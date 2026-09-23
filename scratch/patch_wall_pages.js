// patch_wall_pages.js
const fs = require('fs');
const path = require('path');

const files = [
  'templates/wall-page/template.html',
  'wall/keren-hk-m-twersky/index.html',
  'wall/kfw87/index.html',
  'wall/ksy/index.html'
];

files.forEach(relPath => {
  const absPath = path.join(__dirname, '..', relPath);
  let content = fs.readFileSync(absPath, 'utf8');

  // Replace CRLF / LF normalization
  function normalize(s) { return s.replace(/\r\n/g, '\n'); }
  let normContent = normalize(content);

  // 1. getFilteredDonors
  const t1 = `function getFilteredDonors() {\n    if (!currentTeamFilter) return currentDonors;\n    return currentDonors.filter(d => {\n        if (!d.teams) return false;\n        const teamList = d.teams.split(',').map(t => t.trim().toLowerCase());\n        return teamList.includes(currentTeamFilter.toLowerCase());\n    });\n}`;
  const r1 = `function getFilteredDonors() {\n    if (!currentTeamFilter) return currentDonors;\n    return currentDonors.filter(d => {\n        const teamStr = d.teams || d.team || '';\n        if (!teamStr) return false;\n        const teamList = teamStr.split(',').map(t => t.trim().toLowerCase());\n        return teamList.includes(currentTeamFilter.toLowerCase());\n    });\n}`;

  // 2. Sort by date
  const t2 = `        sorted.sort((a, b) => {\n            const dateA = new Date(a.timestamp || 0);\n            const dateB = new Date(b.timestamp || 0);\n            return dateB - dateA;\n        });`;
  const r2 = `        sorted.sort((a, b) => {\n            const dateA = new Date(a.timestamp || a.date || 0);\n            const dateB = new Date(b.timestamp || b.date || 0);\n            return dateB - dateA;\n        });`;

  // 3. Donor display name
  const t3 = `const displayName = isAnonymous ? 'בעילום שם' : (donor.displayName || 'Anonymous');`;
  const r3 = `const displayName = isAnonymous ? 'בעילום שם' : (donor.displayName || donor.name || 'Anonymous');`;

  // 4. Donor date
  const t4 = `html += \`<div class="donor-date">\${formatDate(donor.timestamp)}</div>\`;`;
  const r4 = `html += \`<div class="donor-date">\${formatDate(donor.timestamp || donor.date)}</div>\`;`;

  // 5. Donor teams badge
  const t5 = `        if (donor.teams && donor.teams.trim()) {\n            const teamIds = donor.teams.split(',').map(t => t.trim()).filter(Boolean);`;
  const r5 = `        const teamStr = donor.teams || donor.team || '';\n        if (teamStr && teamStr.trim()) {\n            const teamIds = teamStr.split(',').map(t => t.trim()).filter(Boolean);`;

  // 6. Team entries sort
  const t6 = `    const teamEntries = Object.entries(currentTeamTotals)\n        .sort((a, b) => b[1].amount - a[1].amount);`;
  const r6 = `    const teamEntries = Object.entries(currentTeamTotals)\n        .sort((a, b) => {\n            const amtA = (typeof a[1] === 'object' && a[1] !== null && a[1].amount !== undefined) ? a[1].amount : (Number(a[1]) || 0);\n            const amtB = (typeof b[1] === 'object' && b[1] !== null && b[1].amount !== undefined) ? b[1].amount : (Number(b[1]) || 0);\n            return amtB - amtA;\n        });`;

  // 7. Team entries card loop
  const t7 = `    teamEntries.forEach(([teamId, data], index) => {`;
  const r7 = `    teamEntries.forEach(([teamId, rawData], index) => {\n        const data = (typeof rawData === 'object' && rawData !== null) ? rawData : { amount: Number(rawData) || 0, count: 0 };`;

  [ [t1, r1, 't1'], [t2, r2, 't2'], [t3, r3, 't3'], [t4, r4, 't4'], [t5, r5, 't5'], [t6, r6, 't6'], [t7, r7, 't7'] ].forEach(([t, r, label]) => {
    if (!normContent.includes(t)) {
      console.error(`[FAIL] ${label} not found in ${relPath}`);
    } else {
      normContent = normContent.replace(t, r);
    }
  });

  fs.writeFileSync(absPath, normContent, 'utf8');
  console.log(`[OK] Successfully patched ${relPath}`);
});
