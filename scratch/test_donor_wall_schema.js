// ============================================================
// test_donor_wall_schema.js
// Regression tests for getDonorsMaster_ donor wall contract & frontend rendering
// ============================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- STARTING DONOR WALL SCHEMA & ANONYMOUS RESOLUTION TESTS ---');

// Mock Google Apps Script environment for getDonorsMaster_
function createMockBackend() {
  const masterCode = fs.readFileSync(path.join(__dirname, '../apps-script-backend/Code.gs'), 'utf8');
  
  // Extract getDonorsMaster_ function body and dependencies
  const vm = require('vm');
  const sandbox = {
    Logger: { log: console.log },
    formatDateEdt_: function(d) {
      if (!d) return '';
      const date = (d instanceof Date) ? d : new Date(d);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => k === 'MASTER_SHEET_ID' ? 'mock-master-sheet-id' : null
      })
    },
    getCampaignRow: function(code) {
      // Return mock campaign row:
      // Index 1: Name, Index 3: SheetId, Index 10: Goal, Index 16: WallEnabled ('Yes'), Index 21: AccessKey ('')
      return [
        code, 'Mock Campaign', 'Desc', 'mock-campaign-ss-id', '', '', '', '', '', '',
        50000, '', '', '', '', '', 'Yes', '', '', '', '', ''
      ];
    },
    SpreadsheetApp: {
      openById: function(sheetId) {
        return {
          getSheetByName: function(name) {
            if (name !== 'Pledges') return null;
            return {
              getName: () => 'Pledges',
              getLastRow: () => 4,
              getLastColumn: () => 16,
              getRange: (r, c, nr, nc) => ({
                getValues: () => [
                  // Headers
                  [
                    'Pledge ID', 'Customer ID', 'Created Date', 'Donor', 'Campaign',
                    'Amount', 'Status', 'Amount Paid', 'Balance',
                    'Display Name', 'Memo', 'Anonymous', 'Teams',
                    'Method', 'Schedule ID', 'Notes'
                  ],
                  // Row 1: Col L = 'No', custom Display Name
                  [
                    'PLG-000001', 'ONLINE-1', new Date('2026-09-18T10:00:00Z'), 'Reuven Cohen', 'mock',
                    180, 'Processed', 180, 0,
                    'Reuven & Family', 'In honor of the Rav', 'No', 'team-alpha',
                    'Credit Card', '', ''
                  ],
                  // Row 2: Col L = '', empty Display Name (falls back to Donor Name)
                  [
                    'PLG-000002', 'ONLINE-2', new Date('2026-09-18T11:30:00Z'), 'Shimon Levi', 'mock',
                    100, 'Processed', 100, 0,
                    '', 'Refuah Sheleimah', '', 'team-beta, team-alpha',
                    'Credit Card', '', ''
                  ],
                  // Row 3: Col L = 'Yes', Anonymous donor
                  [
                    'PLG-000003', 'ONLINE-3', new Date('2026-09-18T12:15:00Z'), 'Yehuda Anonymous', 'mock',
                    500, 'Processed', 500, 0,
                    'Secret Giver', 'Lzchus', 'Yes', '',
                    'Credit Card', '', ''
                  ]
                ]
              })
            };
          }
        };
      }
    }
  };

  vm.createContext(sandbox);
  // Evaluate the Code.gs file or the getDonorsMaster_ function
  // We extract getDonorsMaster_
  const start = masterCode.indexOf('function getDonorsMaster_');
  const end = masterCode.indexOf('function getTeamsMaster_', start);
  const funcCode = masterCode.substring(start, end);
  vm.runInContext(funcCode, sandbox);

  return sandbox;
}

// 1. Test Backend getDonorsMaster_
console.log('Testing getDonorsMaster_ response schema...');
const backend = createMockBackend();
const result = backend.getDonorsMaster_('mock', '', '');

assert.strictEqual(result.status, 'success', 'Result status must be success');
assert.strictEqual(result.donors.length, 3, 'Must return 3 donors');

// Note: donors are sliced(-100).reverse(), so latest donation (Row 3) is first in donors array
const d3 = result.donors.find(d => d.amount === 500); // Row 3: Anonymous = Yes
const d1 = result.donors.find(d => d.amount === 180); // Row 1: Anonymous = No, displayName = 'Reuven & Family'
const d2 = result.donors.find(d => d.amount === 100); // Row 2: Anonymous = '', displayName = '', donor = 'Shimon Levi'

// Test Row 1: Col L = 'No'
assert.strictEqual(d1.anonymous, false, 'Row 1 anonymous must be false');
assert.strictEqual(d1.displayName, 'Reuven & Family', 'Row 1 displayName must match custom display name');
assert.strictEqual(d1.name, 'Reuven & Family', 'Row 1 name must match custom display name');
assert.ok(d1.timestamp, 'Row 1 timestamp must be present');
assert.ok(d1.teams, 'Row 1 teams must be present');

// Test Row 2: Col L = '' (empty, not Yes)
assert.strictEqual(d2.anonymous, false, 'Row 2 anonymous must be false');
assert.strictEqual(d2.displayName, 'Shimon Levi', 'Row 2 displayName must fall back to donor name');
assert.strictEqual(d2.name, 'Shimon Levi', 'Row 2 name must fall back to donor name');

// Test Row 3: Col L = 'Yes'
assert.strictEqual(d3.anonymous, true, 'Row 3 anonymous must be true');
assert.strictEqual(d3.displayName, 'Anonymous Supporter', 'Row 3 displayName must be Anonymous Supporter');

// Test teamTotals structure
assert.ok(result.teamTotals['team-alpha'], 'team-alpha must be in teamTotals');
assert.strictEqual(typeof result.teamTotals['team-alpha'], 'object', 'teamTotals entries must be objects with amount & count');
assert.strictEqual(result.teamTotals['team-alpha'].amount, 280, 'team-alpha total must be 180 + 100 = 280');
assert.strictEqual(result.teamTotals['team-alpha'].count, 2, 'team-alpha count must be 2');

// 2. Test Frontend Rendering Logic
function renderDonorCard(donor) {
  const isAnonymous = donor.anonymous;
  const displayName = isAnonymous ? 'בעילום שם' : (donor.displayName || donor.name || 'Anonymous');
  return { isAnonymous, displayName };
}

const card1 = renderDonorCard(d1);
assert.strictEqual(card1.isAnonymous, false);
assert.strictEqual(card1.displayName, 'Reuven & Family', 'Non-anonymous donor must NOT render as Anonymous!');

const card2 = renderDonorCard(d2);
assert.strictEqual(card2.isAnonymous, false);
assert.strictEqual(card2.displayName, 'Shimon Levi', 'Donor without display name must render donor name, NOT Anonymous!');

const card3 = renderDonorCard(d3);
assert.strictEqual(card3.isAnonymous, true);
assert.strictEqual(card3.displayName, 'בעילום שם', 'Anonymous donor must render as בעילום שם');

console.log('✅ ALL DONOR WALL SCHEMA & ANONYMOUS RESOLUTION TESTS PASSED!');
