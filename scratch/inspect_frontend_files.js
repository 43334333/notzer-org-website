const fs = require('fs');

const feFiles = [
  'templates/donation-page/template.html',
  'campaigns/kfw87/index.html',
  'keren-hk-m-twersky.html',
  'keren-shlomo-yechiel.html',
  'donate/index.html'
];

feFiles.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  console.log(`=== ${f} ===`);
  console.log(`custom-amount-wrapper display:none? ${content.includes('id="custom-amount-wrapper" style="display: none;"')}`);
  console.log(`Has other-ways-section? ${content.includes('id="other-ways-section"')}`);
  console.log(`Has addIfieldKeyPressCallback? ${content.includes('addIfieldKeyPressCallback')}`);
  console.log(`Has logLinkClickMaster? ${content.includes('logLinkClickMaster')}`);
  console.log(`Has daf-confirm-modal? ${content.includes('id="daf-confirm-modal"')}`);
});
