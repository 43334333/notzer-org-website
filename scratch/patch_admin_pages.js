const fs = require('fs');

function normalize(str) {
  return str.replace(/\r\n/g, '\n');
}

function patchFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  let normContent = normalize(content);

  for (const rep of replacements) {
    const normSearch = normalize(rep.search);
    const normReplace = normalize(rep.replace);
    const count = normContent.split(normSearch).length - 1;
    if (count === 0) {
      throw new Error(`Target not found in ${filePath} for: ${rep.label}`);
    }
    if (count > 1 && !rep.allowMultiple) {
      throw new Error(`Target found ${count} times in ${filePath} for: ${rep.label}`);
    }
    normContent = normContent.split(normSearch).join(normReplace);
    console.log(`✅ [${filePath}] Patched: ${rep.label}`);
  }

  // Restore CRLF if original had CRLF
  if (content.includes('\r\n')) {
    content = normContent.replace(/\n/g, '\r\n');
  } else {
    content = normContent;
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

// 1-4. The four campaign admin files
const campaignAdminFiles = [
  'templates/admin-page/template.html',
  'admin/kfw87/index.html',
  'admin/keren-hk-m-twersky/index.html',
  'admin/ksy/index.html'
];

const campaignAdminReps = [
  {
    label: 'Summary Card for Fund Charge',
    search: `            <div class="summary-card accent-orange">
                <div class="card-value" id="txnTotalFees">$0.00</div>
                <div class="card-label">Total Fees</div>
            </div>
            <div class="summary-card accent-blue">
                <div class="card-value" id="txnTotalNet">$0.00</div>
                <div class="card-label">Total Net</div>
            </div>`,
    replace: `            <div class="summary-card accent-orange">
                <div class="card-value" id="txnTotalFees">$0.00</div>
                <div class="card-label">Total Fees</div>
            </div>
            <div class="summary-card accent-orange">
                <div class="card-value" id="txnTotalFundCharge">$0.00</div>
                <div class="card-label">Total Fund Charge</div>
            </div>
            <div class="summary-card accent-blue">
                <div class="card-value" id="txnTotalNet">$0.00</div>
                <div class="card-label">Total Net</div>
            </div>`
  },
  {
    label: 'Table Header Fund Charge',
    search: `                            <th>Amount</th>
                            <th>Fees</th>
                            <th>Net</th>`,
    replace: `                            <th>Amount</th>
                            <th>Fees</th>
                            <th>Fund Charge</th>
                            <th>Net</th>`
  },
  {
    label: 'Colspan 10 to 11',
    search: `colspan="10"`,
    replace: `colspan="11"`,
    allowMultiple: true
  },
  {
    label: 'Render Transactions Fund Charge column',
    search: `            <td style="font-weight:600; color:#fff;">\${formatCurrency(tx.amount || 0)}</td>
            <td style="color:#ffa94d;">\${formatCurrency(tx.fees || 0)}</td>
            <td style="font-weight:600; color:#51cf66;">\${formatCurrency(tx.net || 0)}</td>`,
    replace: `            <td style="font-weight:600; color:#fff;">\${formatCurrency(tx.amount || 0)}</td>
            <td style="color:#ffa94d;">\${formatCurrency(tx.fees || 0)}</td>
            <td style="color:#ffa94d;">\${formatCurrency(tx.fundCharge || 0)}</td>
            <td style="font-weight:600; color:#51cf66;">\${formatCurrency(tx.net || 0)}</td>`
  },
  {
    label: 'Update Transactions Summary Fund Charge',
    search: `    const elCount = document.getElementById('txnTotalCount');
    const elGross = document.getElementById('txnTotalGross');
    const elFees = document.getElementById('txnTotalFees');
    const elNet = document.getElementById('txnTotalNet');

    if (elCount) elCount.textContent = (summary.count || 0).toLocaleString();
    if (elGross) elGross.textContent = formatCurrency(summary.totalCharged || 0);
    if (elFees) elFees.textContent = formatCurrency(summary.totalFees || 0);
    if (elNet) elNet.textContent = formatCurrency(summary.totalNet || 0);`,
    replace: `    const elCount = document.getElementById('txnTotalCount');
    const elGross = document.getElementById('txnTotalGross');
    const elFees = document.getElementById('txnTotalFees');
    const elFundCharge = document.getElementById('txnTotalFundCharge');
    const elNet = document.getElementById('txnTotalNet');

    if (elCount) elCount.textContent = (summary.count || 0).toLocaleString();
    if (elGross) elGross.textContent = formatCurrency(summary.totalCharged || 0);
    if (elFees) elFees.textContent = formatCurrency(summary.totalFees || 0);
    if (elFundCharge) elFundCharge.textContent = formatCurrency(summary.totalFundCharge || 0);
    if (elNet) elNet.textContent = formatCurrency(summary.totalNet || 0);`
  }
];

for (const f of campaignAdminFiles) {
  patchFile(f, campaignAdminReps);
}

// 5. admin/index.html (Fee Defaults Modal)
const adminIndexReps = [
  {
    label: 'Fee Defaults Table Header',
    search: `                <table class="data-table" id="feeDefaultsTable">
                    <thead>
                        <tr>
                            <th style="width:40%;">Payment Method</th>
                            <th style="width:25%;">Rate (%)</th>
                            <th style="width:25%;">Flat Fee ($)</th>
                            <th style="width:10%;text-align:center;">Action</th>
                        </tr>
                    </thead>
                    <tbody id="feeDefaultsTableRows">
                        <tr><td colspan="4" class="empty-state">Loading fee defaults...</td></tr>
                    </tbody>
                </table>`,
    replace: `                <table class="data-table" id="feeDefaultsTable">
                    <thead>
                        <tr>
                            <th style="width:35%;">Payment Method</th>
                            <th style="width:20%;">Rate (%)</th>
                            <th style="width:20%;">Flat Fee ($)</th>
                            <th style="width:15%;">Fund Charge (%)</th>
                            <th style="width:10%;text-align:center;">Action</th>
                        </tr>
                    </thead>
                    <tbody id="feeDefaultsTableRows">
                        <tr><td colspan="5" class="empty-state">Loading fee defaults...</td></tr>
                    </tbody>
                </table>`
  },
  {
    label: 'Render Fee Defaults Table rows',
    search: `    tbody.innerHTML = items.map((item, idx) => {
        const ratePct = typeof item.rate === 'number' ? (item.rate * 100).toFixed(2) : (parseFloat(item.rate) * 100 || 0).toFixed(2);
        const flatVal = typeof item.flat === 'number' ? item.flat.toFixed(2) : (parseFloat(item.flat) || 0).toFixed(2);
        return \`
            <tr data-index="\${idx}">
                <td style="padding:6px 8px;">
                    <input type="text" class="fee-def-method" value="\${escapeHtml(item.method || '')}" placeholder="Payment Method" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:6px;color:var(--text-primary);font-size:0.85rem;">
                </td>
                <td style="padding:6px 8px;">
                    <div style="display:flex;align-items:center;gap:4px;">
                        <input type="number" step="0.01" min="0" max="100" class="fee-def-rate" value="\${ratePct}" style="width:90px;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:6px;color:var(--text-primary);font-size:0.85rem;text-align:right;">
                        <span style="color:var(--text-muted);font-size:0.85rem;">%</span>
                    </div>
                </td>
                <td style="padding:6px 8px;">
                    <div style="display:flex;align-items:center;gap:4px;">
                        <span style="color:var(--text-muted);font-size:0.85rem;">$</span>
                        <input type="number" step="0.01" min="0" class="fee-def-flat" value="\${flatVal}" style="width:90px;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:6px;color:var(--text-primary);font-size:0.85rem;text-align:right;">
                    </div>
                </td>
                <td style="padding:6px 8px;text-align:center;">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="deleteFeeDefaultRow(\${idx})" title="Delete method" style="color:var(--error);padding:4px 8px;font-size:0.8rem;">✕</button>
                </td>
            </tr>
        \`;
    }).join('');`,
    replace: `    tbody.innerHTML = items.map((item, idx) => {
        const ratePct = typeof item.rate === 'number' ? (item.rate * 100).toFixed(2) : (parseFloat(item.rate) * 100 || 0).toFixed(2);
        const flatVal = typeof item.flat === 'number' ? item.flat.toFixed(2) : (parseFloat(item.flat) || 0).toFixed(2);
        const fcVal = item.fundCharge !== undefined ? (typeof item.fundCharge === 'number' ? (item.fundCharge * 100).toFixed(2) : (parseFloat(item.fundCharge) * 100 || 0).toFixed(2)) : '1.00';
        return \`
            <tr data-index="\${idx}">
                <td style="padding:6px 8px;">
                    <input type="text" class="fee-def-method" value="\${escapeHtml(item.method || '')}" placeholder="Payment Method" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:6px;color:var(--text-primary);font-size:0.85rem;">
                </td>
                <td style="padding:6px 8px;">
                    <div style="display:flex;align-items:center;gap:4px;">
                        <input type="number" step="0.01" min="0" max="100" class="fee-def-rate" value="\${ratePct}" style="width:90px;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:6px;color:var(--text-primary);font-size:0.85rem;text-align:right;">
                        <span style="color:var(--text-muted);font-size:0.85rem;">%</span>
                    </div>
                </td>
                <td style="padding:6px 8px;">
                    <div style="display:flex;align-items:center;gap:4px;">
                        <span style="color:var(--text-muted);font-size:0.85rem;">$</span>
                        <input type="number" step="0.01" min="0" class="fee-def-flat" value="\${flatVal}" style="width:90px;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:6px;color:var(--text-primary);font-size:0.85rem;text-align:right;">
                    </div>
                </td>
                <td style="padding:6px 8px;">
                    <div style="display:flex;align-items:center;gap:4px;">
                        <input type="number" step="0.01" min="0" max="100" class="fee-def-fund-charge" value="\${fcVal}" style="width:90px;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:6px;color:var(--text-primary);font-size:0.85rem;text-align:right;">
                        <span style="color:var(--text-muted);font-size:0.85rem;">%</span>
                    </div>
                </td>
                <td style="padding:6px 8px;text-align:center;">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="deleteFeeDefaultRow(\${idx})" title="Delete method" style="color:var(--error);padding:4px 8px;font-size:0.8rem;">✕</button>
                </td>
            </tr>
        \`;
    }).join('');`
  },
  {
    label: 'syncFeeDefaultsFromInputs Fund Charge',
    search: `        const methodInput = row.querySelector('.fee-def-method');
        const rateInput = row.querySelector('.fee-def-rate');
        const flatInput = row.querySelector('.fee-def-flat');
        if (methodInput) {
            const m = methodInput.value.trim();
            if (m) {
                const rate = (parseFloat(rateInput?.value) || 0) / 100;
                const flat = parseFloat(flatInput?.value) || 0;
                updated.push({ method: m, rate: rate, flat: flat });
            }
        }`,
    replace: `        const methodInput = row.querySelector('.fee-def-method');
        const rateInput = row.querySelector('.fee-def-rate');
        const flatInput = row.querySelector('.fee-def-flat');
        const fcInput = row.querySelector('.fee-def-fund-charge');
        if (methodInput) {
            const m = methodInput.value.trim();
            if (m) {
                const rate = (parseFloat(rateInput?.value) || 0) / 100;
                const flat = parseFloat(flatInput?.value) || 0;
                const fc = fcInput ? (parseFloat(fcInput.value) || 0) / 100 : 0.01;
                updated.push({ method: m, rate: rate, flat: flat, fundCharge: fc });
            }
        }`
  },
  {
    label: 'addFeeDefaultRow Fund Charge default',
    search: `    FEE_DEFAULTS_STATE.data.push({ method: '', rate: 0, flat: 0 });`,
    replace: `    FEE_DEFAULTS_STATE.data.push({ method: '', rate: 0, flat: 0, fundCharge: 0.01 });`
  },
  {
    label: 'Colspan 4 to 5 in empty states',
    search: `colspan="4" class="empty-state"`,
    replace: `colspan="5" class="empty-state"`,
    allowMultiple: true
  }
];

patchFile('admin/index.html', adminIndexReps);
console.log('🎉 ALL ADMIN FILES PATCHED SUCCESSFULLY!');
