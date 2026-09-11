// ════════════════════════════════════════════════════════════════
// NOTZER CHESED — PLATFORM SETUP SCRIPT (SetupScript.gs)
// 
// Run this ONCE to bootstrap the entire platform:
//   1. Creates the Master Sheet (campaign registry, users, etc.)
//   2. Creates the General Campaign Sheet (donations not tied to a campaign)
//   3. Registers KSY as the first campaign
//   4. Adds your super_admin account
//   5. Sets all Script Properties automatically
//   6. Creates a time-driven trigger for daily reports
//
// HOW TO USE:
//   1. Go to https://script.google.com → New Project
//   2. Rename the project to "Notzer Chesed Master Backend"
//   3. Paste MasterCode.gs into the editor (File → New → Script file → "MasterCode")
//   4. Paste this file into another script file (File → New → Script file → "SetupScript")
//   5. Fill in the CONFIG section below with your actual values
//   6. Run the function: setupPlatform()
//   7. Authorize the script when prompted (it needs Sheets + Mail access)
//   8. After setup completes, check the Execution Log for your deployment instructions
//   9. Deploy: Deploy → New Deployment → Web App → Execute as Me → Anyone
//  10. Copy the deployment URL and update your frontend configs
// ════════════════════════════════════════════════════════════════


// ┌─────────────────────────────────────────────────────────┐
// │  FILL IN YOUR VALUES BELOW BEFORE RUNNING               │
// └─────────────────────────────────────────────────────────┘
var SETUP_CONFIG = {

  // ── Your Google account (will be the super_admin) ──
  adminEmail:       'YOUR_EMAIL@gmail.com',       // ← CHANGE THIS
  adminDisplayName: 'Admin',                      // ← CHANGE THIS

  // ── KSY Campaign (your existing live campaign) ──
  ksySheetId:       'YOUR_KSY_SHEET_ID',          // ← CHANGE THIS (from the KSY Google Sheet URL)
  ksyAppsScriptUrl: 'YOUR_KSY_DEPLOYMENT_URL',    // ← CHANGE THIS (existing Code.gs deployment)
  ksyGoalAmount:    '',                           // ← Optional: e.g. '100000'
  ksyPageUrl:       '/keren-shlomo-yechiel.html',
  ksyAdminUrl:      '/admin/ksy/',
  ksyWallUrl:       '/wall/ksy/',

  // ── Gateway API Keys ──
  cardknoxServerKey:     'YOUR_CARDKNOX_SERVER_KEY',    // ← CHANGE THIS
  cardknoxIfieldsKey:    'YOUR_CARDKNOX_IFIELDS_KEY',   // ← CHANGE THIS (client-side key)
  usaepaySourceKey:      '',                            // ← Fill if you have USAePay
  usaepayPin:            '',                            // ← Fill if you have USAePay
  usaepayPublicKey:      '',                            // ← Fill if you have USAePay (client-side)
  primaryGateway:        'cardknox',                    // 'cardknox' or 'usaepay'

  // ── Cloudflare Turnstile ──
  turnstileSecret: 'YOUR_TURNSTILE_SECRET_KEY',   // ← CHANGE THIS

  // ── Google OAuth Client ID (from Step 3 — gcloud setup) ──
  // Leave blank for now if you haven't created it yet. 
  // You can update it later via Script Properties.
  googleClientId: '',                              // ← Fill after running OAuth setup
};


// ════════════════════════════════════════════════════════════════
// MAIN SETUP FUNCTION — Run this
// ════════════════════════════════════════════════════════════════
function setupPlatform() {
  Logger.log('╔════════════════════════════════════════════════════╗');
  Logger.log('║  NOTZER CHESED PLATFORM SETUP — Starting...       ║');
  Logger.log('╚════════════════════════════════════════════════════╝');

  // ── Validate required fields ──
  if (SETUP_CONFIG.adminEmail === 'YOUR_EMAIL@gmail.com') {
    throw new Error('❌ Please fill in SETUP_CONFIG.adminEmail before running setup.');
  }
  if (SETUP_CONFIG.ksySheetId === 'YOUR_KSY_SHEET_ID') {
    throw new Error('❌ Please fill in SETUP_CONFIG.ksySheetId before running setup.');
  }

  // ── Step 1: Create Master Sheet ──
  Logger.log('\n🔧 Step 1: Creating Master Sheet...');
  var masterSheet = createMasterSheet_();
  var masterSheetId = masterSheet.getId();
  Logger.log('✅ Master Sheet created: ' + masterSheet.getUrl());

  // ── Step 2: Create General Campaign Sheet ──
  Logger.log('\n🔧 Step 2: Creating General Campaign Sheet...');
  var generalSheet = createGeneralCampaignSheet_();
  var generalSheetId = generalSheet.getId();
  Logger.log('✅ General Sheet created: ' + generalSheet.getUrl());

  // ── Step 3: Populate Master Sheet with initial data ──
  Logger.log('\n🔧 Step 3: Populating initial data...');
  populateMasterData_(masterSheet, generalSheetId);
  Logger.log('✅ KSY campaign registered, super_admin user added.');

  // ── Step 4: Set Script Properties ──
  Logger.log('\n🔧 Step 4: Setting Script Properties...');
  setScriptProperties_(masterSheetId, generalSheetId);
  Logger.log('✅ All Script Properties set.');

  // ── Step 5: Create daily report trigger ──
  Logger.log('\n🔧 Step 5: Setting up daily report trigger...');
  createDailyReportTrigger_();
  Logger.log('✅ Daily report trigger installed (8:00 AM).');

  // ── Done! ──
  Logger.log('\n╔════════════════════════════════════════════════════╗');
  Logger.log('║  ✅ SETUP COMPLETE!                                ║');
  Logger.log('╠════════════════════════════════════════════════════╣');
  Logger.log('║                                                    ║');
  Logger.log('║  📋 Master Sheet: ' + masterSheetId);
  Logger.log('║  📋 General Sheet: ' + generalSheetId);
  Logger.log('║                                                    ║');
  Logger.log('║  NEXT STEPS:                                       ║');
  Logger.log('║  1. Deploy → New Deployment → Web App              ║');
  Logger.log('║     Execute as: Me | Who has access: Anyone        ║');
  Logger.log('║  2. Copy the deployment URL                        ║');
  Logger.log('║  3. Run the OAuth setup script (PowerShell)        ║');
  Logger.log('║  4. Update GOOGLE_CLIENT_ID in Script Properties   ║');
  Logger.log('║  5. Replace {{MASTER_APPS_SCRIPT_URL}} in:         ║');
  Logger.log('║     - js/auth.js                                   ║');
  Logger.log('║     - admin/index.html                             ║');
  Logger.log('║     - donate/index.html                            ║');
  Logger.log('║  6. Replace {{GOOGLE_CLIENT_ID}} in:               ║');
  Logger.log('║     - js/auth.js                                   ║');
  Logger.log('║     - admin/login.html                             ║');
  Logger.log('║                                                    ║');
  Logger.log('╚════════════════════════════════════════════════════╝');

  return {
    masterSheetId: masterSheetId,
    masterSheetUrl: masterSheet.getUrl(),
    generalSheetId: generalSheetId,
    generalSheetUrl: generalSheet.getUrl()
  };
}


// ════════════════════════════════════════════════════════════════
// STEP 1: CREATE MASTER SHEET
// ════════════════════════════════════════════════════════════════
function createMasterSheet_() {
  var ss = SpreadsheetApp.create('Notzer Chesed — Master Platform');

  // ── Tab 1: Campaigns (cols A-S) ──
  var campaignsSheet = ss.getSheetByName('Sheet1');
  campaignsSheet.setName('Campaigns');
  campaignsSheet.getRange('A1:V1').setValues([[
    'Campaign ID', 'Campaign Name', 'Status',
    'Campaign Sheet ID', 'Apps Script Deployment URL',
    'Primary Gateway',
    'Cardknox iFields Key', 'Cardknox Server Key',
    'USAePay Public Key', 'USAePay Server Key',
    'Goal Amount', 'Start Date', 'End Date',
    'Page URL', 'Admin Page URL', 'Wall URL', 'Wall Enabled',
    'Created Date', 'Last Modified',
    'USAePay PIN', 'Is Public', 'Wall Access Key'
  ]]);
  campaignsSheet.getRange('A1:V1').setFontWeight('bold');
  campaignsSheet.getRange('A1:V1').setBackground('#1a1a2e');
  campaignsSheet.getRange('A1:V1').setFontColor('#ffffff');
  campaignsSheet.setFrozenRows(1);
  campaignsSheet.setColumnWidths(1, 2, 150);
  campaignsSheet.setColumnWidth(3, 80);
  campaignsSheet.setColumnWidth(4, 280);
  campaignsSheet.setColumnWidth(5, 320);
  campaignsSheet.setColumnWidths(6, 5, 160);

  // ── Tab 2: Authorized_Users (cols A-H) ──
  var usersSheet = ss.insertSheet('Authorized_Users');
  usersSheet.getRange('A1:H1').setValues([[
    'Email', 'Display Name', 'Auth Method',
    'Role', 'Assigned Campaigns',
    'Status', 'Added Date', 'Last Login'
  ]]);
  usersSheet.getRange('A1:H1').setFontWeight('bold');
  usersSheet.getRange('A1:H1').setBackground('#1a1a2e');
  usersSheet.getRange('A1:H1').setFontColor('#ffffff');
  usersSheet.setFrozenRows(1);
  usersSheet.setColumnWidth(1, 250);
  usersSheet.setColumnWidth(4, 140);
  usersSheet.setColumnWidth(5, 180);

  // ── Tab 3: OTP_Sessions (cols A-G) ──
  var otpSheet = ss.insertSheet('OTP_Sessions');
  otpSheet.getRange('A1:G1').setValues([[
    'Email', 'OTP Hash', 'Created',
    'Expires', 'Session Token',
    'Session Expires', 'Used'
  ]]);
  otpSheet.getRange('A1:G1').setFontWeight('bold');
  otpSheet.getRange('A1:G1').setBackground('#1a1a2e');
  otpSheet.getRange('A1:G1').setFontColor('#ffffff');
  otpSheet.setFrozenRows(1);
  otpSheet.setColumnWidth(1, 220);
  otpSheet.setColumnWidth(2, 280);
  otpSheet.setColumnWidth(5, 280);

  // ── Tab 4: Receipt_Log (cols A-M) ──
  var receiptSheet = ss.insertSheet('Receipt_Log');
  receiptSheet.getRange('A1:M1').setValues([[
    'Receipt ID', 'Timestamp', 'Campaign ID', 'Donor Name', 'Company Name',
    'Donor Email', 'Sent-To Email', 'Amount', 'Issued By',
    'Source', 'Original Transaction Ref', 'Also Sent to Original', 'Notes'
  ]]);
  receiptSheet.getRange('A1:M1').setFontWeight('bold');
  receiptSheet.getRange('A1:M1').setBackground('#1a1a2e');
  receiptSheet.getRange('A1:M1').setFontColor('#ffffff');
  receiptSheet.setFrozenRows(1);
  receiptSheet.setColumnWidth(1, 130);
  receiptSheet.setColumnWidth(4, 180);
  receiptSheet.setColumnWidth(5, 220);

  // ── Tab 5: Report_Schedule (cols A-E) ──
  var reportSheet = ss.insertSheet('Report_Schedule');
  reportSheet.getRange('A1:E1').setValues([[
    'Campaign ID', 'Report Type', 'Recipients', 'Enabled', 'Last Sent'
  ]]);
  reportSheet.getRange('A1:E1').setFontWeight('bold');
  reportSheet.getRange('A1:E1').setBackground('#1a1a2e');
  reportSheet.getRange('A1:E1').setFontColor('#ffffff');
  reportSheet.setFrozenRows(1);
  reportSheet.setColumnWidth(1, 140);
  reportSheet.setColumnWidth(3, 250);

  // ── Tab 6: Templates (cols A-R) ──
  var templatesSheet = ss.insertSheet('Templates');
  templatesSheet.getRange('A1:R1').setValues([[
    'Template ID', 'Template Name', 'Category', 'Description',
    'Accent Color', 'Accent Light', 'Accent Dark',
    'Preset Amounts', 'Hebrew Title', 'Subtitle',
    'Story Layout', 'Default Story EN', 'Default Story HE',
    'Features', 'Hero Image URL', 'Status', 'Created Date', 'Last Modified'
  ]]);
  templatesSheet.getRange('A1:R1').setFontWeight('bold');
  templatesSheet.getRange('A1:R1').setBackground('#1a1a2e');
  templatesSheet.getRange('A1:R1').setFontColor('#ffffff');
  templatesSheet.setFrozenRows(1);
  templatesSheet.setColumnWidth(1, 160);
  templatesSheet.setColumnWidth(2, 220);
  templatesSheet.setColumnWidth(3, 130);
  templatesSheet.setColumnWidth(4, 280);
  templatesSheet.setColumnWidth(8, 200);
  templatesSheet.setColumnWidth(12, 300);
  templatesSheet.setColumnWidth(13, 300);
  templatesSheet.setColumnWidth(14, 250);

  var now = new Date();
  var defaultTemplates = [
    [
      'hachnosas-kallah',
      'Hachnosas Kallah — Wedding Fund',
      'Wedding / Bridal',
      'Dignified bridal and wedding assistance fund with celebratory gold/rose theme, wedding sponsorship tiers, goal progress, and recurring installments.',
      '#d4af37', '#f3e5ab', '#aa820a',
      '[180, 360, 500, 1000, 2500, 5000]',
      'הכנסת כלה — שמחת חתן וכלה',
      'Building a Jewish home with dignity and joy',
      'bilingual-columns',
      'Join us in the sacred mitzvah of Hachnosas Kallah. Our sages teach that rejoicing with a bride and groom and assisting them in establishing their home is among the greatest acts of kindness. This fund provides essential wedding essentials, clothing, and household setup to ensure the young couple can begin their new life with dignity and peace of mind.',
      'מצוה גדולה להכניס כלה ולשמח חתן וכלה ביום חתונתם וביום שמחת לבם. הקרן נוסדה לעזור ולסייע בהוצאות החתונה בכבוד ובהרחבה, להעמיד בית נאמן בישראל.',
      '{"wall":true,"teams":true,"recurring":true,"gallery":false,"prayer":true,"zelle":true,"daf":true,"goal":true}',
      '', 'Active', now, now
    ],
    [
      'emergency-family',
      'Emergency Family Relief',
      'Crisis / Family',
      'Designed for urgent family crises and sudden loss with dual English/Yiddish narrative, photo gallery, goal bar, and recurring installments.',
      '#4dabf7', '#74c0fc', '#339af0',
      '[18, 36, 72, 180, 360, 500, 1000]',
      'קרן עזר וחסד',
      'Standing by a family in their darkest hour',
      'bilingual-columns',
      'Our community has been shaken by a sudden tragedy. An entire family has been left without their primary support. This fund has been established to provide urgent and ongoing financial assistance to ensure stability during this difficult time. Kol Yisrael areivim zeh lazeh.',
      'אונזער קהילה שטייט לימין דער משפחה אין זייער שווערער שעה. די קרן איז געגרינדעט געווארן צוצושטעלן נויטיגע פינאנציעלע הילף און חיזוק פאר די קומענדיגע יארן.',
      '{"wall":true,"teams":true,"recurring":true,"gallery":true,"prayer":false,"zelle":true,"daf":true,"goal":true}',
      '', 'Active', now, now
    ],
    [
      'org-support',
      'Sister Org / Community Program',
      'Organization',
      'Support for communal programs and organizations providing guidance, social services, and discreet aid (Matan B\'Seiser).',
      '#6c63ff', '#8b83ff', '#5548d9',
      '[36, 100, 180, 360, 500, 1000, 2500]',
      'מתן בסתר — קרן עזרה',
      'Providing direct and discreet assistance to families in need',
      'single-column',
      'Matan B\'Seiser is giving in secret — preserving the dignity of the recipient as members of our own household. This campaign provides ongoing, confidential financial assistance, social services, counseling, and essential holiday relief to families in our community.',
      '',
      '{"wall":true,"teams":true,"recurring":true,"gallery":false,"prayer":true,"zelle":true,"daf":true,"goal":false}',
      '', 'Active', now, now
    ],
    [
      'holiday-seasonal',
      'Holiday & Seasonal Campaign',
      'Seasonal',
      'Purim Matanot La\'Evyonim or Pesach Kimcha DePischa campaign with holiday urgency banner, family sponsorship tiers, and rapid checkout.',
      '#e67e22', '#f39c12', '#d35400',
      '[18, 36, 54, 100, 180, 360, 500]',
      'מתנות לאביונים — מגבית החג',
      'Ensuring every family celebrates with joy and dignity',
      'single-column',
      'Fulfill your holiday obligations with 100% distribution on the day of Yom Tov. We provide food packages, holiday clothing, and direct grants to local families so no child is left without the joy of the festival.',
      '',
      '{"wall":true,"teams":true,"recurring":false,"gallery":false,"prayer":false,"zelle":true,"daf":true,"goal":true}',
      '', 'Active', now, now
    ],
    [
      'memorial-fund',
      'Memorial & Tribute Fund',
      'Memorial',
      'Dedicated memorial tributes and Yahrtzeit funds with Hebrew dedication line, Mishnayot / prayer request options, and dignified styling.',
      '#8e44ad', '#bb86fc', '#6c3483',
      '[18, 36, 72, 180, 360, 500, 1000]',
      'קרן לעילוי נשמת',
      'In loving memory and eternal legacy',
      'single-column',
      'Established in loving memory to support acts of Torah and Chesed. Your generous contribution continues a legacy of kindness, helping needy individuals and perpetuating a name of blessed memory.',
      '',
      '{"wall":true,"teams":false,"recurring":true,"gallery":true,"prayer":true,"zelle":true,"daf":true,"goal":false}',
      '', 'Active', now, now
    ],
    [
      'team-crowdfunding',
      'Peer-to-Peer Team Campaign',
      'Crowdfunding',
      'Ambassador-driven campaign with team selectors, team leaderboards, goal meters, and social sharing.',
      '#27ae60', '#2ecc71', '#1e8449',
      '[25, 50, 100, 250, 500, 1000]',
      'מגבית השותפים',
      'Uniting together to reach our communal goal',
      'single-column',
      'Join our team captains and ambassadors in reaching our collective milestone. Every team and every dollar makes a lasting difference for our community programs.',
      '',
      '{"wall":true,"teams":true,"recurring":true,"gallery":false,"prayer":false,"zelle":true,"daf":true,"goal":true}',
      '', 'Active', now, now
    ],
    [
      'standard-general',
      'Standard General Campaign',
      'General',
      'Clean, modern, versatile donation page with fast Cardknox and USAePay payment options, suitable for all general charitable appeals.',
      '#4dabf7', '#74c0fc', '#339af0',
      '[18, 36, 72, 180, 360, 500]',
      'נוצר חסד — קרן כללית',
      'Supporting vital community initiatives',
      'single-column',
      'Thank you for partnering with Notzer Chesed. Your tax-deductible contribution supports our broad network of charitable programs and urgent family assistance funds.',
      '',
      '{"wall":true,"teams":false,"recurring":true,"gallery":false,"prayer":false,"zelle":true,"daf":true,"goal":false}',
      '', 'Active', now, now
    ]
  ];

  templatesSheet.getRange(2, 1, defaultTemplates.length, 18).setValues(defaultTemplates);

  Logger.log('   → Created 6 tabs: Campaigns, Authorized_Users, OTP_Sessions, Receipt_Log, Report_Schedule, Templates');
  return ss;
}


// ════════════════════════════════════════════════════════════════
// STEP 2: CREATE GENERAL CAMPAIGN SHEET
// ════════════════════════════════════════════════════════════════
function createGeneralCampaignSheet_() {
  var ss = SpreadsheetApp.create('Notzer Chesed — General Donations');

  // ── Tab 1: Pledges (cols A-P) ──
  var pledgesSheet = ss.getSheetByName('Sheet1');
  pledgesSheet.setName('Pledges');
  pledgesSheet.getRange('A1:P1').setValues([[
    'Pledge ID', 'Customer ID', 'Created Date', 'Donor',
    'Campaign', 'Amount', 'Status', 'Amount Paid',
    'Balance', 'Display Name', 'Memo', 'Anonymous',
    'Teams', 'Method', 'Schedule ID', 'Notes'
  ]]);
  formatHeaderRow_(pledgesSheet, 'A1:P1');
  pledgesSheet.getRange('F2:I1000').setNumberFormat('$#,##0.00');

  // ── Tab 2: Transactions (cols A-N) ──
  var txnSheet = ss.insertSheet('Transactions');
  txnSheet.getRange('A1:N1').setValues([[
    'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net',
    'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method',
    'Card Type', 'Payment #', 'Funded', 'Funded Date'
  ]]);
  formatHeaderRow_(txnSheet, 'A1:N1');
  txnSheet.getRange('C2:E1000').setNumberFormat('$#,##0.00');

  // ── Tab 3: Customers (cols A-K) ──
  var custSheet = ss.insertSheet('Customers');
  custSheet.getRange('A1:K1').setValues([[
    'Customer ID', 'First Name', 'Last Name', 'Email',
    'Phone', 'Street', 'City', 'State',
    'Zip', 'Created Date', 'Source'
  ]]);
  formatHeaderRow_(custSheet, 'A1:K1');

  // ── Tab 4: Scheduled Payments (cols A-M) ──
  var schedSheet = ss.insertSheet('Scheduled Payments');
  schedSheet.getRange('A1:M1').setValues([[
    'DateSubmitted', 'Recurring ID', 'Pledge ID', 'Customer ID',
    'Donor Name', 'USD Amount', 'Total Pledge', 'Frequency',
    'Count', 'Sequence', 'DateDue', 'Status', 'Transaction Ref'
  ]]);
  formatHeaderRow_(schedSheet, 'A1:M1');
  schedSheet.getRange('F2:G1000').setNumberFormat('$#,##0.00');

  // ── Tab 5: Teams (cols A-G) ──
  var teamsSheet = ss.insertSheet('Teams');
  teamsSheet.getRange('A1:G1').setValues([[
    'Team ID', 'Team Name', 'Team Contact Name',
    'Team Contact Email', 'Notify on New Donation', 'Team Goal', 'Campaign'
  ]]);
  formatHeaderRow_(teamsSheet, 'A1:G1');
  teamsSheet.getRange('F2:F100').setNumberFormat('$#,##0.00');

  // ── Tab 6: LinkClicks (cols A-F) ──
  var clicksSheet = ss.insertSheet('LinkClicks');
  clicksSheet.getRange('A1:F1').setValues([[
    'Timestamp', 'First Name', 'Last Name',
    'Email', 'Link Clicked', 'Campaign'
  ]]);
  formatHeaderRow_(clicksSheet, 'A1:F1');

  // ── Tab 7: Fee_Config (cols A-C) ──
  var feeSheet = ss.insertSheet('Fee_Config');
  feeSheet.getRange('A1:C1').setValues([['Method', 'Rate', 'Flat Fee']]);
  var feeDefaults = [
    ['Credit Card', 0.03, 0.30],
    ['Cardknox', 0.03, 0.30],
    ['USAePay', 0.03, 0.30],
    ['Matbia', 0.025, 0.00],
    ['DAF - OJCF', 0.00, 0.00],
    ['DAF - Pledger', 0.00, 0.00],
    ['DAF - Matbia', 0.00, 0.00],
    ['DAF - The Donors Fund', 0.00, 0.00],
    ['Check', 0.00, 0.00],
    ['Zelle', 0.00, 0.00],
    ['PayPal', 0.029, 0.30],
    ['Wire Transfer', 0.00, 0.00],
    ['Cash', 0.00, 0.00],
    ['Bank Transfer', 0.00, 0.00],
    ['Other', 0.00, 0.00]
  ];
  feeSheet.getRange(2, 1, feeDefaults.length, 3).setValues(feeDefaults);
  formatHeaderRow_(feeSheet, 'A1:C1');
  feeSheet.getRange('B2:B100').setNumberFormat('0.00%');
  feeSheet.getRange('C2:C100').setNumberFormat('$#,##0.00');

  // ── Tab 8: Expenses (cols A-G) ──
  var expSheet = ss.insertSheet('Expenses');
  expSheet.getRange('A1:G1').setValues([[
    'Date', 'Amount', 'Payee', 'Type', 'Purpose', 'Authorized By', 'Given by'
  ]]);
  formatHeaderRow_(expSheet, 'A1:G1');
  expSheet.getRange('B2:B1000').setNumberFormat('$#,##0.00');

  // ── Tab 9: Campaigns (cols A-F) ──
  var campSheet = ss.insertSheet('Campaigns');
  campSheet.getRange('A1:F1').setValues([[
    'Short Code', 'Long Name Eng', 'Goal',
    'Manager Email', 'Manager Name', 'Notify on New Donation'
  ]]);
  formatHeaderRow_(campSheet, 'A1:F1');
  campSheet.getRange('A2:F2').setValues([[
    'general', 'General Donations', '', SETUP_CONFIG.adminEmail, SETUP_CONFIG.adminDisplayName, 'Yes'
  ]]);

  Logger.log('   → Created 9 tabs: Pledges, Transactions, Customers, Scheduled Payments, Teams, LinkClicks, Fee_Config, Expenses, Campaigns');
  return ss;
}

function formatHeaderRow_(sheet, range) {
  sheet.getRange(range).setFontWeight('bold');
  sheet.getRange(range).setBackground('#1a1a2e');
  sheet.getRange(range).setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}


// ════════════════════════════════════════════════════════════════
// STEP 3: POPULATE MASTER SHEET WITH INITIAL DATA
// ════════════════════════════════════════════════════════════════
function populateMasterData_(masterSs, generalSheetId) {
  var now = new Date();

  // ── Register KSY campaign ──
  var campaignsSheet = masterSs.getSheetByName('Campaigns');
  campaignsSheet.getRange('A2:T2').setValues([[
    'ksy',                                   // A: Campaign ID
    'Keren Shlomo Yechiel',                  // B: Campaign Name
    'Active',                                // C: Status
    SETUP_CONFIG.ksySheetId,                 // D: Campaign Sheet ID
    SETUP_CONFIG.ksyAppsScriptUrl,           // E: Apps Script URL
    SETUP_CONFIG.primaryGateway,             // F: Primary Gateway
    SETUP_CONFIG.cardknoxIfieldsKey,         // G: Cardknox iFields Key
    SETUP_CONFIG.cardknoxServerKey,          // H: Cardknox Server Key
    SETUP_CONFIG.usaepayPublicKey || '',     // I: USAePay Public Key
    SETUP_CONFIG.usaepaySourceKey || '',     // J: USAePay Server Key
    SETUP_CONFIG.ksyGoalAmount || '',        // K: Goal Amount
    '',                                      // L: Start Date
    '',                                      // M: End Date
    SETUP_CONFIG.ksyPageUrl,                 // N: Page URL
    SETUP_CONFIG.ksyAdminUrl,                // O: Admin Page URL
    SETUP_CONFIG.ksyWallUrl,                 // P: Wall URL
    'Yes',                                   // Q: Wall Enabled
    now,                                     // R: Created Date
    now,                                     // S: Last Modified
    SETUP_CONFIG.usaepayPin || ''            // T: USAePay PIN
  ]]);

  // ── Register General campaign ──
  campaignsSheet.getRange('A3:T3').setValues([[
    'general', 'General Donations', 'Active',
    generalSheetId, '',  // No separate Apps Script for general — handled by MasterCode
    SETUP_CONFIG.primaryGateway,
    SETUP_CONFIG.cardknoxIfieldsKey,
    SETUP_CONFIG.cardknoxServerKey,
    SETUP_CONFIG.usaepayPublicKey || '',
    SETUP_CONFIG.usaepaySourceKey || '',
    '', '', '', '/donate/', '/admin/', '', 'No',
    now, now,
    SETUP_CONFIG.usaepayPin || ''            // T: USAePay PIN
  ]]);
  Logger.log('   → Registered campaigns: ksy, general');

  // ── Add super_admin user ──
  var usersSheet = masterSs.getSheetByName('Authorized_Users');
  usersSheet.getRange('A2:H2').setValues([[
    SETUP_CONFIG.adminEmail,                 // A: Email
    SETUP_CONFIG.adminDisplayName,           // B: Display Name
    'google',                                // C: Auth Method
    'super_admin',                           // D: Role
    '*',                                     // E: Assigned Campaigns (all)
    'Active',                                // F: Status
    now,                                     // G: Added Date
    ''                                       // H: Last Login
  ]]);
  Logger.log('   → Added super_admin: ' + SETUP_CONFIG.adminEmail);
}


// ════════════════════════════════════════════════════════════════
// STEP 4: SET SCRIPT PROPERTIES
// ════════════════════════════════════════════════════════════════
function setScriptProperties_(masterSheetId, generalSheetId) {
  var props = PropertiesService.getScriptProperties();

  props.setProperties({
    'MASTER_SHEET_ID':            masterSheetId,
    'GENERAL_SHEET_ID':           generalSheetId,
    'GOOGLE_CLIENT_ID':           SETUP_CONFIG.googleClientId || 'PLACEHOLDER_SET_AFTER_OAUTH_SETUP',
    'TURNSTILE_SECRET':           SETUP_CONFIG.turnstileSecret,
    'DEFAULT_CARDKNOX_KEY':       SETUP_CONFIG.cardknoxServerKey,
    'DEFAULT_USAEPAY_SOURCE_KEY': SETUP_CONFIG.usaepaySourceKey || '',
    'DEFAULT_USAEPAY_PIN':        SETUP_CONFIG.usaepayPin || '',
    'DEFAULT_PRIMARY_GATEWAY':    SETUP_CONFIG.primaryGateway || 'cardknox',
  });

  Logger.log('   → MASTER_SHEET_ID = ' + masterSheetId);
  Logger.log('   → GENERAL_SHEET_ID = ' + generalSheetId);
  Logger.log('   → DEFAULT_PRIMARY_GATEWAY = ' + (SETUP_CONFIG.primaryGateway || 'cardknox'));

  if (!SETUP_CONFIG.googleClientId) {
    Logger.log('   ⚠️ GOOGLE_CLIENT_ID is not set yet — update after OAuth setup');
  }
}


// ════════════════════════════════════════════════════════════════
// STEP 5: CREATE DAILY REPORT TRIGGER
// ════════════════════════════════════════════════════════════════
function createDailyReportTrigger_() {
  // Remove any existing triggers for sendScheduledReports to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendScheduledReports') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Create new daily trigger at 8:00 AM
  ScriptApp.newTrigger('sendScheduledReports')
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .create();

  Logger.log('   → Trigger: sendScheduledReports() at 8:00 AM daily');
}


// ════════════════════════════════════════════════════════════════
// UTILITY: Update Google Client ID after OAuth setup
//
// Run this function AFTER you've created the OAuth client ID
// via the gcloud setup script. Pass the client ID as argument.
// ════════════════════════════════════════════════════════════════
function updateGoogleClientId(clientId) {
  if (!clientId || clientId.indexOf('.apps.googleusercontent.com') === -1) {
    throw new Error('Invalid client ID. Must end with .apps.googleusercontent.com');
  }

  PropertiesService.getScriptProperties().setProperty('GOOGLE_CLIENT_ID', clientId);
  Logger.log('✅ GOOGLE_CLIENT_ID updated to: ' + clientId);
  Logger.log('Now update the same value in:');
  Logger.log('  - js/auth.js (AUTH_CONFIG.googleClientId)');
  Logger.log('  - admin/login.html (if hardcoded)');
}


// ════════════════════════════════════════════════════════════════
// UTILITY: Verify setup is correct
//
// Run this anytime to verify the platform is configured correctly.
// ════════════════════════════════════════════════════════════════
function verifySetup() {
  Logger.log('🔍 Verifying platform setup...\n');
  var props = PropertiesService.getScriptProperties().getProperties();
  var allGood = true;

  // Check required properties
  var required = [
    'MASTER_SHEET_ID', 'GENERAL_SHEET_ID', 'GOOGLE_CLIENT_ID',
    'TURNSTILE_SECRET', 'DEFAULT_CARDKNOX_KEY', 'DEFAULT_PRIMARY_GATEWAY'
  ];

  for (var i = 0; i < required.length; i++) {
    var key = required[i];
    var val = props[key] || '';
    if (!val || val === 'PLACEHOLDER_SET_AFTER_OAUTH_SETUP' || val.indexOf('YOUR_') === 0) {
      Logger.log('❌ ' + key + ' = ' + (val || '(empty)'));
      allGood = false;
    } else {
      // Mask sensitive values
      var display = val.length > 20 ? val.substring(0, 8) + '...' + val.substring(val.length - 8) : val;
      Logger.log('✅ ' + key + ' = ' + display);
    }
  }

  // Check Master Sheet is accessible
  try {
    var masterSs = SpreadsheetApp.openById(props['MASTER_SHEET_ID']);
    var tabs = masterSs.getSheets().map(function(s) { return s.getName(); });
    Logger.log('\n📋 Master Sheet tabs: ' + tabs.join(', '));

    // Check campaigns
    var campSheet = masterSs.getSheetByName('Campaigns');
    if (campSheet) {
      var campData = campSheet.getDataRange().getValues();
      Logger.log('📊 Campaigns registered: ' + (campData.length - 1));
      for (var j = 1; j < campData.length; j++) {
        Logger.log('   → ' + campData[j][0] + ' (' + campData[j][2] + ')');
      }
    }

    // Check users
    var usersSheet = masterSs.getSheetByName('Authorized_Users');
    if (usersSheet) {
      var userData = usersSheet.getDataRange().getValues();
      Logger.log('👤 Authorized users: ' + (userData.length - 1));
      for (var k = 1; k < userData.length; k++) {
        Logger.log('   → ' + userData[k][0] + ' (' + userData[k][3] + ')');
      }
    }

    // Check templates
    var tmplSheet = masterSs.getSheetByName('Templates');
    if (tmplSheet) {
      var tmplData = tmplSheet.getDataRange().getValues();
      Logger.log('📐 Templates registered: ' + (tmplData.length - 1));
      for (var m = 1; m < tmplData.length; m++) {
        Logger.log('   → ' + tmplData[m][0] + ': ' + tmplData[m][1] + ' (' + tmplData[m][15] + ')');
      }
    } else {
      Logger.log('⚠️ Templates tab missing from Master Sheet.');
    }
  } catch (err) {
    Logger.log('❌ Cannot access Master Sheet: ' + err.message);
    allGood = false;
  }

  // Check General Sheet
  try {
    var generalSs = SpreadsheetApp.openById(props['GENERAL_SHEET_ID']);
    var genTabs = generalSs.getSheets().map(function(s) { return s.getName(); });
    Logger.log('\n📋 General Sheet tabs: ' + genTabs.join(', '));
  } catch (err) {
    Logger.log('❌ Cannot access General Sheet: ' + err.message);
    allGood = false;
  }

  // Check triggers
  var triggers = ScriptApp.getProjectTriggers();
  Logger.log('\n⏰ Active triggers: ' + triggers.length);
  for (var t = 0; t < triggers.length; t++) {
    Logger.log('   → ' + triggers[t].getHandlerFunction() + ' (' + triggers[t].getEventType() + ')');
  }

  Logger.log('\n' + (allGood ? '✅ All checks passed!' : '⚠️ Some issues found — see above.'));
  return allGood;
}
