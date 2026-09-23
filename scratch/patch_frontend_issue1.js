const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const files = [
  'templates/donation-page/template.html',
  'campaigns/kfw87/index.html',
  'keren-hk-m-twersky.html',
  'keren-shlomo-yechiel.html'
];

function patchFile(relPath) {
  const filePath = path.join(repoRoot, relPath);
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Add zelle-error-display inside zelle-info if not present
  if (!content.includes('id="zelle-error-display"')) {
    const target = 'Please include your name and email address in the Zelle memo for receipt purposes.</p>';
    if (content.includes(target)) {
      content = content.replace(target, target + '\n                                        <div id="zelle-error-display" style="display: none; padding: 6px 10px; margin-top: 8px; background: rgba(255, 82, 82, 0.15); border: 1px solid #ff5252; border-radius: 5px; color: #ff5252; font-size: 0.8rem; text-align: center;"></div>');
    } else {
      console.warn(`[WARN] Could not find zelle-info target in ${relPath}`);
    }
  }

  // 2. Add modal-zelle-error inside modal-daf-step-zelle if not present
  if (!content.includes('id="modal-zelle-error"')) {
    const target = 'Please include this reference memo in the Zelle payment notes so we can credit your gift and issue a tax receipt.\n                </p>';
    const targetCRLF = 'Please include this reference memo in the Zelle payment notes so we can credit your gift and issue a tax receipt.\r\n                </p>';
    if (content.includes(target)) {
      content = content.replace(target, target + '\n                <div id="modal-zelle-error" style="display: none; padding: 8px 10px; margin-bottom: 12px; background: rgba(255, 82, 82, 0.15); border: 1px solid #ff5252; border-radius: 5px; color: #ff5252; font-size: 0.82rem; text-align: center;"></div>');
    } else if (content.includes(targetCRLF)) {
      content = content.replace(targetCRLF, targetCRLF + '\r\n                <div id="modal-zelle-error" style="display: none; padding: 8px 10px; margin-bottom: 12px; background: rgba(255, 82, 82, 0.15); border: 1px solid #ff5252; border-radius: 5px; color: #ff5252; font-size: 0.82rem; text-align: center;"></div>');
    } else {
      console.warn(`[WARN] Could not find modal-daf-step-zelle target in ${relPath}`);
    }
  }

  // 3. Update modal-paypal-status-text initial text and add modal-paypal-error inside modal-daf-step-paypal
  if (!content.includes('id="modal-paypal-error"')) {
    const target = '<p id="modal-paypal-status-text" style="font-size: 0.9rem; color: #ccc; margin-bottom: 12px;">\n                    Campaign memo copied to clipboard!\n                </p>';
    const targetCRLF = '<p id="modal-paypal-status-text" style="font-size: 0.9rem; color: #ccc; margin-bottom: 12px;">\r\n                    Campaign memo copied to clipboard!\r\n                </p>';
    const replacement = '<p id="modal-paypal-status-text" style="font-size: 0.9rem; color: #ccc; margin-bottom: 12px;">\n                    Preparing campaign memo...\n                </p>\n                <div id="modal-paypal-error" style="display: none; padding: 8px 10px; margin-bottom: 12px; background: rgba(255, 82, 82, 0.15); border: 1px solid #ff5252; border-radius: 5px; color: #ff5252; font-size: 0.82rem; text-align: center;"></div>';
    const replacementCRLF = '<p id="modal-paypal-status-text" style="font-size: 0.9rem; color: #ccc; margin-bottom: 12px;">\r\n                    Preparing campaign memo...\r\n                </p>\r\n                <div id="modal-paypal-error" style="display: none; padding: 8px 10px; margin-bottom: 12px; background: rgba(255, 82, 82, 0.15); border: 1px solid #ff5252; border-radius: 5px; color: #ff5252; font-size: 0.82rem; text-align: center;"></div>';

    if (content.includes(target)) {
      content = content.replace(target, replacement);
    } else if (content.includes(targetCRLF)) {
      content = content.replace(targetCRLF, replacementCRLF);
    } else {
      console.warn(`[WARN] Could not find modal-daf-step-paypal target in ${relPath}`);
    }
  }

  // 4. Update handleZelleClick to clear inPageZErr on toggle close, and catch error on logLinkClickMaster
  const zelleToggleTarget = `if (zelleInfo && zelleInfo.style.display === 'block') {
            zelleInfo.style.display = 'none';
            if (zelleBtn) zelleBtn.classList.remove('open');
            activeClickSessions.zelle = null;
            return;
        }`;
  const zelleToggleTargetCRLF = zelleToggleTarget.replace(/\n/g, '\r\n');
  const zelleToggleReplacement = `if (zelleInfo && zelleInfo.style.display === 'block') {
            zelleInfo.style.display = 'none';
            if (zelleBtn) zelleBtn.classList.remove('open');
            var inPageZErr = document.getElementById('zelle-error-display');
            if (inPageZErr) { inPageZErr.style.display = 'none'; inPageZErr.textContent = ''; }
            activeClickSessions.zelle = null;
            return;
        }`;

  if (content.includes(zelleToggleTarget)) {
    content = content.replace(zelleToggleTarget, zelleToggleReplacement);
  } else if (content.includes(zelleToggleTargetCRLF)) {
    content = content.replace(zelleToggleTargetCRLF, zelleToggleReplacement.replace(/\n/g, '\r\n'));
  }

  const zelleLogTarget = `logLinkClickMaster('Zelle', amt, fn, ln, em, session.id);`;
  // We need to be careful: logLinkClickMaster('Zelle', ...) is called in handleZelleClick AND in daf-confirm-proceed
  // Let's replace the one in handleZelleClick with error handler:
  const handleZelleLogTarget = `if (zelleInfo) zelleInfo.style.display = 'block';
            if (zelleBtn) zelleBtn.classList.add('open');
            logLinkClickMaster('Zelle', amt, fn, ln, em, session.id);`;
  const handleZelleLogTargetCRLF = handleZelleLogTarget.replace(/\n/g, '\r\n');
  const handleZelleLogReplacement = `var inPageZErr = document.getElementById('zelle-error-display');
            if (inPageZErr) { inPageZErr.style.display = 'none'; inPageZErr.textContent = ''; }
            if (zelleInfo) zelleInfo.style.display = 'block';
            if (zelleBtn) zelleBtn.classList.add('open');
            logLinkClickMaster('Zelle', amt, fn, ln, em, session.id).catch(function(err) {
                if (inPageZErr) {
                    inPageZErr.textContent = 'Note: could not record click reference with server (' + (err.message || err) + '). Please ensure memo is included in Zelle.';
                    inPageZErr.style.display = 'block';
                }
            });`;

  if (content.includes(handleZelleLogTarget)) {
    content = content.replace(handleZelleLogTarget, handleZelleLogReplacement);
  } else if (content.includes(handleZelleLogTargetCRLF)) {
    content = content.replace(handleZelleLogTargetCRLF, handleZelleLogReplacement.replace(/\n/g, '\r\n'));
  }

  // 5. Update setupAndShowDafModal to hide all error elements
  const setupModalTarget = `var stepForm = document.getElementById('modal-daf-step-form');
        var stepZelle = document.getElementById('modal-daf-step-zelle');
        var stepPaypal = document.getElementById('modal-daf-step-paypal');
        if (stepForm) stepForm.style.display = 'block';
        if (stepZelle) stepZelle.style.display = 'none';
        if (stepPaypal) stepPaypal.style.display = 'none';`;
  const setupModalTargetCRLF = setupModalTarget.replace(/\n/g, '\r\n');
  const setupModalReplacement = `var stepForm = document.getElementById('modal-daf-step-form');
        var stepZelle = document.getElementById('modal-daf-step-zelle');
        var stepPaypal = document.getElementById('modal-daf-step-paypal');
        if (stepForm) stepForm.style.display = 'block';
        if (stepZelle) stepZelle.style.display = 'none';
        if (stepPaypal) stepPaypal.style.display = 'none';

        var modalDafErr = document.getElementById('modal-daf-error');
        if (modalDafErr) { modalDafErr.style.display = 'none'; modalDafErr.textContent = ''; }
        var modalZErr = document.getElementById('modal-zelle-error');
        if (modalZErr) { modalZErr.style.display = 'none'; modalZErr.textContent = ''; }
        var modalPPErr = document.getElementById('modal-paypal-error');
        if (modalPPErr) { modalPPErr.style.display = 'none'; modalPPErr.textContent = ''; }`;

  if (content.includes(setupModalTarget)) {
    content = content.replace(setupModalTarget, setupModalReplacement);
  } else if (content.includes(setupModalTargetCRLF)) {
    content = content.replace(setupModalTargetCRLF, setupModalReplacement.replace(/\n/g, '\r\n'));
  }

  // 6. Update closeDafConfirm to hide all error elements
  const closeDafTarget = `function closeDafConfirm() {
        var modal = document.getElementById('daf-confirm-modal');
        if (modal) modal.classList.remove('active');
        var stepForm = document.getElementById('modal-daf-step-form');
        var stepZelle = document.getElementById('modal-daf-step-zelle');
        var stepPaypal = document.getElementById('modal-daf-step-paypal');
        if (stepForm) stepForm.style.display = 'block';
        if (stepZelle) stepZelle.style.display = 'none';
        if (stepPaypal) stepPaypal.style.display = 'none';
        pendingDafLink = null;
        pendingDafName = null;
        isZelleMode = false;
        activeClickSessions.zelle = null;
        activeClickSessions.paypal = null;
    }`;
  const closeDafTargetCRLF = closeDafTarget.replace(/\n/g, '\r\n');
  const closeDafReplacement = `function closeDafConfirm() {
        var modal = document.getElementById('daf-confirm-modal');
        if (modal) modal.classList.remove('active');
        var stepForm = document.getElementById('modal-daf-step-form');
        var stepZelle = document.getElementById('modal-daf-step-zelle');
        var stepPaypal = document.getElementById('modal-daf-step-paypal');
        if (stepForm) stepForm.style.display = 'block';
        if (stepZelle) stepZelle.style.display = 'none';
        if (stepPaypal) stepPaypal.style.display = 'none';
        var modalDafErr = document.getElementById('modal-daf-error');
        if (modalDafErr) { modalDafErr.style.display = 'none'; modalDafErr.textContent = ''; }
        var modalZErr = document.getElementById('modal-zelle-error');
        if (modalZErr) { modalZErr.style.display = 'none'; modalZErr.textContent = ''; }
        var modalPPErr = document.getElementById('modal-paypal-error');
        if (modalPPErr) { modalPPErr.style.display = 'none'; modalPPErr.textContent = ''; }
        pendingDafLink = null;
        pendingDafName = null;
        isZelleMode = false;
        activeClickSessions.zelle = null;
        activeClickSessions.paypal = null;
    }`;

  if (content.includes(closeDafTarget)) {
    content = content.replace(closeDafTarget, closeDafReplacement);
  } else if (content.includes(closeDafTargetCRLF)) {
    content = content.replace(closeDafTargetCRLF, closeDafReplacement.replace(/\n/g, '\r\n'));
  }

  // 7. Update daf-confirm-proceed for modal Zelle and PayPal
  const modalZelleLogTarget = `if (isZelleMode) {
                var session = getRouteSession('zelle');
                logLinkClickMaster('Zelle', amt, fn, ln, em, session.id);`;
  const modalZelleLogTargetCRLF = modalZelleLogTarget.replace(/\n/g, '\r\n');
  const modalZelleLogReplacement = `if (isZelleMode) {
                var session = getRouteSession('zelle');
                var modalZErr = document.getElementById('modal-zelle-error');
                if (modalZErr) { modalZErr.style.display = 'none'; modalZErr.textContent = ''; }

                logLinkClickMaster('Zelle', amt, fn, ln, em, session.id).catch(function(err) {
                    if (modalZErr) {
                        modalZErr.textContent = 'Note: could not record click reference with server (' + (err.message || err) + '). Please ensure memo is pasted in Zelle.';
                        modalZErr.style.display = 'block';
                    }
                });`;

  if (content.includes(modalZelleLogTarget)) {
    content = content.replace(modalZelleLogTarget, modalZelleLogReplacement);
  } else if (content.includes(modalZelleLogTargetCRLF)) {
    content = content.replace(modalZelleLogTargetCRLF, modalZelleLogReplacement.replace(/\n/g, '\r\n'));
  }

  // PayPal block in daf-confirm-proceed:
  // Find from } else if (pendingDafName === 'PayPal') { to logLinkClickMaster('PayPal', ...).catch(...)
  const paypalBlockRegex = /(\} else if \(pendingDafName === 'PayPal'\) \{[\s\S]*?logLinkClickMaster\('PayPal', amt, fn, ln, em, session\.id\)\.catch\(function\(err\) \{[\s\S]*?\}\);)/;

  const newPaypalBlock = `} else if (pendingDafName === 'PayPal') {
                var session = getRouteSession('paypal');
                var modalPPMemo = document.getElementById('modal-paypal-memo-display');
                if (modalPPMemo) modalPPMemo.textContent = session.memo;

                var modalPPLink = document.getElementById('modal-paypal-open-btn');
                if (modalPPLink) modalPPLink.href = pendingDafLink || 'https://www.paypal.com/us/fundraiser/charity/3380976';

                var statusText = document.getElementById('modal-paypal-status-text');
                if (statusText) statusText.textContent = 'Copying campaign memo...';

                var modalPPErr = document.getElementById('modal-paypal-error');
                if (modalPPErr) { modalPPErr.style.display = 'none'; modalPPErr.textContent = ''; }

                // Primary handoff: transition modal to PayPal Step 3 with explicit "Open PayPal →" link
                var stepForm = document.getElementById('modal-daf-step-form');
                var stepZelle = document.getElementById('modal-daf-step-zelle');
                var stepPaypal = document.getElementById('modal-daf-step-paypal');
                if (stepForm) stepForm.style.display = 'none';
                if (stepZelle) stepZelle.style.display = 'none';
                if (stepPaypal) stepPaypal.style.display = 'block';

                // Copy memo to clipboard
                safeCopyText(session.memo).then(function(copied) {
                    var memoHint = document.getElementById('modal-paypal-memo-hint');
                    if (copied) {
                        if (statusText) statusText.textContent = 'Campaign memo copied to clipboard!';
                        if (memoHint) {
                            memoHint.textContent = 'Copied!';
                            setTimeout(function() { memoHint.textContent = 'Click to copy'; }, 3000);
                        }
                    } else {
                        if (statusText) statusText.textContent = 'Please copy the campaign memo below before opening PayPal:';
                    }
                });

                logLinkClickMaster('PayPal', amt, fn, ln, em, session.id).catch(function(err) {
                    if (modalPPErr) {
                        modalPPErr.textContent = 'Note: could not record click reference with server (' + (err.message || err) + '). Please ensure memo is pasted in PayPal.';
                        modalPPErr.style.display = 'block';
                    }
                });`;

  if (paypalBlockRegex.test(content)) {
    content = content.replace(paypalBlockRegex, newPaypalBlock);
  } else {
    console.warn(`[WARN] Could not find paypalBlockRegex in ${relPath}`);
  }

  // 8. Generic DAF link catch
  const dafLinkTarget = `logLinkClickMaster(pendingDafName, amt, fn, ln, em, dafPk);\n                window.open(pendingDafLink, '_blank');`;
  const dafLinkTargetCRLF = `logLinkClickMaster(pendingDafName, amt, fn, ln, em, dafPk);\r\n                window.open(pendingDafLink, '_blank');`;
  const dafLinkReplacement = `logLinkClickMaster(pendingDafName, amt, fn, ln, em, dafPk).catch(function(err) {\n                    console.warn('Failed to log DAF link click:', err);\n                });\n                window.open(pendingDafLink, '_blank');`;

  if (content.includes(dafLinkTarget)) {
    content = content.replace(dafLinkTarget, dafLinkReplacement);
  } else if (content.includes(dafLinkTargetCRLF)) {
    content = content.replace(dafLinkTargetCRLF, dafLinkReplacement.replace(/\n/g, '\r\n'));
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`[OK] Patched ${relPath}`);
}

files.forEach(patchFile);
