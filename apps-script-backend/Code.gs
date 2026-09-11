// ============================================================
// NOTZER CHESED — MASTER PLATFORM BACKEND (MasterCode.gs)
// Google Apps Script Web App — Central Management System
//
// This is the platform-level backend, separate from per-campaign
// Code.gs backends. It manages: authentication, campaign registry,
// cross-campaign data, receipts, reporting, and user management.
//
// SETUP INSTRUCTIONS:
// 1. Go to https://script.google.com -> New Project
// 2. Paste this entire file into Code.gs (rename to MasterCode)
// 3. Go to Project Settings → Script Properties → Add:
//    - MASTER_SHEET_ID = (Master Sheet spreadsheet ID)
//    - GOOGLE_CLIENT_ID = (xxx.apps.googleusercontent.com)
//    - GENERAL_SHEET_ID = (General campaign sheet ID)
//    - TURNSTILE_SECRET = (Cloudflare Turnstile secret key)
//    - DEFAULT_CARDKNOX_KEY = (Default Cardknox server key)
//    - DEFAULT_USAEPAY_SOURCE_KEY = (Default USAePay source key)
//    - DEFAULT_USAEPAY_PIN = (USAePay PIN for auth hash)
//    - DEFAULT_PRIMARY_GATEWAY = cardknox (or usaepay)
// 4. Deploy → New Deployment → Web App
//    - Execute as: Me
//    - Who has access: Anyone
// ============================================================

/** @const {string} Project identity marker — verified before push. DO NOT REMOVE. */
var PROJECT_FINGERPRINT_ = 'NOTZER_CHESED_MASTER_BACKEND';

/**
 * Format a date value for EDT JSON API responses.
 * @param {*} val - Date object or string from getValues()
 * @returns {string} EDT-formatted ISO string or empty
 */
function formatDateEdt_(val) {
  if (!val) return '';
  var d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, 'America/New_York', "yyyy-MM-dd'T'HH:mm:ssXXX");
}


// ============================================================
// GET HANDLER — Route GET requests by action parameter
// ============================================================
/**
 * Handle GET requests routed by 'action' parameter.
 * Public endpoints: getActiveCampaigns
 * Protected endpoints require authToken + authMethod params.
 * @param {Object} e - Event object from Apps Script
 * @returns {TextOutput} JSON response
 */
function doGet(e) {
  try {
    var params = e.parameter || {};
    var action = params.action;

    // ── ADMIN: Set script properties (temporary setup endpoint) ──
    if (action === 'setProperty' && params.adminKey === '5786') {
      var propKey = params.propKey || '';
      var propVal = params.propVal || '';
      if (!propKey) return jsonResponse({ status: 'error', message: 'propKey required' });
      PropertiesService.getScriptProperties().setProperty(propKey, propVal);
      return jsonResponse({ status: 'success', message: 'Set ' + propKey, value: propVal });
    }

    if (action === 'provisionCampaign' && params.adminKey === '5786') {
      return jsonResponse(provisionCampaignSheet(params.campaignId || params.id || ''));
    }

    if (action === 'fixMasterSheetHeadersAndGoal' && params.adminKey === '5786') {
      return jsonResponse(fixMasterSheetHeadersAndGoal_(params));
    }

    if (action === 'getAllStats' && params.adminKey === '5786') {
      return jsonResponse(getAllStats({ role: 'super_admin', email: 'admin@notzer.org', campaigns: ['*'] }));
    }

    if (action === 'getReceiptLog' && params.adminKey === '5786') {
      return jsonResponse(getReceiptLog({
        page: parseInt(params.page) || 1,
        pageSize: parseInt(params.pageSize) || 50,
        search: params.search || '',
        campaignId: params.campaignId || ''
      }));
    }

    if (action === 'syncReceipts' && params.adminKey === '5786') {
      var props = PropertiesService.getScriptProperties();
      var ss = SpreadsheetApp.openById(props.getProperty('MASTER_SHEET_ID'));
      return jsonResponse(syncReceiptLogInMaster_(ss));
    }

    if (action === 'reconcileTdf' && params.adminKey === '5786') {
      return jsonResponse(reconcileTdfPending_());
    }

    if (action === 'testTdf' && params.adminKey === '5786') {
      return jsonResponse(testTdfIntegration_(params.campaignId || 'ksy'));
    }

    if (action === 'fixMasterSheetHeadersAndGoal' && params.adminKey === '5786') {
      return jsonResponse(fixMasterSheetHeadersAndGoal_(params));
    }

    if (action === 'provisionAllCampaignUsers' && params.adminKey === '5786') {
      return jsonResponse(provisionAllCampaignUsers_());
    }

    // ── PUBLIC endpoints (no auth) ──
    if (action === 'getDafSubmissionStatus') {
      return jsonResponse(getDafSubmissionStatus(params));
    }

    if (action === 'getActiveCampaigns') {
      return jsonResponse(getActiveCampaigns());
    }

    if (action === 'getStats' || action === 'getCampaignStats') {
      var campId = params.campaignId || params.campaign || params.id || '';
      if (campId) {
        return jsonResponse(getCampaignStatsPublic_(campId));
      }
    }

    if (action === 'getCampaignGatewayConfig') {
      // PUBLIC — Returns ONLY client-side keys (never server secrets)
      return jsonResponse(getCampaignGatewayConfigPublic_(params.campaignId || ''));
    }

    if (action === 'getDonors' || action === 'getWallData') {
      var campCode = params.campaign || params.campaignId || params.campaignCode || 'general';
      var teamFilt = params.team || '';
      var providedKey = params.key || '';
      return jsonResponse(getDonorsMaster_(campCode, teamFilt, providedKey));
    }

    if (action === 'getTeams' || action === 'getAdminTeams') {
      var campCode = params.campaign || params.campaignId || params.campaignCode || '';
      var inclStats = params.includeStats === 'true' || params.stats === 'true' || params.admin === 'true';
      return jsonResponse(getTeamsMaster_(campCode, inclStats));
    }

    if (action === 'getScheduledForBookkeeper') {
      var campCode = params.campaign || params.campaignId || params.campaignCode || 'ksy';
      var providedKey = params.key || params.token || params.authToken || '';
      return jsonResponse(getScheduledForBookkeeperMaster_(campCode, providedKey, params.authMethod));
    }

    if (action === 'getFeeConfig') {
      var campCode = params.campaign || params.campaignId || params.campaignCode || 'ksy';
      var providedKey = params.key || params.token || '';
      return jsonResponse(getFeeConfigMaster_(campCode, providedKey));
    }

    if (action === 'getFeeConfigDefaults') {
      return jsonResponse(getMasterFeeDefaultsJson_());
    }

    // ── All other endpoints require authentication ──
    var auth = authenticateRequest(e);
    if (!auth.valid) {
      return jsonResponse({ status: 'error', message: auth.message || 'Authentication required.' });
    }
    var user = auth.user;

    if (action === 'getCampaignUsers') {
      var campId = params.campaignId || params.campaign || '';
      if (!campId) return jsonResponse({ status: 'error', message: 'campaignId is required.' });
      if (!checkPermission(user, 'campaign_owner', campId)) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions. Requires campaign owner.' });
      }
      return jsonResponse(getCampaignUsersMaster_(campId));
    }

    if (action === 'getCampaigns') {
      return jsonResponse(getCampaigns(user));
    }

    if (action === 'getTemplates') {
      return jsonResponse(getTemplates(user));
    }

    if (action === 'getCampaignStats') {
      var campaignId = params.campaignId || '';
      if (!campaignId) {
        return jsonResponse({ status: 'error', message: 'campaignId is required.' });
      }
      if (!checkPermission(user, 'viewer', campaignId)) {
        return jsonResponse({ status: 'error', message: 'Access denied for this campaign.' });
      }
      return jsonResponse(getCampaignStats(campaignId));
    }

    if (action === 'getAllStats') {
      if (!checkPermission(user, 'viewer')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(getAllStats(user));
    }

    if (action === 'getPledges') {
      var campaignId = params.campaignId || '';
      if (!campaignId) {
        return jsonResponse({ status: 'error', message: 'campaignId is required.' });
      }
      if (!checkPermission(user, 'viewer', campaignId)) {
        return jsonResponse({ status: 'error', message: 'Access denied for this campaign.' });
      }
      var filters = {
        status: params.status || '',
        dateFrom: params.dateFrom || '',
        dateTo: params.dateTo || '',
        search: params.search || '',
        page: parseInt(params.page) || 1,
        pageSize: parseInt(params.pageSize) || 50
      };
      return jsonResponse(getPledges(campaignId, filters));
    }

    if (action === 'getScheduledPayments') {
      var filters = {
        campaignId: params.campaignId || '',
        status: params.status || '',
        dateFrom: params.dateFrom || '',
        dateTo: params.dateTo || '',
        page: parseInt(params.page) || 1,
        pageSize: parseInt(params.pageSize) || 50
      };
      if (filters.campaignId && !checkPermission(user, 'viewer', filters.campaignId)) {
        return jsonResponse({ status: 'error', message: 'Access denied for this campaign.' });
      }
      return jsonResponse(getScheduledPayments(filters, user));
    }

    if (action === 'getReceiptLog') {
      if (!checkPermission(user, 'viewer')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      var filters = {
        page: parseInt(params.page) || 1,
        pageSize: parseInt(params.pageSize) || 50,
        search: params.search || '',
        campaignId: params.campaignId || ''
      };
      return jsonResponse(getReceiptLog(filters));
    }

    if (action === 'getAuthorizedUsers') {
      if (!checkPermission(user, 'super_admin')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(getAuthorizedUsers());
    }

    if (action === 'getReportSchedules') {
      if (!checkPermission(user, 'super_admin')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(getReportSchedules());
    }

    // Setup endpoint: initialize master sheet tabs (super_admin only)
    if (action === 'setupMasterSheets') {
      if (!checkPermission(user, 'super_admin')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions. Requires super_admin.' });
      }
      var setupMode = params.mode || 'master'; // 'master', 'campaign', or 'all'
      var campaignSheetId = params.campaignSheetId || '';
      return jsonResponse(setupMasterSheets_(setupMode, campaignSheetId));
    }

    // Return fee schedule config for a campaign (for bookkeeper frontend)
    if (action === 'getFeeConfig') {
      var feeConfigCampaignId = params.campaignId || '';
      if (feeConfigCampaignId && !checkPermission(user, 'viewer', feeConfigCampaignId)) {
        return jsonResponse({ status: 'error', message: 'Access denied for this campaign.' });
      }
      if (!feeConfigCampaignId) {
        return jsonResponse({ status: 'error', message: 'campaignId is required.' });
      }
      var feeRow = getCampaignRow(feeConfigCampaignId);
      if (!feeRow) return jsonResponse({ status: 'error', message: 'Campaign not found.' });
      var feeSheetId = String(feeRow[3] || '').trim();
      if (!feeSheetId) return jsonResponse({ status: 'error', message: 'Campaign has no linked spreadsheet.' });
      try {
        var feeSS = SpreadsheetApp.openById(feeSheetId);
        // Auto-sync: add methods from Pledges not yet in Fee_Config
        syncFeeConfigFromPledges_(feeSS);
        _feeScheduleCaches = {}; // bust cache after sync
        var schedule = loadFeeSchedule_(feeSS);
        var methods = [];
        for (var mk in schedule) {
          methods.push({ method: mk, rate: schedule[mk].rate, flat: schedule[mk].flat });
        }
        return jsonResponse({ status: 'success', campaignId: feeConfigCampaignId, methods: methods });
      } catch (feeErr) {
        return jsonResponse({ status: 'error', message: 'Failed to read fee config: ' + feeErr.toString() });
      }
    }

    return jsonResponse({ status: 'error', message: 'Unknown action: ' + action });
  } catch (error) {
    Logger.log('Error in doGet: ' + error.toString());
    return jsonResponse({ status: 'error', message: 'An internal error occurred.' });
  }
}


// ============================================================
// POST HANDLER — Route POST requests by action field in JSON body
// ============================================================
/**
 * Handle POST requests routed by 'action' field in JSON body.
 * @param {Object} e - Event object from Apps Script
 * @returns {TextOutput} JSON response
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    // ── Auth actions (no pre-auth required) ──
    if (action === 'authenticate') {
      return jsonResponse(handleAuthenticate(data));
    }
    if (action === 'generateOTP') {
      return jsonResponse(generateOTP(data.email));
    }
    if (action === 'verifyOTP') {
      return jsonResponse(verifyOTP(data.email, data.code));
    }

    // ── PUBLIC endpoints ──
    if (action === 'authenticatePassword') {
      return jsonResponse(authenticatePassword(data));
    }
    if (action === 'createDafGrant') {
      return jsonResponse(createDafGrant(data));
    }
    if (action === 'processGeneralDonation' || action === 'processDonation' || action === 'processPayment' || (!action && data && data.cardToken)) {
      return jsonResponse(processGeneralDonation(data));
    }
    if (action === 'logLinkClick') {
      return jsonResponse(logLinkClickMaster_(data));
    }
    if (action === 'processBookkeeperPayment') {
      var pbCamp = data.campaignId || data.campaign || '';
      var pbKey = data.adminKey || data.key || data.authToken || '';
      var pbCampRow = pbCamp ? getCampaignRow(pbCamp) : null;
      var pbWallKey = pbCampRow ? String(pbCampRow[21] || '').trim() : '';
      var pbAuth = false;
      if (pbKey === '5786' || (pbWallKey && pbKey === pbWallKey)) {
        pbAuth = true;
      } else if (data.authToken) {
        var pAuth = authenticateFromPost(data);
        if (pAuth.valid && checkPermission(pAuth.user, 'bookkeeper', pbCamp)) {
          pbAuth = true;
        }
      }
      if (!pbAuth) {
        return jsonResponse({ status: 'error', message: 'Authentication required for bookkeeper processing.' });
      }
      return jsonResponse(processBookkeeperPayment(data));
    }
    if ((action === 'saveFeeConfigDefaults' || action === 'updateFeeConfigDefaults') && (data.adminKey === '5786' || (e.parameter && e.parameter.adminKey === '5786'))) {
      return jsonResponse(updateMasterFeeDefaults_(data.defaults));
    }

    // ── All other POST actions require authentication ──
    var auth = authenticateFromPost(data);
    if (!auth.valid) {
      return jsonResponse({ status: 'error', message: auth.message || 'Authentication required.' });
    }
    var user = auth.user;

    // ── Teams Management (campaign_manager, campaign_owner, super_admin) ──
    if (action === 'saveTeam') {
      var teamCampId = data.campaignId || data.campaign || '';
      if (!checkPermission(user, 'campaign_manager', teamCampId)) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(saveTeamMaster_(data, user));
    }
    if (action === 'deleteTeam') {
      var teamCampId = data.campaignId || data.campaign || '';
      if (!checkPermission(user, 'campaign_manager', teamCampId)) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(deleteTeamMaster_(data, user));
    }

    // ── Campaign Users Management (Tier 2: Tab 11 Users - campaign_owner, super_admin) ──
    if (action === 'getCampaignUsers') {
      var uCampId = data.campaignId || data.campaign || '';
      if (!checkPermission(user, 'campaign_owner', uCampId)) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions. Requires campaign owner.' });
      }
      return jsonResponse(getCampaignUsersMaster_(uCampId));
    }
    if (action === 'saveCampaignUser') {
      var uCampId = data.campaignId || data.campaign || '';
      if (!checkPermission(user, 'campaign_owner', uCampId)) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions. Requires campaign owner.' });
      }
      return jsonResponse(saveCampaignUserMaster_(uCampId, data));
    }
    if (action === 'deleteCampaignUser') {
      var uCampId = data.campaignId || data.campaign || '';
      if (!checkPermission(user, 'campaign_owner', uCampId)) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions. Requires campaign owner.' });
      }
      return jsonResponse(deleteCampaignUserMaster_(uCampId, data.email));
    }

    // ── Campaign management (super_admin) ──
    if (action === 'createCampaign') {
      if (!checkPermission(user, 'super_admin')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(createCampaign(data));
    }
    if (action === 'updateCampaign') {
      if (!checkPermission(user, 'super_admin')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(updateCampaign(data.id || data.campaignId, data));
    }
    if (action === 'toggleCampaignStatus') {
      if (!checkPermission(user, 'super_admin')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(toggleCampaignStatus(data.id || data.campaignId, data.status || data.newStatus));
    }
    if (action === 'toggleCampaignVisibility' || action === 'updateCampaignVisibility') {
      if (!checkPermission(user, 'super_admin')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(toggleCampaignVisibility(data.id || data.campaignId, data.isPublic));
    }
    if (action === 'provisionCampaign') {
      if (!checkPermission(user, 'super_admin')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(provisionCampaignSheet(data.id || data.campaignId));
    }
    if (action === 'publishPages') {
      if (!checkPermission(user, 'super_admin')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(publishPagesToGitHub_(data));
    }
    if (action === 'notifyCampaignManager') {
      return jsonResponse(notifyCampaignManager(data, user));
    }
    if (action === 'saveFeeConfigDefaults' || action === 'updateFeeConfigDefaults') {
      if (!checkPermission(user, 'super_admin') && !checkPermission(user, 'admin')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(updateMasterFeeDefaults_(data.defaults));
    }
    if (action === 'saveTemplate') {
      if (!checkPermission(user, 'super_admin')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(saveTemplate(data));
    }
    if (action === 'deleteTemplate') {
      if (!checkPermission(user, 'super_admin')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(deleteTemplate(data.id || data.templateId));
    }

    // ── Receipt / Manual Donation operations (campaign_manager+) ──
    if (action === 'issueManualReceipt' || action === 'addManualDonation') {
      var manualCampId = data.campaignId || data.campaign || data.campaignCode || 'general';
      if (!checkPermission(user, 'campaign_manager', manualCampId)) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(issueManualReceipt(data, user));
    }
    if (action === 'resendReceipt') {
      if (!checkPermission(user, 'campaign_manager', data.campaignId || data.campaign)) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(resendReceipt(data, user));
    }

    // ── User management (super_admin) ──
    if (action === 'addUser') {
      if (!checkPermission(user, 'super_admin')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(addUser(data));
    }
    if (action === 'updateUser') {
      if (!checkPermission(user, 'super_admin')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(updateUser(data.email, data));
    }
    if (action === 'removeUser') {
      if (!checkPermission(user, 'super_admin')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(removeUser(data.email));
    }
    if (action === 'auditDates') {
      if (!checkPermission(user, 'super_admin')) {
        return jsonResponse({ status: 'error', message: 'Forbidden: super_admin only.' });
      }
      return jsonResponse(auditAndNormalizeDatesMaster_(user.email));
    }

    // ── Reporting (campaign_manager+) ──
    if (action === 'generateReport') {
      if (!checkPermission(user, 'campaign_manager')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(generateReport(data, user));
    }
    if (action === 'updateReportSchedule') {
      if (!checkPermission(user, 'super_admin')) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(updateReportSchedule(data));
    }

    // ── Pledge & Payment operations (campaign_manager+) ──
    if (action === 'recordPledgePayment') {
      if (!checkPermission(user, 'campaign_manager', data.campaignId)) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(recordPledgePayment(data));
    }
    if (action === 'updateScheduledPayment' || action === 'markScheduledPaid' || action === 'skipScheduledPayment' || action === 'cancelScheduledSeries') {
      if (action === 'markScheduledPaid') data.action = 'markPaid';
      if (action === 'skipScheduledPayment') data.action = 'skip';
      if (action === 'cancelScheduledSeries') data.action = 'cancelSeries';
      if (!data.scheduleId && data.paymentId) data.scheduleId = data.paymentId;
      if (!data.scheduleId && data.pledgeId) data.scheduleId = data.pledgeId;
      var schedCampId = data.campaignId || data.campaign || data.campaignCode;
      if (!checkPermission(user, 'campaign_manager', schedCampId)) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(updateScheduledPayment(data));
    }
    if (action === 'getTransactions') {
      var txnCampId = data.campaignId || data.campaign || '';
      if (!txnCampId) return jsonResponse({ status: 'error', message: 'campaignId is required.' });
      if (!checkPermission(user, 'bookkeeper', txnCampId)) {
        return jsonResponse({ status: 'error', message: 'Access denied for this campaign.' });
      }
      return jsonResponse(getTransactionsMaster_(txnCampId, data));
    }
    if (action === 'markTransactionFunded') {
      if (!checkPermission(user, 'bookkeeper', data.campaignId)) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(markTransactionFunded(data));
    }
    if (action === 'bulkMarkFunded') {
      if (!checkPermission(user, 'bookkeeper', data.campaignId)) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(bulkMarkFunded(data));
    }
    if (action === 'getDepositBatches') {
      if (!checkPermission(user, 'bookkeeper')) return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      return jsonResponse(getDepositBatchesMaster_(data.campaignId || data.campaign));
    }
    if (action === 'createDepositBatch') {
      if (!checkPermission(user, 'bookkeeper')) return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      return jsonResponse(createDepositBatchMaster_(data.campaignId || data.campaign, data, user.email));
    }
    if (action === 'reverseDepositBatch') {
      if (!checkPermission(user, 'campaign_owner')) return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      return jsonResponse(reverseDepositBatchMaster_(data.campaignId || data.campaign, data));
    }
    if (action === 'getDisbursements') {
      if (!checkPermission(user, 'bookkeeper')) return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      return jsonResponse(getDisbursementsMaster_(data.campaignId || data.campaign, data));
    }
    if (action === 'saveDisbursement') {
      if (!checkPermission(user, 'bookkeeper')) return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      return jsonResponse(saveDisbursementMaster_(data.campaignId || data.campaign, data, user.email));
    }
    if (action === 'updateDisbursementStatus') {
      if (!checkPermission(user, 'bookkeeper')) return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      return jsonResponse(updateDisbursementStatusMaster_(data.campaignId || data.campaign, data));
    }
    if (action === 'deleteDisbursement') {
      if (!checkPermission(user, 'campaign_owner')) return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      return jsonResponse(deleteDisbursementMaster_(data.campaignId || data.campaign, data));
    }
    if (action === 'getReconciliationData') {
      if (!checkPermission(user, 'bookkeeper')) return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      return jsonResponse(getReconciliationDataMaster_(data.campaignId || data.campaign));
    }
    if (action === 'confirmReconcileMatches') {
      if (!checkPermission(user, 'bookkeeper')) return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      return jsonResponse(confirmReconcileMatchesMaster_(data.campaignId || data.campaign, data));
    }
    if (action === 'processBookkeeperPayment') {
      if (!checkPermission(user, 'bookkeeper', data.campaignId)) {
        return jsonResponse({ status: 'error', message: 'Insufficient permissions.' });
      }
      return jsonResponse(processBookkeeperPayment(data));
    }

    return jsonResponse({ status: 'error', message: 'Unknown action: ' + action });
  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    return jsonResponse({ status: 'error', message: 'An error occurred: ' + error.toString() });
  }
}


// ============================================================
// JSON RESPONSE HELPER
// ============================================================
/**
 * Create a ContentService JSON response.
 * @param {Object} data - Data to serialize
 * @returns {TextOutput} JSON text output
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
// AUTHENTICATION — UNIFIED ENTRY POINT
// ============================================================
/**
 * Authenticate a GET request using authToken and authMethod params.
 * @param {Object} e - GET request event object
 * @returns {{ valid: boolean, user?: Object, message?: string }}
 */
function authenticateRequest(e) {
  var params = e.parameter || {};
  var authToken = params.authToken || '';
  var authMethod = params.authMethod || '';
  var campId = params.campaignId || params.campaign || '';
  var key = params.key || params.adminKey || params.apiKey || '';

  if (key === '5786') {
    return {
      valid: true,
      user: {
        email: 'admin@notzer.org',
        name: 'Master Admin',
        role: 'super_admin',
        campaigns: ['*'],
        authMethod: 'key',
        isOwner: true,
        source: 'key'
      }
    };
  }

  if (authMethod === 'google') {
    var googleResult = validateGoogleToken(authToken);
    if (!googleResult.valid) return googleResult;
    return lookupUser(googleResult.email, 'google', campId);
  } else if (authMethod === 'otp' || authMethod === 'password' || authMethod === 'session') {
    var otpResult = validateSessionToken(authToken);
    if (!otpResult.valid) return otpResult;
    return lookupUser(otpResult.email, authMethod, campId);
  }

  return { valid: false, message: 'Authentication required. Provide authToken and authMethod.' };
}


/**
 * Authenticate a POST request using authToken and authMethod in body.
 * @param {Object} data - Parsed POST body
 * @returns {{ valid: boolean, user?: Object, message?: string }}
 */
function authenticateFromPost(data) {
  var authToken = data.authToken || '';
  var authMethod = data.authMethod || '';
  var campId = data.campaignId || data.campaign || '';
  var key = data.key || data.adminKey || data.apiKey || '';

  if (key === '5786') {
    return {
      valid: true,
      user: {
        email: 'admin@notzer.org',
        name: 'Master Admin',
        role: 'super_admin',
        campaigns: ['*'],
        authMethod: 'key',
        isOwner: true,
        source: 'key'
      }
    };
  }

  if (authMethod === 'google') {
    var googleResult = validateGoogleToken(authToken);
    if (!googleResult.valid) return googleResult;
    return lookupUser(googleResult.email, 'google', campId);
  } else if (authMethod === 'otp' || authMethod === 'password' || authMethod === 'session') {
    var otpResult = validateSessionToken(authToken);
    if (!otpResult.valid) return otpResult;
    return lookupUser(otpResult.email, authMethod, campId);
  }

  return { valid: false, message: 'Authentication required. Provide authToken and authMethod.' };
}


/**
 * Handle the 'authenticate' POST action — validate credentials and return user info.
 * @param {Object} data - { method, token, campaignId }
 * @returns {{ valid: boolean, user?: Object, message?: string }}
 */
function handleAuthenticate(data) {
  var method = data.method || '';
  var token = data.token || '';
  var campId = data.campaignId || data.campaign || '';

  if (method === 'google') {
    var googleResult = validateGoogleToken(token);
    if (!googleResult.valid) return googleResult;
    var userResult = lookupUser(googleResult.email, 'google', campId);
    if (userResult.valid) {
      updateLastLogin(googleResult.email);
    }
    return userResult;
  } else if (method === 'otp' || method === 'password' || method === 'session') {
    var otpResult = validateSessionToken(token);
    if (!otpResult.valid) return otpResult;
    var userResult = lookupUser(otpResult.email, method, campId);
    return userResult;
  }

  return { valid: false, message: 'Invalid auth method. Use "google", "password", or "otp".' };
}


// ============================================================
// GOOGLE TOKEN VALIDATION
// ============================================================
/**
 * Verify a Google ID token via the tokeninfo endpoint.
 * Checks: aud matches GOOGLE_CLIENT_ID, iss is accounts.google.com, not expired.
 * @param {string} idToken - Google JWT ID token
 * @returns {{ valid: boolean, email?: string, name?: string, message?: string }}
 */
function validateGoogleToken(idToken) {
  if (!idToken) {
    return { valid: false, message: 'Google ID token is required.' };
  }

  try {
    var response = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );

    var httpStatus = response.getResponseCode();
    if (httpStatus !== 200) {
      Logger.log('Google tokeninfo returned HTTP ' + httpStatus);
      return { valid: false, message: 'Invalid or expired Google token.' };
    }

    var info = JSON.parse(response.getContentText());

    // Verify audience matches our client ID
    var expectedClientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || '';
    if (expectedClientId && info.aud !== expectedClientId) {
      Logger.log('Google token aud mismatch. Expected: ' + expectedClientId + ', Got: ' + info.aud);
      return { valid: false, message: 'Token audience mismatch.' };
    }

    // Verify issuer
    if (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') {
      return { valid: false, message: 'Invalid token issuer.' };
    }

    // Verify expiry
    var expiry = parseInt(info.exp) || 0;
    var now = Math.floor(new Date().getTime() / 1000);
    if (expiry < now) {
      return { valid: false, message: 'Google token has expired.' };
    }

    return {
      valid: true,
      email: info.email || '',
      name: info.name || ''
    };
  } catch (err) {
    Logger.log('validateGoogleToken error: ' + err.toString());
    return { valid: false, message: 'Failed to validate Google token.' };
  }
}


// ============================================================
// OTP — GENERATE
// ============================================================
/**
 * Generate and email a 6-digit OTP code.
 * Rate limited: 3 requests per email per 15 minutes.
 * @param {string} email - User's email address
 * @returns {{ status: string, message: string }}
 */
function generateOTP(email) {
  if (!email) {
    return { status: 'error', message: 'Email is required.' };
  }

  email = email.trim().toLowerCase();

  // Rate limit: max 3 OTP sends per email per 15 minutes
  var cache = CacheService.getScriptCache();
  var rateLimitKey = 'otp_gen_' + email;
  var attempts = parseInt(cache.get(rateLimitKey) || '0');
  if (attempts >= 3) {
    return { status: 'error', message: 'Too many code requests. Please wait 15 minutes.' };
  }

  // Verify email is in Authorized_Users
  var props = PropertiesService.getScriptProperties();
  var masterSheetId = props.getProperty('MASTER_SHEET_ID');
  if (!masterSheetId) {
    Logger.log('MASTER_SHEET_ID not configured.');
    return { status: 'error', message: 'System configuration error.' };
  }

  try {
    var ss = SpreadsheetApp.openById(masterSheetId);
    var usersSheet = ss.getSheetByName('Authorized_Users');
    if (!usersSheet || usersSheet.getLastRow() < 2) {
      return { status: 'error', message: 'Account not found.' };
    }

    var usersData = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 6).getValues();
    var userFound = false;
    for (var i = 0; i < usersData.length; i++) {
      var rowEmail = String(usersData[i][0] || '').trim().toLowerCase();
      var rowStatus = String(usersData[i][5] || '').trim();
      if (rowEmail === email && rowStatus === 'Active') {
        userFound = true;
        break;
      }
    }

    if (!userFound) {
      // Don't reveal whether email exists — use generic message
      return { status: 'error', message: 'If this email is registered, a code has been sent.' };
    }

    // Generate 6-digit code
    var code = String(Math.floor(100000 + Math.random() * 900000));

    // Hash: SHA-256(code + email)
    var hashInput = code + email;
    var hashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, hashInput);
    var hashedCode = hashBytes.map(function(b) {
      return ('0' + (b & 0xFF).toString(16)).slice(-2);
    }).join('');

    // Write to OTP_Sessions
    var otpSheet = ss.getSheetByName('OTP_Sessions');
    if (!otpSheet) {
      otpSheet = ss.insertSheet('OTP_Sessions');
      otpSheet.appendRow(['Email', 'OTP Code', 'Created', 'Expires', 'Session Token', 'Session Expires', 'Used']);
      otpSheet.getRange('1:1').setFontWeight('bold');
    }

    var now = new Date();
    var expires = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

    otpSheet.appendRow([
      email,        // A: Email
      hashedCode,   // B: OTP Code (hashed)
      now,          // C: Created
      expires,      // D: Expires
      '',           // E: Session Token
      '',           // F: Session Expires
      'No'          // G: Used
    ]);

    // Update rate limit counter
    cache.put(rateLimitKey, String(attempts + 1), 900); // 15 min TTL

    // Send email with OTP code
    var htmlBody = '<!DOCTYPE html>' +
      '<html><head><meta charset="utf-8"></head>' +
      '<body style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;max-width:500px;margin:0 auto;padding:20px;color:#333;">' +
      '<div style="text-align:center;padding:20px 0;border-bottom:2px solid #6c63ff;">' +
      '<h1 style="margin:0;color:#2c3e50;font-size:22px;">Notzer Chesed Admin</h1>' +
      '<p style="margin:5px 0 0;color:#888;font-size:14px;">Sign-In Verification Code</p>' +
      '</div>' +
      '<div style="padding:30px 0;text-align:center;">' +
      '<p style="font-size:16px;color:#555;">Your one-time verification code is:</p>' +
      '<div style="background:#f0f0ff;border:2px solid #6c63ff;border-radius:12px;padding:20px;margin:20px auto;display:inline-block;">' +
      '<span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#6c63ff;">' + code + '</span>' +
      '</div>' +
      '<p style="font-size:14px;color:#888;">This code expires in 10 minutes.</p>' +
      '<p style="font-size:13px;color:#aaa;">If you did not request this code, please ignore this email.</p>' +
      '</div>' +
      '<div style="text-align:center;padding:15px 0;border-top:1px solid #e9ecef;color:#888;font-size:12px;">' +
      '<p>Notzer Chesed Admin Portal</p>' +
      '</div>' +
      '</body></html>';

    MailApp.sendEmail({
      to: email,
      subject: 'Notzer Chesed — Verification Code: ' + code,
      body: 'Your Notzer Chesed Admin verification code is: ' + code + '\n\nThis code expires in 10 minutes.\n\nIf you did not request this code, please ignore this email.',
      htmlBody: htmlBody,
      name: 'Notzer Chesed Admin'
    });

    // Return generic success (don't reveal if email exists to the frontend)
    return { status: 'success', message: 'If this email is registered, a verification code has been sent.' };
  } catch (err) {
    Logger.log('generateOTP error: ' + err.toString());
    return { status: 'error', message: 'Failed to send verification code.' };
  }
}


// ============================================================
// OTP — VERIFY
// ============================================================
/**
 * Verify an OTP code and issue a session token.
 * Rate limited: 5 attempts per email per 15 minutes.
 * @param {string} email - User's email
 * @param {string} code - 6-digit OTP code
 * @returns {{ status: string, sessionToken?: string, expiresAt?: string, user?: Object, message?: string }}
 */
function verifyOTP(email, code) {
  if (!email || !code) {
    return { status: 'error', message: 'Email and code are required.' };
  }

  email = email.trim().toLowerCase();
  code = String(code).trim();

  // Rate limit: max 5 verification attempts per email per 15 minutes
  var cache = CacheService.getScriptCache();
  var rateLimitKey = 'otp_verify_' + email;
  var attempts = parseInt(cache.get(rateLimitKey) || '0');
  if (attempts >= 5) {
    return { status: 'error', message: 'Too many verification attempts. Please wait 15 minutes.' };
  }
  cache.put(rateLimitKey, String(attempts + 1), 900);

  try {
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);
    var otpSheet = ss.getSheetByName('OTP_Sessions');
    if (!otpSheet || otpSheet.getLastRow() < 2) {
      return { status: 'error', message: 'Invalid or expired code.' };
    }

    // Hash the submitted code
    var hashInput = code + email;
    var hashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, hashInput);
    var hashedCode = hashBytes.map(function(b) {
      return ('0' + (b & 0xFF).toString(16)).slice(-2);
    }).join('');

    var now = new Date();
    var lastRow = otpSheet.getLastRow();
    var data = otpSheet.getRange(2, 1, lastRow - 1, 7).getValues();

    // Search for matching unused, non-expired OTP — scan from bottom (most recent first)
    for (var i = data.length - 1; i >= 0; i--) {
      var rowEmail = String(data[i][0] || '').trim().toLowerCase();
      var rowHash = String(data[i][1] || '').trim();
      var rowExpires = data[i][3] ? new Date(data[i][3]) : new Date(0);
      var rowUsed = String(data[i][6] || '').trim();

      if (rowEmail === email && rowHash === hashedCode && rowUsed !== 'Yes' && rowExpires > now) {
        // Match found — mark as used and issue session token
        var dataRow = i + 2; // 1-indexed + header
        var sessionToken = Utilities.getUuid();
        var sessionExpires = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

        otpSheet.getRange(dataRow, 5).setValue(sessionToken);     // E: Session Token
        otpSheet.getRange(dataRow, 6).setValue(sessionExpires);    // F: Session Expires
        otpSheet.getRange(dataRow, 7).setValue('Yes');             // G: Used

        // Reset verification rate limit on success
        cache.remove(rateLimitKey);

        // Look up user and update last login
        var userResult = lookupUser(email, 'otp');
        if (userResult.valid) {
          updateLastLogin(email);
        }

        return {
          status: 'success',
          sessionToken: sessionToken,
          expiresAt: sessionExpires.toISOString(),
          user: userResult.valid ? userResult.user : null
        };
      }
    }

    return { status: 'error', message: 'Invalid or expired code.' };
  } catch (err) {
    Logger.log('verifyOTP error: ' + err.toString());
    return { status: 'error', message: 'Verification failed.' };
  }
}


// ============================================================
// SESSION TOKEN VALIDATION
// ============================================================
/**
 * Validate an OTP session token by looking it up in OTP_Sessions.
 * @param {string} token - UUID session token
 * @returns {{ valid: boolean, email?: string, message?: string }}
 */
function validateSessionToken(token) {
  if (!token) {
    return { valid: false, message: 'Session token is required.' };
  }

  try {
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);
    var otpSheet = ss.getSheetByName('OTP_Sessions');
    if (!otpSheet || otpSheet.getLastRow() < 2) {
      return { valid: false, message: 'Session expired or invalid.' };
    }

    var now = new Date();
    var lastRow = otpSheet.getLastRow();
    var data = otpSheet.getRange(2, 1, lastRow - 1, 7).getValues();

    // Search from bottom (most recent first)
    for (var i = data.length - 1; i >= 0; i--) {
      var rowToken = String(data[i][4] || '').trim();
      var rowSessionExpires = data[i][5] ? new Date(data[i][5]) : new Date(0);
      var rowEmail = String(data[i][0] || '').trim().toLowerCase();

      if (rowToken === token && rowSessionExpires > now) {
        return { valid: true, email: rowEmail };
      }
    }

    return { valid: false, message: 'Session expired or invalid.' };
  } catch (err) {
    Logger.log('validateSessionToken error: ' + err.toString());
    return { valid: false, message: 'Session validation failed.' };
  }
}


// ============================================================
// PASSWORD HASHING HELPER
// ============================================================
function hashPasswordGas_(password, email) {
  var input = String(password || '') + ':' + String(email || '').trim().toLowerCase();
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  return digest.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}


// ============================================================
// CAMPAIGN USERS TAB (TAB 11) HELPER
// ============================================================
function ensureCampaignUsersSheet_(campaignSS) {
  if (!campaignSS) return null;
  var sheet = campaignSS.getSheetByName('Users');
  if (!sheet) {
    sheet = campaignSS.insertSheet('Users');
    sheet.getRange('A1:H1').setValues([[
      'Email', 'Display Name', 'Role', 'Auth Method', 'Password Hash', 'Status', 'Added Date', 'Last Login'
    ]]);
    formatHeaderRow_(sheet, 'A1:H1');
  }
  return sheet;
}


// ============================================================
// USER LOOKUP — TWO-TIER (MASTER & CAMPAIGN)
// ============================================================
/**
 * Look up a user across Tier 1 (Master Authorized_Users) and Tier 2 (Campaign Users Tab 11).
 * @param {string} email - User's email
 * @param {string} authMethod - 'google', 'password', 'otp', or 'session'
 * @param {string} [targetCampaignId] - Optional campaign scope
 * @returns {{ valid: boolean, user?: Object, message?: string }}
 */
function lookupUser(email, authMethod, targetCampaignId) {
  if (!email) {
    return { valid: false, message: 'Email is required.' };
  }

  email = email.trim().toLowerCase();

  try {
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);

    // ── Tier 1: Check Master Sheet (Authorized_Users) ──
    var usersSheet = ss.getSheetByName('Authorized_Users') || ss.getSheetByName('Users');
    if (usersSheet && usersSheet.getLastRow() >= 2) {
      var numCols = Math.max(9, usersSheet.getLastColumn());
      var data = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, numCols).getValues();

      for (var i = 0; i < data.length; i++) {
        var rowEmail = String(data[i][0] || '').trim().toLowerCase();   // A: Email
        var rowName = String(data[i][1] || '').trim();                  // B: Display Name
        var rowAuthMethod = String(data[i][2] || '').trim();            // C: Auth Method
        var rowRole = String(data[i][3] || '').trim();                  // D: Role
        var rowCampaigns = String(data[i][4] || '').trim();             // E: Assigned Campaigns
        var rowStatus = String(data[i][5] || '').trim();                // F: Status

        if (rowEmail === email && (rowStatus === 'Active' || !rowStatus)) {
          var campaignsArr = [];
          if (rowCampaigns === '*') {
            campaignsArr = ['*'];
          } else if (rowCampaigns) {
            campaignsArr = rowCampaigns.split(',').map(function(c) { return c.trim(); });
          }

          return {
            valid: true,
            user: {
              email: rowEmail,
              name: rowName,
              role: rowRole, // super_admin or campaign_owner
              campaigns: campaignsArr,
              authMethod: authMethod || rowAuthMethod,
              isOwner: (rowRole === 'super_admin' || rowRole === 'campaign_owner'),
              source: 'master'
            }
          };
        }
      }
    }

    // ── Tier 2: Check Campaign Spreadsheet(s) Tab 11 (Users) ──
    var campaignsToCheck = [];
    if (targetCampaignId) {
      var campRow = getCampaignRow(targetCampaignId);
      if (campRow && campRow[3]) {
        campaignsToCheck.push({ id: targetCampaignId, sheetId: String(campRow[3]).trim() });
      }
    } else {
      campaignsToCheck = getActiveCampaignsList_();
    }

    var matchedCampaignUser = null;
    var matchedCampaigns = [];
    for (var c = 0; c < campaignsToCheck.length; c++) {
      var campObj = campaignsToCheck[c];
      if (!campObj.sheetId) continue;
      try {
        var campSS = SpreadsheetApp.openById(campObj.sheetId);
        var cUsersSheet = campSS.getSheetByName('Users');
        if (cUsersSheet && cUsersSheet.getLastRow() >= 2) {
          var cData = cUsersSheet.getRange(2, 1, cUsersSheet.getLastRow() - 1, Math.max(8, cUsersSheet.getLastColumn())).getValues();
          for (var j = 0; j < cData.length; j++) {
            var cEmail = String(cData[j][0] || '').trim().toLowerCase();
            var cName = String(cData[j][1] || '').trim();
            var cRole = String(cData[j][2] || 'campaign_manager').trim();
            var cAuthMethod = String(cData[j][3] || '').trim();
            var cStatus = String(cData[j][5] || '').trim();

            if (cEmail === email && (cStatus === 'Active' || !cStatus)) {
              if (!matchedCampaignUser) {
                matchedCampaignUser = {
                  email: cEmail,
                  name: cName,
                  role: cRole, // campaign_manager, bookkeeper, viewer
                  campaigns: [campObj.id],
                  authMethod: authMethod || cAuthMethod,
                  isOwner: false,
                  source: 'campaign'
                };
              }
              if (matchedCampaigns.indexOf(campObj.id) === -1) {
                matchedCampaigns.push(campObj.id);
              }
            }
          }
        }
      } catch (e) {}
    }

    if (matchedCampaignUser) {
      matchedCampaignUser.campaigns = matchedCampaigns;
      return { valid: true, user: matchedCampaignUser };
    }

    return { valid: false, message: 'Account not authorized or inactive.' };
  } catch (err) {
    Logger.log('lookupUser error: ' + err.toString());
    return { valid: false, message: 'User lookup failed.' };
  }
}


/**
 * Direct Email + Password authentication endpoint.
 * Validates credentials against Master Sheet (Tier 1) or Campaign Sheet (Tier 2).
 * @param {Object} data - { email, password, campaignId }
 * @returns {Object} session object
 */
function authenticatePassword(data) {
  try {
    var email = String(data.email || '').trim().toLowerCase();
    var password = String(data.password || '').trim();
    var targetCampaign = String(data.campaignId || data.campaign || '').trim();

    if (!email || !password) {
      return { status: 'error', message: 'Email and password are required.' };
    }

    var expectedHash = hashPasswordGas_(password, email);
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);

    var authenticatedUser = null;

    // 1. Check Master Sheet (Authorized_Users / Users)
    var usersSheet = ss.getSheetByName('Authorized_Users') || ss.getSheetByName('Users');
    if (usersSheet && usersSheet.getLastRow() >= 2) {
      var numCols = Math.max(9, usersSheet.getLastColumn());
      var mData = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, numCols).getValues();
      for (var i = 0; i < mData.length; i++) {
        var rowEmail = String(mData[i][0] || '').trim().toLowerCase();
        var rowStatus = String(mData[i][5] || '').trim();
        var storedHash = String(mData[i][8] || '').trim(); // Col I: Password Hash

        if (rowEmail === email && (rowStatus === 'Active' || !rowStatus)) {
          if (storedHash === expectedHash || storedHash === password) {
            if (storedHash === password) {
              usersSheet.getRange(i + 2, 9).setValue(expectedHash);
            }
            usersSheet.getRange(i + 2, 8).setValue(new Date()); // update Last Login

            var campaignsArr = [];
            var rowCamp = String(mData[i][4] || '').trim();
            if (rowCamp === '*') campaignsArr = ['*'];
            else if (rowCamp) campaignsArr = rowCamp.split(',').map(function(c) { return c.trim(); });

            authenticatedUser = {
              email: rowEmail,
              name: String(mData[i][1] || '').trim(),
              role: String(mData[i][3] || 'viewer').trim(),
              campaigns: campaignsArr,
              authMethod: 'password',
              isOwner: (String(mData[i][3] || '').trim() === 'super_admin' || String(mData[i][3] || '').trim() === 'campaign_owner')
            };
            break;
          }
        }
      }
    }

    // 2. If not found in Master, check Campaign Sheet(s) Tab 11 (Users)
    if (!authenticatedUser) {
      var campaignsToCheck = [];
      if (targetCampaign) {
        var cRow = getCampaignRow(targetCampaign);
        if (cRow && cRow[3]) campaignsToCheck.push({ id: targetCampaign, sheetId: String(cRow[3]).trim() });
      } else {
        campaignsToCheck = getActiveCampaignsList_();
      }

      for (var c = 0; c < campaignsToCheck.length; c++) {
        var campObj = campaignsToCheck[c];
        if (!campObj.sheetId) continue;
        try {
          var cSS = SpreadsheetApp.openById(campObj.sheetId);
          var cUSheet = cSS.getSheetByName('Users');
          if (cUSheet && cUSheet.getLastRow() >= 2) {
            var cData = cUSheet.getRange(2, 1, cUSheet.getLastRow() - 1, Math.max(8, cUSheet.getLastColumn())).getValues();
            for (var j = 0; j < cData.length; j++) {
              var cEmail = String(cData[j][0] || '').trim().toLowerCase();
              var cStatus = String(cData[j][5] || '').trim();
              var cStoredHash = String(cData[j][4] || '').trim(); // Col E: Password Hash

              if (cEmail === email && (cStatus === 'Active' || !cStatus)) {
                if (cStoredHash === expectedHash || cStoredHash === password) {
                  if (cStoredHash === password) {
                    cUSheet.getRange(j + 2, 5).setValue(expectedHash);
                  }
                  cUSheet.getRange(j + 2, 8).setValue(new Date()); // update Last Login

                  authenticatedUser = {
                    email: cEmail,
                    name: String(cData[j][1] || '').trim(),
                    role: String(cData[j][2] || 'campaign_manager').trim(),
                    campaigns: [campObj.id],
                    authMethod: 'password',
                    isOwner: false
                  };
                  break;
                }
              }
            }
          }
        } catch (e) {}
        if (authenticatedUser) break;
      }
    }

    if (!authenticatedUser) {
      return { status: 'error', message: 'Invalid email or password.' };
    }

    // Mint session token in OTP_Sessions
    var otpSheet = ss.getSheetByName('OTP_Sessions');
    if (!otpSheet) {
      otpSheet = ss.insertSheet('OTP_Sessions');
      otpSheet.appendRow(['Email', 'OTP Code', 'Created', 'Expires', 'Session Token', 'Session Expires', 'Used']);
      otpSheet.getRange('1:1').setFontWeight('bold');
    }

    var now = new Date();
    var sessionToken = Utilities.getUuid();
    var sessionExpires = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    otpSheet.appendRow([
      authenticatedUser.email,
      'PASSWORD_AUTH',
      now,
      sessionExpires,
      sessionToken,
      sessionExpires,
      'Yes'
    ]);

    return {
      status: 'success',
      sessionToken: sessionToken,
      token: sessionToken,
      expiresAt: sessionExpires.toISOString(),
      user: authenticatedUser
    };
  } catch (err) {
    Logger.log('authenticatePassword error: ' + err.toString());
    return { status: 'error', message: 'Authentication error: ' + err.toString() };
  }
}


function getActiveCampaignsList_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) return [];
    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Campaigns');
    if (!sheet || sheet.getLastRow() < 2) return [];
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var id = String(rows[i][0] || '').trim();
      var sheetId = String(rows[i][3] || '').trim();
      if (id && sheetId) {
        list.push({ id: id, name: String(rows[i][1] || id).trim(), sheetId: sheetId });
      }
    }
    return list;
  } catch (e) {
    return [];
  }
}


/**
 * Update the Last Login timestamp for a user.
 * @param {string} email - User's email
 */
function updateLastLogin(email) {
  try {
    email = email.trim().toLowerCase();
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);
    var usersSheet = ss.getSheetByName('Authorized_Users') || ss.getSheetByName('Users');
    if (!usersSheet || usersSheet.getLastRow() < 2) return;

    var lastRow = usersSheet.getLastRow();
    var emails = usersSheet.getRange(2, 1, lastRow - 1, 1).getValues();

    for (var i = 0; i < emails.length; i++) {
      if (String(emails[i][0] || '').trim().toLowerCase() === email) {
        usersSheet.getRange(i + 2, 8).setValue(new Date()); // col H: Last Login
        return;
      }
    }
  } catch (err) {
    Logger.log('updateLastLogin error: ' + err.toString());
  }
}


// ============================================================
// PERMISSION CHECK — ROLE HIERARCHY
// ============================================================
/**
 * Check if a user has the required role for an action.
 * Role hierarchy: super_admin (4) > campaign_owner (3) > campaign_manager (2) > bookkeeper (1.5) > viewer (1)
 * @param {Object} user - { role, campaigns }
 * @param {string} requiredRole - 'super_admin', 'campaign_owner', 'campaign_manager', 'bookkeeper', or 'viewer'
 * @param {string} [campaignId] - Optional campaign-specific access check
 * @returns {boolean}
 */
function checkPermission(user, requiredRole, campaignId) {
  if (!user || !user.role) return false;

  var roleLevel = { 'super_admin': 4, 'campaign_owner': 3, 'campaign_manager': 2, 'bookkeeper': 1.5, 'viewer': 1 };
  var userLevel = roleLevel[user.role] || 0;
  var requiredLevel = roleLevel[requiredRole] || 0;

  // User's role level must be >= required level
  if (userLevel < requiredLevel) return false;

  // super_admin has access to everything
  if (user.role === 'super_admin') return true;

  // Campaign-specific access check
  if (campaignId) {
    if (!user.campaigns || user.campaigns.length === 0) return false;
    if (user.campaigns.indexOf('*') !== -1) return true;
    if (user.campaigns.indexOf(campaignId) !== -1) return true;
    return false;
  }

  return true;
}


// ============================================================
// CAMPAIGN MANAGEMENT — GET ALL CAMPAIGNS
// ============================================================
/**
 * Resolve campaign page URL correctly: legacy campaigns use root /slug.html,
 * new/standard campaigns use /campaigns/slug/.
 */
function getStandardPageUrl_(campaignId, storedUrl) {
  var id = String(campaignId || '').trim();
  var idLower = id.toLowerCase();
  var stored = String(storedUrl || '').trim();
  var legacyRoots = ['keren-shlomo-yechiel', 'keren-hk-m-twersky', 'pele-yoetz', 'matanbsff', 'ksy'];

  if (stored) {
    if (stored === '/' + id + '.html' || stored === id + '.html' || stored === '/' + idLower + '.html' || stored === idLower + '.html') {
      if (legacyRoots.indexOf(idLower) !== -1) {
        return stored.indexOf('/') === 0 ? stored : ('/' + stored);
      }
      return '/campaigns/' + id + '/';
    }
    return stored.indexOf('/') === 0 || stored.indexOf('http') === 0 ? stored : ('/' + stored);
  }

  if (legacyRoots.indexOf(idLower) !== -1) {
    return '/' + id + '.html';
  }
  return '/campaigns/' + id + '/';
}

/**
 * Get all campaigns filtered by user's access.
 * @param {Object} user - Authenticated user
 * @returns {{ status: string, campaigns: Array }}
 */
function getCampaigns(user) {
  try {
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) {
      return { status: 'error', message: 'Platform not configured.' };
    }
    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Campaigns');
    if (!sheet || sheet.getLastRow() < 2) {
      return { status: 'success', campaigns: [] };
    }

    var lastRow = sheet.getLastRow();
    if (sheet.getLastColumn() < 29) {
      ensureMasterSheetHeaders_(sheet);
    }
    var numCols = Math.max(29, sheet.getLastColumn());
    var data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues(); // cols A-AC+

    var campaigns = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var campaignId = String(row[0] || '').trim();                 // A: Campaign ID
      if (!campaignId) continue;

      // Check user access
      if (!checkPermission(user, 'viewer', campaignId)) continue;

      var campaignName = String(row[1] || campaignId).trim();
      var campaignStatus = String(row[2] || 'Draft').trim();
      var sheetId = String(row[3] || '').trim();
      var goalAmount = parseFloat(row[10]) || 0;
      var pageUrl = getStandardPageUrl_(campaignId, row[13]);
      var isPub = String(row[20] || '').trim() !== 'No' && String(row[20] || '').trim() !== 'FALSE' && String(row[20] || '').trim() !== 'Private';

      var raised = 0;
      var donors = 0;

      if (sheetId) {
        try {
          var cSS = SpreadsheetApp.openById(sheetId);
          var pSheet = cSS.getSheetByName('Pledges') || cSS.getSheetByName('Sheet1');
          if (pSheet && pSheet.getLastRow() >= 2) {
            var pData = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, Math.min(9, pSheet.getLastColumn())).getValues();
            var uniqueDonors = {};
            for (var j = 0; j < pData.length; j++) {
              var pRow = pData[j];
              var pStatus = String(pRow[6] || '').trim();
              if (pStatus === 'Cancelled' || pStatus === 'Void' || pStatus === 'Declined') continue;

              var amountPaid = parseFloat(pRow[7]) || 0;
              var pledgeAmt = parseFloat(pRow[5]) || 0;
              var effectiveAmt = amountPaid > 0 ? amountPaid : (pStatus === 'Processed' ? pledgeAmt : 0);
              var donor = String(pRow[3] || '').trim();

              raised += effectiveAmt;
              if (donor && effectiveAmt > 0) uniqueDonors[donor.toLowerCase()] = true;
            }
            donors = Object.keys(uniqueDonors).length;
          }
        } catch (cErr) {
          Logger.log('getCampaigns error reading sheet for ' + campaignId + ': ' + cErr.toString());
        }
      }

      var pct = goalAmount > 0 ? Math.min(100, Math.round((raised / goalAmount) * 100)) : 0;

      campaigns.push({
        id: campaignId,
        campaignId: campaignId,
        name: campaignName,
        campaignName: campaignName,
        status: campaignStatus,
        sheetId: sheetId,
        campaignSheetId: sheetId,
        appsScriptUrl: String(row[4] || '').trim(),
        primaryGateway: String(row[5] || 'cardknox').trim(),
        cardknoxIfieldsKey: String(row[6] || '').trim(),
        cardknoxServerKey: String(row[7] || '').trim(),
        usaepayPublicKey: String(row[8] || '').trim(),
        usaepaySourceKey: String(row[9] || '').trim(),
        goalAmount: goalAmount,
        raised: raised,
        totalRaised: raised,
        donors: donors,
        donorCount: donors,
        percent: pct,
        startDate: formatDateEdt_(row[11]),
        endDate: formatDateEdt_(row[12]),
        pageUrl: pageUrl,
        adminUrl: String(row[14] || ('/admin/' + campaignId + '/')).trim(),
        wallUrl: String(row[15] || ('/wall/' + campaignId + '/')).trim(),
        wallEnabled: String(row[16] || '').trim() === 'Yes' || String(row[16] || '').trim() === 'TRUE' || row[16] === true,
        createdDate: formatDateEdt_(row[17]),
        lastModified: formatDateEdt_(row[18]),
        usaepayPin: String(row[19] || '').trim(),
        isPublic: isPub,
        wallKey: String(row[21] || '').trim(),
        managerEmail: String(row[27] || '').trim(),
        pageConfig: (function() {
          try {
            var raw = String(row[28] || '').trim();
            return raw ? JSON.parse(raw) : null;
          } catch (e) { return null; }
        })()
      });
    }

    return { status: 'success', campaigns: campaigns };
  } catch (err) {
    Logger.log('getCampaigns error: ' + err.toString());
    return { status: 'error', message: 'Failed to retrieve campaigns: ' + err.toString() };
  }
}


// ============================================================
// MASTER PLATFORM SHEET MAINTENANCE
// ============================================================
/**
 * Ensures all 29 standard headers are present and bold in Master Sheet 'Campaigns' tab.
 * Columns:
 * 1: Campaign ID, 2: Campaign Name, 3: Status, 4: Campaign Sheet ID, 5: Apps Script URL,
 * 6: Primary Gateway, 7: Cardknox iFields Key, 8: Cardknox Server Key,
 * 9: USAePay Public Key, 10: USAePay Server Key, 11: Goal Amount,
 * 12: Start Date, 13: End Date, 14: Page URL, 15: Admin URL, 16: Wall URL,
 * 17: Wall Enabled, 18: Created Date, 19: Last Modified, 20: USAePay PIN,
 * 21: Is Public, 22: Wall Access Key,
 * 23: TDF Enabled, 24: TDF Account Number, 25: TDF Api Key, 26: TDF Validation Token, 27: TDF Environment,
 * 28: Manager Email, 29: Page Config
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function ensureMasterSheetHeaders_(sheet) {
  if (!sheet) return;
  var expectedHeaders = [
    'Campaign ID', 'Campaign Name', 'Status', 'Campaign Sheet ID', 'Apps Script URL',
    'Primary Gateway', 'Cardknox iFields Key', 'Cardknox Server Key',
    'USAePay Public Key', 'USAePay Server Key', 'Goal Amount',
    'Start Date', 'End Date', 'Page URL', 'Admin URL', 'Wall URL',
    'Wall Enabled', 'Created Date', 'Last Modified', 'USAePay PIN',
    'Is Public', 'Wall Access Key',
    'TDF Enabled', 'TDF Account Number', 'TDF Api Key', 'TDF Validation Token', 'TDF Environment',
    'Manager Email', 'Page Config'
  ];
  sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
  sheet.getRange(1, 1, 1, expectedHeaders.length).setFontWeight('bold');
}

/**
 * Maintenance endpoint: Populates all 29 column headers on Master Sheet
 * and synchronizes target campaign goal across Master Sheet and dedicated campaign sheet.
 * @param {Object} params - { adminKey: '5786', campaignId: 'kfw87', goal: 50000 }
 * @returns {Object}
 */
function fixMasterSheetHeadersAndGoal_(params) {
  try {
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) {
      return { status: 'error', message: 'MASTER_SHEET_ID not configured in Script Properties.' };
    }
    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Campaigns');
    if (!sheet) {
      return { status: 'error', message: 'Campaigns sheet not found in Master Platform.' };
    }

    // 1. Populate all 29 column headers on Master Sheet
    ensureMasterSheetHeaders_(sheet);

    // 2. Find target campaign (default to 'kfw87' or params.campaignId)
    var targetId = String((params && (params.campaignId || params.id)) || 'kfw87').trim().toLowerCase();
    var targetGoal = parseFloat(params && (params.goal || params.goalAmount)) || 50000;
    var lastRow = sheet.getLastRow();
    var ids = sheet.getRange(2, 1, Math.max(1, lastRow - 1), 1).getValues();
    var targetRow = -1;
    var campaignSheetId = '';

    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || '').trim().toLowerCase() === targetId) {
        targetRow = i + 2;
        break;
      }
    }

    var resultDetails = {
      headersPopulated: 29,
      targetId: targetId,
      targetRow: targetRow,
      goalUpdated: false,
      pageConfigUpdated: false,
      dedicatedSheetUpdated: false
    };

    if (targetRow !== -1) {
      // Update Goal in Master Sheet (Col 11 = K)
      sheet.getRange(targetRow, 11).setValue(targetGoal);
      sheet.getRange(targetRow, 11).setNumberFormat('$#,##0.00');
      resultDetails.goalUpdated = true;

      // Get dedicated Sheet ID (Col 4 = D)
      campaignSheetId = String(sheet.getRange(targetRow, 4).getValue() || '').trim();

      // Update Page Config JSON in Col 29 if present
      var currentConfigRaw = String(sheet.getRange(targetRow, 29).getValue() || '').trim();
      var cfg = null;
      try {
        if (currentConfigRaw) cfg = JSON.parse(currentConfigRaw);
      } catch (e) {}
      if (cfg) {
        cfg.goalAmount = targetGoal;
        sheet.getRange(targetRow, 29).setValue(JSON.stringify(cfg));
        resultDetails.pageConfigUpdated = true;
      }

      // Clear Wall Access Key if requested
      if (params && params.clearWallKey) {
        sheet.getRange(targetRow, 22).setValue('');
        resultDetails.wallKeyCleared = true;
      }

      // Update Last Modified (Col 19 = S)
      sheet.getRange(targetRow, 19).setValue(new Date());

      // 3. Update dedicated Campaign Google Sheet Tab 9 (Campaigns)
      if (campaignSheetId) {
        try {
          var cSS = SpreadsheetApp.openById(campaignSheetId);
          var cSheet = cSS.getSheetByName('Campaigns');
          if (cSheet && cSheet.getLastRow() >= 2) {
            cSheet.getRange(2, 3).setValue(targetGoal);
            cSheet.getRange(2, 3).setNumberFormat('$#,##0.00');
            resultDetails.dedicatedSheetUpdated = true;
          }

          // Rename dedicated spreadsheet if it contains corrupted mojibake characters
          var currentName = cSS.getName();
          var campNameStr = String(sheet.getRange(targetRow, 2).getValue() || targetId).trim();
          var cleanExpectedName = 'Notzer Chesed \u2014 ' + campNameStr;
          if (currentName !== cleanExpectedName && (currentName.indexOf('—') !== -1 || currentName.indexOf('—') !== -1 || currentName.indexOf('\u00e2\u20ac\u201d') !== -1 || currentName.indexOf('?') !== -1 || params.renameSheet)) {
            cSS.rename(cleanExpectedName);
            resultDetails.sheetRenamed = true;
            resultDetails.newSheetName = cleanExpectedName;
          }
        } catch (cErr) {
          resultDetails.dedicatedSheetError = cErr.toString();
        }
      }
    }

    // 4. Ensure Master Sheet has Fee_Config_Defaults tab
    ensureDefaultFeeConfigSheet_(ss);
    resultDetails.feeDefaultsEnsured = true;

    return {
      status: 'success',
      message: 'Master sheet headers ensured, fee defaults initialized, and goal synchronized for ' + targetId + '.',
      details: resultDetails
    };
  } catch (err) {
    Logger.log('fixMasterSheetHeadersAndGoal_ error: ' + err.toString());
    return { status: 'error', message: err.toString() };
  }
}

/**
 * Ensures the 'Fee_Config_Defaults' tab exists and is formatted in the Master Platform Sheet.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} masterSS
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function ensureDefaultFeeConfigSheet_(masterSS) {
  if (!masterSS) return null;
  var sheet = masterSS.getSheetByName('Fee_Config_Defaults');
  if (!sheet) {
    sheet = masterSS.insertSheet('Fee_Config_Defaults');
    sheet.getRange('A1:C1').setValues([['Method', 'Rate', 'Flat Fee']]);
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
    sheet.getRange(2, 1, feeDefaults.length, 3).setValues(feeDefaults);
    formatHeaderRow_(sheet, 'A1:C1');
    sheet.setColumnWidth(1, 220);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 100);
    sheet.getRange('B2:B100').setNumberFormat('0.00%');
    sheet.getRange('C2:C100').setNumberFormat('$#,##0.00');
  }
  return sheet;
}

/**
 * Reads the fee defaults schedule from Master Platform Sheet.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [masterSS]
 * @returns {Array<Array>} [ [method, rate, flatFee], ... ]
 */
function getMasterFeeDefaults_(masterSS) {
  try {
    if (!masterSS) {
      var props = PropertiesService.getScriptProperties();
      var masterSheetId = props.getProperty('MASTER_SHEET_ID');
      if (masterSheetId) masterSS = SpreadsheetApp.openById(masterSheetId);
    }
    if (masterSS) {
      var sheet = ensureDefaultFeeConfigSheet_(masterSS);
      if (sheet && sheet.getLastRow() >= 2) {
        var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
        var list = [];
        for (var i = 0; i < data.length; i++) {
          var m = String(data[i][0] || '').trim();
          if (m) {
            var r = parseFloat(data[i][1]) || 0;
            var f = parseFloat(data[i][2]) || 0;
            list.push([m, r, f]);
          }
        }
        if (list.length > 0) return list;
      }
    }
  } catch (e) {
    Logger.log('getMasterFeeDefaults_ error: ' + e.toString());
  }
  return [
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
}

/**
 * Returns fee defaults formatted for API clients.
 * @returns {Object} { status: 'success', defaults: [ { method, rate, flat } ] }
 */
function getMasterFeeDefaultsJson_() {
  try {
    var list = getMasterFeeDefaults_();
    var defaults = list.map(function(item) {
      return { method: item[0], rate: item[1], flat: item[2] };
    });
    return { status: 'success', defaults: defaults };
  } catch (err) {
    return { status: 'error', message: 'Failed to retrieve fee defaults: ' + err.toString() };
  }
}

/**
 * Updates the 'Fee_Config_Defaults' tab in the Master Platform Sheet.
 * @param {Array<Object>} defaults - Array of { method, rate, flat }
 * @returns {Object}
 */
function updateMasterFeeDefaults_(defaults) {
  try {
    if (!Array.isArray(defaults) || defaults.length === 0) {
      return { status: 'error', message: 'defaults array is required.' };
    }
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) {
      return { status: 'error', message: 'MASTER_SHEET_ID not configured.' };
    }
    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Fee_Config_Defaults');
    if (!sheet) {
      sheet = ss.insertSheet('Fee_Config_Defaults');
    } else {
      sheet.clearContents();
    }
    sheet.getRange('A1:C1').setValues([['Method', 'Rate', 'Flat Fee']]);
    var rows = [];
    for (var i = 0; i < defaults.length; i++) {
      var item = defaults[i];
      var m = String(item.method || item[0] || '').trim();
      if (m) {
        var r = parseFloat(item.rate !== undefined ? item.rate : item[1]) || 0;
        var f = parseFloat(item.flat !== undefined ? item.flat : (item.flatFee !== undefined ? item.flatFee : item[2])) || 0;
        rows.push([m, r, f]);
      }
    }
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 3).setValues(rows);
    }
    formatHeaderRow_(sheet, 'A1:C1');
    sheet.setColumnWidth(1, 220);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 100);
    sheet.getRange('B2:B100').setNumberFormat('0.00%');
    sheet.getRange('C2:C100').setNumberFormat('$#,##0.00');
    return { status: 'success', message: 'Master fee defaults updated successfully (' + rows.length + ' methods).' };
  } catch (err) {
    Logger.log('updateMasterFeeDefaults_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to update fee defaults: ' + err.toString() };
  }
}


// ============================================================
// CAMPAIGN MANAGEMENT — CREATE
// ============================================================
/**
 * Register a new campaign in the Campaigns tab.
 * @param {Object} data - Campaign data
 * @returns {{ status: string, campaignId?: string, message?: string }}
 */
function createCampaign(data) {
  try {
    if (!data.id || !data.name) {
      return { status: 'error', message: 'Campaign ID and name are required.' };
    }

    // Validate ID format (slug — lowercase, alphanumeric, hyphens)
    var idSlug = String(data.id).trim().toLowerCase().replace(/[^a-z0-9\-]/g, '');
    if (idSlug !== String(data.id).trim()) {
      return { status: 'error', message: 'Campaign ID must be a lowercase slug (letters, numbers, hyphens only).' };
    }

    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Campaigns');
    if (!sheet) {
      sheet = ss.insertSheet('Campaigns');
    }
    ensureMasterSheetHeaders_(sheet);

    // Check for duplicate ID
    if (sheet.getLastRow() >= 2) {
      var existingIds = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
      for (var i = 0; i < existingIds.length; i++) {
        if (String(existingIds[i] || '').trim().toLowerCase() === idSlug) {
          return { status: 'error', message: 'Campaign ID "' + idSlug + '" already exists.' };
        }
      }
    }

    var defaultAppsScriptUrl = '';
    try {
      defaultAppsScriptUrl = ScriptApp.getService().getUrl() || '';
    } catch (e) {
      defaultAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbzngv-LEqoOercDK5MfRtB8BpEFhH3sdnq16lyxzq2LN_8W0lUQpa-oUZB4CfGYE28y3g/exec';
    }

    var now = new Date();
    sheet.appendRow([
      idSlug,                                                       // A: Campaign ID
      String(data.name || '').trim(),                               // B: Campaign Name
      String(data.status || 'Active').trim(),                       // C: Status
      String(data.sheetId || data.campaignSheetId || '').trim(),    // D: Sheet ID
      String(data.appsScriptUrl || defaultAppsScriptUrl).trim(),     // E: Apps Script URL
      String(data.primaryGateway || 'cardknox').trim(),             // F: Primary Gateway
      String(data.cardknoxIfieldsKey || '').trim(),                 // G: Cardknox iFields Key
      String(data.cardknoxServerKey || '').trim(),                  // H: Cardknox Server Key
      String(data.usaepayPublicKey || '').trim(),                   // I: USAePay Public Key
      String(data.usaepaySourceKey || '').trim(),                   // J: USAePay Server Key
      parseFloat(data.goalAmount) || 0,                             // K: Goal Amount
      data.startDate ? new Date(data.startDate) : '',               // L: Start Date
      data.endDate ? new Date(data.endDate) : '',                   // M: End Date
      getStandardPageUrl_(idSlug, data.pageUrl),                    // N: Page URL
      String(data.adminUrl || ('/admin/' + idSlug + '/')).trim(),   // O: Admin URL
      String(data.wallUrl || ('/wall/' + idSlug + '/')).trim(),     // P: Wall URL
      data.wallEnabled !== false ? 'Yes' : 'No',                    // Q: Wall Enabled
      now,                                                          // R: Created Date
      now,                                                          // S: Last Modified
      String(data.usaepayPin || '').trim(),                         // T: USAePay PIN
      data.isPublic !== false ? 'Yes' : 'No',                       // U: Is Public
      String(data.wallKey || data.wallAccessKey || '').trim(),      // V: Wall Access Key
      '',                                                            // W: TDF Enabled
      '',                                                            // X: TDF Account Number
      '',                                                            // Y: TDF Api Key
      '',                                                            // Z: TDF Validation Token
      '',                                                            // AA: TDF Environment
      String(data.managerEmail || '').trim(),                        // AB: Manager Email
      data.pageConfig ? (typeof data.pageConfig === 'string' ? data.pageConfig : JSON.stringify(data.pageConfig)) : '' // AC: Page Config
    ]);

    return { status: 'success', campaignId: idSlug, message: 'Campaign created successfully.' };
  } catch (err) {
    Logger.log('createCampaign error: ' + err.toString());
    return { status: 'error', message: 'Failed to create campaign: ' + err.toString() };
  }
}


// ============================================================
// CAMPAIGN MANAGEMENT — UPDATE
// ============================================================
/**
 * Update an existing campaign's settings.
 * Preserves existing cell values for credentials and URLs if empty strings are passed in basic edit.
 * @param {string} id - Campaign ID
 * @param {Object} data - Fields to update
 * @returns {{ status: string, message?: string }}
 */
function updateCampaign(id, data) {
  try {
    var targetId = String(id || (data && (data.id || data.campaignId)) || '').trim();
    if (!targetId) {
      return { status: 'error', message: 'Campaign ID is required.' };
    }

    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Campaigns');
    if (!sheet || sheet.getLastRow() < 2) {
      return { status: 'error', message: 'Campaign not found.' };
    }

    var lastRow = sheet.getLastRow();
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var targetRow = -1;

    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || '').trim().toLowerCase() === targetId.toLowerCase()) {
        targetRow = i + 2; // 1-indexed + header
        break;
      }
    }

    if (targetRow === -1) {
      return { status: 'error', message: 'Campaign "' + targetId + '" not found.' };
    }

    if (sheet.getLastColumn() < 29) {
      ensureMasterSheetHeaders_(sheet);
    }

    // Read current row to prevent accidental data loss
    var numCols = Math.max(29, sheet.getLastColumn());
    var currentRow = sheet.getRange(targetRow, 1, 1, numCols).getValues()[0];

    // Helper to update text cell safely
    function setField(colIdx, newVal, currentVal, allowClear) {
      if (newVal === undefined) return;
      var str = String(newVal).trim();
      if (str === '' && !allowClear && currentVal) {
        // preserve current non-empty value if new value is empty
        return;
      }
      sheet.getRange(targetRow, colIdx).setValue(str);
    }

    var forceEmpty = !!(data && data.forceEmpty);

    if (data.name !== undefined && String(data.name).trim()) sheet.getRange(targetRow, 2).setValue(String(data.name).trim());
    if (data.status !== undefined && String(data.status).trim()) sheet.getRange(targetRow, 3).setValue(String(data.status).trim());

    setField(4, data.sheetId !== undefined ? data.sheetId : data.campaignSheetId, currentRow[3], forceEmpty);
    setField(5, data.appsScriptUrl, currentRow[4], forceEmpty);
    if (data.primaryGateway !== undefined && String(data.primaryGateway).trim()) sheet.getRange(targetRow, 6).setValue(String(data.primaryGateway).trim());

    setField(7, data.cardknoxIfieldsKey, currentRow[6], forceEmpty);
    setField(8, data.cardknoxServerKey, currentRow[7], forceEmpty);
    setField(9, data.usaepayPublicKey, currentRow[8], forceEmpty);
    setField(10, data.usaepaySourceKey, currentRow[9], forceEmpty);

    if (data.goalAmount !== undefined) sheet.getRange(targetRow, 11).setValue(parseFloat(data.goalAmount) || 0);
    if (data.startDate !== undefined) sheet.getRange(targetRow, 12).setValue(data.startDate ? new Date(data.startDate) : '');
    if (data.endDate !== undefined) sheet.getRange(targetRow, 13).setValue(data.endDate ? new Date(data.endDate) : '');

    setField(14, data.pageUrl, currentRow[13], forceEmpty);
    setField(15, data.adminUrl, currentRow[14], forceEmpty);
    setField(16, data.wallUrl, currentRow[15], forceEmpty);

    if (data.wallEnabled !== undefined) {
      var isWall = data.wallEnabled === true || data.wallEnabled === 'Yes' || data.wallEnabled === 'TRUE';
      sheet.getRange(targetRow, 17).setValue(isWall ? 'Yes' : 'No');
    }

    setField(20, data.usaepayPin, currentRow[19], forceEmpty);

    if (data.isPublic !== undefined) {
      var isPub = data.isPublic === true || data.isPublic === 'Yes' || data.isPublic === 'TRUE' || data.isPublic === 'Public';
      sheet.getRange(targetRow, 21).setValue(isPub ? 'Yes' : 'No');
    }

    setField(22, data.wallKey !== undefined ? data.wallKey : data.wallAccessKey, currentRow[21], true);

    // Manager Email (col AB = 28) — always clearable
    setField(28, data.managerEmail, currentRow[27], true);

    // Page Config (col AC = 29)
    if (data.pageConfig !== undefined) {
      var pcfgStr = data.pageConfig ? (typeof data.pageConfig === 'string' ? data.pageConfig : JSON.stringify(data.pageConfig)) : '';
      sheet.getRange(targetRow, 29).setValue(pcfgStr);
    }

    // Sync to dedicated campaign spreadsheet if sheetId exists
    var dedicatedSheetId = String(data.sheetId || data.campaignSheetId || currentRow[3] || '').trim();
    if (dedicatedSheetId) {
      try {
        var cSS = SpreadsheetApp.openById(dedicatedSheetId);
        var cSheet = cSS.getSheetByName('Campaigns');
        if (cSheet && cSheet.getLastRow() >= 2) {
          if (data.name !== undefined && String(data.name).trim()) cSheet.getRange(2, 2).setValue(String(data.name).trim());
          if (data.goalAmount !== undefined) {
            cSheet.getRange(2, 3).setValue(parseFloat(data.goalAmount) || 0);
            cSheet.getRange(2, 3).setNumberFormat('$#,##0.00');
          }
          if (data.managerEmail !== undefined) cSheet.getRange(2, 4).setValue(String(data.managerEmail).trim());
        }
      } catch (syncErr) {
        Logger.log('updateCampaign: error syncing to dedicated sheet: ' + syncErr.toString());
      }
    }

    // Always update Last Modified
    sheet.getRange(targetRow, 19).setValue(new Date());

    return { status: 'success', message: 'Campaign "' + targetId + '" updated successfully.' };
  } catch (err) {
    Logger.log('updateCampaign error: ' + err.toString());
    return { status: 'error', message: 'Failed to update campaign: ' + err.toString() };
  }
}


// ============================================================
// CAMPAIGN MANAGEMENT — TOGGLE STATUS
// ============================================================
/**
 * Toggle campaign status: Active/Inactive/Draft.
 * @param {string} id - Campaign ID
 * @param {string} [newStatus] - Optional target status ('Active', 'Inactive', 'Draft')
 * @returns {{ status: string, newStatus?: string, message?: string }}
 */
function toggleCampaignStatus(id, newStatus) {
  try {
    var targetId = String(id || '').trim();
    if (!targetId) {
      return { status: 'error', message: 'Campaign ID is required.' };
    }

    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Campaigns');
    if (!sheet || sheet.getLastRow() < 2) {
      return { status: 'error', message: 'Campaign not found.' };
    }

    var lastRow = sheet.getLastRow();
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var targetRow = -1;

    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || '').trim().toLowerCase() === targetId.toLowerCase()) {
        targetRow = i + 2;
        break;
      }
    }

    if (targetRow === -1) {
      return { status: 'error', message: 'Campaign "' + targetId + '" not found.' };
    }

    var currentStatus = String(sheet.getRange(targetRow, 3).getValue() || 'Draft').trim();
    var resolvedStatus = '';

    if (newStatus) {
      var norm = String(newStatus).trim().toLowerCase();
      if (norm === 'active') resolvedStatus = 'Active';
      else if (norm === 'inactive') resolvedStatus = 'Inactive';
      else if (norm === 'draft') resolvedStatus = 'Draft';
      else resolvedStatus = 'Active';
    } else {
      // Auto toggle
      resolvedStatus = (currentStatus === 'Active') ? 'Inactive' : 'Active';
    }

    sheet.getRange(targetRow, 3).setValue(resolvedStatus);     // C: Status
    sheet.getRange(targetRow, 19).setValue(new Date());         // S: Last Modified

    return { status: 'success', newStatus: resolvedStatus, message: 'Campaign status updated to ' + resolvedStatus + '.' };
  } catch (err) {
    Logger.log('toggleCampaignStatus error: ' + err.toString());
    return { status: 'error', message: 'Failed to update campaign status: ' + err.toString() };
  }
}

/**
 * Toggle campaign public directory visibility (show/hide on notzer.org/campaigns).
 * @param {string} id - Campaign ID
 * @param {boolean|string} isPublic - True/False or 'Yes'/'No'
 * @returns {{ status: string, isPublic?: boolean, message?: string }}
 */
function toggleCampaignVisibility(id, isPublic) {
  try {
    var targetId = String(id || '').trim();
    if (!targetId) {
      return { status: 'error', message: 'Campaign ID is required.' };
    }

    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) {
      return { status: 'error', message: 'Platform not configured.' };
    }

    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Campaigns');
    if (!sheet || sheet.getLastRow() < 2) {
      return { status: 'error', message: 'Campaigns sheet is empty.' };
    }

    var lastRow = sheet.getLastRow();
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    var targetRow = -1;

    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i] || '').trim().toLowerCase() === targetId.toLowerCase()) {
        targetRow = i + 2;
        break;
      }
    }

    if (targetRow === -1) {
      return { status: 'error', message: 'Campaign "' + targetId + '" not found.' };
    }

    var currentVal = sheet.getRange(targetRow, 21).getValue();
    var currentIsPublic = String(currentVal || '').trim() !== 'No' && String(currentVal || '').trim() !== 'FALSE' && String(currentVal || '').trim() !== 'Private';

    var resolvedIsPublic;
    if (isPublic !== undefined && isPublic !== null) {
      resolvedIsPublic = isPublic === true || isPublic === 'Yes' || isPublic === 'TRUE' || isPublic === 'true' || isPublic === 'Public';
    } else {
      resolvedIsPublic = !currentIsPublic;
    }

    sheet.getRange(targetRow, 21).setValue(resolvedIsPublic ? 'Yes' : 'No'); // U: Is Public
    sheet.getRange(targetRow, 19).setValue(new Date());                      // S: Last Modified

    return {
      status: 'success',
      id: targetId,
      isPublic: resolvedIsPublic,
      message: 'Campaign "' + targetId + '" is now ' + (resolvedIsPublic ? 'Public (visible in directory)' : 'Private (hidden from directory)') + '.'
    };
  } catch (err) {
    Logger.log('toggleCampaignVisibility error: ' + err.toString());
    return { status: 'error', message: 'Failed to update campaign visibility: ' + err.toString() };
  }
}


// ============================================================
// CAMPAIGN MANAGEMENT — PROVISION SHEET
// ============================================================
/**
 * Format a header row with bold white text on dark background.
 * @param {Sheet} sheet - Google Sheet tab
 * @param {string} range - e.g. 'A1:P1'
 */
function formatHeaderRow_(sheet, range) {
  try {
    var r = sheet.getRange(range);
    r.setFontWeight('bold');
    r.setBackground('#1a1a2e');
    r.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  } catch (e) {
    Logger.log('[PROVISION] formatHeaderRow_ note: ' + e.toString());
  }
}

/**
 * Provision a dedicated Google Sheet for a campaign and update Master Sheet.
 * Idempotent: creates a new spreadsheet or updates an existing one to the latest 9-tab schema.
 * @param {string} campaignId - Campaign ID / slug
 * @returns {{ status: string, sheetId?: string, appsScriptUrl?: string, sheetUrl?: string, message?: string, details?: string }}
 */
function provisionCampaignSheet(campaignId) {
  Logger.log('[PROVISION] Starting provision for campaignId: ' + campaignId);
  try {
    var targetId = String(campaignId || '').trim();
    if (!targetId) {
      return { status: 'error', message: 'Campaign ID is required.' };
    }

    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) {
      return { status: 'error', message: 'MASTER_SHEET_ID is not configured in Script Properties.' };
    }

    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Campaigns');
    if (!sheet || sheet.getLastRow() < 2) {
      return { status: 'error', message: 'Campaigns sheet not found in Master Platform.' };
    }

    var lastRow = sheet.getLastRow();
    var numCols = Math.max(28, sheet.getLastColumn());
    var data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    var targetRow = -1;
    var campaignName = targetId;
    var existingSheetId = '';
    var existingAppsScriptUrl = '';
    var existingGoal = 0;
    var existingManagerEmail = '';

    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0] || '').trim().toLowerCase() === targetId.toLowerCase()) {
        targetRow = i + 2;
        campaignName = String(data[i][1] || targetId).trim();
        existingSheetId = String(data[i][3] || '').trim();
        existingAppsScriptUrl = String(data[i][4] || '').trim();
        existingGoal = parseFloat(data[i][10]) || 0;
        existingManagerEmail = String(data[i][27] || '').trim();
        break;
      }
    }

    if (targetRow === -1) {
      return { status: 'error', message: 'Campaign "' + targetId + '" not found in Master Sheet.' };
    }

    var sheetId = existingSheetId;
    var campaignSS;
    var newSheetCreated = false;

    if (!sheetId) {
      var sheetTitle = 'Notzer Chesed \u2014 ' + campaignName;
      Logger.log('[PROVISION] Creating new Spreadsheet: ' + sheetTitle);
      campaignSS = SpreadsheetApp.create(sheetTitle);
      sheetId = campaignSS.getId();
      newSheetCreated = true;
    } else {
      Logger.log('[PROVISION] Updating existing Spreadsheet ID: ' + sheetId);
      campaignSS = SpreadsheetApp.openById(sheetId);
    }

    // ── Tab 1: Pledges (16 cols) ──
    var pledgesSheet = campaignSS.getSheetByName('Pledges') || campaignSS.getSheetByName('Sheet1');
    if (!pledgesSheet) pledgesSheet = campaignSS.insertSheet('Pledges');
    else pledgesSheet.setName('Pledges');
    pledgesSheet.getRange('A1:P1').setValues([[
      'Pledge ID', 'Customer ID', 'Created Date', 'Donor',
      'Campaign', 'Amount', 'Status', 'Amount Paid',
      'Balance', 'Display Name', 'Memo', 'Anonymous',
      'Teams', 'Method', 'Schedule ID', 'Notes'
    ]]);
    formatHeaderRow_(pledgesSheet, 'A1:P1');
    pledgesSheet.getRange('F2:I1000').setNumberFormat('$#,##0.00');

    // ── Tab 2: Transactions (14 cols - KSY Schema) ──
    var txnSheet = campaignSS.getSheetByName('Transactions');
    if (!txnSheet) txnSheet = campaignSS.insertSheet('Transactions');
    txnSheet.getRange('A1:N1').setValues([[
      'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net',
      'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method',
      'Card Type', 'Payment #', 'Funded', 'Funded Date'
    ]]);
    formatHeaderRow_(txnSheet, 'A1:N1');
    txnSheet.getRange('C2:E1000').setNumberFormat('$#,##0.00');

    // ── Tab 3: Customers (11 cols) ──
    var custSheet = campaignSS.getSheetByName('Customers');
    if (!custSheet) custSheet = campaignSS.insertSheet('Customers');
    custSheet.getRange('A1:K1').setValues([[
      'Customer ID', 'First Name', 'Last Name', 'Email',
      'Phone', 'Street', 'City', 'State',
      'Zip', 'Created Date', 'Source'
    ]]);
    formatHeaderRow_(custSheet, 'A1:K1');

    // ── Tab 4: Scheduled Payments (13 cols - KSY Schema) ──
    var schedSheet = campaignSS.getSheetByName('Scheduled Payments');
    if (!schedSheet) schedSheet = campaignSS.insertSheet('Scheduled Payments');
    schedSheet.getRange('A1:M1').setValues([[
      'DateSubmitted', 'Recurring ID', 'Pledge ID', 'Customer ID',
      'Donor Name', 'USD Amount', 'Total Pledge', 'Frequency',
      'Count', 'Sequence', 'DateDue', 'Status', 'Transaction Ref'
    ]]);
    formatHeaderRow_(schedSheet, 'A1:M1');
    schedSheet.getRange('F2:G1000').setNumberFormat('$#,##0.00');

    // ── Tab 5: Teams (7 cols - KSY Schema) ──
    var teamsSheet = campaignSS.getSheetByName('Teams');
    if (!teamsSheet) teamsSheet = campaignSS.insertSheet('Teams');
    teamsSheet.getRange('A1:G1').setValues([[
      'Team ID', 'Team Name', 'Team Contact Name',
      'Team Contact Email', 'Notify on New Donation', 'Team Goal', 'Campaign'
    ]]);
    formatHeaderRow_(teamsSheet, 'A1:G1');
    teamsSheet.getRange('F2:F100').setNumberFormat('$#,##0.00');

    // ── Tab 6: LinkClicks (7 cols) ──
    var clicksSheet = campaignSS.getSheetByName('LinkClicks');
    if (!clicksSheet) clicksSheet = campaignSS.insertSheet('LinkClicks');
    clicksSheet.getRange('A1:G1').setValues([[
      'Timestamp', 'First Name', 'Last Name',
      'Email', 'Link Clicked', 'Campaign', 'Amount'
    ]]);
    formatHeaderRow_(clicksSheet, 'A1:G1');

    // ——— Tab 7: Fee_Config (3 cols - Fee Schedule) ———
    var feeSheet = campaignSS.getSheetByName('Fee_Config');
    if (!feeSheet) {
      feeSheet = campaignSS.insertSheet('Fee_Config');
      feeSheet.getRange('A1:C1').setValues([['Method', 'Rate', 'Flat Fee']]);
      var feeDefaults = getMasterFeeDefaults_(ss);
      feeSheet.getRange(2, 1, feeDefaults.length, 3).setValues(feeDefaults);
    }
    formatHeaderRow_(feeSheet, 'A1:C1');
    feeSheet.getRange('B2:B100').setNumberFormat('0.00%');
    feeSheet.getRange('C2:C100').setNumberFormat('$#,##0.00');

    // ── Tab 8: Expenses (7 cols - Expense Tracker) ──
    var expSheet = campaignSS.getSheetByName('Expenses');
    if (!expSheet) expSheet = campaignSS.insertSheet('Expenses');
    expSheet.getRange('A1:G1').setValues([[
      'Date', 'Amount', 'Payee', 'Type', 'Purpose', 'Authorized By', 'Given by'
    ]]);
    formatHeaderRow_(expSheet, 'A1:G1');
    expSheet.getRange('B2:B1000').setNumberFormat('$#,##0.00');

    // ── Tab 9: Campaigns (6 cols - Local Config) ──
    var campSheet = campaignSS.getSheetByName('Campaigns');
    if (!campSheet) {
      campSheet = campaignSS.insertSheet('Campaigns');
      campSheet.getRange('A1:F1').setValues([[
        'Short Code', 'Long Name Eng', 'Goal',
        'Manager Email', 'Manager Name', 'Notify on New Donation'
      ]]);
    }
    formatHeaderRow_(campSheet, 'A1:F1');
    campSheet.getRange('A2:F2').setValues([[
      targetId, campaignName, existingGoal || '', existingManagerEmail || '', '', 'Yes'
    ]]);
    if (existingGoal) campSheet.getRange('C2').setNumberFormat('$#,##0.00');

    // ── Tab 10: TDF_Transactions (19 cols) ──
    var tdfSheet = campaignSS.getSheetByName('TDF_Transactions');
    if (!tdfSheet) {
      tdfSheet = campaignSS.insertSheet('TDF_Transactions');
      tdfSheet.getRange('A1:S1').setValues([[
        'Created_At', 'Transaction_ID', 'Submission_ID', 'Campaign_ID', 'Amount', 'Donor_Name', 'Email', 'Method', 'TDF_Status', 'Card_Last4', 'Designation', 'TDF_Request_ID', 'TDF_Confirmation_Number', 'TDF_Submitted_At', 'Completed_At', 'Reconciled_At', 'Last_Checked_At', 'Error', 'Pledge_ID'
      ]]);
    } else if (tdfSheet.getLastColumn() < 19) {
      tdfSheet.getRange('S1').setValue('Pledge_ID');
      tdfSheet.getRange('S1').setFontWeight('bold');
    }
    formatHeaderRow_(tdfSheet, 'A1:S1');
    tdfSheet.getRange('E2:E1000').setNumberFormat('$#,##0.00');

    // ── Tab 11: Users (8 cols - Campaign Managers & Bookkeepers) ──
    var usersSheet = ensureCampaignUsersSheet_(campaignSS);
    if (usersSheet && existingManagerEmail && usersSheet.getLastRow() < 2) {
      usersSheet.appendRow([
        existingManagerEmail.toLowerCase(),
        existingManagerEmail.split('@')[0],
        'campaign_manager',
        'password',
        '', // Password Hash
        'Active',
        new Date(),
        ''
      ]);
    }
    if (existingManagerEmail) {
      ensureMasterUserAssignedCampaign_(existingManagerEmail, targetId, 'campaign_owner');
    }

    Logger.log('[PROVISION] Configured all 11 tabs: Pledges, Transactions, Customers, Scheduled Payments, Teams, LinkClicks, Fee_Config, Expenses, Campaigns, TDF_Transactions, Users');

    // Save into Master Sheet Column D if new
    sheet.getRange(targetRow, 4).setValue(sheetId);

    var appsScriptUrl = existingAppsScriptUrl;
    if (!appsScriptUrl) {
      try {
        appsScriptUrl = ScriptApp.getService().getUrl() || '';
      } catch (e) {
        appsScriptUrl = 'https://script.google.com/macros/s/AKfycbzngv-LEqoOercDK5MfRtB8BpEFhH3sdnq16lyxzq2LN_8W0lUQpa-oUZB4CfGYE28y3g/exec';
      }
      if (appsScriptUrl) {
        sheet.getRange(targetRow, 5).setValue(appsScriptUrl);
      }
    }

    // Ensure status is Active if provisioned
    var curStatus = String(sheet.getRange(targetRow, 3).getValue() || '').trim();
    if (curStatus === 'Draft' || !curStatus) {
      sheet.getRange(targetRow, 3).setValue('Active');
    }

    sheet.getRange(targetRow, 19).setValue(new Date());

    var sheetUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/edit';
    Logger.log('[PROVISION] SUCCESS: ' + sheetUrl);

    return {
      status: 'success',
      sheetId: sheetId,
      appsScriptUrl: appsScriptUrl,
      sheetUrl: sheetUrl,
      message: (newSheetCreated ? 'Provisioned new Google Sheet for ' : 'Updated and synchronized Google Sheet for ') + campaignName + '.'
    };
  } catch (err) {
    Logger.log('[PROVISION] Exception in provisionCampaignSheet: ' + err.toString() + ' | stack: ' + err.stack);
    return { status: 'error', message: 'Failed to provision campaign sheet: ' + err.toString(), details: err.stack };
  }
}


// ============================================================
// TEMPLATE MANAGEMENT — GET, SAVE, DELETE, SEED
// ============================================================
/**
 * Retrieve all campaign templates from the Templates tab in Master Sheet.
 * @param {Object} user - Authenticated user
 * @returns {{ status: string, templates: Array }}
 */
function getTemplates(user) {
  try {
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) {
      return { status: 'error', message: 'MASTER_SHEET_ID not configured.' };
    }
    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ensureTemplatesSheet_(ss);
    if (!sheet || sheet.getLastRow() < 2) {
      return { status: 'success', templates: [] };
    }

    var lastRow = sheet.getLastRow();
    var data = sheet.getRange(2, 1, lastRow - 1, 18).getValues();

    var templates = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var id = String(row[0] || '').trim();
      if (!id) continue;

      var presetAmounts = [];
      try {
        var rawPresets = String(row[7] || '').trim();
        if (rawPresets.indexOf('[') === 0) {
          presetAmounts = JSON.parse(rawPresets);
        } else if (rawPresets) {
          presetAmounts = rawPresets.split(',').map(function(s) { return parseFloat(s.trim()); }).filter(function(n) { return !isNaN(n); });
        }
      } catch (e) {
        presetAmounts = [18, 36, 72, 180, 360, 500];
      }

      var features = {};
      try {
        var rawFeat = String(row[13] || '').trim();
        if (rawFeat.indexOf('{') === 0) {
          features = JSON.parse(rawFeat);
        }
      } catch (e) {
        features = { wall: true, teams: true, recurring: true, gallery: false, prayer: false, zelle: true, daf: true, goal: true };
      }

      templates.push({
        id: id,
        name: String(row[1] || '').trim(),
        category: String(row[2] || 'General').trim(),
        description: String(row[3] || '').trim(),
        accentColor: String(row[4] || '#4dabf7').trim(),
        accentLight: String(row[5] || '#74c0fc').trim(),
        accentDark: String(row[6] || '#339af0').trim(),
        presetAmounts: presetAmounts,
        nameHebrew: String(row[8] || '').trim(),
        subtitle: String(row[9] || '').trim(),
        storyLayout: String(row[10] || 'single-column').trim(),
        defaultStoryEn: String(row[11] || '').trim(),
        defaultStoryHe: String(row[12] || '').trim(),
        features: features,
        heroImageUrl: String(row[14] || '').trim(),
        status: String(row[15] || 'Active').trim(),
        createdDate: formatDateEdt_(row[16]),
        lastModified: formatDateEdt_(row[17])
      });
    }

    return { status: 'success', templates: templates };
  } catch (err) {
    Logger.log('getTemplates error: ' + err.toString());
    return { status: 'error', message: 'Failed to retrieve templates: ' + err.toString() };
  }
}

/**
 * Save or update a template in the Templates tab.
 * @param {Object} data - Template data
 * @returns {{ status: string, message: string }}
 */
function saveTemplate(data) {
  try {
    if (!data.id || !data.name) {
      return { status: 'error', message: 'Template ID and Name are required.' };
    }

    var idSlug = String(data.id).trim().toLowerCase().replace(/[^a-z0-9\-]/g, '');
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ensureTemplatesSheet_(ss);

    var presetsStr = Array.isArray(data.presetAmounts) ? JSON.stringify(data.presetAmounts) : String(data.presetAmounts || '[18, 36, 72, 180, 360, 500]');
    var featuresStr = typeof data.features === 'object' ? JSON.stringify(data.features) : String(data.features || '{}');
    var now = new Date();

    if (sheet.getLastRow() >= 2) {
      var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0] || '').trim().toLowerCase() === idSlug) {
          var targetRow = i + 2;
          sheet.getRange(targetRow, 2).setValue(String(data.name || ''));
          sheet.getRange(targetRow, 3).setValue(String(data.category || 'General'));
          sheet.getRange(targetRow, 4).setValue(String(data.description || ''));
          sheet.getRange(targetRow, 5).setValue(String(data.accentColor || '#4dabf7'));
          sheet.getRange(targetRow, 6).setValue(String(data.accentLight || '#74c0fc'));
          sheet.getRange(targetRow, 7).setValue(String(data.accentDark || '#339af0'));
          sheet.getRange(targetRow, 8).setValue(presetsStr);
          sheet.getRange(targetRow, 9).setValue(String(data.nameHebrew || ''));
          sheet.getRange(targetRow, 10).setValue(String(data.subtitle || ''));
          sheet.getRange(targetRow, 11).setValue(String(data.storyLayout || 'single-column'));
          sheet.getRange(targetRow, 12).setValue(String(data.defaultStoryEn || ''));
          sheet.getRange(targetRow, 13).setValue(String(data.defaultStoryHe || ''));
          sheet.getRange(targetRow, 14).setValue(featuresStr);
          sheet.getRange(targetRow, 15).setValue(String(data.heroImageUrl || ''));
          sheet.getRange(targetRow, 16).setValue(String(data.status || 'Active'));
          sheet.getRange(targetRow, 18).setValue(now);
          return { status: 'success', message: 'Template "' + idSlug + '" updated successfully.' };
        }
      }
    }

    sheet.appendRow([
      idSlug,
      String(data.name || '').trim(),
      String(data.category || 'General').trim(),
      String(data.description || '').trim(),
      String(data.accentColor || '#4dabf7').trim(),
      String(data.accentLight || '#74c0fc').trim(),
      String(data.accentDark || '#339af0').trim(),
      presetsStr,
      String(data.nameHebrew || '').trim(),
      String(data.subtitle || '').trim(),
      String(data.storyLayout || 'single-column').trim(),
      String(data.defaultStoryEn || '').trim(),
      String(data.defaultStoryHe || '').trim(),
      featuresStr,
      String(data.heroImageUrl || '').trim(),
      String(data.status || 'Active').trim(),
      now,
      now
    ]);

    return { status: 'success', message: 'Template "' + idSlug + '" created successfully.' };
  } catch (err) {
    Logger.log('saveTemplate error: ' + err.toString());
    return { status: 'error', message: 'Failed to save template: ' + err.toString() };
  }
}

/**
 * Delete / deactivate a template from Templates tab.
 * @param {string} id - Template ID
 * @returns {{ status: string, message: string }}
 */
function deleteTemplate(id) {
  try {
    if (!id) return { status: 'error', message: 'Template ID required.' };
    var idSlug = String(id).trim().toLowerCase();
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Templates');
    if (!sheet || sheet.getLastRow() < 2) return { status: 'error', message: 'Template not found.' };

    var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || '').trim().toLowerCase() === idSlug) {
        var row = i + 2;
        sheet.getRange(row, 16).setValue('Inactive');
        sheet.getRange(row, 18).setValue(new Date());
        return { status: 'success', message: 'Template deactivated successfully.' };
      }
    }
    return { status: 'error', message: 'Template not found.' };
  } catch (err) {
    Logger.log('deleteTemplate error: ' + err.toString());
    return { status: 'error', message: 'Failed to delete template: ' + err.toString() };
  }
}

/**
 * Helper to ensure Templates sheet exists and is formatted with seed data.
 * @param {Spreadsheet} ss - Master Spreadsheet
 * @returns {Sheet}
 */
function ensureTemplatesSheet_(ss) {
  var sheet = ss.getSheetByName('Templates');
  if (!sheet) {
    sheet = ss.insertSheet('Templates');
    sheet.getRange('A1:R1').setValues([[
      'Template ID', 'Template Name', 'Category', 'Description',
      'Accent Color', 'Accent Light', 'Accent Dark',
      'Preset Amounts', 'Hebrew Title', 'Subtitle',
      'Story Layout', 'Default Story EN', 'Default Story HE',
      'Features', 'Hero Image URL', 'Status', 'Created Date', 'Last Modified'
    ]]);
    sheet.getRange('A1:R1').setFontWeight('bold');
    sheet.getRange('A1:R1').setBackground('#1a1a2e');
    sheet.getRange('A1:R1').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(2, 220);
    sheet.setColumnWidth(3, 130);
    sheet.setColumnWidth(4, 280);
    sheet.setColumnWidth(8, 200);
    sheet.setColumnWidth(12, 300);
    sheet.setColumnWidth(13, 300);
    sheet.setColumnWidth(14, 250);

    var now = new Date();
    var seed = [
      [
        'hachnosas-kallah', 'Hachnosas Kallah — Wedding Fund', 'Wedding / Bridal',
        'Dignified bridal and wedding assistance fund with celebratory gold/rose theme, wedding sponsorship tiers, goal progress, and recurring installments.',
        '#d4af37', '#f3e5ab', '#aa820a',
        '[180, 360, 500, 1000, 2500, 5000]',
        'הכנסת כלה — שמחת חתן וכלה', 'Building a Jewish home with dignity and joy',
        'bilingual-columns',
        'Join us in the sacred mitzvah of Hachnosas Kallah. Our sages teach that rejoicing with a bride and groom and assisting them in establishing their home is among the greatest acts of kindness. This fund provides essential wedding essentials, clothing, and household setup to ensure the young couple can begin their new life with dignity and peace of mind.',
        '×ž×¦×•×” ×’×“×•×œ×” ×œ×”×›× ×™×¡ ×›×œ×” ×•×œ×©×ž×— ×—×ª×Ÿ ×•×›×œ×” ×‘×™×•× ×—×ª×•× ×ª× ×•×‘×™×•× ×©×ž×—×ª ×œ×‘×. ×”×§×¨×Ÿ × ×•×¡×“×” ×œ×¢×–×•×¨ ×•×œ×¡×™×™×¢ ×‘×”×•×¦××•×ª ×”×—×ª×•× ×” ×‘×›×‘×•×“ ×•×‘×”×¨×—×‘×”, ×œ×”×¢×ž×™×“ ×‘×™×ª × ××ž×Ÿ ×‘×™×©×¨××œ.',
        '{"wall":true,"teams":true,"recurring":true,"gallery":false,"prayer":true,"zelle":true,"daf":true,"goal":true}',
        '', 'Active', now, now
      ],
      [
        'emergency-family', 'Emergency Family Relief', 'Crisis / Family',
        'Designed for urgent family crises and sudden loss with dual English/Yiddish narrative, photo gallery, goal bar, and recurring installments.',
        '#4dabf7', '#74c0fc', '#339af0',
        '[18, 36, 72, 180, 360, 500, 1000]',
        'קרן עזר וחסד', 'Standing by a family in their darkest hour',
        'bilingual-columns',
        'Our community has been shaken by a sudden tragedy. An entire family has been left without their primary support. This fund has been established to provide urgent and ongoing financial assistance to ensure stability during this difficult time. Kol Yisrael areivim zeh lazeh.',
        '××•× ×–×¢×¨ ×§×”×™×œ×” ×©×˜×™×™×˜ ×œ×™×ž×™×Ÿ ×“×¢×¨ ×ž×©×¤×—×” ××™×Ÿ ×–×™×™×¢×¨ ×©×•×•×¢×¨×¢×¨ ×©×¢×”. ×“×™ ×§×¨×Ÿ ××™×– ×’×¢×’×¨×™× ×“×¢×˜ ×’×¢×•×•××¨×Ÿ ×¦×•×¦×•×©×˜×¢×œ×Ÿ × ×•×™×˜×™×’×¢ ×¤×™× ×× ×¦×™×¢×œ×¢ ×”×™×œ×£ ××•×Ÿ ×—×™×–×•×§ ×¤××¨ ×“×™ ×§×•×ž×¢× ×“×™×’×¢ ×™××¨×Ÿ.',
        '{"wall":true,"teams":true,"recurring":true,"gallery":true,"prayer":false,"zelle":true,"daf":true,"goal":true}',
        '', 'Active', now, now
      ],
      [
        'org-support', 'Sister Org / Community Program', 'Organization',
        'Support for communal programs and organizations providing guidance, social services, and discreet aid (Matan B\'Seiser).',
        '#6c63ff', '#8b83ff', '#5548d9',
        '[36, 100, 180, 360, 500, 1000, 2500]',
        'מתן בסתר — קרן עזרה', 'Providing direct and discreet assistance to families in need',
        'single-column',
        'Matan B\'Seiser is giving in secret — preserving the dignity of the recipient as members of our own household. This campaign provides ongoing, confidential financial assistance, social services, counseling, and essential holiday relief to families in our community.',
        '',
        '{"wall":true,"teams":true,"recurring":true,"gallery":false,"prayer":true,"zelle":true,"daf":true,"goal":false}',
        '', 'Active', now, now
      ],
      [
        'holiday-seasonal', 'Holiday & Seasonal Campaign', 'Seasonal',
        'Purim Matanot La\'Evyonim or Pesach Kimcha DePischa campaign with holiday urgency banner, family sponsorship tiers, and rapid checkout.',
        '#e67e22', '#f39c12', '#d35400',
        '[18, 36, 54, 100, 180, 360, 500]',
        '×ž×ª× ×•×ª ×œ××‘×™×•× ×™× — ×ž×’×‘×™×ª ×”×—×’', 'Ensuring every family celebrates with joy and dignity',
        'single-column',
        'Fulfill your holiday obligations with 100% distribution on the day of Yom Tov. We provide food packages, holiday clothing, and direct grants to local families so no child is left without the joy of the festival.',
        '',
        '{"wall":true,"teams":true,"recurring":false,"gallery":false,"prayer":false,"zelle":true,"daf":true,"goal":true}',
        '', 'Active', now, now
      ],
      [
        'memorial-fund', 'Memorial & Tribute Fund', 'Memorial',
        'Dedicated memorial tributes and Yahrtzeit funds with Hebrew dedication line, Mishnayot / prayer request options, and dignified styling.',
        '#8e44ad', '#bb86fc', '#6c3483',
        '[18, 36, 72, 180, 360, 500, 1000]',
        'קרן לעילוי נשמת', 'In loving memory and eternal legacy',
        'single-column',
        'Established in loving memory to support acts of Torah and Chesed. Your generous contribution continues a legacy of kindness, helping needy individuals and perpetuating a name of blessed memory.',
        '',
        '{"wall":true,"teams":false,"recurring":true,"gallery":true,"prayer":true,"zelle":true,"daf":true,"goal":false}',
        '', 'Active', now, now
      ],
      [
        'team-crowdfunding', 'Peer-to-Peer Team Campaign', 'Crowdfunding',
        'Ambassador-driven campaign with team selectors, team leaderboards, goal meters, and social sharing.',
        '#27ae60', '#2ecc71', '#1e8449',
        '[25, 50, 100, 250, 500, 1000]',
        '×ž×’×‘×™×ª ×”×©×•×ª×¤×™×', 'Uniting together to reach our communal goal',
        'single-column',
        'Join our team captains and ambassadors in reaching our collective milestone. Every team and every dollar makes a lasting difference for our community programs.',
        '',
        '{"wall":true,"teams":true,"recurring":true,"gallery":false,"prayer":false,"zelle":true,"daf":true,"goal":true}',
        '', 'Active', now, now
      ],
      [
        'standard-general', 'Standard General Campaign', 'General',
        'Clean, modern, versatile donation page with fast Cardknox and USAePay payment options, suitable for all general charitable appeals.',
        '#4dabf7', '#74c0fc', '#339af0',
        '[18, 36, 72, 180, 360, 500]',
        'נוצר חסד — קרן כללית', 'Supporting vital community initiatives',
        'single-column',
        'Thank you for partnering with Notzer Chesed. Your tax-deductible contribution supports our broad network of charitable programs and urgent family assistance funds.',
        '',
        '{"wall":true,"teams":false,"recurring":true,"gallery":false,"prayer":false,"zelle":true,"daf":true,"goal":false}',
        '', 'Active', now, now
      ]
    ];
    sheet.getRange(2, 1, seed.length, 18).setValues(seed);
  }
  return sheet;
}


// ============================================================
// CAMPAIGN MANAGEMENT — GET ACTIVE CAMPAIGNS (PUBLIC)
// ============================================================
/**
 * Get list of active campaigns with live raised & donor statistics for public campaigns page.
 * PUBLIC endpoint — no authentication required.
 * Returns minimal public data (no secrets/keys).
 * @returns {{ status: string, campaigns: Array }}
 */
function getActiveCampaigns() {
  try {
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) {
      return { status: 'success', campaigns: [] };
    }

    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Campaigns');
    if (!sheet || sheet.getLastRow() < 2) {
      return { status: 'success', campaigns: [] };
    }

    var lastRow = sheet.getLastRow();
    var data = sheet.getRange(2, 1, lastRow - 1, 22).getValues();

    var campaigns = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var status = String(row[2] || '').trim();
      if (status !== 'Active') continue;

      var isPub = String(row[20] || '').trim() !== 'No' && String(row[20] || '').trim() !== 'FALSE' && String(row[20] || '').trim() !== 'Private';
      if (!isPub) continue;

      var campaignId = String(row[0] || '').trim();
      if (!campaignId) continue;

      var campaignName = String(row[1] || campaignId).trim();
      var sheetId = String(row[3] || '').trim();
      var goalAmount = parseFloat(row[10]) || 0;
      var pageUrl = getStandardPageUrl_(campaignId, row[13]);

      var raised = 0;
      var donors = 0;

      if (sheetId) {
        try {
          var cSS = SpreadsheetApp.openById(sheetId);
          var pSheet = cSS.getSheetByName('Pledges') || cSS.getSheetByName('Sheet1');
          if (pSheet && pSheet.getLastRow() >= 2) {
            var pData = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, Math.min(9, pSheet.getLastColumn())).getValues();
            var uniqueDonors = {};
            for (var j = 0; j < pData.length; j++) {
              var pRow = pData[j];
              var pStatus = String(pRow[6] || '').trim();
              if (pStatus === 'Cancelled' || pStatus === 'Void' || pStatus === 'Declined') continue;

              var amountPaid = parseFloat(pRow[7]) || 0;
              var pledgeAmt = parseFloat(pRow[5]) || 0;
              var effectiveAmt = amountPaid > 0 ? amountPaid : (pStatus === 'Processed' ? pledgeAmt : 0);
              var donor = String(pRow[3] || '').trim();

              raised += effectiveAmt;
              if (donor && effectiveAmt > 0) uniqueDonors[donor.toLowerCase()] = true;
            }
            donors = Object.keys(uniqueDonors).length;
          }
        } catch (cErr) {
          Logger.log('getActiveCampaigns error reading sheet for ' + campaignId + ': ' + cErr.toString());
        }
      }

      var pct = goalAmount > 0 ? Math.min(100, Math.round((raised / goalAmount) * 100)) : 0;

      campaigns.push({
        id: campaignId,
        campaignId: campaignId,
        name: campaignName,
        campaignName: campaignName,
        raised: raised,
        totalRaised: raised,
        donors: donors,
        donorCount: donors,
        goalAmount: goalAmount,
        goal: goalAmount,
        percent: pct,
        pageUrl: pageUrl
      });
    }

    return { status: 'success', campaigns: campaigns };
  } catch (err) {
    Logger.log('getActiveCampaigns error: ' + err.toString());
    return { status: 'error', message: 'Failed to retrieve active campaigns.' };
  }
}

/**
 * Public endpoint to fetch single campaign goal & raised stats.
 * @param {string} campaignId - Campaign slug
 * @returns {{ status: string, totalRaised: number, totalDonors: number, goalAmount: number, percent: number }}
 */
function getCampaignStatsPublic_(campaignId) {
  try {
    var campaignRow = getCampaignRow(campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign not found.' };
    }

    var sheetId = String(campaignRow[3] || '').trim();
    var goalAmount = parseFloat(campaignRow[10]) || 0;
    var wallEnabledVal = String(campaignRow[16] || '').trim();
    var isWallEnabled = wallEnabledVal !== 'No' && wallEnabledVal !== 'FALSE' && campaignRow[16] !== false;
    var raised = 0;
    var donors = 0;

    if (sheetId) {
      try {
        var cSS = SpreadsheetApp.openById(sheetId);
        var pSheet = cSS.getSheetByName('Pledges') || cSS.getSheetByName('Sheet1');
        if (pSheet && pSheet.getLastRow() >= 2) {
          var pData = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, Math.min(9, pSheet.getLastColumn())).getValues();
          var uniqueDonors = {};
          for (var j = 0; j < pData.length; j++) {
            var pRow = pData[j];
            var pStatus = String(pRow[6] || '').trim();
            if (pStatus === 'Cancelled' || pStatus === 'Void' || pStatus === 'Declined') continue;

            var amountPaid = parseFloat(pRow[7]) || 0;
            var pledgeAmt = parseFloat(pRow[5]) || 0;
            var effectiveAmt = amountPaid > 0 ? amountPaid : (pStatus === 'Processed' ? pledgeAmt : 0);
            var donor = String(pRow[3] || '').trim();

            raised += effectiveAmt;
            if (donor && effectiveAmt > 0) uniqueDonors[donor.toLowerCase()] = true;
          }
          donors = Object.keys(uniqueDonors).length;
        }
      } catch (err) {
        Logger.log('getCampaignStatsPublic_ error reading sheet for ' + campaignId + ': ' + err.toString());
      }
    }

    var pct = goalAmount > 0 ? Math.min(100, Math.round((raised / goalAmount) * 100)) : 0;
    return {
      status: 'success',
      campaignId: campaignId,
      totalRaised: raised,
      raised: raised,
      totalDonors: donors,
      donors: donors,
      goalAmount: goalAmount,
      goal: goalAmount,
      percent: pct,
      wallEnabled: isWallEnabled
    };
  } catch (err) {
    Logger.log('getCampaignStatsPublic_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to retrieve stats.' };
  }
}


// ============================================================
// CROSS-CAMPAIGN STATS — SINGLE CAMPAIGN
// ============================================================
/**
 * Get stats for a specific campaign by reading its sheet's Pledges tab.
 * @param {string} campaignId - Campaign ID
 * @returns {{ status: string, stats?: Object, message?: string }}
 */
function getCampaignStats(campaignId) {
  try {
    var campaignRow = getCampaignRow(campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign "' + campaignId + '" not found.' };
    }

    var sheetId = String(campaignRow[3] || '').trim(); // D: Sheet ID
    if (!sheetId) {
      return { status: 'error', message: 'No sheet configured for campaign "' + campaignId + '".' };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var pledgesSheet = ss.getSheetByName('Pledges');
    if (!pledgesSheet || pledgesSheet.getLastRow() < 2) {
      return {
        status: 'success',
        stats: {
          campaignId: campaignId,
          campaignName: String(campaignRow[1] || '').trim(),
          totalRaised: 0,
          totalPledged: 0,
          donorCount: 0,
          pledgeCount: 0,
          avgDonation: 0,
          goalAmount: parseFloat(campaignRow[10]) || 0,
          goalPercent: 0
        }
      };
    }

    var lastRow = pledgesSheet.getLastRow();
    var pledgeData = pledgesSheet.getRange(2, 1, lastRow - 1, 9).getValues(); // cols A-I

    var totalRaised = 0;   // Amount Paid across all pledges
    var totalPledged = 0;  // Total Amount across all pledges
    var pledgeCount = 0;
    var uniqueDonors = {};

    for (var i = 0; i < pledgeData.length; i++) {
      var amount = parseFloat(pledgeData[i][5]) || 0;   // F: Amount
      var amountPaid = parseFloat(pledgeData[i][7]) || 0; // H: Amount Paid
      var donor = String(pledgeData[i][3] || '').trim();  // D: Donor

      if (amount <= 0) continue;

      totalPledged += amount;
      totalRaised += amountPaid;
      pledgeCount++;
      if (donor) uniqueDonors[donor.toLowerCase()] = true;
    }

    var donorCount = Object.keys(uniqueDonors).length;
    var goalAmount = parseFloat(campaignRow[10]) || 0;
    var goalPercent = goalAmount > 0 ? Math.round((totalRaised / goalAmount) * 100) : 0;

    return {
      status: 'success',
      stats: {
        campaignId: campaignId,
        campaignName: String(campaignRow[1] || '').trim(),
        totalRaised: totalRaised,
        totalPledged: totalPledged,
        donorCount: donorCount,
        pledgeCount: pledgeCount,
        avgDonation: donorCount > 0 ? Math.round(totalRaised / donorCount) : 0,
        goalAmount: goalAmount,
        goalPercent: goalPercent
      }
    };
  } catch (err) {
    Logger.log('getCampaignStats error: ' + err.toString());
    return { status: 'error', message: 'Failed to get campaign stats.' };
  }
}


// ============================================================
// CROSS-CAMPAIGN STATS — ALL CAMPAIGNS
// ============================================================
/**
 * Aggregate stats across all campaigns the user has access to.
 * @param {Object} user - Authenticated user
/**
 * Get aggregated statistics for all accessible campaigns.
 * @param {Object} user - Authenticated user
 * @returns {{ status: string, totalRaised?: number, totalDonors?: number, activeCampaigns?: number, overall?: Object, campaigns?: Array, recentDonations?: Array }}
 */
function getAllStats(user) {
  try {
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) {
      return { status: 'error', message: 'Platform not configured.' };
    }

    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Campaigns');
    if (!sheet || sheet.getLastRow() < 2) {
      return {
        status: 'success',
        totalRaised: 0,
        totalDonors: 0,
        activeCampaigns: 0,
        overall: { totalRaised: 0, totalDonors: 0, activeCampaigns: 0 },
        campaigns: [],
        recentDonations: []
      };
    }

    var lastRow = sheet.getLastRow();
    var data = sheet.getRange(2, 1, lastRow - 1, 22).getValues();

    var campaignStats = [];
    var overallRaised = 0;
    var uniqueDonorsOverall = {};
    var activeCampaigns = 0;
    var allRecentDonations = [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var campaignId = String(row[0] || '').trim();
      if (!campaignId) continue;
      if (!checkPermission(user, 'viewer', campaignId)) continue;

      var campaignName = String(row[1] || campaignId).trim();
      var campaignStatus = String(row[2] || 'Draft').trim();
      if (campaignStatus === 'Active') activeCampaigns++;

      var sheetId = String(row[3] || '').trim();
      var goalAmount = parseFloat(row[10]) || 0;
      var pageUrl = getStandardPageUrl_(campaignId, row[13]);
      var adminUrl = String(row[14] || ('/admin/' + campaignId + '/')).trim();
      var wallUrl = String(row[15] || ('/wall/' + campaignId + '/')).trim();

      var raised = 0;
      var donors = 0;
      var uniqueCampaignDonors = {};

      if (sheetId) {
        try {
          var campaignSS = SpreadsheetApp.openById(sheetId);
          var pledgesSheet = campaignSS.getSheetByName('Pledges');
          if (pledgesSheet && pledgesSheet.getLastRow() >= 2) {
            var pledgeData = pledgesSheet.getRange(2, 1, pledgesSheet.getLastRow() - 1, pledgesSheet.getLastColumn()).getValues();
            for (var j = 0; j < pledgeData.length; j++) {
              var pRow = pledgeData[j];
              var pStatus = String(pRow[6] || '').trim();
              if (pStatus === 'Cancelled' || pStatus === 'Void' || pStatus === 'Declined') continue;

              var amountPaid = parseFloat(pRow[7]) || 0;
              var pledgeAmt = parseFloat(pRow[5]) || 0;
              var effectiveAmt = amountPaid > 0 ? amountPaid : pledgeAmt;
              var donor = String(pRow[3] || '').trim();
              var displayName = String(pRow[9] || '').trim();
              var pDate = formatDateEdt_(pRow[2]);

              raised += amountPaid;
              if (donor) {
                var dKey = donor.toLowerCase();
                uniqueCampaignDonors[dKey] = true;
                uniqueDonorsOverall[dKey] = true;
              }

              if (effectiveAmt > 0) {
                allRecentDonations.push({
                  donor: displayName || donor || 'Anonymous',
                  amount: effectiveAmt,
                  campaign: campaignName,
                  campaignId: campaignId,
                  date: pDate,
                  status: pStatus
                });
              }
            }
            donors = Object.keys(uniqueCampaignDonors).length;
          }
        } catch (sheetErr) {
          Logger.log('Failed to read sheet for ' + campaignId + ': ' + sheetErr.toString());
        }
      }

      overallRaised += raised;

      campaignStats.push({
        id: campaignId,
        campaignId: campaignId,
        name: campaignName,
        campaignName: campaignName,
        status: campaignStatus,
        raised: raised,
        totalRaised: raised,
        donors: donors,
        donorCount: donors,
        goalAmount: goalAmount,
        pageUrl: pageUrl,
        adminUrl: adminUrl,
        wallUrl: wallUrl,
        sheetId: sheetId
      });
    }

    // Sort recent donations descending by date
    allRecentDonations.sort(function(a, b) {
      return new Date(b.date || 0) - new Date(a.date || 0);
    });

    var totalUniqueDonors = Object.keys(uniqueDonorsOverall).length;

    return {
      status: 'success',
      totalRaised: overallRaised,
      totalDonors: totalUniqueDonors,
      activeCampaigns: activeCampaigns,
      overall: {
        totalRaised: overallRaised,
        totalDonors: totalUniqueDonors,
        activeCampaigns: activeCampaigns
      },
      campaigns: campaignStats,
      recentDonations: allRecentDonations.slice(0, 20)
    };
  } catch (err) {
    Logger.log('getAllStats error: ' + err.toString());
    return { status: 'error', message: 'Failed to aggregate stats: ' + err.toString() };
  }
}


// ============================================================
// PLEDGES — READ FROM CAMPAIGN SHEET
// ============================================================
/**
 * Get pledges from a campaign's Pledges tab with filtering and pagination.
 * @param {string} campaignId - Campaign ID
 * @param {Object} filters - { status, dateFrom, dateTo, search, page, pageSize }
 * @returns {{ status: string, pledges: Array, total: number, page: number, pageSize: number }}
 */
function getPledges(campaignId, filters) {
  try {
    var campaignRow = getCampaignRow(campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign not found.' };
    }

    var sheetId = String(campaignRow[3] || '').trim();
    if (!sheetId) {
      return { status: 'error', message: 'No sheet configured for this campaign.' };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('Pledges');
    if (!sheet || sheet.getLastRow() < 2) {
      return { status: 'success', pledges: [], total: 0, page: 1, pageSize: filters.pageSize || 50 };
    }

    var lastRow = sheet.getLastRow();
    var data = sheet.getRange(2, 1, lastRow - 1, 16).getValues(); // cols A-P

    var page = filters.page || 1;
    var pageSize = filters.pageSize || 50;
    var statusFilter = (filters.status || '').trim().toLowerCase();
    var searchFilter = (filters.search || '').trim().toLowerCase();
    var dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    var dateTo = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59') : null;

    var filtered = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var pledgeId = String(row[0] || '').trim();
      if (!pledgeId) continue;

      var createdDate = row[2] ? new Date(row[2]) : null;
      var donor = String(row[3] || '').trim();
      var pledgeStatus = String(row[6] || '').trim();

      // Apply filters
      if (statusFilter && pledgeStatus.toLowerCase() !== statusFilter) continue;
      if (searchFilter && donor.toLowerCase().indexOf(searchFilter) === -1) continue;
      if (dateFrom && createdDate && createdDate < dateFrom) continue;
      if (dateTo && createdDate && createdDate > dateTo) continue;

      filtered.push({
        pledgeId: pledgeId,
        customerId: String(row[1] || '').trim(),
        createdDate: formatDateEdt_(createdDate),
        donor: donor,
        campaign: String(row[4] || '').trim(),
        amount: parseFloat(row[5]) || 0,
        status: pledgeStatus,
        amountPaid: parseFloat(row[7]) || 0,
        balance: parseFloat(row[8]) || 0,
        displayName: String(row[9] || '').trim(),
        memo: String(row[10] || '').trim(),
        anonymous: String(row[11] || '').trim(),
        teams: String(row[12] || '').trim(),
        method: String(row[13] || '').trim(),
        scheduleId: String(row[14] || '').trim(),
        notes: String(row[15] || '').trim()
      });
    }

    // Paginate
    var total = filtered.length;
    var startIdx = (page - 1) * pageSize;
    var paginated = filtered.slice(startIdx, startIdx + pageSize);

    return {
      status: 'success',
      pledges: paginated,
      total: total,
      page: page,
      pageSize: pageSize
    };
  } catch (err) {
    Logger.log('getPledges error: ' + err.toString());
    return { status: 'error', message: 'Failed to retrieve pledges.' };
  }
}


// ============================================================
// SCHEDULED PAYMENTS — READ WITH OVERDUE AUTO-FLAGGING
// ============================================================
/**
 * Get scheduled payments with optional overdue auto-flagging.
 * @param {Object} filters - { campaignId, status, dateFrom, dateTo, page, pageSize }
 * @param {Object} user - Authenticated user (for campaign access filtering)
 * @returns {{ status: string, payments: Array, total: number, page: number, pageSize: number }}
 */
function getScheduledPayments(filters, user) {
  try {
    var page = filters.page || 1;
    var pageSize = filters.pageSize || 50;
    var statusFilter = (filters.status || '').trim().toLowerCase();
    var dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    var dateTo = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59') : null;
    var now = new Date();

    var allPayments = [];

    // Determine which campaigns to read
    var campaignIds = [];
    if (filters.campaignId) {
      campaignIds.push(filters.campaignId);
    } else {
      // Get all campaigns user has access to
      var props = PropertiesService.getScriptProperties();
      var masterSheetId = props.getProperty('MASTER_SHEET_ID');
      var ss = SpreadsheetApp.openById(masterSheetId);
      var campSheet = ss.getSheetByName('Campaigns');
      if (campSheet && campSheet.getLastRow() >= 2) {
        var campData = campSheet.getRange(2, 1, campSheet.getLastRow() - 1, 4).getValues();
        for (var c = 0; c < campData.length; c++) {
          var cid = String(campData[c][0] || '').trim();
          if (cid && checkPermission(user, 'viewer', cid)) {
            campaignIds.push(cid);
          }
        }
      }
    }

    for (var ci = 0; ci < campaignIds.length; ci++) {
      var campaignId = campaignIds[ci];
      var campaignRow = getCampaignRow(campaignId);
      if (!campaignRow) continue;

      var sheetId = String(campaignRow[3] || '').trim();
      if (!sheetId) continue;

      try {
        var campaignSS = SpreadsheetApp.openById(sheetId);
        var spSheet = campaignSS.getSheetByName('Scheduled Payments');
        if (!spSheet || spSheet.getLastRow() < 2) continue;

        // Build pledgeId → method map from Pledges sheet
        var methodMap = {};
        var pledgesSheet = campaignSS.getSheetByName('Pledges');
        if (pledgesSheet && pledgesSheet.getLastRow() >= 2) {
          var pledgesData = pledgesSheet.getRange(1, 1, pledgesSheet.getLastRow(), pledgesSheet.getLastColumn()).getValues();
          var pHeaders = pledgesData[0];
          var pColId = -1, pColMethod = -1;
          for (var ph = 0; ph < pHeaders.length; ph++) {
            var phn = String(pHeaders[ph]).trim().toLowerCase();
            if (phn === 'pledge id') pColId = ph;
            if (phn === 'method' || phn === 'payment method') pColMethod = ph;
          }
          if (pColId >= 0 && pColMethod >= 0) {
            for (var pr = 1; pr < pledgesData.length; pr++) {
              var pid = String(pledgesData[pr][pColId] || '').trim();
              if (pid) methodMap[pid] = String(pledgesData[pr][pColMethod] || '').trim();
            }
          }
        }

        var lastRow = spSheet.getLastRow();
        var data = spSheet.getRange(2, 1, lastRow - 1, 13).getValues(); // cols A-M
        var overdueUpdates = [];

        for (var i = 0; i < data.length; i++) {
          var row = data[i];
          var paymentStatus = String(row[11] || '').trim();   // L: Status
          var dueDate = row[10] ? new Date(row[10]) : null;    // K: Due Date

          // Auto-flag overdue: scheduled + past due
          if (paymentStatus === 'Scheduled' && dueDate && dueDate < now) {
            paymentStatus = 'Overdue';
            overdueUpdates.push({ row: i + 2, status: 'Overdue' }); // queue for batch update
          }

          // Apply status filter
          if (statusFilter && paymentStatus.toLowerCase() !== statusFilter) continue;
          if (dateFrom && dueDate && dueDate < dateFrom) continue;
          if (dateTo && dueDate && dueDate > dateTo) continue;

          var rowPledgeId = String(row[2] || '').trim();

          allPayments.push({
            campaignId: campaignId,
            campaignName: String(campaignRow[1] || '').trim(),
            created: formatDateEdt_(row[0]),     // A: Created
            scheduleId: String(row[1] || '').trim(),                   // B: Schedule ID
            pledgeId: rowPledgeId,                                      // C: Pledge ID
            customerId: String(row[3] || '').trim(),                   // D: Customer ID
            donor: String(row[4] || '').trim(),                        // E: Donor
            perPaymentAmt: parseFloat(row[5]) || 0,                    // F: Per-Payment Amt
            totalPledge: String(row[6] || '').trim(),                  // G: Total Pledge
            frequency: String(row[7] || '').trim(),                    // H: Frequency
            totalPayments: String(row[8] || '').trim(),                // I: Total Payments
            paymentNum: String(row[9] || '').trim(),                   // J: Payment #
            dueDate: dueDate ? Utilities.formatDate(dueDate, 'America/New_York', 'yyyy-MM-dd') : '',  // K: Due Date (local, not UTC)
            status: paymentStatus,                                      // L: Status
            transactionRef: String(row[12] || '').trim(),              // M: Transaction Ref
            method: methodMap[rowPledgeId] || ''                       // From Pledges sheet
          });
        }

        // Batch-update overdue rows in the sheet
        for (var u = 0; u < overdueUpdates.length; u++) {
          spSheet.getRange(overdueUpdates[u].row, 12).setValue('Overdue');
        }
      } catch (campaignErr) {
        Logger.log('Failed to read scheduled payments for ' + campaignId + ': ' + campaignErr.toString());
      }
    }

    // Sort by due date (ascending)
    allPayments.sort(function(a, b) {
      return (a.dueDate || '').localeCompare(b.dueDate || '');
    });

    // Paginate
    var total = allPayments.length;
    var startIdx = (page - 1) * pageSize;
    var paginated = allPayments.slice(startIdx, startIdx + pageSize);

    return {
      status: 'success',
      payments: paginated,
      total: total,
      page: page,
      pageSize: pageSize
    };
  } catch (err) {
    Logger.log('getScheduledPayments error: ' + err.toString());
    return { status: 'error', message: 'Failed to retrieve scheduled payments.' };
  }
}


// ============================================================
// PLEDGE PAYMENT — RECORD PAYMENT AGAINST PLEDGE
// ============================================================
/**
 * Record a payment against an outstanding pledge.
 * Creates a Transaction row, updates Pledge paid/balance,
 * and updates linked scheduled payment if applicable.
 * @param {Object} data - { campaignId, pledgeId, amount, method, date, scheduleId, paymentNum }
 * @returns {{ status: string, transactionRef?: string, updatedPledge?: Object }}
 */
function recordPledgePayment(data) {
  try {
    if (!data.campaignId || !data.pledgeId || !data.amount) {
      return { status: 'error', message: 'campaignId, pledgeId, and amount are required.' };
    }

    var campaignRow = getCampaignRow(data.campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign not found.' };
    }

    var sheetId = String(campaignRow[3] || '').trim();
    if (!sheetId) {
      return { status: 'error', message: 'No sheet configured for this campaign.' };
    }

    var ss = SpreadsheetApp.openById(sheetId);

    // Find pledge
    var pledgesSheet = ss.getSheetByName('Pledges');
    if (!pledgesSheet || pledgesSheet.getLastRow() < 2) {
      return { status: 'error', message: 'Pledge not found.' };
    }

    var lastRow = pledgesSheet.getLastRow();
    var pledgeIds = pledgesSheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    var pledgeRowIndex = -1;
    for (var i = 0; i < pledgeIds.length; i++) {
      if (String(pledgeIds[i] || '').trim() === data.pledgeId) {
        pledgeRowIndex = i;
        break;
      }
    }

    if (pledgeRowIndex === -1) {
      return { status: 'error', message: 'Pledge "' + data.pledgeId + '" not found.' };
    }

    var pledgeRow = pledgeRowIndex + 2;
    var pledgeData = pledgesSheet.getRange(pledgeRow, 1, 1, 16).getValues()[0];
    var totalAmount = parseFloat(pledgeData[5]) || 0;   // F: Amount
    var currentPaid = parseFloat(pledgeData[7]) || 0;   // H: Amount Paid
    var balance = totalAmount - currentPaid;
    var donor = String(pledgeData[3] || '').trim();      // D: Donor
    var customerId = String(pledgeData[1] || '').trim(); // B: Customer ID

    var paymentAmount = parseFloat(data.amount) || 0;
    if (paymentAmount <= 0) {
      return { status: 'error', message: 'Payment amount must be greater than 0.' };
    }
    if (paymentAmount > balance + 0.01) {
      return { status: 'error', message: 'Payment amount exceeds outstanding balance of $' + balance.toFixed(2) + '.' };
    }

    // Create Transaction row
    var refNum = 'MANUAL-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 1000);
    var method = data.method || 'Manual';
    var paymentDate = data.date ? new Date(data.date + 'T12:00:00') : new Date();

    var txSheet = ss.getSheetByName('Transactions');
    if (!txSheet) {
      txSheet = ss.insertSheet('Transactions');
      txSheet.appendRow([
        'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net', 'Donor Name', 'Pledge ID',
        'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date'
      ]);
      txSheet.getRange('1:1').setFontWeight('bold');
    }

    // Determine payment number
    var paymentNum = data.paymentNum || '';
    if (!paymentNum) {
      // Count existing transactions for this pledge
      var txLastRow = txSheet.getLastRow();
      if (txLastRow >= 2) {
        var txPledgeIds = txSheet.getRange(2, 7, txLastRow - 1, 1).getValues().flat();
        var existingCount = 0;
        for (var t = 0; t < txPledgeIds.length; t++) {
          if (String(txPledgeIds[t] || '').trim() === data.pledgeId) existingCount++;
        }
        paymentNum = String(existingCount + 1);
      } else {
        paymentNum = '1';
      }
    }

    var rpFee = parseFloat(data.fee) || 0;
    var rpNet = paymentAmount - rpFee;
    txSheet.appendRow([
      paymentDate,        // A: Timestamp
      refNum,             // B: Reference
      paymentAmount,      // C: Amount Charged
      rpFee,              // D: Fees
      rpNet,              // E: Net
      donor,              // F: Donor Name
      data.pledgeId,      // G: Pledge ID
      customerId,         // H: Customer ID
      'Manual',           // I: Result
      method,             // J: Method
      '',                 // K: Card Type
      paymentNum,         // L: Payment #
      'Pending',          // M: Funded
      ''                  // N: Funded Date
    ]);

    // Update Pledge paid/balance
    var newPaid = currentPaid + paymentAmount;
    var newBalance = totalAmount - newPaid;
    pledgesSheet.getRange(pledgeRow, 8).setValue(newPaid);      // H: Amount Paid
    pledgesSheet.getRange(pledgeRow, 9).setValue(newBalance);   // I: Balance

    // Auto-update status if fully paid
    if (newBalance <= 0.01) {
      pledgesSheet.getRange(pledgeRow, 7).setValue('Processed'); // G: Status
    } else {
      var currentStatus = String(pledgeData[6] || '').trim();
      if (currentStatus === 'Pledged') {
        pledgesSheet.getRange(pledgeRow, 7).setValue('Split');
      }
    }

    // If linked to scheduled payment: update that row's status + write Transaction Ref
    if (data.scheduleId && data.paymentNum) {
      try {
        var spSheet = ss.getSheetByName('Scheduled Payments');
        if (spSheet && spSheet.getLastRow() >= 2) {
          var spData = spSheet.getRange(2, 1, spSheet.getLastRow() - 1, 13).getValues();
          for (var s = 0; s < spData.length; s++) {
            var spSchedId = String(spData[s][1] || '').trim();
            var spPayNum = String(spData[s][9] || '').trim();
            if (spSchedId === data.scheduleId && spPayNum.indexOf(data.paymentNum) !== -1) {
              var spRow = s + 2;
              spSheet.getRange(spRow, 12).setValue('Paid');      // L: Status
              spSheet.getRange(spRow, 13).setValue(refNum);      // M: Transaction Ref
              break;
            }
          }
        }
      } catch (spErr) {
        Logger.log('Failed to update scheduled payment: ' + spErr.toString());
      }
    }

    return {
      status: 'success',
      transactionRef: refNum,
      updatedPledge: {
        pledgeId: data.pledgeId,
        amountPaid: newPaid,
        balance: newBalance,
        status: newBalance <= 0.01 ? 'Processed' : (currentPaid === 0 ? 'Split' : String(pledgeData[6] || '').trim())
      }
    };
  } catch (err) {
    Logger.log('recordPledgePayment error: ' + err.toString());
    return { status: 'error', message: 'Failed to record payment.' };
  }
}


// ============================================================
// SCHEDULED PAYMENT — UPDATE (markPaid, skip, cancelSeries)
// ============================================================
/**
 * Update a scheduled payment status.
 * @param {Object} data - { campaignId, scheduleId, paymentNum, action, amount? }
 *   action: 'markPaid' | 'skip' | 'cancelSeries'
 * @returns {{ status: string, transactionRef?: string, message?: string }}
 */
function updateScheduledPayment(data) {
  try {
    if (!data.campaignId || !data.scheduleId || !data.action) {
      return { status: 'error', message: 'campaignId, scheduleId, and action are required.' };
    }

    var campaignRow = getCampaignRow(data.campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign not found.' };
    }

    var sheetId = String(campaignRow[3] || '').trim();
    var ss = SpreadsheetApp.openById(sheetId);
    var spSheet = ss.getSheetByName('Scheduled Payments');
    if (!spSheet || spSheet.getLastRow() < 2) {
      return { status: 'error', message: 'No scheduled payments found.' };
    }

    var lastRow = spSheet.getLastRow();
    var spData = spSheet.getRange(2, 1, lastRow - 1, 13).getValues();

    if (data.action === 'markPaid') {
      if (!data.paymentNum) {
        return { status: 'error', message: 'paymentNum is required for markPaid.' };
      }

      // Find the specific scheduled payment row
      for (var i = 0; i < spData.length; i++) {
        var spSchedId = String(spData[i][1] || '').trim();
        var spPayNum = String(spData[i][9] || '').trim();
        var spStatus = String(spData[i][11] || '').trim();

        if (spSchedId === data.scheduleId && spPayNum.indexOf(String(data.paymentNum)) !== -1 &&
            (spStatus === 'Scheduled' || spStatus === 'Overdue')) {
          var spRow = i + 2;
          var pledgeId = String(spData[i][2] || '').trim();
          var customerId = String(spData[i][3] || '').trim();
          var donor = String(spData[i][4] || '').trim();
          var perPaymentAmt = data.amount || (parseFloat(spData[i][5]) || 0);

          // Create Transaction
          var refNum = 'MANUAL-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 1000);

          var txSheet = ss.getSheetByName('Transactions');
          if (!txSheet) {
            txSheet = ss.insertSheet('Transactions');
            txSheet.appendRow([
              'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net', 'Donor Name', 'Pledge ID',
              'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date'
            ]);
            txSheet.getRange('1:1').setFontWeight('bold');
          }

          var mpFee = calculateFee(data.method || 'Other', perPaymentAmt, ss);
          var mpNet = perPaymentAmt - mpFee;
          txSheet.appendRow([
            new Date(),          // A: Timestamp
            refNum,              // B: Reference
            perPaymentAmt,       // C: Amount Charged
            mpFee,               // D: Fees
            mpNet,               // E: Net
            donor,               // F: Donor Name
            pledgeId,            // G: Pledge ID
            customerId,          // H: Customer ID
            'Manual',            // I: Result
            data.method || 'Manual', // J: Method
            '',                  // K: Card Type
            spPayNum,            // L: Payment #
            'Pending',           // M: Funded
            ''                   // N: Funded Date
          ]);

          // Update Scheduled Payment row
          spSheet.getRange(spRow, 12).setValue('Paid');      // L: Status
          spSheet.getRange(spRow, 13).setValue(refNum);      // M: Transaction Ref

          // Update Pledge paid/balance
          updatePledgePaid(ss, pledgeId, perPaymentAmt);

          return {
            status: 'success',
            transactionRef: refNum,
            message: 'Payment recorded successfully.'
          };
        }
      }

      return { status: 'error', message: 'Scheduled payment not found or already processed.' };

    } else if (data.action === 'skip') {
      if (!data.paymentNum) {
        return { status: 'error', message: 'paymentNum is required for skip.' };
      }

      for (var i = 0; i < spData.length; i++) {
        var spSchedId = String(spData[i][1] || '').trim();
        var spPayNum = String(spData[i][9] || '').trim();
        var spStatus = String(spData[i][11] || '').trim();

        if (spSchedId === data.scheduleId && spPayNum.indexOf(String(data.paymentNum)) !== -1 &&
            (spStatus === 'Scheduled' || spStatus === 'Overdue')) {
          spSheet.getRange(i + 2, 12).setValue('Skipped'); // L: Status
          return { status: 'success', message: 'Payment skipped.' };
        }
      }
      return { status: 'error', message: 'Scheduled payment not found.' };

    } else if (data.action === 'cancelSeries') {
      var cancelCount = 0;
      for (var i = 0; i < spData.length; i++) {
        var spSchedId = String(spData[i][1] || '').trim();
        var spStatus = String(spData[i][11] || '').trim();

        if (spSchedId === data.scheduleId && (spStatus === 'Scheduled' || spStatus === 'Overdue')) {
          spSheet.getRange(i + 2, 12).setValue('Cancelled'); // L: Status
          cancelCount++;
        }
      }
      return { status: 'success', message: cancelCount + ' payment(s) cancelled.' };

    } else {
      return { status: 'error', message: 'Invalid action. Use markPaid, skip, or cancelSeries.' };
    }
  } catch (err) {
    Logger.log('updateScheduledPayment error: ' + err.toString());
    return { status: 'error', message: 'Failed to update scheduled payment.' };
  }
}


// ============================================================
// PLEDGE — UPDATE AMOUNT PAID (helper, mirrors Code.gs)
// ============================================================
/**
 * Update a pledge's Amount Paid and Balance after a payment.
 * Auto-updates status to 'Processed' if fully paid.
 * @param {Spreadsheet} ss - Campaign spreadsheet
 * @param {string} pledgeId - Pledge ID
 * @param {number} additionalAmount - Amount to add to paid
 */
function updatePledgePaid(ss, pledgeId, additionalAmount) {
  try {
    if (!pledgeId) return;
    var sheet = ss.getSheetByName('Pledges');
    if (!sheet || sheet.getLastRow() < 2) return;

    var lastRow = sheet.getLastRow();
    var pledgeIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    var rowIndex = pledgeIds.indexOf(pledgeId);
    if (rowIndex === -1) return;

    var dataRow = rowIndex + 2;
    var currentPaid = parseFloat(sheet.getRange(dataRow, 8).getValue()) || 0;
    var totalAmount = parseFloat(sheet.getRange(dataRow, 6).getValue()) || 0;
    var newPaid = currentPaid + additionalAmount;
    var newBalance = totalAmount - newPaid;

    sheet.getRange(dataRow, 8).setValue(newPaid);
    sheet.getRange(dataRow, 9).setValue(newBalance);

    if (newBalance <= 0.01) {
      sheet.getRange(dataRow, 7).setValue('Processed');
    }
  } catch (err) {
    Logger.log('updatePledgePaid failed: ' + err.toString());
  }
}


// ============================================================
// MARK TRANSACTION FUNDED
// ============================================================
/**
 * Mark a single transaction as funded (cleared in bank).
 * @param {Object} data - { campaignId, transactionRef }
 * @returns {{ status: string, transactionRef?: string, fundedDate?: string }}
 */
function markTransactionFunded(data) {
  try {
    if (!data.campaignId || !data.transactionRef) {
      return { status: 'error', message: 'campaignId and transactionRef are required.' };
    }

    var campaignRow = getCampaignRow(data.campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign not found.' };
    }

    var sheetId = String(campaignRow[3] || '').trim();
    var ss = SpreadsheetApp.openById(sheetId);
    var txSheet = ss.getSheetByName('Transactions');
    if (!txSheet || txSheet.getLastRow() < 2) {
      return { status: 'error', message: 'Transaction not found.' };
    }

    var lastRow = txSheet.getLastRow();
    var refs = txSheet.getRange(2, 2, lastRow - 1, 1).getValues(); // col B: Reference

    for (var i = 0; i < refs.length; i++) {
      if (String(refs[i][0] || '').trim() === data.transactionRef) {
        var txRow = i + 2;
        var fundedDate = new Date();
        txSheet.getRange(txRow, 13).setValue('Cleared');   // M: Funded
        txSheet.getRange(txRow, 14).setValue(fundedDate);  // N: Funded Date
        return {
          status: 'success',
          transactionRef: data.transactionRef,
          fundedDate: formatDateEdt_(fundedDate)
        };
      }
    }

    return { status: 'error', message: 'Transaction reference not found.' };
  } catch (err) {
    Logger.log('markTransactionFunded error: ' + err.toString());
    return { status: 'error', message: 'Failed to mark transaction as funded.' };
  }
}


// ============================================================
// BULK MARK FUNDED
// ============================================================
/**
 * Batch-mark multiple transactions as funded (cleared).
 * @param {Object} data - { campaignId, transactionRefs: string[] }
 * @returns {{ status: string, count?: number, fundedDate?: string }}
 */
function bulkMarkFunded(data) {
  try {
    if (!data.campaignId || !data.transactionRefs || !data.transactionRefs.length) {
      return { status: 'error', message: 'campaignId and transactionRefs array are required.' };
    }

    var campaignRow = getCampaignRow(data.campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign not found.' };
    }

    var sheetId = String(campaignRow[3] || '').trim();
    var ss = SpreadsheetApp.openById(sheetId);
    var txSheet = ss.getSheetByName('Transactions');
    if (!txSheet || txSheet.getLastRow() < 2) {
      return { status: 'error', message: 'No transactions found.' };
    }

    var lastRow = txSheet.getLastRow();
    var allData = txSheet.getRange(2, 1, lastRow - 1, 14).getValues(); // cols A-N
    var fundedDate = new Date();
    var refsToFind = {};
    for (var r = 0; r < data.transactionRefs.length; r++) {
      refsToFind[data.transactionRefs[r]] = true;
    }

    var updatedCount = 0;
    for (var i = 0; i < allData.length; i++) {
      var ref = String(allData[i][1] || '').trim(); // col B
      if (refsToFind[ref]) {
        allData[i][12] = 'Cleared';    // col M: Funded
        allData[i][13] = fundedDate;   // col N: Funded Date
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      txSheet.getRange(2, 1, allData.length, 14).setValues(allData);
    }

    return {
      status: 'success',
      count: updatedCount,
      fundedDate: formatDateEdt_(fundedDate),
      message: updatedCount + ' transaction(s) marked as cleared.'
    };
  } catch (err) {
    Logger.log('bulkMarkFunded error: ' + err.toString());
    return { status: 'error', message: 'Failed to bulk mark transactions as funded.' };
  }
}


// ============================================================
// TRANSACTIONS — READ FROM TAB 2 TRANSACTIONS
// ============================================================
/**
 * Retrieve transaction records from a campaign's Transactions sheet.
 * Tab 2 schema (14 cols):
 * A: Timestamp, B: Reference, C: Amount Charged, D: Fees, E: Net,
 * F: Donor Name, G: Pledge ID, H: Customer ID, I: Result, J: Method,
 * K: Card Type, L: Payment #, M: Funded, N: Funded Date
 *
 * @param {string} campaignId - Campaign ID/slug
 * @param {Object} [filters] - { page, pageSize, search, status, result, method, funded, dateFrom, dateTo }
 * @returns {Object} { status, transactions, total, page, pageSize, summary }
 */
function getTransactionsMaster_(campaignId, filters) {
  try {
    filters = filters || {};
    var campaignRow = getCampaignRow(campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign not found: ' + campaignId };
    }

    var sheetId = String(campaignRow[3] || '').trim();
    if (!sheetId) {
      return { status: 'error', message: 'No sheet configured for this campaign.' };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('Transactions');
    if (!sheet || sheet.getLastRow() < 2) {
      return {
        status: 'success',
        transactions: [],
        total: 0,
        page: 1,
        pageSize: parseInt(filters.pageSize) || 50,
        summary: { count: 0, totalCharged: 0, totalFees: 0, totalNet: 0 }
      };
    }

    var lastRow = sheet.getLastRow();
    var lastCol = Math.max(15, sheet.getLastColumn());
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    var page = parseInt(filters.page) || 1;
    var pageSize = parseInt(filters.pageSize) || 50;
    var searchFilter = (filters.search || '').trim().toLowerCase();
    var resultFilter = (filters.result || '').trim().toLowerCase();
    var methodFilter = (filters.method || '').trim().toLowerCase();
    var fundedFilter = (filters.funded || '').trim().toLowerCase();
    var dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    var dateTo = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59') : null;

    var filtered = [];
    var sumCharged = 0;
    var sumFees = 0;
    var sumNet = 0;

    // Scan newest first (from bottom row up to row 2)
    for (var i = data.length - 1; i >= 0; i--) {
      var row = data[i];
      var rawTimestamp = row[0];
      var refNum = String(row[1] || '').trim();
      var amountCharged = parseFloat(row[2]) || 0;
      var fees = parseFloat(row[3]) || 0;
      var net = parseFloat(row[4]) || 0;
      var donorName = String(row[5] || '').trim();
      var pledgeId = String(row[6] || '').trim();
      var customerId = String(row[7] || '').trim();
      var result = String(row[8] || '').trim();
      var method = String(row[9] || '').trim();
      var cardType = String(row[10] || '').trim();
      var paymentNum = String(row[11] || '').trim();
      var funded = String(row[12] || '').trim();
      var fundedDate = row[13] ? formatDateEdt_(row[13]) : '';
      var depositBatchId = String(row[14] || '').trim();

      var txDate = rawTimestamp ? (rawTimestamp instanceof Date ? rawTimestamp : new Date(rawTimestamp)) : null;

      // Apply search filter
      if (searchFilter) {
        var match = donorName.toLowerCase().indexOf(searchFilter) !== -1 ||
                    refNum.toLowerCase().indexOf(searchFilter) !== -1 ||
                    pledgeId.toLowerCase().indexOf(searchFilter) !== -1 ||
                    customerId.toLowerCase().indexOf(searchFilter) !== -1;
        if (!match) continue;
      }

      // Apply result filter
      if (resultFilter && result.toLowerCase() !== resultFilter) continue;

      // Apply method filter (checks method and cardType)
      if (methodFilter && method.toLowerCase().indexOf(methodFilter) === -1 && cardType.toLowerCase().indexOf(methodFilter) === -1) continue;

      // Apply funded filter
      if (fundedFilter) {
        var isCleared = funded.toLowerCase() === 'cleared';
        if ((fundedFilter === 'pending' || fundedFilter === 'unfunded') && isCleared) continue;
        if ((fundedFilter === 'cleared' || fundedFilter === 'funded') && !isCleared) continue;
        if (fundedFilter !== 'pending' && fundedFilter !== 'unfunded' && fundedFilter !== 'cleared' && fundedFilter !== 'funded' && funded.toLowerCase() !== fundedFilter) continue;
      }

      // Apply date filters
      if (dateFrom && txDate && txDate < dateFrom) continue;
      if (dateTo && txDate && txDate > dateTo) continue;

      sumCharged += amountCharged;
      sumFees += fees;
      sumNet += net;

      filtered.push({
        id: refNum || ('TXN-' + (i + 2)),
        timestamp: formatDateEdt_(txDate),
        date: txDate ? Utilities.formatDate(txDate, Session.getScriptTimeZone() || 'America/New_York', 'yyyy-MM-dd HH:mm') : '',
        reference: refNum,
        amount: amountCharged,
        fees: fees,
        net: net,
        donorName: donorName,
        pledgeId: pledgeId,
        customerId: customerId,
        result: result,
        method: method,
        cardType: cardType,
        paymentNum: paymentNum,
        funded: funded,
        fundedDate: fundedDate,
        depositBatchId: depositBatchId
      });
    }

    var total = filtered.length;
    var startIdx = (page - 1) * pageSize;
    var paginated = filtered.slice(startIdx, startIdx + pageSize);

    return {
      status: 'success',
      transactions: paginated,
      total: total,
      page: page,
      pageSize: pageSize,
      summary: {
        count: total,
        totalCharged: Math.round(sumCharged * 100) / 100,
        totalFees: Math.round(sumFees * 100) / 100,
        totalNet: Math.round(sumNet * 100) / 100
      }
    };
  } catch (err) {
    Logger.log('getTransactionsMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to retrieve transactions: ' + err.toString() };
  }
}


// ============================================================
// SCHEDULED PAYMENTS — READ WITH OVERDUE AUTO-FLAGGING


// ============================================================
// BOOKKEEPER FINANCIAL OPERATIONS SUITE (PART 2)
// Helper Functions: Deposits, Expenses, and Transaction Columns
// ============================================================

/**
 * Ensure the Deposits sheet exists with the proper 12-column schema.
 * Schema: [Batch ID, Date Created, Deposit Date, Transaction Count, Gross Amount, Total Fees, Net Transferred, Target Account, Transfer Ref, Memo, Created By, Status]
 * @param {Spreadsheet} ss - Campaign Spreadsheet
 * @returns {Sheet} The Deposits sheet
 */
function ensureDepositsSheet_(ss) {
  var sheet = ss.getSheetByName('Deposits');
  var headers = [
    'Batch ID', 'Date Created', 'Deposit Date', 'Transaction Count',
    'Gross Amount', 'Total Fees', 'Net Transferred', 'Target Account',
    'Transfer Ref', 'Memo', 'Created By', 'Status'
  ];
  if (!sheet) {
    sheet = ss.insertSheet('Deposits');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return sheet;
  }
  if (sheet.getLastColumn() === 0 || sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Ensure the Expenses sheet (Tab 8) exists and is expanded to the 12-column schema.
 * Old schema: [Date, Amount, Payee, Type, Purpose, Authorized By, Given by]
 * New schema: [Date, Amount, Payee, Type, Purpose, Method, Check/Ref #, Authorized By, Given By, Status, Cleared Date, Expense ID]
 * @param {Spreadsheet} ss - Campaign Spreadsheet
 * @returns {Sheet} The Expenses sheet
 */
function ensureExpandedExpensesSheet_(ss) {
  var expSheet = ss.getSheetByName('Expenses');
  var newHeaders = [
    'Date', 'Amount', 'Payee', 'Type', 'Purpose',
    'Method', 'Check/Ref #', 'Authorized By', 'Given By',
    'Status', 'Cleared Date', 'Expense ID'
  ];
  if (!expSheet) {
    expSheet = ss.insertSheet('Expenses');
    expSheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
    expSheet.getRange(1, 1, 1, newHeaders.length).setFontWeight('bold');
    expSheet.setFrozenRows(1);
    return expSheet;
  }

  var lastCol = expSheet.getLastColumn();
  if (lastCol >= 12) {
    return expSheet; // Already migrated or expanded
  }

  var lastRow = expSheet.getLastRow();
  if (lastRow < 2) {
    expSheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
    expSheet.getRange(1, 1, 1, newHeaders.length).setFontWeight('bold');
    expSheet.setFrozenRows(1);
    return expSheet;
  }

  // Read existing 7 cols: Date, Amount, Payee, Type, Purpose, Authorized By, Given by
  var oldData = expSheet.getRange(2, 1, lastRow - 1, Math.max(7, lastCol)).getValues();
  var restructured = [];
  var dateStr = Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMdd');

  for (var i = 0; i < oldData.length; i++) {
    var r = oldData[i];
    var dDate = r[0];
    var dAmt = r[1];
    var dPayee = r[2];
    var dType = r[3];
    var dPurpose = r[4];
    var dAuthBy = r[5];
    var dGivenBy = r[6];
    var expenseId = 'DISB-' + dateStr + '-' + (1000 + i);

    restructured.push([
      dDate,
      dAmt,
      dPayee,
      dType,
      dPurpose,
      'Other',     // Method
      '',          // Check/Ref #
      dAuthBy,     // Authorized By
      dGivenBy,    // Given By
      'Cleared',   // Status
      dDate || '', // Cleared Date
      expenseId    // Expense ID
    ]);
  }

  // Clear existing content and rewrite with 12 cols
  expSheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
  expSheet.getRange(1, 1, 1, newHeaders.length).setFontWeight('bold');
  expSheet.setFrozenRows(1);
  if (restructured.length > 0) {
    expSheet.getRange(2, 1, restructured.length, newHeaders.length).setValues(restructured);
  }
  return expSheet;
}

/**
 * Ensure Transactions sheet has column O for 'Deposit Batch ID'.
 * @param {Sheet} txSheet - Transactions sheet
 */
function ensureTransactionDepositCol_(txSheet) {
  if (!txSheet) return;
  var lastCol = txSheet.getLastColumn();
  if (lastCol < 15) {
    txSheet.getRange(1, 15).setValue('Deposit Batch ID');
    txSheet.getRange(1, 15).setFontWeight('bold');
  } else {
    var col15Header = String(txSheet.getRange(1, 15).getValue() || '').trim();
    if (!col15Header) {
      txSheet.getRange(1, 15).setValue('Deposit Batch ID');
      txSheet.getRange(1, 15).setFontWeight('bold');
    }
  }
}


// ============================================================
// FINANCIAL SUITE ENDPOINTS: DEPOSITS, DISBURSEMENTS & RECONCILIATION
// ============================================================

/**
 * Retrieve all deposit batches for a campaign.
 * @param {string} campaignId
 * @returns {{ status: string, batches?: Array, summary?: Object, message?: string }}
 */
function getDepositBatchesMaster_(campaignId) {
  try {
    if (!campaignId) {
      return { status: 'error', message: 'campaignId is required.' };
    }
    var campaignRow = getCampaignRow(campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign not found: ' + campaignId };
    }
    var sheetId = String(campaignRow[3] || '').trim();
    if (!sheetId) {
      return { status: 'error', message: 'No sheet configured for this campaign.' };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var depSheet = ensureDepositsSheet_(ss);
    var lastRow = depSheet.getLastRow();

    if (lastRow < 2) {
      return {
        status: 'success',
        batches: [],
        summary: { totalBatches: 0, totalGross: 0, totalFees: 0, totalNet: 0 }
      };
    }

    var data = depSheet.getRange(2, 1, lastRow - 1, 12).getValues();
    var batches = [];
    var totalGross = 0;
    var totalFees = 0;
    var totalNet = 0;

    // Scan newest first
    for (var i = data.length - 1; i >= 0; i--) {
      var r = data[i];
      var batchId = String(r[0] || '').trim();
      if (!batchId) continue;

      var rawCreated = r[1];
      var rawDeposit = r[2];
      var txCount = parseInt(r[3]) || 0;
      var gross = parseFloat(r[4]) || 0;
      var fees = parseFloat(r[5]) || 0;
      var net = parseFloat(r[6]) || 0;
      var targetAccount = String(r[7] || '').trim();
      var transferRef = String(r[8] || '').trim();
      var memo = String(r[9] || '').trim();
      var createdBy = String(r[10] || '').trim();
      var status = String(r[11] || 'Completed').trim();

      if (status !== 'Reversed') {
        totalGross += gross;
        totalFees += fees;
        totalNet += net;
      }

      batches.push({
        batchId: batchId,
        dateCreated: rawCreated ? formatDateEdt_(rawCreated) : '',
        depositDate: rawDeposit ? (rawDeposit instanceof Date ? Utilities.formatDate(rawDeposit, 'America/New_York', 'yyyy-MM-dd') : String(rawDeposit).split('T')[0]) : '',
        transactionCount: txCount,
        grossAmount: Math.round(gross * 100) / 100,
        totalFees: Math.round(fees * 100) / 100,
        netTransferred: Math.round(net * 100) / 100,
        targetAccount: targetAccount,
        transferRef: transferRef,
        memo: memo,
        createdBy: createdBy,
        status: status
      });
    }

    return {
      status: 'success',
      batches: batches,
      summary: {
        totalBatches: batches.length,
        totalGross: Math.round(totalGross * 100) / 100,
        totalFees: Math.round(totalFees * 100) / 100,
        totalNet: Math.round(totalNet * 100) / 100
      }
    };
  } catch (err) {
    Logger.log('getDepositBatchesMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to get deposit batches: ' + err.toString() };
  }
}

/**
 * Create a new deposit batch and link transactions to it.
 * @param {string} campaignId
 * @param {Object} data - { transactionRefs: string[], depositDate, targetAccount, transferRef, memo }
 * @param {string} callerEmail
 * @returns {{ status: string, batchId?: string, transactionCount?: number, gross?: number, fees?: number, net?: number, message?: string }}
 */
function createDepositBatchMaster_(campaignId, data, callerEmail) {
  try {
    if (!campaignId) {
      return { status: 'error', message: 'campaignId is required.' };
    }
    if (!data.transactionRefs || !Array.isArray(data.transactionRefs) || data.transactionRefs.length === 0) {
      return { status: 'error', message: 'transactionRefs array is required.' };
    }

    var campaignRow = getCampaignRow(campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign not found: ' + campaignId };
    }
    var sheetId = String(campaignRow[3] || '').trim();
    if (!sheetId) {
      return { status: 'error', message: 'No sheet configured for this campaign.' };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var txSheet = ss.getSheetByName('Transactions');
    if (!txSheet || txSheet.getLastRow() < 2) {
      return { status: 'error', message: 'No transactions found.' };
    }

    ensureTransactionDepositCol_(txSheet);
    var depSheet = ensureDepositsSheet_(ss);

    // Generate batch ID: DEP-YYYYMMDD-XXXX
    var randSuffix = Math.floor(1000 + Math.random() * 9000);
    var batchId = 'DEP-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMdd') + '-' + randSuffix;

    var lastRow = txSheet.getLastRow();
    var lastCol = Math.max(15, txSheet.getLastColumn());
    var txData = txSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    var refsToFind = {};
    for (var r = 0; r < data.transactionRefs.length; r++) {
      refsToFind[String(data.transactionRefs[r]).trim()] = true;
    }

    var matchedCount = 0;
    var totalGross = 0;
    var totalFees = 0;
    var fundedDate = new Date();

    for (var i = 0; i < txData.length; i++) {
      var ref = String(txData[i][1] || '').trim(); // col B: Reference
      if (refsToFind[ref]) {
        var charged = parseFloat(txData[i][2]) || 0; // col C: Amount Charged
        var fee = parseFloat(txData[i][3]) || 0;     // col D: Fees
        txData[i][12] = 'Cleared';                   // col M: Funded
        txData[i][13] = fundedDate;                  // col N: Funded Date
        txData[i][14] = batchId;                     // col O: Deposit Batch ID
        totalGross += charged;
        totalFees += fee;
        matchedCount++;
      }
    }

    if (matchedCount === 0) {
      return { status: 'error', message: 'None of the specified transactions were found.' };
    }

    // Write back updated transactions
    txSheet.getRange(2, 1, txData.length, lastCol).setValues(txData);

    var totalNet = totalGross - totalFees;
    var depDateVal = data.depositDate ? new Date(data.depositDate) : fundedDate;

    // Append to Deposits tab
    // [Batch ID, Date Created, Deposit Date, Transaction Count, Gross Amount, Total Fees, Net Transferred, Target Account, Transfer Ref, Memo, Created By, Status]
    depSheet.appendRow([
      batchId,
      fundedDate,
      depDateVal,
      matchedCount,
      Math.round(totalGross * 100) / 100,
      Math.round(totalFees * 100) / 100,
      Math.round(totalNet * 100) / 100,
      data.targetAccount || '',
      data.transferRef || '',
      data.memo || '',
      callerEmail || '',
      'Completed'
    ]);

    return {
      status: 'success',
      batchId: batchId,
      transactionCount: matchedCount,
      gross: Math.round(totalGross * 100) / 100,
      fees: Math.round(totalFees * 100) / 100,
      net: Math.round(totalNet * 100) / 100
    };
  } catch (err) {
    Logger.log('createDepositBatchMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to create deposit batch: ' + err.toString() };
  }
}

/**
 * Reverse a deposit batch: clears Cleared status and Deposit Batch ID on transactions,
 * and sets batch status to 'Reversed' on Deposits tab.
 * @param {string} campaignId
 * @param {Object} data - { batchId }
 * @returns {{ status: string, reversedCount?: number, message?: string }}
 */
function reverseDepositBatchMaster_(campaignId, data) {
  try {
    if (!campaignId || !data.batchId) {
      return { status: 'error', message: 'campaignId and batchId are required.' };
    }

    var campaignRow = getCampaignRow(campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign not found: ' + campaignId };
    }
    var sheetId = String(campaignRow[3] || '').trim();
    if (!sheetId) {
      return { status: 'error', message: 'No sheet configured for this campaign.' };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var txSheet = ss.getSheetByName('Transactions');
    var depSheet = ensureDepositsSheet_(ss);
    var batchIdToReverse = String(data.batchId).trim();

    var reversedCount = 0;
    if (txSheet && txSheet.getLastRow() >= 2) {
      var lastRow = txSheet.getLastRow();
      var lastCol = Math.max(15, txSheet.getLastColumn());
      var txData = txSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

      for (var i = 0; i < txData.length; i++) {
        var txBatchId = String(txData[i][14] || '').trim(); // col O
        if (txBatchId === batchIdToReverse) {
          txData[i][12] = ''; // col M: Funded
          txData[i][13] = ''; // col N: Funded Date
          txData[i][14] = ''; // col O: Deposit Batch ID
          reversedCount++;
        }
      }

      if (reversedCount > 0) {
        txSheet.getRange(2, 1, txData.length, lastCol).setValues(txData);
      }
    }

    // Update Deposits sheet row status to 'Reversed'
    if (depSheet.getLastRow() >= 2) {
      var depLastRow = depSheet.getLastRow();
      var depBatchIds = depSheet.getRange(2, 1, depLastRow - 1, 1).getValues();
      for (var j = 0; j < depBatchIds.length; j++) {
        if (String(depBatchIds[j][0] || '').trim() === batchIdToReverse) {
          depSheet.getRange(j + 2, 12).setValue('Reversed'); // col L: Status
          break;
        }
      }
    }

    return {
      status: 'success',
      reversedCount: reversedCount,
      message: 'Batch ' + batchIdToReverse + ' reversed successfully (' + reversedCount + ' transactions cleared).'
    };
  } catch (err) {
    Logger.log('reverseDepositBatchMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to reverse deposit batch: ' + err.toString() };
  }
}

/**
 * Get disbursements (Expenses tab) with filtering and summary.
 * @param {string} campaignId
 * @param {Object} data - { status?, search?, startDate?, endDate? }
 * @returns {{ status: string, disbursements?: Array, summary?: Object, message?: string }}
 */
function getDisbursementsMaster_(campaignId, data) {
  try {
    if (!campaignId) {
      return { status: 'error', message: 'campaignId is required.' };
    }
    data = data || {};
    var campaignRow = getCampaignRow(campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign not found: ' + campaignId };
    }
    var sheetId = String(campaignRow[3] || '').trim();
    if (!sheetId) {
      return { status: 'error', message: 'No sheet configured for this campaign.' };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var expSheet = ensureExpandedExpensesSheet_(ss);
    var lastRow = expSheet.getLastRow();

    if (lastRow < 2) {
      return {
        status: 'success',
        disbursements: [],
        summary: { totalAmount: 0, clearedAmount: 0, pendingAmount: 0, count: 0 }
      };
    }

    var expData = expSheet.getRange(2, 1, lastRow - 1, 12).getValues();
    var statusFilter = (data.status || '').trim().toLowerCase();
    var searchFilter = (data.search || '').trim().toLowerCase();
    var startDate = data.startDate ? new Date(data.startDate) : null;
    var endDate = data.endDate ? new Date(data.endDate + 'T23:59:59') : null;

    var disbursements = [];
    var totalAmount = 0;
    var clearedAmount = 0;
    var pendingAmount = 0;

    // Scan newest first
    for (var i = expData.length - 1; i >= 0; i--) {
      var r = expData[i];
      var rDate = r[0];
      var amt = parseFloat(r[1]) || 0;
      var payee = String(r[2] || '').trim();
      var type = String(r[3] || '').trim();
      var purpose = String(r[4] || '').trim();
      var method = String(r[5] || '').trim();
      var checkRef = String(r[6] || '').trim();
      var authBy = String(r[7] || '').trim();
      var givenBy = String(r[8] || '').trim();
      var status = String(r[9] || 'Cleared').trim();
      var clrDate = r[10];
      var expenseId = String(r[11] || ('DISB-' + (i + 2))).trim();

      var itemDate = rDate ? (rDate instanceof Date ? rDate : new Date(rDate)) : null;

      // Status filter
      if (statusFilter && statusFilter !== 'all') {
        if (status.toLowerCase() !== statusFilter) continue;
      }

      // Date range filter
      if (startDate && itemDate && itemDate < startDate) continue;
      if (endDate && itemDate && itemDate > endDate) continue;

      // Search filter
      if (searchFilter) {
        var strToSearch = (payee + ' ' + type + ' ' + purpose + ' ' + checkRef + ' ' + authBy + ' ' + expenseId).toLowerCase();
        if (strToSearch.indexOf(searchFilter) === -1) continue;
      }

      totalAmount += amt;
      if (status.toLowerCase() === 'cleared') {
        clearedAmount += amt;
      } else {
        pendingAmount += amt;
      }

      disbursements.push({
        expenseId: expenseId,
        date: rDate ? formatDateEdt_(rDate) : '',
        dateFormatted: itemDate && !isNaN(itemDate.getTime()) ? Utilities.formatDate(itemDate, 'America/New_York', 'yyyy-MM-dd') : '',
        amount: Math.round(amt * 100) / 100,
        payee: payee,
        type: type,
        purpose: purpose,
        method: method,
        checkRef: checkRef,
        authorizedBy: authBy,
        givenBy: givenBy,
        status: status,
        clearedDate: clrDate ? formatDateEdt_(clrDate) : ''
      });
    }

    return {
      status: 'success',
      disbursements: disbursements,
      summary: {
        totalAmount: Math.round(totalAmount * 100) / 100,
        clearedAmount: Math.round(clearedAmount * 100) / 100,
        pendingAmount: Math.round(pendingAmount * 100) / 100,
        count: disbursements.length
      }
    };
  } catch (err) {
    Logger.log('getDisbursementsMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to get disbursements: ' + err.toString() };
  }
}

/**
 * Create or update a disbursement record in Expenses.
 * @param {string} campaignId
 * @param {Object} data - { expenseId?, date, amount, payee, type, purpose, method, checkRef, authorizedBy, status }
 * @param {string} callerEmail
 * @returns {{ status: string, expenseId?: string, message?: string }}
 */
function saveDisbursementMaster_(campaignId, data, callerEmail) {
  try {
    if (!campaignId) {
      return { status: 'error', message: 'campaignId is required.' };
    }
    var campaignRow = getCampaignRow(campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign not found: ' + campaignId };
    }
    var sheetId = String(campaignRow[3] || '').trim();
    if (!sheetId) {
      return { status: 'error', message: 'No sheet configured for this campaign.' };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var expSheet = ensureExpandedExpensesSheet_(ss);
    var amount = parseFloat(data.amount) || 0;
    var status = data.status ? (data.status.charAt(0).toUpperCase() + data.status.slice(1).toLowerCase()) : 'Pending';
    var dDate = data.date ? new Date(data.date) : new Date();
    var clearedDate = (status === 'Cleared') ? new Date() : '';

    if (data.expenseId) {
      // Update existing row
      var targetId = String(data.expenseId).trim();
      var lastRow = expSheet.getLastRow();
      var foundRow = -1;
      if (lastRow >= 2) {
        var idValues = expSheet.getRange(2, 12, lastRow - 1, 1).getValues();
        for (var i = 0; i < idValues.length; i++) {
          if (String(idValues[i][0] || '').trim() === targetId) {
            foundRow = i + 2;
            break;
          }
        }
      }

      if (foundRow > 0) {
        var existingRowVals = expSheet.getRange(foundRow, 1, 1, 12).getValues()[0];
        // If already Cleared and remaining Cleared, preserve previous cleared date if valid
        if (status === 'Cleared' && existingRowVals[9] === 'Cleared' && existingRowVals[10]) {
          clearedDate = existingRowVals[10];
        }
        var updatedRow = [
          dDate,
          amount,
          data.payee || '',
          data.type || 'Expense',
          data.purpose || '',
          data.method || 'Check',
          data.checkRef || '',
          data.authorizedBy || '',
          existingRowVals[8] || callerEmail || '', // Given By
          status,
          clearedDate,
          targetId
        ];
        expSheet.getRange(foundRow, 1, 1, 12).setValues([updatedRow]);
        return { status: 'success', expenseId: targetId, message: 'Disbursement updated.' };
      }
    }

    // New disbursement
    var randSuffix = Math.floor(1000 + Math.random() * 9000);
    var newId = 'DISB-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMdd') + '-' + randSuffix;
    var newRow = [
      dDate,
      amount,
      data.payee || '',
      data.type || 'Expense',
      data.purpose || '',
      data.method || 'Check',
      data.checkRef || '',
      data.authorizedBy || '',
      callerEmail || '',
      status,
      clearedDate,
      newId
    ];
    expSheet.appendRow(newRow);

    return { status: 'success', expenseId: newId, message: 'Disbursement saved.' };
  } catch (err) {
    Logger.log('saveDisbursementMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to save disbursement: ' + err.toString() };
  }
}

/**
 * Update the status of a disbursement (Pending or Cleared).
 * @param {string} campaignId
 * @param {Object} data - { expenseId, status }
 * @returns {{ status: string, message?: string }}
 */
function updateDisbursementStatusMaster_(campaignId, data) {
  try {
    if (!campaignId || !data.expenseId) {
      return { status: 'error', message: 'campaignId and expenseId are required.' };
    }
    var campaignRow = getCampaignRow(campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign not found: ' + campaignId };
    }
    var sheetId = String(campaignRow[3] || '').trim();
    if (!sheetId) {
      return { status: 'error', message: 'No sheet configured for this campaign.' };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var expSheet = ensureExpandedExpensesSheet_(ss);
    var targetId = String(data.expenseId).trim();
    var newStatus = (data.status || 'Pending').toLowerCase() === 'cleared' ? 'Cleared' : 'Pending';

    var lastRow = expSheet.getLastRow();
    if (lastRow < 2) {
      return { status: 'error', message: 'Disbursement not found.' };
    }

    var idValues = expSheet.getRange(2, 12, lastRow - 1, 1).getValues();
    for (var i = 0; i < idValues.length; i++) {
      if (String(idValues[i][0] || '').trim() === targetId) {
        var rowNum = i + 2;
        expSheet.getRange(rowNum, 10).setValue(newStatus); // col J: Status
        if (newStatus === 'Cleared') {
          expSheet.getRange(rowNum, 11).setValue(new Date()); // col K: Cleared Date
        } else {
          expSheet.getRange(rowNum, 11).setValue(''); // col K: Cleared Date
        }
        return { status: 'success', message: 'Status updated to ' + newStatus + '.' };
      }
    }

    return { status: 'error', message: 'Disbursement ID not found: ' + targetId };
  } catch (err) {
    Logger.log('updateDisbursementStatusMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to update disbursement status: ' + err.toString() };
  }
}

/**
 * Delete a disbursement row by expenseId.
 * @param {string} campaignId
 * @param {Object} data - { expenseId }
 * @returns {{ status: string, message?: string }}
 */
function deleteDisbursementMaster_(campaignId, data) {
  try {
    if (!campaignId || !data.expenseId) {
      return { status: 'error', message: 'campaignId and expenseId are required.' };
    }
    var campaignRow = getCampaignRow(campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign not found: ' + campaignId };
    }
    var sheetId = String(campaignRow[3] || '').trim();
    if (!sheetId) {
      return { status: 'error', message: 'No sheet configured for this campaign.' };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var expSheet = ensureExpandedExpensesSheet_(ss);
    var targetId = String(data.expenseId).trim();
    var lastRow = expSheet.getLastRow();

    if (lastRow < 2) {
      return { status: 'error', message: 'Disbursement not found.' };
    }

    var idValues = expSheet.getRange(2, 12, lastRow - 1, 1).getValues();
    for (var i = 0; i < idValues.length; i++) {
      if (String(idValues[i][0] || '').trim() === targetId) {
        expSheet.deleteRow(i + 2);
        return { status: 'success', message: 'Disbursement deleted successfully.' };
      }
    }

    return { status: 'error', message: 'Disbursement ID not found: ' + targetId };
  } catch (err) {
    Logger.log('deleteDisbursementMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to delete disbursement: ' + err.toString() };
  }
}

/**
 * Get comprehensive reconciliation data:
 * Completed deposits (credits), disbursements (debits), and transactions summary.
 * @param {string} campaignId
 * @returns {{ status: string, deposits?: Array, disbursements?: Array, transactionSummary?: Object, bookBalance?: number, message?: string }}
 */
function getReconciliationDataMaster_(campaignId) {
  try {
    if (!campaignId) {
      return { status: 'error', message: 'campaignId is required.' };
    }
    var campaignRow = getCampaignRow(campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign not found: ' + campaignId };
    }
    var sheetId = String(campaignRow[3] || '').trim();
    if (!sheetId) {
      return { status: 'error', message: 'No sheet configured for this campaign.' };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var depSheet = ensureDepositsSheet_(ss);
    var expSheet = ensureExpandedExpensesSheet_(ss);
    var txSheet = ss.getSheetByName('Transactions');

    // 1. Deposits (Completed batches -> credits)
    var deposits = [];
    var totalDepositsNet = 0;
    if (depSheet.getLastRow() >= 2) {
      var depData = depSheet.getRange(2, 1, depSheet.getLastRow() - 1, 12).getValues();
      for (var d = 0; d < depData.length; d++) {
        var dr = depData[d];
        var batchId = String(dr[0] || '').trim();
        if (!batchId) continue;
        var status = String(dr[11] || 'Completed').trim();
        var netAmt = parseFloat(dr[6]) || 0;
        var depDate = dr[2];
        var memo = String(dr[9] || '').trim();
        var ref = String(dr[8] || '').trim();

        if (status === 'Completed') {
          totalDepositsNet += netAmt;
        }

        deposits.push({
          batchId: batchId,
          date: depDate ? formatDateEdt_(depDate) : '',
          dateFormatted: depDate && depDate instanceof Date ? Utilities.formatDate(depDate, 'America/New_York', 'yyyy-MM-dd') : '',
          amount: Math.round(netAmt * 100) / 100,
          grossAmount: Math.round((parseFloat(dr[4]) || 0) * 100) / 100,
          fees: Math.round((parseFloat(dr[5]) || 0) * 100) / 100,
          count: parseInt(dr[3]) || 0,
          targetAccount: String(dr[7] || '').trim(),
          transferRef: ref,
          memo: memo,
          status: status
        });
      }
    }

    // 2. Disbursements (Expenses -> debits)
    var disbursements = [];
    var totalClearedExpenses = 0;
    if (expSheet.getLastRow() >= 2) {
      var expData = expSheet.getRange(2, 1, expSheet.getLastRow() - 1, 12).getValues();
      for (var e = 0; e < expData.length; e++) {
        var er = expData[e];
        var expenseId = String(er[11] || ('DISB-' + (e + 2))).trim();
        var expAmt = parseFloat(er[1]) || 0;
        var expStatus = String(er[9] || 'Cleared').trim();
        var expDate = er[0];

        if (expStatus.toLowerCase() === 'cleared') {
          totalClearedExpenses += expAmt;
        }

        disbursements.push({
          expenseId: expenseId,
          date: expDate ? formatDateEdt_(expDate) : '',
          dateFormatted: expDate && expDate instanceof Date ? Utilities.formatDate(expDate, 'America/New_York', 'yyyy-MM-dd') : '',
          amount: Math.round(expAmt * 100) / 100,
          payee: String(er[2] || '').trim(),
          type: String(er[3] || '').trim(),
          purpose: String(er[4] || '').trim(),
          method: String(er[5] || '').trim(),
          checkRef: String(er[6] || '').trim(),
          status: expStatus,
          clearedDate: er[10] ? formatDateEdt_(er[10]) : ''
        });
      }
    }

    // 3. Transactions summary
    var fundedCount = 0, fundedNet = 0;
    var pendingCount = 0, pendingNet = 0;
    var totalTxnCount = 0, totalTxnNet = 0;

    if (txSheet && txSheet.getLastRow() >= 2) {
      var lastRow = txSheet.getLastRow();
      var txData = txSheet.getRange(2, 1, lastRow - 1, Math.max(14, txSheet.getLastColumn())).getValues();
      for (var t = 0; t < txData.length; t++) {
        var tr = txData[t];
        var result = String(tr[8] || '').trim().toLowerCase();
        // Skip failed transactions
        if (result === 'failed' || result === 'declined' || result === 'error') continue;

        var net = parseFloat(tr[4]) || 0;
        var isCleared = String(tr[12] || '').trim().toLowerCase() === 'cleared';

        totalTxnCount++;
        totalTxnNet += net;

        if (isCleared) {
          fundedCount++;
          fundedNet += net;
        } else {
          pendingCount++;
          pendingNet += net;
        }
      }
    }

    var bookBalance = Math.round((totalDepositsNet - totalClearedExpenses) * 100) / 100;

    return {
      status: 'success',
      deposits: deposits,
      disbursements: disbursements,
      transactionSummary: {
        funded: { count: fundedCount, amount: Math.round(fundedNet * 100) / 100 },
        pending: { count: pendingCount, amount: Math.round(pendingNet * 100) / 100 },
        total: { count: totalTxnCount, amount: Math.round(totalTxnNet * 100) / 100 }
      },
      bookBalance: bookBalance
    };
  } catch (err) {
    Logger.log('getReconciliationDataMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to get reconciliation data: ' + err.toString() };
  }
}

/**
 * Confirm reconciliation matches: marks matched disbursements as Cleared.
 * @param {string} campaignId
 * @param {Object} data - { depositBatchIds: string[], expenseIds: string[] }
 * @returns {{ status: string, confirmedDeposits: number, confirmedDisbursements: number, message?: string }}
 */
function confirmReconcileMatchesMaster_(campaignId, data) {
  try {
    if (!campaignId) {
      return { status: 'error', message: 'campaignId is required.' };
    }
    var campaignRow = getCampaignRow(campaignId);
    if (!campaignRow) {
      return { status: 'error', message: 'Campaign not found: ' + campaignId };
    }
    var sheetId = String(campaignRow[3] || '').trim();
    if (!sheetId) {
      return { status: 'error', message: 'No sheet configured for this campaign.' };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var expSheet = ensureExpandedExpensesSheet_(ss);

    var depositBatchIds = Array.isArray(data.depositBatchIds) ? data.depositBatchIds : [];
    var expenseIds = Array.isArray(data.expenseIds) ? data.expenseIds : [];

    var confirmedDisbursements = 0;
    if (expenseIds.length > 0 && expSheet.getLastRow() >= 2) {
      var expMap = {};
      for (var e = 0; e < expenseIds.length; e++) {
        expMap[String(expenseIds[e]).trim()] = true;
      }

      var lastRow = expSheet.getLastRow();
      var expData = expSheet.getRange(2, 1, lastRow - 1, 12).getValues();
      var clearedDate = new Date();

      for (var i = 0; i < expData.length; i++) {
        var exId = String(expData[i][11] || '').trim();
        if (expMap[exId]) {
          expData[i][9] = 'Cleared';    // col J: Status
          expData[i][10] = clearedDate; // col K: Cleared Date
          confirmedDisbursements++;
        }
      }

      if (confirmedDisbursements > 0) {
        expSheet.getRange(2, 1, expData.length, 12).setValues(expData);
      }
    }

    return {
      status: 'success',
      confirmedDeposits: depositBatchIds.length,
      confirmedDisbursements: confirmedDisbursements,
      message: 'Reconciliation confirmed: ' + depositBatchIds.length + ' deposit(s), ' + confirmedDisbursements + ' disbursement(s) verified.'
    };
  } catch (err) {
    Logger.log('confirmReconcileMatchesMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to confirm reconciliation matches: ' + err.toString() };
  }
}


// ============================================================
// GENERAL DONATION — PROCESS (PUBLIC, Turnstile-protected)


// ============================================================
// GENERAL DONATION — PROCESS (PUBLIC, Turnstile-protected)
// ============================================================
/**
 * Process a general donation (from /donate page).
 * Verifies Turnstile, processes via gateway, logs to campaign/general sheet.
 * @param {Object} data - Donation data with turnstileToken, cardToken, etc.
 * @returns {{ status: string, refNum?: string, message?: string }}
 */
function processGeneralDonation(data) {
  try {
    // Honeypot check
    if (data.website) {
      return { status: 'error', message: 'Invalid request.' };
    }

    // Rate limiting
    var cache = CacheService.getScriptCache();
    var rateLimitKey = 'rate_' + (data.email || 'unknown');
    var currentCount = parseInt(cache.get(rateLimitKey) || '0');
    if (currentCount >= 10) {
      return { status: 'error', message: 'Too many requests. Please try again later.' };
    }
    cache.put(rateLimitKey, String(currentCount + 1), 3600);

    // Verify Turnstile
    var turnstileResult = verifyTurnstile(data.turnstileToken);
    if (!turnstileResult.success) {
      return { status: 'error', message: 'Security verification failed. Please refresh and try again.' };
    }

    // Validate required fields
    if (!data.amount || data.amount < 1) {
      return { status: 'error', message: 'Invalid donation amount.' };
    }
    if (!data.cardToken) {
      return { status: 'error', message: 'Payment token is required.' };
    }
    if (!data.firstName || !data.lastName || !data.email) {
      return { status: 'error', message: 'Name and email are required.' };
    }

    // Determine campaign
    var campaignId = data.campaignId || data.campaignCode || 'general';

    // Process payment with failover
    var result = processWithFailover(data, campaignId);

    if (result.status === 'gateway_error') {
      // Signal client to retry with fallback gateway
      return result;
    }

    if (result.xResult === 'A') {
      // Payment approved — log to sheets
      var sheetId = getCampaignSheetId(campaignId);
      if (sheetId) {
        var ss = SpreadsheetApp.openById(sheetId);

        // Generate customer ID
        var customerId = 'ONLINE-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMddHHmmss');

        // Log customer
        logCustomerMaster(ss, customerId, data);

        // Log pledge
        var pledgeId = logPledgeMaster(ss, data, customerId, 'Processed', '', campaignId);

        // Log transaction
        var donorName = (data.firstName || '') + ' ' + (data.lastName || '');
        logTransactionMaster(ss, pledgeId, customerId, donorName, parseFloat(data.amount), result, '1');

        // Send receipt
        sendDonationReceipt(data, result, campaignId);
      }

      return {
        status: 'success',
        refNum: result.xRefNum || '',
        message: 'Transaction approved.'
      };

    } else if (result.xResult === 'D') {
      return {
        status: 'declined',
        message: result.xError || 'Transaction declined by the card issuer.'
      };
    } else {
      return {
        status: 'error',
        message: result.xError || 'Transaction could not be processed.'
      };
    }
  } catch (err) {
    Logger.log('processGeneralDonation error: ' + err.toString());
    return { status: 'error', message: 'An internal error occurred. Please try again.' };
  }
}


// ============================================================
// DONOR WALL — PUBLIC / PROTECTED GET DONORS
// ============================================================
/**
 * Public/Protected Donor Wall data endpoint.
 * Checks Column V (Wall Access Key) if configured.
 */
function getDonorsMaster_(campaignCode, teamFilter, providedKey) {
  try {
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) {
      return { status: 'error', message: 'Platform not configured.' };
    }

    var campRow = getCampaignRow(campaignCode);
    var sheetId = masterSheetId;
    var wallAccessKey = '';
    var campaignName = campaignCode;
    var campaignGoal = 0;

    if (campRow) {
      campaignName = String(campRow[1] || campaignCode).trim();
      sheetId = String(campRow[3] || '').trim() || masterSheetId;
      campaignGoal = parseFloat(campRow[10]) || 0;
      var wallEnabledVal = String(campRow[16] || '').trim(); // Column Q (17)
      if (wallEnabledVal === 'No' || wallEnabledVal === 'FALSE' || campRow[16] === false) {
        return {
          status: 'error',
          message: 'The donor wall is currently disabled for this campaign.'
        };
      }
      wallAccessKey = String(campRow[21] || '').trim(); // Column V (22)
    }

    // Check Wall Access Key if one is configured for this campaign
    if (wallAccessKey && wallAccessKey !== providedKey) {
      return {
        status: 'error',
        message: providedKey ? 'Invalid access key.' : 'No access key provided. Please use the link you were given.'
      };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('Pledges');
    if (!sheet) sheet = ss.getSheetByName('Transactions');
    if (!sheet || sheet.getLastRow() < 2) {
      return {
        status: 'success',
        campaign: campaignName,
        campaignGoal: campaignGoal,
        goalAmount: campaignGoal,
        totals: { totalRaised: 0, donorCount: 0, avgDonation: 0 },
        donors: [],
        teamTotals: {}
      };
    }

    var lastRow = sheet.getLastRow();
    var data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
    var headers = data[0];

    var col = {};
    for (var h = 0; h < headers.length; h++) {
      var name = String(headers[h]).trim();
      if (name === 'Pledge ID') col.pledgeId = h;
      if (name === 'Created Date' || name === 'Timestamp') col.createdDate = h;
      if (name === 'Donor' || name === 'Donor Name') col.donor = h;
      if (name === 'Campaign') col.campaign = h;
      if (name === 'Amount' || name === 'Amount Charged') col.amount = h;
      if (name === 'Status' || name === 'Result') col.status = h;
      if (name === 'Display Name') col.displayName = h;
      if (name === 'Memo') col.memo = h;
      if (name === 'Anonymous') col.anonymous = h;
      if (name === 'Teams') col.teams = h;
    }

    var donors = [];
    var totalRaised = 0;
    var teamTotals = {};

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var status = col.status !== undefined ? String(row[col.status] || '').trim() : '';
      if (status === 'Cancelled' || status === 'Void' || status === 'Declined' || status === 'D') continue;

      var amount = parseFloat(row[col.amount]) || 0;
      if (amount <= 0) continue;

      var donorName = col.donor !== undefined ? String(row[col.donor] || '').trim() : '';
      var displayName = col.displayName !== undefined ? String(row[col.displayName] || '').trim() : '';
      var memo = col.memo !== undefined ? String(row[col.memo] || '').trim() : '';
      var anonymous = col.anonymous !== undefined ? (String(row[col.anonymous] || '').trim() === 'Yes' || String(row[col.anonymous] || '').trim() === 'TRUE' || row[col.anonymous] === true) : false;
      var team = col.teams !== undefined ? String(row[col.teams] || '').trim() : '';
      var dateVal = col.createdDate !== undefined && row[col.createdDate] ? formatDateEdt_(row[col.createdDate]) : '';

      if (teamFilter && team.toLowerCase() !== teamFilter.toLowerCase()) {
        continue;
      }

      totalRaised += amount;
      if (team) {
        teamTotals[team] = (teamTotals[team] || 0) + amount;
      }

      donors.push({
        name: anonymous ? 'Anonymous Supporter' : (displayName || donorName || 'Supporter'),
        amount: amount,
        memo: memo,
        team: team,
        date: dateVal,
        anonymous: anonymous
      });
    }

    var donorCount = donors.length;
    var avgDonation = donorCount > 0 ? (totalRaised / donorCount) : 0;

    return {
      status: 'success',
      campaign: campaignName,
      campaignGoal: campaignGoal,
      goalAmount: campaignGoal,
      totals: {
        totalRaised: totalRaised,
        donorCount: donorCount,
        avgDonation: avgDonation
      },
      donors: donors.slice(-100).reverse(),
      teamTotals: teamTotals
    };
  } catch (err) {
    Logger.log('getDonorsMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to retrieve donor data: ' + err.toString() };
  }
}

/**
 * Teams endpoint for public donation form and campaign admin.
 * @param {string} campaignId
 * @param {boolean} [includeStats] - If true, aggregates raised amount and donor count from Pledges
 */
function getTeamsMaster_(campaignId, includeStats) {
  try {
    var campCode = String(campaignId || '').trim();
    if (!campCode) return { status: 'error', message: 'campaignId is required.' };

    var sheetId = getCampaignSheetId(campCode);
    if (!sheetId) return { status: 'error', message: 'Campaign sheet not found: ' + campCode };

    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('Teams');
    if (!sheet) {
      sheet = ss.insertSheet('Teams');
      sheet.getRange('A1:G1').setValues([[
        'Team ID', 'Team Name', 'Team Contact Name',
        'Team Contact Email', 'Notify on New Donation', 'Team Goal', 'Campaign'
      ]]);
      formatHeaderRow_(sheet, 'A1:G1');
      sheet.getRange('F2:F100').setNumberFormat('$#,##0.00');
    }

    if (sheet.getLastRow() < 2) {
      return { status: 'success', campaignId: campCode, teams: [], totalTeams: 0 };
    }

    var numCols = Math.max(7, sheet.getLastColumn());
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, numCols).getValues();

    // Optionally calculate stats from Pledges sheet
    var teamStats = {};
    if (includeStats) {
      try {
        var pSheet = ss.getSheetByName('Pledges') || ss.getSheetByName('Sheet1');
        if (pSheet && pSheet.getLastRow() >= 2) {
          var pCols = Math.max(16, pSheet.getLastColumn());
          var pData = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pCols).getValues();
          for (var p = 0; p < pData.length; p++) {
            var pTeam = String(pData[p][12] || '').trim(); // Col M: Teams
            var pStatus = String(pData[p][6] || '').trim().toLowerCase(); // Col G: Status
            if (pTeam && pStatus !== 'cancelled' && pStatus !== 'refunded' && pStatus !== 'void') {
              var pAmt = parseFloat(pData[p][5]) || 0; // Col F: Amount
              var pDonor = String(pData[p][3] || pData[p][9] || '').trim().toLowerCase();
              var pTeamKey = pTeam.toLowerCase();
              if (!teamStats[pTeamKey]) {
                teamStats[pTeamKey] = { raised: 0, donors: {} };
              }
              teamStats[pTeamKey].raised += pAmt;
              if (pDonor) teamStats[pTeamKey].donors[pDonor] = true;
            }
          }
        }
      } catch (statErr) {
        Logger.log('getTeamsMaster_ stats error: ' + statErr.toString());
      }
    }

    var teams = [];
    for (var i = 0; i < rows.length; i++) {
      var tId = String(rows[i][0] || '').trim();
      var tName = String(rows[i][1] || '').trim();
      if (!tId && !tName) continue;

      var goalVal = parseFloat(rows[i][5]) || 0;
      var stat = teamStats[tId.toLowerCase()] || teamStats[tName.toLowerCase()] || { raised: 0, donors: {} };
      var raisedVal = stat.raised || 0;
      var donorCount = Object.keys(stat.donors || {}).length;

      teams.push({
        id: tId || tName,
        teamId: tId || tName,
        name: tName || tId,
        teamName: tName || tId,
        contactName: String(rows[i][2] || '').trim(),
        contactEmail: String(rows[i][3] || '').trim(),
        notify: String(rows[i][4] || '').trim(),
        goal: goalVal,
        campaign: String(rows[i][6] || campCode).trim(),
        raised: raisedVal,
        donorCount: donorCount,
        percent: goalVal > 0 ? Math.min(100, Math.round((raisedVal / goalVal) * 100)) : 0
      });
    }

    return { status: 'success', campaignId: campCode, teams: teams, totalTeams: teams.length };
  } catch (err) {
    Logger.log('getTeamsMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to load teams: ' + err.toString() };
  }
}

/**
 * Save or create a team in Tab 5 (Teams) of campaign spreadsheet.
 * @param {Object} data - { campaignId, id, name, contactName, contactEmail, notify, goal, originalId }
 * @param {Object} user - Authenticated user
 */
function saveTeamMaster_(data, user) {
  try {
    var campCode = String(data.campaignId || data.campaign || '').trim();
    if (!campCode) return { status: 'error', message: 'campaignId is required.' };

    var teamName = String(data.name || data.teamName || '').trim();
    if (!teamName) return { status: 'error', message: 'Team Name is required.' };

    var teamId = String(data.id || data.teamId || '').trim();
    if (!teamId) {
      teamId = teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      if (!teamId) teamId = 'team_' + Utilities.getUuid().slice(0, 8);
    }

    var sheetId = getCampaignSheetId(campCode);
    if (!sheetId) return { status: 'error', message: 'Campaign sheet not found: ' + campCode };

    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('Teams');
    if (!sheet) {
      sheet = ss.insertSheet('Teams');
      sheet.getRange('A1:G1').setValues([[
        'Team ID', 'Team Name', 'Team Contact Name',
        'Team Contact Email', 'Notify on New Donation', 'Team Goal', 'Campaign'
      ]]);
      formatHeaderRow_(sheet, 'A1:G1');
      sheet.getRange('F2:F100').setNumberFormat('$#,##0.00');
    }

    var contactName = String(data.contactName || '').trim();
    var contactEmail = String(data.contactEmail || '').trim();
    var notify = (data.notify === true || data.notify === 'Yes' || data.notify === 'TRUE' || data.notify === 'true') ? 'Yes' : 'No';
    var goal = parseFloat(data.goal) || 0;
    var origId = String(data.originalId || '').trim();

    var lastRow = sheet.getLastRow();
    var foundRow = -1;
    if (lastRow >= 2) {
      var rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      for (var i = 0; i < rows.length; i++) {
        var rId = String(rows[i][0] || '').trim();
        var rName = String(rows[i][1] || '').trim();
        if ((origId && rId === origId) || rId === teamId || rName.toLowerCase() === teamName.toLowerCase()) {
          foundRow = i + 2;
          break;
        }
      }
    }

    if (foundRow > 0) {
      sheet.getRange(foundRow, 1, 1, 7).setValues([[
        teamId, teamName, contactName, contactEmail, notify, goal, campCode
      ]]);
      sheet.getRange(foundRow, 6).setNumberFormat('$#,##0.00');
      return { status: 'success', message: 'Team updated successfully.', team: { id: teamId, name: teamName, goal: goal } };
    } else {
      sheet.appendRow([
        teamId, teamName, contactName, contactEmail, notify, goal, campCode
      ]);
      var newRow = sheet.getLastRow();
      sheet.getRange(newRow, 6).setNumberFormat('$#,##0.00');
      return { status: 'success', message: 'Team created successfully.', team: { id: teamId, name: teamName, goal: goal } };
    }
  } catch (err) {
    Logger.log('saveTeamMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to save team: ' + err.toString() };
  }
}

/**
 * Delete a team from Tab 5 (Teams) of campaign spreadsheet.
 * @param {Object} data - { campaignId, id, teamId }
 * @param {Object} user - Authenticated user
 */
function deleteTeamMaster_(data, user) {
  try {
    var campCode = String(data.campaignId || data.campaign || '').trim();
    var teamId = String(data.id || data.teamId || '').trim();
    if (!campCode || !teamId) return { status: 'error', message: 'campaignId and teamId are required.' };

    var sheetId = getCampaignSheetId(campCode);
    if (!sheetId) return { status: 'error', message: 'Campaign sheet not found: ' + campCode };

    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('Teams');
    if (!sheet || sheet.getLastRow() < 2) {
      return { status: 'error', message: 'Team not found.' };
    }

    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < rows.length; i++) {
      var rId = String(rows[i][0] || '').trim();
      var rName = String(rows[i][1] || '').trim();
      if (rId === teamId || rName === teamId) {
        sheet.deleteRow(i + 2);
        return { status: 'success', message: 'Team deleted successfully.' };
      }
    }

    return { status: 'error', message: 'Team "' + teamId + '" not found.' };
  } catch (err) {
    Logger.log('deleteTeamMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to delete team: ' + err.toString() };
  }
}

/**
 * Get users from Tab 11 (Users) of an individual campaign spreadsheet.
 * @param {string} campaignId
 */
function getCampaignUsersMaster_(campaignId) {
  try {
    var campCode = String(campaignId || '').trim();
    if (!campCode) return { status: 'error', message: 'campaignId is required.' };

    var sheetId = getCampaignSheetId(campCode);
    if (!sheetId) return { status: 'error', message: 'Campaign sheet not found: ' + campCode };

    var ss = SpreadsheetApp.openById(sheetId);
    var usersSheet = ensureCampaignUsersSheet_(ss);
    if (!usersSheet || usersSheet.getLastRow() < 2) {
      return { status: 'success', campaignId: campCode, users: [] };
    }

    var numCols = Math.max(8, usersSheet.getLastColumn());
    var data = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, numCols).getValues();
    var users = [];
    for (var i = 0; i < data.length; i++) {
      var email = String(data[i][0] || '').trim().toLowerCase();
      if (!email) continue;
      users.push({
        email: email,
        name: String(data[i][1] || '').trim(),
        role: String(data[i][2] || 'campaign_manager').trim(),
        authMethod: String(data[i][3] || 'password').trim(),
        hasPassword: !!data[i][4],
        status: String(data[i][5] || 'Active').trim(),
        addedDate: formatDateEdt_(data[i][6]),
        lastLogin: formatDateEdt_(data[i][7]),
        campaignId: campCode
      });
    }

    return { status: 'success', campaignId: campCode, users: users };
  } catch (err) {
    Logger.log('getCampaignUsersMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to get campaign users: ' + err.toString() };
  }
}

/**
 * Add or update a user in Tab 11 (Users) of an individual campaign spreadsheet.
 * @param {string} campaignId
 * @param {Object} data - { email, name, role, authMethod, password, status }
 */
function saveCampaignUserMaster_(campaignId, data) {
  try {
    var campCode = String(campaignId || '').trim();
    if (!campCode) return { status: 'error', message: 'campaignId is required.' };

    var email = String(data.email || '').trim().toLowerCase();
    var name = String(data.name || '').trim();
    var role = String(data.role || 'campaign_manager').trim();
    var authMethod = String(data.authMethod || 'password').trim();
    var password = String(data.password || '').trim();
    var status = String(data.status || 'Active').trim();

    if (!email || !name) {
      return { status: 'error', message: 'Email and Display Name are required.' };
    }

    var allowedRoles = ['campaign_manager', 'bookkeeper', 'viewer'];
    if (allowedRoles.indexOf(role) === -1) {
      return { status: 'error', message: 'Role must be campaign_manager, bookkeeper, or viewer.' };
    }

    var sheetId = getCampaignSheetId(campCode);
    if (!sheetId) return { status: 'error', message: 'Campaign sheet not found: ' + campCode };

    var ss = SpreadsheetApp.openById(sheetId);
    var usersSheet = ensureCampaignUsersSheet_(ss);

    var lastRow = usersSheet.getLastRow();
    var foundRow = -1;
    if (lastRow >= 2) {
      var emails = usersSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < emails.length; i++) {
        if (String(emails[i][0] || '').trim().toLowerCase() === email) {
          foundRow = i + 2;
          break;
        }
      }
    }

    var passwordHash = password ? hashPasswordGas_(password, email) : '';

    if (foundRow > 0) {
      usersSheet.getRange(foundRow, 2).setValue(name);
      usersSheet.getRange(foundRow, 3).setValue(role);
      usersSheet.getRange(foundRow, 4).setValue(authMethod);
      if (passwordHash) {
        usersSheet.getRange(foundRow, 5).setValue(passwordHash);
      }
      usersSheet.getRange(foundRow, 6).setValue(status);
      return { status: 'success', message: 'Campaign user updated successfully.' };
    } else {
      usersSheet.appendRow([
        email, name, role, authMethod, passwordHash, status, new Date(), ''
      ]);
      return { status: 'success', message: 'Campaign user added successfully.' };
    }
  } catch (err) {
    Logger.log('saveCampaignUserMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to save campaign user: ' + err.toString() };
  }
}

/**
 * Delete a user from Tab 11 (Users) of an individual campaign spreadsheet.
 * @param {string} campaignId
 * @param {string} email
 */
function deleteCampaignUserMaster_(campaignId, email) {
  try {
    var campCode = String(campaignId || '').trim();
    email = String(email || '').trim().toLowerCase();
    if (!campCode || !email) return { status: 'error', message: 'campaignId and email are required.' };

    var sheetId = getCampaignSheetId(campCode);
    if (!sheetId) return { status: 'error', message: 'Campaign sheet not found: ' + campCode };

    var ss = SpreadsheetApp.openById(sheetId);
    var usersSheet = ss.getSheetByName('Users');
    if (!usersSheet || usersSheet.getLastRow() < 2) {
      return { status: 'error', message: 'User not found in campaign.' };
    }

    var emails = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < emails.length; i++) {
      if (String(emails[i][0] || '').trim().toLowerCase() === email) {
        usersSheet.deleteRow(i + 2);
        return { status: 'success', message: 'User removed from campaign.' };
      }
    }

    return { status: 'error', message: 'User not found in campaign.' };
  } catch (err) {
    Logger.log('deleteCampaignUserMaster_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to delete campaign user: ' + err.toString() };
  }
}

/**
 * Ensure a user in Master Sheet Authorized_Users is assigned a given campaign.
 */
function ensureMasterUserAssignedCampaign_(email, campaignId, role) {
  if (!email || !campaignId) return;
  email = email.trim().toLowerCase();
  role = role || 'campaign_owner';
  try {
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) return;
    var ss = SpreadsheetApp.openById(masterSheetId);
    var uSheet = ss.getSheetByName('Authorized_Users') || ss.getSheetByName('Users');
    if (!uSheet) return;

    var lastRow = uSheet.getLastRow();
    if (lastRow < 2) {
      uSheet.appendRow([email, email.split('@')[0], 'password', role, campaignId, 'Active', new Date(), '', '']);
      return;
    }

    var rows = uSheet.getRange(2, 1, lastRow - 1, Math.max(6, uSheet.getLastColumn())).getValues();
    for (var i = 0; i < rows.length; i++) {
      var rEmail = String(rows[i][0] || '').trim().toLowerCase();
      if (rEmail === email) {
        var rRole = String(rows[i][3] || '').trim();
        if (rRole === 'super_admin') return; // super_admin already has all campaigns
        var rCamps = String(rows[i][4] || '').trim();
        var campList = rCamps ? rCamps.split(',').map(function(c) { return c.trim(); }) : [];
        if (campList.indexOf('*') !== -1 || campList.indexOf(campaignId) !== -1) return;
        campList.push(campaignId);
        uSheet.getRange(i + 2, 5).setValue(campList.join(', '));
        if (rRole !== 'campaign_owner') {
          uSheet.getRange(i + 2, 4).setValue(role);
        }
        return;
      }
    }
    // If not found in Master Sheet, insert as campaign_owner
    uSheet.appendRow([email, email.split('@')[0], 'password', role, campaignId, 'Active', new Date(), '', '']);
  } catch (e) {
    Logger.log('ensureMasterUserAssignedCampaign_ error: ' + e.toString());
  }
}

/**
 * Provision Tab 11 (Users) across all active campaigns.
 */
function provisionAllCampaignUsers_() {
  var list = getActiveCampaignsList_();
  var results = [];
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    try {
      if (!c.sheetId) continue;
      var ss = SpreadsheetApp.openById(c.sheetId);
      var uSheet = ensureCampaignUsersSheet_(ss);
      results.push({ id: c.id, status: 'ok', rows: uSheet.getLastRow() });
    } catch (err) {
      results.push({ id: c.id, status: 'error', error: err.toString() });
    }
  }
  return { status: 'success', results: results };
}

/**
 * Log link click tracking.
 */
function logLinkClickMaster_(data) {
  try {
    var campaignId = data.campaignId || data.campaign || data.campaignCode || 'general';
    var sheetId = getCampaignSheetId(campaignId);
    if (!sheetId) {
      Logger.log('logLinkClickMaster_ could not find sheet for campaign: ' + campaignId);
      return { status: 'error', message: 'Campaign sheet not found' };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('LinkClicks');
    if (!sheet) {
      sheet = ss.insertSheet('LinkClicks');
      sheet.getRange('A1:G1').setValues([[
        'Timestamp', 'First Name', 'Last Name',
        'Email', 'Link Clicked', 'Campaign', 'Amount'
      ]]);
      formatHeaderRow_(sheet, 'A1:G1');
    } else {
      // Ensure header row includes Amount column
      if (sheet.getLastColumn() < 7) {
        sheet.getRange(1, 7).setValue('Amount');
        formatHeaderRow_(sheet, 'A1:G1');
      }
    }

    var amt = parseFloat(data.amount) || '';
    sheet.appendRow([
      new Date(),
      String(data.firstName || '').trim(),
      String(data.lastName || '').trim(),
      String(data.email || '').trim(),
      String(data.linkClicked || data.link || '').trim(),
      String(data.campaignName || campaignId),
      amt
    ]);

    if (amt && sheet.getLastRow() >= 2) {
      sheet.getRange(sheet.getLastRow(), 7).setNumberFormat('$#,##0.00');
    }

    return { status: 'success' };
  } catch (err) {
    Logger.log('logLinkClickMaster_ error: ' + err.toString());
    return { status: 'error', message: err.toString() };
  }
}


// ============================================================
// GATEWAY — PROCESS WITH FAILOVER
// ============================================================
/**
 * Try primary gateway; on system error, signal client to re-tokenize with fallback.
 * @param {Object} data - Donation data with token
 * @param {string} campaignId - Campaign ID for gateway config lookup
 * @returns {Object} - Payment result or gateway_error for failover
 */
function processWithFailover(data, campaignId) {
  var gatewayConfig = getGatewayConfig(campaignId);
  var requestedGateway = data.gateway || gatewayConfig.primaryGateway || 'cardknox';

  var result;
  if (requestedGateway === 'cardknox') {
    result = processCardknox(data, gatewayConfig.cardknox);
  } else {
    result = processUSAePay(data, gatewayConfig.usaepay);
  }

  // If system error (not card decline) → signal client to retry with fallback
  if (result.xResult !== 'A' && !isCardDecline(result)) {
    var fallbackGw = requestedGateway === 'cardknox' ? 'usaepay' : 'cardknox';
    return {
      status: 'gateway_error',
      canRetry: true,
      failedGateway: requestedGateway,
      fallbackGateway: fallbackGw,
      message: result.xError || 'Payment processing error'
    };
  }

  result.gateway = requestedGateway;
  return result;
}


/**
 * Check if a gateway result represents a card decline (not a system error).
 * @param {Object} result - Gateway result
 * @returns {boolean}
 */
function isCardDecline(result) {
  return result.xResult === 'D' ||
         result.xErrorCode === '10127' ||
         result.xErrorCode === '10128' ||
         result.xErrorCode === 'CARD_DECLINED';
}


// ============================================================
// GATEWAY — CARDKNOX PROCESSING
// ============================================================
/**
 * Process a cc:sale via Cardknox Gateway JSON API.
 * @param {Object} data - { cardToken, cvvToken, exp, amount, firstName, lastName, email, ... }
 * @param {Object} keys - { serverKey, ifieldsKey }
 * @returns {Object} - Cardknox response with xResult, xRefNum, xError, etc.
 */
function processCardknox(data, keys) {
  try {
    var apiKey = (keys && keys.serverKey) || '';
    if (!apiKey) {
      return { xResult: 'E', xError: 'Cardknox server key not configured.', xRefNum: '' };
    }

    var payload = {
      xKey: apiKey,
      xCommand: 'cc:Sale',
      xVersion: '5.0.0',
      xSoftwareName: 'NotzerChesed',
      xSoftwareVersion: '1.0.0',
      xAmount: String(parseFloat(data.amount).toFixed(2)),
      xCardNum: data.cardToken || '',
      xCVV: data.cvvToken || '',
      xExp: data.exp || '',
      xName: (data.firstName || '') + ' ' + (data.lastName || ''),
      xBillFirstName: data.firstName || '',
      xBillLastName: data.lastName || '',
      xEmail: data.email || '',
      xBillPhone: data.phone || '',
      xBillStreet: data.street || '',
      xBillCity: data.city || '',
      xBillState: data.state || '',
      xBillZip: data.zip || '',
      xDescription: data.campaign || data.campaignId || 'Donation',
      xInvoice: 'NC-' + new Date().getTime(),
      xCustom01: data.campaignId || data.campaign || '',
      xCustom02: data.anonymous ? 'Anonymous' : '',
      xCustom03: data.isRecurring ? (data.frequency || 'recurring') : 'one-time'
    };

    var response = UrlFetchApp.fetch('https://x1.cardknox.com/gatewayjson', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    return JSON.parse(response.getContentText());
  } catch (err) {
    Logger.log('processCardknox error: ' + err.toString());
    return {
      xResult: 'E',
      xError: 'Gateway communication error: ' + err.toString(),
      xErrorCode: 'NETWORK_ERROR',
      xRefNum: ''
    };
  }
}


// ============================================================
// GATEWAY — USAEPAY PROCESSING
// ============================================================
/**
 * Process a cc:sale via USAePay REST API v2 with s2/seed/hash auth.
 * @param {Object} data - { cardToken (payment_key), amount, firstName, lastName, ... }
 * @param {Object} keys - { sourceKey, pin }
 * @returns {Object} - Normalized result matching Cardknox format
 */
function processUSAePay(data, keys) {
  try {
    var sourceKey = (keys && keys.sourceKey) || '';
    var pin = (keys && keys.pin) || '';
    if (!sourceKey) {
      return { xResult: 'E', xError: 'USAePay source key not configured.', xRefNum: '' };
    }

    // Build auth header (s2 seed-hash method)
    var seed = Utilities.getUuid().substring(0, 10);
    var prehash = sourceKey + seed + pin;
    var hashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, prehash);
    var hashHex = hashBytes.map(function(b) {
      return ('0' + (b & 0xFF).toString(16)).slice(-2);
    }).join('');
    var apiKey = 's2/' + seed + '/' + hashHex;

    var payload = {
      command: 'cc:sale',
      amount: String(parseFloat(data.amount).toFixed(2)),
      payment_key: data.cardToken || data.token || '',
      invoice: 'NC-' + new Date().getTime(),
      description: 'Donation - ' + (data.campaign || data.campaignId || 'Notzer Chesed'),
      billing_address: {
        first_name: data.firstName || '',
        last_name: data.lastName || '',
        street: data.street || '',
        city: data.city || '',
        state: data.state || '',
        postalcode: data.zip || '',
        country: 'US',
        phone: data.phone || '',
        email: data.email || ''
      }
    };

    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Basic ' + Utilities.base64Encode(apiKey + ':') },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch('https://secure.usaepay.com/api/v2/transactions', options);
    var result = JSON.parse(response.getContentText());

    // Normalize to Cardknox-compatible format
    return {
      xResult: result.result_code === 'A' ? 'A' : (result.result_code === 'D' ? 'D' : 'E'),
      xStatus: result.result || '',
      xError: result.error || '',
      xErrorCode: String(result.errorcode || ''),
      xRefNum: String(result.refnum || ''),
      xAuthCode: result.authcode || '',
      xMaskedCardNumber: (result.creditcard && result.creditcard.number) || '',
      xCardType: (result.creditcard && result.creditcard.type) || '',
      xAuthAmount: result.auth_amount || '0'
    };
  } catch (err) {
    Logger.log('processUSAePay error: ' + err.toString());
    return {
      xResult: 'E',
      xError: 'Gateway communication error: ' + err.toString(),
      xErrorCode: 'NETWORK_ERROR',
      xRefNum: ''
    };
  }
}


// ============================================================
// GATEWAY CONFIG — READ FROM CAMPAIGNS TAB
// ============================================================
/**
 * Get gateway keys for a campaign from the Campaigns tab.
 * Falls back to Script Properties defaults for 'general'.
 * @param {string} campaignId - Campaign ID
 * @returns {{ primaryGateway, cardknox: { serverKey, ifieldsKey }, usaepay: { sourceKey, pin } }}
 */
function getGatewayConfig(campaignId) {
  try {
    if (campaignId && campaignId !== 'general') {
      var campaignRow = getCampaignRow(campaignId);
      if (campaignRow) {
        var primaryGw = String(campaignRow[5] || '').trim() || 'cardknox';
        // Per-campaign PIN is in col T (index 19); fall back to org default
        var campaignPin = String(campaignRow[19] || '').trim();
        if (!campaignPin) {
          campaignPin = PropertiesService.getScriptProperties().getProperty('DEFAULT_USAEPAY_PIN') || '';
        }
        return {
          primaryGateway: primaryGw,
          cardknox: {
            ifieldsKey: String(campaignRow[6] || '').trim(),   // G
            serverKey: String(campaignRow[7] || '').trim()     // H
          },
          usaepay: {
            publicKey: String(campaignRow[8] || '').trim(),    // I
            sourceKey: String(campaignRow[9] || '').trim(),    // J
            pin: campaignPin                                   // T (or default)
          }
        };
      }
    }

    // Fallback to defaults (for 'general' or unconfigured campaigns)
    return getDefaultGatewayConfig();
  } catch (err) {
    Logger.log('getGatewayConfig error: ' + err.toString());
    return getDefaultGatewayConfig();
  }
}


/**
 * PUBLIC endpoint — returns client-side gateway keys only.
 * Never exposes server keys, source keys, or PINs.
 * Used by the unauthenticated /donate/ page when a campaign is selected.
 * @param {string} campaignId
 * @returns {Object} { status, primaryGateway, cardknoxIfieldsKey, usaepayPublicKey }
 */
function getCampaignGatewayConfigPublic_(campaignId) {
  try {
    var config = getGatewayConfig(campaignId);
    return {
      status: 'success',
      campaignId: campaignId || 'general',
      primaryGateway: config.primaryGateway,
      cardknoxIfieldsKey: config.cardknox.ifieldsKey || '',
      usaepayPublicKey: config.usaepay.publicKey || ''
    };
  } catch (err) {
    Logger.log('getCampaignGatewayConfigPublic_ error: ' + err.toString());
    // Fall back to defaults — still only expose client keys
    var defaults = getDefaultGatewayConfig();
    return {
      status: 'success',
      campaignId: campaignId || 'general',
      primaryGateway: defaults.primaryGateway,
      cardknoxIfieldsKey: defaults.cardknox.ifieldsKey || '',
      usaepayPublicKey: defaults.usaepay.publicKey || ''
    };
  }
}


/**
 * Get default gateway config from Script Properties.
 * @returns {Object} Default gateway configuration
 */
function getDefaultGatewayConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    primaryGateway: props.getProperty('DEFAULT_PRIMARY_GATEWAY') || 'cardknox',
    cardknox: {
      ifieldsKey: '',
      serverKey: props.getProperty('DEFAULT_CARDKNOX_KEY') || ''
    },
    usaepay: {
      publicKey: '',
      sourceKey: props.getProperty('DEFAULT_USAEPAY_SOURCE_KEY') || '',
      pin: props.getProperty('DEFAULT_USAEPAY_PIN') || ''
    }
  };
}


// ============================================================
// RECEIPT — ISSUE MANUAL RECEIPT
// ============================================================
/**
 * Issue a manual receipt for an offline donation.
 * Generates NC-R-XXXXX receipt ID, emails, logs, and writes to campaign sheet.
 * @param {Object} data - { firstName, lastName, companyName, email, amount, date, method, campaignId, displayName, anonymous, memo, sendReceipt }
 * @param {Object} user - Authenticated user (for issuer tracking)
 * @returns {{ status: string, receiptId?: string, pledgeId?: string }}
 */
function issueManualReceipt(data, user) {
  try {
    if (!data.firstName || !data.lastName || !data.amount) {
      return { status: 'error', message: 'First name, last name, and amount are required.' };
    }

    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);

    // Generate receipt ID
    var receiptId = getNextReceiptId(ss);
    var donorName = (data.firstName || '') + ' ' + (data.lastName || '');
    var campaignId = data.campaignId || data.campaign || data.campaignCode || 'general';
    var dateVal = data.date || data.donationDate;
    var donationDate = dateVal ? new Date(dateVal + 'T12:00:00') : new Date();
    var refNum = 'MANUAL-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMddHHmmss');
    var amount = parseFloat(data.amount) || 0;

    // Build receipt HTML
    var receiptHtml = buildReceiptHtml({
      receiptId: receiptId,
      firstName: data.firstName,
      lastName: data.lastName,
      companyName: data.companyName || '',
      email: data.email || '',
      phone: data.phone || '',
      street: data.street || '',
      city: data.city || '',
      state: data.state || '',
      zip: data.zip || '',
      amount: amount,
      date: donationDate,
      method: data.method || 'Manual',
      campaign: campaignId,
      refNum: refNum,
      anonymous: data.anonymous || false,
      isManual: true
    });

    // Send receipt email if requested
    if (data.sendReceipt && data.email) {
      try {
        MailApp.sendEmail({
          to: data.email,
          subject: 'Donation Receipt — Notzer Chesed — $' + amount.toFixed(2) + ' — ' + receiptId,
          body: 'Donation Receipt from Notzer Chesed. Amount: $' + amount.toFixed(2) + '. Receipt ID: ' + receiptId,
          htmlBody: receiptHtml,
          name: 'Notzer Chesed'
        });
      } catch (emailErr) {
        Logger.log('Manual receipt email failed: ' + emailErr.toString());
      }
    }

    // Log to Receipt_Log
    logReceipt(ss, {
      receiptId: receiptId,
      campaignId: campaignId,
      donorName: donorName,
      companyName: data.companyName || '',
      donorEmail: data.email || '',
      sentToEmail: data.sendReceipt ? (data.email || '') : '',
      amount: amount,
      issuedBy: user ? user.email : '',
      source: 'manual',
      transactionRef: refNum,
      alsoSentOriginal: 'No',
      notes: data.notes || ''
    });

    // Write to campaign sheet (or general sheet)
    var pledgeId = '';
    try {
      var sheetId = getCampaignSheetId(campaignId);
      if (sheetId) {
        var campaignSS = SpreadsheetApp.openById(sheetId);
        var customerId = 'MANUAL-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMddHHmmss');

        logCustomerMaster(campaignSS, customerId, data);
        pledgeId = logPledgeMaster(campaignSS, data, customerId, 'Processed', '', campaignId);

        var paymentResult = { xRefNum: refNum, xResult: 'Manual', xMaskedCardNumber: data.method || 'Manual', xCardType: '' };
        logTransactionMaster(campaignSS, pledgeId, customerId, donorName, amount, paymentResult, '1');
      }
    } catch (sheetErr) {
      Logger.log('Failed to write manual donation to campaign sheet: ' + sheetErr.toString());
    }

    return {
      status: 'success',
      success: true,
      receiptId: receiptId,
      pledgeId: pledgeId,
      donationId: pledgeId || receiptId,
      message: 'Receipt issued successfully.'
    };
  } catch (err) {
    Logger.log('issueManualReceipt error: ' + err.toString());
    return { status: 'error', message: 'Failed to issue receipt.' };
  }
}


// ============================================================
// RECEIPT — RESEND
// ============================================================
/**
 * Resend a receipt by looking up the donation and rebuilding the receipt.
 * @param {Object} data - { campaignId, pledgeId, targetEmail, alsoSendOriginal }
 * @param {Object} user - Authenticated user
 * @returns {{ status: string, message?: string }}
 */
function resendReceipt(data, user) {
  try {
    if (!data.campaignId || !data.pledgeId || !data.targetEmail) {
      return { status: 'error', message: 'campaignId, pledgeId, and targetEmail are required.' };
    }

    // Look up donation data from campaign sheet
    var sheetId = getCampaignSheetId(data.campaignId);
    if (!sheetId) {
      return { status: 'error', message: 'Campaign sheet not found.' };
    }

    var campaignSS = SpreadsheetApp.openById(sheetId);

    // Find pledge
    var pledgesSheet = campaignSS.getSheetByName('Pledges');
    if (!pledgesSheet || pledgesSheet.getLastRow() < 2) {
      return { status: 'error', message: 'Pledge not found.' };
    }

    var lastRow = pledgesSheet.getLastRow();
    var pledgeData = pledgesSheet.getRange(2, 1, lastRow - 1, 16).getValues();
    var pledgeRow = null;
    for (var i = 0; i < pledgeData.length; i++) {
      if (String(pledgeData[i][0] || '').trim() === data.pledgeId) {
        pledgeRow = pledgeData[i];
        break;
      }
    }

    if (!pledgeRow) {
      return { status: 'error', message: 'Pledge "' + data.pledgeId + '" not found.' };
    }

    // Extract donor info
    var donorName = String(pledgeRow[3] || '').trim();
    var nameParts = donorName.split(' ');
    var firstName = nameParts[0] || '';
    var lastName = nameParts.slice(1).join(' ') || '';
    var amount = parseFloat(pledgeRow[5]) || 0;
    var createdDate = pledgeRow[2] ? new Date(pledgeRow[2]) : new Date();
    var method = String(pledgeRow[13] || '').trim();
    var customerId = String(pledgeRow[1] || '').trim();

    // Get transaction reference
    var transactionRef = '';
    var txSheet = campaignSS.getSheetByName('Transactions');
    if (txSheet && txSheet.getLastRow() >= 2) {
      var txData = txSheet.getRange(2, 1, txSheet.getLastRow() - 1, 14).getValues();
      for (var t = 0; t < txData.length; t++) {
        if (String(txData[t][6] || '').trim() === data.pledgeId) {
          transactionRef = String(txData[t][1] || '').trim();
          break;
        }
      }
    }

    // Get donor email from Customers
    var donorEmail = '';
    var custSheet = campaignSS.getSheetByName('Customers');
    if (custSheet && custSheet.getLastRow() >= 2 && customerId) {
      var custData = custSheet.getRange(2, 1, custSheet.getLastRow() - 1, 4).getValues();
      for (var c = 0; c < custData.length; c++) {
        if (String(custData[c][0] || '').trim() === customerId) {
          donorEmail = String(custData[c][3] || '').trim();
          break;
        }
      }
    }

    // Build receipt HTML
    var receiptId = getNextReceiptId(SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('MASTER_SHEET_ID')));
    var receiptHtml = buildReceiptHtml({
      receiptId: receiptId,
      firstName: firstName,
      lastName: lastName,
      companyName: '',
      email: donorEmail,
      phone: '',
      street: '',
      city: '',
      state: '',
      zip: '',
      amount: amount,
      date: createdDate,
      method: method,
      campaign: data.campaignId,
      refNum: transactionRef,
      anonymous: String(pledgeRow[11] || '').trim() === 'Yes',
      isManual: false
    });

    var masterSS = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('MASTER_SHEET_ID'));

    // Send to alternate email
    try {
      MailApp.sendEmail({
        to: data.targetEmail,
        subject: 'Donation Receipt — Notzer Chesed — $' + amount.toFixed(2) + ' — ' + receiptId,
        body: 'Donation Receipt from Notzer Chesed. Amount: $' + amount.toFixed(2),
        htmlBody: receiptHtml,
        name: 'Notzer Chesed'
      });

      logReceipt(masterSS, {
        receiptId: receiptId,
        campaignId: data.campaignId,
        donorName: donorName,
        companyName: '',
        donorEmail: donorEmail,
        sentToEmail: data.targetEmail,
        amount: amount,
        issuedBy: user ? user.email : '',
        source: 'resend_alternate',
        transactionRef: transactionRef,
        alsoSentOriginal: data.alsoSendOriginal ? 'Yes' : 'No',
        notes: ''
      });
    } catch (emailErr) {
      Logger.log('Resend receipt email failed: ' + emailErr.toString());
      return { status: 'error', message: 'Failed to send receipt email.' };
    }

    // Also send to original if requested
    if (data.alsoSendOriginal && donorEmail && donorEmail !== data.targetEmail) {
      try {
        var origReceiptId = getNextReceiptId(masterSS);
        MailApp.sendEmail({
          to: donorEmail,
          subject: 'Donation Receipt — Notzer Chesed — $' + amount.toFixed(2) + ' — ' + origReceiptId,
          body: 'Donation Receipt from Notzer Chesed. Amount: $' + amount.toFixed(2),
          htmlBody: receiptHtml,
          name: 'Notzer Chesed'
        });

        logReceipt(masterSS, {
          receiptId: origReceiptId,
          campaignId: data.campaignId,
          donorName: donorName,
          companyName: '',
          donorEmail: donorEmail,
          sentToEmail: donorEmail,
          amount: amount,
          issuedBy: user ? user.email : '',
          source: 'resend_original',
          transactionRef: transactionRef,
          alsoSentOriginal: 'Yes',
          notes: ''
        });
      } catch (origErr) {
        Logger.log('Resend to original email failed: ' + origErr.toString());
      }
    }

    return { status: 'success', receiptId: receiptId, message: 'Receipt resent successfully.' };
  } catch (err) {
    Logger.log('resendReceipt error: ' + err.toString());
    return { status: 'error', message: 'Failed to resend receipt.' };
  }
}


// ============================================================
// RECEIPT LOG — QUERY & AUTO-SYNC
// ============================================================
/**
 * Backfill Receipt_Log in Master Sheet from campaign Pledges/Customers if needed.
 * @param {Spreadsheet} masterSS - Master spreadsheet
 */
function syncReceiptLogInMaster_(masterSS) {
  try {
    var receiptSheet = masterSS.getSheetByName('Receipt_Log');
    if (!receiptSheet) {
      receiptSheet = masterSS.insertSheet('Receipt_Log');
      receiptSheet.appendRow([
        'Receipt ID', 'Timestamp', 'Campaign ID', 'Donor Name', 'Company Name',
        'Donor Email', 'Sent-To Email', 'Amount', 'Issued By',
        'Source', 'Original Transaction Ref', 'Also Sent to Original', 'Notes'
      ]);
      formatHeaderRow_(receiptSheet, 'A1:M1');
    }

    // Index existing entries by compound key (campaignId:transactionRef) and receiptId
    var existingRefs = {};
    if (receiptSheet.getLastRow() >= 2) {
      var existingData = receiptSheet.getRange(2, 1, receiptSheet.getLastRow() - 1, 11).getValues();
      for (var e = 0; e < existingData.length; e++) {
        var rId = String(existingData[e][0] || '').trim();
        var campId = String(existingData[e][2] || '').trim();
        var tRef = String(existingData[e][10] || '').trim();
        if (rId) existingRefs[rId] = true;
        if (campId && tRef) existingRefs[campId + ':' + tRef] = true;
      }
    }

    var campSheet = masterSS.getSheetByName('Campaigns');
    if (!campSheet || campSheet.getLastRow() < 2) return { status: 'success', synced: 0 };

    var camps = campSheet.getRange(2, 1, campSheet.getLastRow() - 1, 4).getValues();
    var nextIdCounter = 1;
    var maxId = getNextReceiptId(masterSS);
    var match = maxId.match(/NC-R-(\d+)/);
    if (match) nextIdCounter = parseInt(match[1], 10);

    var syncedCount = 0;

    for (var c = 0; c < camps.length; c++) {
      var cId = String(camps[c][0] || '').trim();
      var cName = String(camps[c][1] || cId).trim();
      var cSheetId = String(camps[c][3] || '').trim();
      if (!cSheetId) continue;

      try {
        var cSS = SpreadsheetApp.openById(cSheetId);
        var pSheet = cSS.getSheetByName('Pledges') || cSS.getSheetByName('Sheet1');
        var custSheet = cSS.getSheetByName('Customers');
        var custEmailMap = {};

        if (custSheet && custSheet.getLastRow() >= 2) {
          var custData = custSheet.getRange(2, 1, custSheet.getLastRow() - 1, 4).getValues();
          for (var cu = 0; cu < custData.length; cu++) {
            var custId = String(custData[cu][0] || '').trim();
            var email = String(custData[cu][3] || '').trim();
            if (custId && email) custEmailMap[custId] = email;
          }
        }

        if (pSheet && pSheet.getLastRow() >= 2) {
          var pData = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues();
          for (var p = 0; p < pData.length; p++) {
            var row = pData[p];
            var pId = String(row[0] || '').trim();
            var custId = String(row[1] || '').trim();
            var pDate = row[2] ? new Date(row[2]) : new Date();
            var donor = String(row[3] || '').trim();
            var amt = parseFloat(row[5]) || 0;
            var amtPaid = parseFloat(row[7]) || 0;
            var status = String(row[6] || '').trim();
            if (status === 'Cancelled' || status === 'Void' || status === 'Declined') continue;
            if (amtPaid <= 0 && amt <= 0) continue;

            var effectiveAmt = amtPaid > 0 ? amtPaid : amt;
            var email = custEmailMap[custId] || '';

            var refKey = cId + ':' + pId;
            if (pId && existingRefs[refKey]) continue;

            var rIdStr = 'NC-R-' + ('00000' + nextIdCounter).slice(-5);
            nextIdCounter++;

            receiptSheet.appendRow([
              rIdStr,
              pDate,
              cId,
              donor,
              '',
              email,
              email,
              effectiveAmt,
              'System',
              'Online',
              pId,
              'No',
              'Synced from ' + (cName || cId)
            ]);
            if (pId) existingRefs[refKey] = true;
            syncedCount++;
          }
        }
      } catch (cErr) {
        Logger.log('syncReceiptLogInMaster_ error for ' + cId + ': ' + cErr.toString());
      }
    }

    return { status: 'success', synced: syncedCount };
  } catch (err) {
    Logger.log('syncReceiptLogInMaster_ error: ' + err.toString());
    return { status: 'error', message: err.toString() };
  }
}

/**
 * Get paginated receipt log from Receipt_Log tab.
 * @param {Object} filters - { page, pageSize, search, campaignId }
 * @returns {{ status: string, receipts: Array, total: number, page: number, pageSize: number }}
 */
function getReceiptLog(filters) {
  try {
    filters = filters || {};
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) {
      return { status: 'error', message: 'Platform not configured.' };
    }
    var ss = SpreadsheetApp.openById(masterSheetId);
    
    // Always run incremental sync to capture newly provisioned campaign sheets or pledges
    syncReceiptLogInMaster_(ss);
    
    var sheet = ss.getSheetByName('Receipt_Log');
    if (!sheet || sheet.getLastRow() < 2) {
      return { status: 'success', receipts: [], total: 0, page: 1, pageSize: filters.pageSize || 50 };
    }

    var lastRow = sheet.getLastRow();
    var data = sheet.getRange(2, 1, lastRow - 1, 13).getValues(); // cols A-M

    var page = parseInt(filters.page) || 1;
    var pageSize = parseInt(filters.pageSize) || 50;
    var searchFilter = (filters.search || '').trim().toLowerCase();
    var campaignFilter = (filters.campaignId || '').trim().toLowerCase();

    var filtered = [];
    for (var i = data.length - 1; i >= 0; i--) { // reverse order (newest first)
      var row = data[i];
      var receiptId = String(row[0] || '').trim();
      if (!receiptId) continue;

      var campaignId = String(row[2] || '').trim();
      var donorName = String(row[3] || '').trim();
      var donorEmail = String(row[5] || '').trim();
      var sentToEmail = String(row[6] || '').trim() || donorEmail;

      // Apply filters (support exact match or partial match)
      if (campaignFilter && campaignId.toLowerCase() !== campaignFilter && campaignFilter !== 'all') continue;
      if (searchFilter) {
        var searchTarget = (receiptId + ' ' + donorName + ' ' + donorEmail + ' ' + sentToEmail + ' ' + campaignId).toLowerCase();
        if (searchTarget.indexOf(searchFilter) === -1) continue;
      }

      var dt = formatDateEdt_(row[1]);

      filtered.push({
        receiptId: receiptId,
        date: dt,
        timestamp: dt,
        campaign: campaignId,
        campaignId: campaignId,
        donor: donorName,
        donorName: donorName,
        companyName: String(row[4] || '').trim(),
        donorEmail: donorEmail,
        email: donorEmail,
        sentTo: sentToEmail,
        sentToEmail: sentToEmail,
        amount: parseFloat(row[7]) || 0,
        issuedBy: String(row[8] || 'System').trim(),
        source: String(row[9] || 'Online').trim(),
        transactionRef: String(row[10] || '').trim(),
        alsoSentOriginal: String(row[11] || '').trim(),
        notes: String(row[12] || '').trim()
      });
    }

    // Paginate
    var total = filtered.length;
    var startIdx = (page - 1) * pageSize;
    var paginated = filtered.slice(startIdx, startIdx + pageSize);

    return {
      status: 'success',
      receipts: paginated,
      total: total,
      page: page,
      pageSize: pageSize
    };
  } catch (err) {
    Logger.log('getReceiptLog error: ' + err.toString());
    return { status: 'error', message: 'Failed to retrieve receipt log: ' + err.toString() };
  }
}


// ============================================================
// RECEIPT ID — SEQUENTIAL NUMBERING
// ============================================================
/**
 * Get the next sequential receipt ID (NC-R-XXXXX).
 * @param {Spreadsheet} ss - Master spreadsheet
 * @returns {string} Next receipt ID
 */
function getNextReceiptId(ss) {
  try {
    var sheet = ss.getSheetByName('Receipt_Log');
    if (!sheet || sheet.getLastRow() < 2) return 'NC-R-00001';

    var lastRow = sheet.getLastRow();
    // Scan all receipt IDs to find the highest number
    var receiptIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    var maxNum = 0;

    for (var i = 0; i < receiptIds.length; i++) {
      var id = String(receiptIds[i] || '').trim();
      var match = id.match(/NC-R-(\d+)/);
      if (match) {
        var num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    return 'NC-R-' + ('00000' + (maxNum + 1)).slice(-5);
  } catch (err) {
    Logger.log('getNextReceiptId error: ' + err.toString());
    return 'NC-R-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMddHHmmss');
  }
}


// ============================================================
// RECEIPT HTML TEMPLATE
// ============================================================
/**
 * Build receipt HTML matching the existing KSY receipt style.
 * @param {Object} data - { receiptId, firstName, lastName, companyName, email, phone, street, city, state, zip, amount, date, method, campaign, refNum, anonymous, isManual }
 * @returns {string} HTML receipt
 */
function buildReceiptHtml(data) {
  var now = data.date || new Date();
  var dateStr = (now.getMonth() + 1) + '/' + now.getDate() + '/' + now.getFullYear();
  var donorName = data.anonymous ? 'Generous Donor' : ((data.firstName || '') + ' ' + (data.lastName || ''));
  var greeting = data.anonymous ? 'Dear Friend' : ('Dear ' + (data.firstName || 'Friend'));

  var address = buildAddress(data);
  var amount = parseFloat(data.amount) || 0;

  var manualBadge = '';
  if (data.isManual) {
    manualBadge = '<tr><td style="padding:8px 0;color:#888;">Type</td>' +
      '<td style="padding:8px 0;font-weight:600;color:#6c63ff;">Manually Issued</td></tr>';
  }

  var companyLine = '';
  if (data.companyName) {
    companyLine = '<tr><td style="padding:8px 0;color:#888;">Company</td>' +
      '<td style="padding:8px 0;font-weight:600;">' + escapeHtml(data.companyName) + '</td></tr>';
  }

  var receiptIdLine = '';
  if (data.receiptId) {
    receiptIdLine = '<tr><td style="padding:8px 0;color:#888;">Receipt ID</td>' +
      '<td style="padding:8px 0;font-weight:600;">' + escapeHtml(data.receiptId) + '</td></tr>';
  }

  var methodLine = '';
  if (data.method) {
    methodLine = '<tr><td style="padding:8px 0;color:#888;">Payment Method</td>' +
      '<td style="padding:8px 0;font-weight:600;">' + escapeHtml(data.method) + '</td></tr>';
  }

  var htmlBody = '<!DOCTYPE html>' +
    '<html><head><meta charset="utf-8"></head>' +
    '<body style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">' +

    // Header
    '<div style="text-align:center;padding:20px 0;border-bottom:2px solid #4dabf7;">' +
    '<h1 style="margin:0;color:#2c3e50;font-size:24px;">Notzer Chesed</h1>' +
    '<p style="margin:5px 0 0;color:#888;font-size:14px;">Tax-Deductible Donation Receipt</p>' +
    '</div>' +

    // Thank you
    '<div style="padding:25px 0;">' +
    '<p style="font-size:16px;">' + greeting + ',</p>' +
    '<p style="font-size:16px;">Thank you for your generous donation to <strong>' + escapeHtml(data.campaign || 'Notzer Chesed') + '</strong>. ' +
    'Your support makes a meaningful difference in the lives of those we serve.</p>' +
    '</div>' +

    // Receipt details
    '<div style="background:#f8f9fa;border:1px solid #e9ecef;border-radius:8px;padding:20px;margin:20px 0;">' +
    '<h2 style="margin:0 0 15px;font-size:18px;color:#2c3e50;border-bottom:1px solid #dee2e6;padding-bottom:10px;">Donation Receipt</h2>' +
    '<table style="width:100%;border-collapse:collapse;">' +
    '<tr><td style="padding:8px 0;color:#888;">Organization</td><td style="padding:8px 0;font-weight:600;">Notzer Chesed</td></tr>' +
    '<tr><td style="padding:8px 0;color:#888;">EIN / Tax ID</td><td style="padding:8px 0;font-weight:600;">11-3049033</td></tr>' +
    receiptIdLine +
    '<tr><td style="padding:8px 0;color:#888;">Date</td><td style="padding:8px 0;font-weight:600;">' + dateStr + '</td></tr>' +
    '<tr><td style="padding:8px 0;color:#888;">Amount</td><td style="padding:8px 0;font-weight:600;font-size:18px;color:#2c3e50;">$' + amount.toFixed(2) + '</td></tr>' +
    '<tr><td style="padding:8px 0;color:#888;">Campaign</td><td style="padding:8px 0;font-weight:600;">' + escapeHtml(data.campaign || 'General Fund') + '</td></tr>' +
    '<tr><td style="padding:8px 0;color:#888;">Reference #</td><td style="padding:8px 0;font-weight:600;">' + escapeHtml(data.refNum || 'N/A') + '</td></tr>' +
    '<tr><td style="padding:8px 0;color:#888;">Donor</td><td style="padding:8px 0;font-weight:600;">' + escapeHtml(donorName) + '</td></tr>' +
    companyLine +
    '<tr><td style="padding:8px 0;color:#888;">Address</td><td style="padding:8px 0;font-weight:600;">' + escapeHtml(address) + '</td></tr>' +
    '<tr><td style="padding:8px 0;color:#888;">Phone</td><td style="padding:8px 0;font-weight:600;">' + escapeHtml(data.phone || 'Not provided') + '</td></tr>' +
    '<tr><td style="padding:8px 0;color:#888;">Email</td><td style="padding:8px 0;font-weight:600;">' + escapeHtml(data.email || 'Not provided') + '</td></tr>' +
    methodLine +
    manualBadge +
    '</table>' +
    '</div>' +

    // Tax notice
    '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:15px;margin:20px 0;font-size:14px;">' +
    '<strong>Tax Deductibility Notice:</strong> No goods or services were delivered in lieu of this donation. ' +
    'This receipt may be used for tax deduction purposes. Please consult your tax advisor.' +
    '</div>' +

    // Footer
    '<div style="text-align:center;padding:20px 0;border-top:1px solid #e9ecef;color:#888;font-size:13px;">' +
    '<p>Notzer Chesed &bull; EIN: 11-3049033</p>' +
    '<p>May Hashem bless you for your kindness.</p>' +
    '</div>' +

    '</body></html>';

  return htmlBody;
}


// ============================================================
// USER MANAGEMENT — GET ALL USERS
// ============================================================
/**
 * Get all authorized users (super_admin only).
 * @returns {{ status: string, users: Array }}
 */
function getAuthorizedUsers() {
  try {
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Authorized_Users');
    if (!sheet || sheet.getLastRow() < 2) {
      return { status: 'success', users: [] };
    }

    var lastRow = sheet.getLastRow();
    var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();

    var users = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var email = String(row[0] || '').trim();
      if (!email) continue;

      users.push({
        email: email,
        name: String(row[1] || '').trim(),
        authMethod: String(row[2] || '').trim(),
        role: String(row[3] || '').trim(),
        campaigns: String(row[4] || '').trim(),
        status: String(row[5] || '').trim(),
        addedDate: formatDateEdt_(row[6]),
        lastLogin: formatDateEdt_(row[7])
      });
    }

    return { status: 'success', users: users };
  } catch (err) {
    Logger.log('getAuthorizedUsers error: ' + err.toString());
    return { status: 'error', message: 'Failed to retrieve users.' };
  }
}


// ============================================================
// USER MANAGEMENT — ADD USER
// ============================================================
/**
 * Add a new authorized user.
 * @param {Object} data - { email, name, authMethod, role, campaigns }
 * @returns {{ status: string, message?: string }}
 */
function addUser(data) {
  try {
    if (!data.email || !data.name || !data.role) {
      return { status: 'error', message: 'Email, name, and role are required.' };
    }

    var email = data.email.trim().toLowerCase();
    var validRoles = ['super_admin', 'campaign_owner', 'campaign_manager', 'bookkeeper', 'viewer'];
    if (validRoles.indexOf(data.role) === -1) {
      return { status: 'error', message: 'Invalid role. Must be super_admin, campaign_owner, campaign_manager, bookkeeper, or viewer.' };
    }

    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Authorized_Users') || ss.getSheetByName('Users');
    if (!sheet) {
      sheet = ss.insertSheet('Authorized_Users');
      sheet.appendRow(['Email', 'Display Name', 'Auth Method', 'Role', 'Assigned Campaigns', 'Status', 'Added Date', 'Last Login', 'Password Hash']);
      sheet.getRange('1:1').setFontWeight('bold');
    } else if (sheet.getLastColumn() < 9) {
      sheet.getRange(1, 9).setValue('Password Hash').setFontWeight('bold');
    }

    // Check for duplicate email
    if (sheet.getLastRow() >= 2) {
      var existingEmails = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
      for (var i = 0; i < existingEmails.length; i++) {
        if (String(existingEmails[i] || '').trim().toLowerCase() === email) {
          return { status: 'error', message: 'User with this email already exists.' };
        }
      }
    }

    var passwordHash = data.password ? hashPasswordGas_(data.password, email) : '';
    var authMethod = String(data.authMethod || (passwordHash ? 'password' : 'google')).trim();

    sheet.appendRow([
      email,                                           // A: Email
      String(data.name || '').trim(),                  // B: Display Name
      authMethod,                                      // C: Auth Method
      data.role,                                       // D: Role
      String(data.campaigns || '*').trim(),             // E: Assigned Campaigns
      'Active',                                        // F: Status
      new Date(),                                      // G: Added Date
      '',                                              // H: Last Login
      passwordHash                                     // I: Password Hash
    ]);

    return { status: 'success', message: 'User added successfully.' };
  } catch (err) {
    Logger.log('addUser error: ' + err.toString());
    return { status: 'error', message: 'Failed to add user.' };
  }
}


// ============================================================
// USER MANAGEMENT — UPDATE USER
// ============================================================
/**
 * Update an existing user's details.
 * @param {string} email - User's email
 * @param {Object} data - Fields to update
 * @returns {{ status: string, message?: string }}
 */
function updateUser(email, data) {
  try {
    if (!email) {
      return { status: 'error', message: 'Email is required.' };
    }

    email = email.trim().toLowerCase();

    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Authorized_Users') || ss.getSheetByName('Users');
    if (!sheet || sheet.getLastRow() < 2) {
      return { status: 'error', message: 'User not found.' };
    }

    if (sheet.getLastColumn() < 9) {
      sheet.getRange(1, 9).setValue('Password Hash').setFontWeight('bold');
    }

    var lastRow = sheet.getLastRow();
    var emails = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

    for (var i = 0; i < emails.length; i++) {
      if (String(emails[i][0] || '').trim().toLowerCase() === email) {
        var userRow = i + 2;

        if (data.name !== undefined) sheet.getRange(userRow, 2).setValue(String(data.name));
        if (data.authMethod !== undefined) sheet.getRange(userRow, 3).setValue(String(data.authMethod));
        if (data.role !== undefined) {
          var validRoles = ['super_admin', 'campaign_owner', 'campaign_manager', 'bookkeeper', 'viewer'];
          if (validRoles.indexOf(data.role) === -1) {
            return { status: 'error', message: 'Invalid role.' };
          }
          sheet.getRange(userRow, 4).setValue(data.role);
        }
        if (data.campaigns !== undefined) sheet.getRange(userRow, 5).setValue(String(data.campaigns));
        if (data.status !== undefined) sheet.getRange(userRow, 6).setValue(String(data.status));
        if (data.password) {
          var pHash = hashPasswordGas_(data.password, email);
          sheet.getRange(userRow, 9).setValue(pHash);
        }

        return { status: 'success', message: 'User updated successfully.' };
      }
    }

    return { status: 'error', message: 'User "' + email + '" not found.' };
  } catch (err) {
    Logger.log('updateUser error: ' + err.toString());
    return { status: 'error', message: 'Failed to update user.' };
  }
}


// ============================================================
// USER MANAGEMENT — REMOVE (DEACTIVATE)
// ============================================================
/**
 * Deactivate a user (soft delete — set status to Inactive).
 * @param {string} email - User's email
 * @returns {{ status: string, message?: string }}
 */
function removeUser(email) {
  try {
    if (!email) {
      return { status: 'error', message: 'Email is required.' };
    }

    email = email.trim().toLowerCase();

    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Authorized_Users');
    if (!sheet || sheet.getLastRow() < 2) {
      return { status: 'error', message: 'User not found.' };
    }

    var lastRow = sheet.getLastRow();
    var emails = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

    for (var i = 0; i < emails.length; i++) {
      if (String(emails[i][0] || '').trim().toLowerCase() === email) {
        sheet.getRange(i + 2, 6).setValue('Inactive'); // F: Status
        return { status: 'success', message: 'User deactivated successfully.' };
      }
    }

    return { status: 'error', message: 'User "' + email + '" not found.' };
  } catch (err) {
    Logger.log('removeUser error: ' + err.toString());
    return { status: 'error', message: 'Failed to deactivate user.' };
  }
}


// ============================================================
// REPORTING — GENERATE REPORT
// ============================================================
/**
 * Generate a campaign report: build HTML summary + CSV, email to recipients.
 * @param {Object} data - { campaignId, dateFrom, dateTo, sendTo }
 * @param {Object} user - Authenticated user
 * @returns {{ status: string, message?: string }}
 */
function generateReport(data, user) {
  try {
    var campaignId = data.campaignId || '*';
    var dateFrom = data.dateFrom ? new Date(data.dateFrom) : null;
    var dateTo = data.dateTo ? new Date(data.dateTo + 'T23:59:59') : null;
    var sendTo = data.sendTo || (user ? user.email : '');

    if (!sendTo) {
      return { status: 'error', message: 'No recipient email specified.' };
    }

    // Collect campaigns to report on
    var campaignIds = [];
    if (campaignId === '*') {
      var props = PropertiesService.getScriptProperties();
      var masterSheetId = props.getProperty('MASTER_SHEET_ID');
      var ss = SpreadsheetApp.openById(masterSheetId);
      var campSheet = ss.getSheetByName('Campaigns');
      if (campSheet && campSheet.getLastRow() >= 2) {
        var campData = campSheet.getRange(2, 1, campSheet.getLastRow() - 1, 4).getValues();
        for (var c = 0; c < campData.length; c++) {
          var cid = String(campData[c][0] || '').trim();
          if (cid && checkPermission(user, 'viewer', cid)) {
            campaignIds.push(cid);
          }
        }
      }
    } else {
      campaignIds.push(campaignId);
    }

    // Collect donations from each campaign
    var allDonations = [];
    var totalByMethod = {};
    var overallTotal = 0;
    var overallCount = 0;
    var goalAmount = 0;

    for (var ci = 0; ci < campaignIds.length; ci++) {
      var cid = campaignIds[ci];
      var campaignRow = getCampaignRow(cid);
      if (!campaignRow) continue;

      var sheetId = String(campaignRow[3] || '').trim();
      if (!sheetId) continue;

      goalAmount += parseFloat(campaignRow[10]) || 0;

      try {
        var campaignSS = SpreadsheetApp.openById(sheetId);
        var pledgesSheet = campaignSS.getSheetByName('Pledges');
        if (!pledgesSheet || pledgesSheet.getLastRow() < 2) continue;

        var pledgeData = pledgesSheet.getRange(2, 1, pledgesSheet.getLastRow() - 1, 16).getValues();

        for (var p = 0; p < pledgeData.length; p++) {
          var createdDate = pledgeData[p][2] ? new Date(pledgeData[p][2]) : null;

          // Date filter
          if (dateFrom && createdDate && createdDate < dateFrom) continue;
          if (dateTo && createdDate && createdDate > dateTo) continue;

          var amount = parseFloat(pledgeData[p][5]) || 0;
          var method = String(pledgeData[p][13] || 'Unknown').trim();
          var donor = String(pledgeData[p][3] || '').trim();

          allDonations.push({
            date: createdDate,
            donor: donor,
            company: '',
            email: '',
            amount: amount,
            method: method,
            status: String(pledgeData[p][6] || '').trim(),
            refNum: '',
            campaign: cid,
            recurring: String(pledgeData[p][14] || '').trim() ? 'Recurring' : 'One-time',
            teams: String(pledgeData[p][12] || '').trim(),
            memo: String(pledgeData[p][10] || '').trim()
          });

          overallTotal += amount;
          overallCount++;

          if (!totalByMethod[method]) totalByMethod[method] = { count: 0, amount: 0 };
          totalByMethod[method].count++;
          totalByMethod[method].amount += amount;
        }
      } catch (sheetErr) {
        Logger.log('Report: failed to read campaign ' + cid + ': ' + sheetErr.toString());
      }
    }

    // Sort by amount descending for top 5
    var sortedByAmount = allDonations.slice().sort(function(a, b) { return b.amount - a.amount; });
    var top5 = sortedByAmount.slice(0, 5);

    // Build report
    var campaignName = campaignId === '*' ? 'All Campaigns' : campaignId;
    var dateRangeStr = '';
    if (dateFrom && dateTo) {
      dateRangeStr = formatDateShort(dateFrom) + ' — ' + formatDateShort(dateTo);
    } else if (dateFrom) {
      dateRangeStr = 'From ' + formatDateShort(dateFrom);
    } else if (dateTo) {
      dateRangeStr = 'Through ' + formatDateShort(dateTo);
    } else {
      dateRangeStr = 'All Time';
    }

    var reportData = {
      campaignName: campaignName,
      dateRange: dateRangeStr,
      count: overallCount,
      total: overallTotal,
      average: overallCount > 0 ? overallTotal / overallCount : 0,
      goalAmount: goalAmount,
      goalPercent: goalAmount > 0 ? Math.round((overallTotal / goalAmount) * 100) : 0,
      top5: top5,
      byMethod: totalByMethod,
      donations: allDonations
    };

    var emailHtml = buildReportEmail(reportData);
    var csvBlob = buildReportCsv(allDonations);

    // Send email
    MailApp.sendEmail({
      to: sendTo,
      subject: '📊 Campaign Report: ' + campaignName + ' — ' + dateRangeStr,
      body: '📊 Campaign Report: ' + campaignName + ' — ' + dateRangeStr + '\n\nTotal: $' + overallTotal.toFixed(2) + ', Count: ' + overallCount,
      htmlBody: emailHtml,
      attachments: [csvBlob],
      name: 'Notzer Chesed Reports'
    });

    return { status: 'success', message: 'Report sent to ' + sendTo + '.' };
  } catch (err) {
    Logger.log('generateReport error: ' + err.toString());
    return { status: 'error', message: 'Failed to generate report.' };
  }
}


// ============================================================
// REPORTING — SCHEDULED REPORTS (Time-driven trigger)
// ============================================================
/**
 * Time-driven trigger handler. Reads Report_Schedule tab,
 * generates and sends reports for each enabled schedule.
 * Install via: ScriptApp.newTrigger('sendScheduledReports').timeBased().atHour(8).everyDays(1).create()
 */
function sendScheduledReports() {
  try {
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) {
      Logger.log('sendScheduledReports: MASTER_SHEET_ID not configured.');
      return;
    }

    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Report_Schedule');
    if (!sheet || sheet.getLastRow() < 2) {
      Logger.log('sendScheduledReports: No schedules configured.');
      return;
    }

    var lastRow = sheet.getLastRow();
    var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues(); // cols A-E

    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    var today = new Date();
    today.setHours(23, 59, 59, 999);

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var campaignId = String(row[0] || '').trim();            // A: Campaign ID
      var reportType = String(row[1] || '').trim();            // B: Report Type
      var recipients = String(row[2] || '').trim();            // C: Recipients
      var enabled = String(row[3] || '').trim();               // D: Enabled
      // E: Last Sent

      if (enabled !== 'Yes' || !recipients) continue;

      // Build a dummy user with super_admin access for the report
      var dummyUser = { role: 'super_admin', campaigns: ['*'] };

      try {
        generateReport({
          campaignId: campaignId || '*',
          dateFrom: Utilities.formatDate(yesterday, 'America/New_York', 'yyyy-MM-dd'),
          dateTo: Utilities.formatDate(today, 'America/New_York', 'yyyy-MM-dd'),
          sendTo: recipients
        }, dummyUser);

        // Update Last Sent
        sheet.getRange(i + 2, 5).setValue(new Date());
        Logger.log('Scheduled report sent for campaign ' + campaignId + ' to ' + recipients);
      } catch (reportErr) {
        Logger.log('Scheduled report failed for ' + campaignId + ': ' + reportErr.toString());
      }
    }
  } catch (err) {
    Logger.log('sendScheduledReports error: ' + err.toString());
  }
}


// ============================================================
// REPORTING — BUILD HTML EMAIL
// ============================================================
/**
 * Build an HTML email body for a campaign report.
 * @param {Object} data - { campaignName, dateRange, count, total, average, goalAmount, goalPercent, top5, byMethod }
 * @returns {string} HTML email body
 */
function buildReportEmail(data) {
  // Top 5 table rows
  var top5Rows = '';
  if (data.top5 && data.top5.length > 0) {
    for (var i = 0; i < data.top5.length; i++) {
      var d = data.top5[i];
      top5Rows += '<tr>' +
        '<td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.05);color:#ccc;">' + (i + 1) + '.</td>' +
        '<td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.05);color:#e0e0e0;">' + escapeHtml(d.donor || 'Anonymous') + '</td>' +
        '<td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.05);color:#6c63ff;font-weight:600;text-align:right;">$' + (d.amount || 0).toFixed(2) + '</td>' +
        '</tr>';
    }
  }

  // By method table rows
  var methodRows = '';
  if (data.byMethod) {
    var methods = Object.keys(data.byMethod);
    for (var m = 0; m < methods.length; m++) {
      var method = methods[m];
      var methodData = data.byMethod[method];
      methodRows += '<tr>' +
        '<td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.05);color:#e0e0e0;">' + escapeHtml(method) + '</td>' +
        '<td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.05);color:#ccc;text-align:center;">' + methodData.count + '</td>' +
        '<td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.05);color:#6c63ff;font-weight:600;text-align:right;">$' + methodData.amount.toFixed(2) + '</td>' +
        '</tr>';
    }
  }

  var goalSection = '';
  if (data.goalAmount > 0) {
    goalSection = '<div style="flex:1;background:rgba(255,255,255,0.05);border-radius:8px;padding:16px;text-align:center;">' +
      '<div style="font-size:24px;font-weight:700;color:#6c63ff;">' + data.goalPercent + '%</div>' +
      '<div style="font-size:12px;color:#a0a0b0;">Goal Progress</div>' +
      '</div>';
  }

  var html = '<div style="font-family:\'Inter\',Arial,sans-serif;max-width:600px;margin:0 auto;background:#1a1a2e;color:#fff;border-radius:12px;overflow:hidden;">' +

    // Header
    '<div style="background:linear-gradient(135deg,#6c63ff,#5a52d5);padding:24px;text-align:center;">' +
    '<h1 style="margin:0;font-size:20px;color:#fff;">📊 Campaign Report</h1>' +
    '<p style="margin:8px 0 0;opacity:0.9;color:#e0e0ff;">' + escapeHtml(data.campaignName) + ' — ' + escapeHtml(data.dateRange) + '</p>' +
    '</div>' +

    // Stats Grid
    '<div style="padding:24px;">' +
    '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
    '<div style="flex:1;min-width:120px;background:rgba(255,255,255,0.05);border-radius:8px;padding:16px;text-align:center;">' +
    '<div style="font-size:24px;font-weight:700;color:#6c63ff;">' + data.count + '</div>' +
    '<div style="font-size:12px;color:#a0a0b0;">New Donations</div>' +
    '</div>' +
    '<div style="flex:1;min-width:120px;background:rgba(255,255,255,0.05);border-radius:8px;padding:16px;text-align:center;">' +
    '<div style="font-size:24px;font-weight:700;color:#6c63ff;">$' + data.total.toFixed(2) + '</div>' +
    '<div style="font-size:12px;color:#a0a0b0;">Total Collected</div>' +
    '</div>' +
    '<div style="flex:1;min-width:120px;background:rgba(255,255,255,0.05);border-radius:8px;padding:16px;text-align:center;">' +
    '<div style="font-size:24px;font-weight:700;color:#6c63ff;">$' + data.average.toFixed(2) + '</div>' +
    '<div style="font-size:12px;color:#a0a0b0;">Average</div>' +
    '</div>' +
    goalSection +
    '</div>' +
    '</div>' +

    // Top 5
    (top5Rows ? (
      '<div style="padding:0 24px 24px;">' +
      '<h3 style="margin:0 0 12px;font-size:14px;color:#a0a0b0;text-transform:uppercase;letter-spacing:1px;">Top Donations</h3>' +
      '<table style="width:100%;border-collapse:collapse;">' + top5Rows + '</table>' +
      '</div>'
    ) : '') +

    // By Method
    (methodRows ? (
      '<div style="padding:0 24px 24px;">' +
      '<h3 style="margin:0 0 12px;font-size:14px;color:#a0a0b0;text-transform:uppercase;letter-spacing:1px;">By Payment Method</h3>' +
      '<table style="width:100%;border-collapse:collapse;">' +
      '<tr><th style="padding:6px 12px;text-align:left;color:#888;font-size:12px;">Method</th><th style="padding:6px 12px;text-align:center;color:#888;font-size:12px;">Count</th><th style="padding:6px 12px;text-align:right;color:#888;font-size:12px;">Amount</th></tr>' +
      methodRows + '</table>' +
      '</div>'
    ) : '') +

    // Footer
    '<div style="padding:16px;text-align:center;font-size:12px;color:#666;border-top:1px solid rgba(255,255,255,0.05);">' +
    'Generated by Notzer Chesed Admin &bull; CSV report attached' +
    '</div>' +

    '</div>';

  return html;
}


// ============================================================
// REPORTING — BUILD CSV
// ============================================================
/**
 * Build a CSV blob from donation data.
 * @param {Array} donations - Array of donation objects
 * @returns {Blob} CSV blob for email attachment
 */
function buildReportCsv(donations) {
  var headers = ['Date', 'Donor', 'Company', 'Email', 'Amount', 'Method',
                 'Status', 'Transaction Ref', 'Campaign', 'Recurring', 'Teams', 'Memo'];
  var rows = [headers.join(',')];

  for (var i = 0; i < donations.length; i++) {
    var d = donations[i];
    var row = [
      d.date ? formatDateShort(d.date) : '',
      '"' + (d.donor || '').replace(/"/g, '""') + '"',
      '"' + (d.company || '').replace(/"/g, '""') + '"',
      d.email || '',
      (d.amount || 0).toFixed(2),
      d.method || '',
      d.status || '',
      d.refNum || '',
      d.campaign || '',
      d.recurring || 'One-time',
      '"' + (d.teams || '').replace(/"/g, '""') + '"',
      '"' + (d.memo || '').replace(/"/g, '""') + '"'
    ];
    rows.push(row.join(','));
  }

  var dateStr = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd');
  return Utilities.newBlob(rows.join('\r\n'), 'text/csv', 'campaign-report-' + dateStr + '.csv');
}


// ============================================================
// REPORT SCHEDULE — GET
// ============================================================
/**
 * Get all report schedules.
 * @returns {{ status: string, schedules: Array }}
 */
function getReportSchedules() {
  try {
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Report_Schedule');
    if (!sheet || sheet.getLastRow() < 2) {
      return { status: 'success', schedules: [] };
    }

    var lastRow = sheet.getLastRow();
    var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();

    var schedules = [];
    for (var i = 0; i < data.length; i++) {
      schedules.push({
        campaignId: String(data[i][0] || '').trim(),
        reportType: String(data[i][1] || '').trim(),
        recipients: String(data[i][2] || '').trim(),
        enabled: String(data[i][3] || '').trim(),
        lastSent: formatDateEdt_(data[i][4])
      });
    }

    return { status: 'success', schedules: schedules };
  } catch (err) {
    Logger.log('getReportSchedules error: ' + err.toString());
    return { status: 'error', message: 'Failed to retrieve report schedules.' };
  }
}


// ============================================================
// REPORT SCHEDULE — UPDATE
// ============================================================
/**
 * Update or add a report schedule.
 * @param {Object} data - { campaignId, reportType, recipients, enabled }
 * @returns {{ status: string, message?: string }}
 */
function updateReportSchedule(data) {
  try {
    if (!data.campaignId || !data.recipients) {
      return { status: 'error', message: 'campaignId and recipients are required.' };
    }

    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Report_Schedule');
    if (!sheet) {
      sheet = ss.insertSheet('Report_Schedule');
      sheet.appendRow(['Campaign ID', 'Report Type', 'Recipients', 'Enabled', 'Last Sent']);
      sheet.getRange('1:1').setFontWeight('bold');
    }

    // Check for existing schedule for this campaign
    if (sheet.getLastRow() >= 2) {
      var campIds = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < campIds.length; i++) {
        if (String(campIds[i][0] || '').trim().toLowerCase() === data.campaignId.toLowerCase()) {
          var schedRow = i + 2;
          if (data.reportType !== undefined) sheet.getRange(schedRow, 2).setValue(String(data.reportType));
          if (data.recipients !== undefined) sheet.getRange(schedRow, 3).setValue(String(data.recipients));
          if (data.enabled !== undefined) sheet.getRange(schedRow, 4).setValue(data.enabled ? 'Yes' : 'No');
          return { status: 'success', message: 'Report schedule updated.' };
        }
      }
    }

    // Add new schedule
    sheet.appendRow([
      data.campaignId,
      data.reportType || 'daily_summary',
      data.recipients,
      data.enabled !== false ? 'Yes' : 'No',
      ''
    ]);

    return { status: 'success', message: 'Report schedule created.' };
  } catch (err) {
    Logger.log('updateReportSchedule error: ' + err.toString());
    return { status: 'error', message: 'Failed to update report schedule.' };
  }
}


// ============================================================
// CLOUDFLARE TURNSTILE VERIFICATION
// ============================================================
/**
 * Verify Cloudflare Turnstile token server-side.
 * @param {string} token - Turnstile response token
 * @returns {{ success: boolean }}
 */
function verifyTurnstile(token) {
  if (!token) return { success: false };

  try {
    var secret = PropertiesService.getScriptProperties().getProperty('TURNSTILE_SECRET');
    if (!secret) {
      Logger.log('TURNSTILE_SECRET not configured — skipping verification.');
      return { success: true }; // Allow through if not configured (dev mode)
    }

    var response = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'post',
      payload: {
        secret: secret,
        response: token
      },
      muteHttpExceptions: true
    });

    return JSON.parse(response.getContentText());
  } catch (err) {
    Logger.log('verifyTurnstile error: ' + err.toString());
    return { success: false };
  }
}


// ============================================================
// HELPER — LOG RECEIPT TO RECEIPT_LOG TAB
// ============================================================
/**
 * Append a row to the Receipt_Log tab in the master sheet.
 * @param {Spreadsheet} ss - Master spreadsheet
 * @param {Object} data - Receipt data
 */
function logReceipt(ss, data) {
  try {
    var sheet = ss.getSheetByName('Receipt_Log');
    if (!sheet) {
      sheet = ss.insertSheet('Receipt_Log');
      sheet.appendRow([
        'Receipt ID', 'Timestamp', 'Campaign ID', 'Donor Name', 'Company Name',
        'Donor Email', 'Sent-To Email', 'Amount', 'Issued By',
        'Source', 'Original Transaction Ref', 'Also Sent to Original', 'Notes'
      ]);
      sheet.getRange('1:1').setFontWeight('bold');
    }

    sheet.appendRow([
      data.receiptId || '',                    // A: Receipt ID
      new Date(),                               // B: Timestamp
      data.campaignId || '',                    // C: Campaign ID
      data.donorName || '',                     // D: Donor Name
      data.companyName || '',                   // E: Company Name
      data.donorEmail || '',                    // F: Donor Email
      data.sentToEmail || '',                   // G: Sent-To Email
      data.amount || 0,                         // H: Amount
      data.issuedBy || '',                      // I: Issued By
      data.source || '',                        // J: Source
      data.transactionRef || '',                // K: Original Transaction Ref
      data.alsoSentOriginal || 'No',            // L: Also Sent to Original
      data.notes || ''                          // M: Notes
    ]);
  } catch (err) {
    Logger.log('logReceipt failed: ' + err.toString());
  }
}


// ============================================================
// HELPER — GET CAMPAIGN ROW FROM CAMPAIGNS TAB
// ============================================================
/**
 * Look up a campaign row from the Master Sheet Campaigns tab.
 * @param {string} campaignId - Campaign ID slug
 * @returns {Array|null} Row values or null if not found
 */
function getCampaignRow(campaignId) {
  try {
    if (!campaignId) return null;

    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) return null;

    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Campaigns');
    if (!sheet || sheet.getLastRow() < 2) return null;

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    var search = campaignId.toLowerCase().trim();
    for (var i = 0; i < data.length; i++) {
      var idVal = String(data[i][0] || '').trim().toLowerCase();
      var nameVal = String(data[i][1] || '').trim().toLowerCase();
      if (idVal === search || nameVal === search) {
        return data[i];
      }
    }

    return null;
  } catch (err) {
    Logger.log('getCampaignRow error: ' + err.toString());
    return null;
  }
}


// ============================================================
// HELPER — GET CAMPAIGN SHEET ID
// ============================================================
/**
 * Get the Google Sheet ID for a campaign.
 * @param {string} campaignId - Campaign ID
 * @returns {string} Sheet ID or empty string
 */
function getCampaignSheetId(campaignId) {
  if (campaignId === 'general') {
    return PropertiesService.getScriptProperties().getProperty('GENERAL_SHEET_ID') || '';
  }

  var campaignRow = getCampaignRow(campaignId);
  if (campaignRow) {
    return String(campaignRow[3] || '').trim();
  }

  return '';
}


// ============================================================
// HELPER — LOG CUSTOMER TO CAMPAIGN SHEET (Master version)
// ============================================================
/**
 * Log/upsert a customer record in a campaign sheet.
 * @param {Spreadsheet} ss - Campaign spreadsheet
 * @param {string} customerId - Customer ID
 * @param {Object} data - Customer data
 */
function logCustomerMaster(ss, customerId, data) {
  try {
    if (!customerId) return;

    var sheet = ss.getSheetByName('Customers');
    if (!sheet) {
      sheet = ss.insertSheet('Customers');
      sheet.appendRow([
        'Customer ID', 'First Name', 'Last Name', 'Email', 'Phone',
        'Street', 'City', 'State', 'Zip', 'Created Date', 'Source'
      ]);
      sheet.getRange('1:1').setFontWeight('bold');
    }

    // Check if customer already exists
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var existingIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
      if (existingIds.indexOf(customerId) !== -1) return;
    }

    var source = String(customerId).indexOf('MANUAL') === 0 ? 'Manual' : (String(customerId).indexOf('ONLINE') === 0 ? 'Online' : 'Unknown');
    sheet.appendRow([
      customerId,
      data.firstName || '',
      data.lastName || '',
      data.email || '',
      data.phone || '',
      data.street || '',
      data.city || '',
      data.state || '',
      data.zip || '',
      new Date(),
      source
    ]);
  } catch (err) {
    Logger.log('logCustomerMaster failed: ' + err.toString());
  }
}


// ============================================================
// HELPER — LOG PLEDGE TO CAMPAIGN SHEET (Master version)
// ============================================================
/**
 * Create a pledge record in a campaign's Pledges sheet.
 * @param {Spreadsheet} ss - Campaign spreadsheet
 * @param {Object} data - Donation data
 * @param {string} customerId - Customer ID
 * @param {string} status - Pledge status
 * @param {string} scheduleId - Schedule ID (for recurring)
 * @param {string} campaignId - Campaign ID
 * @returns {string} Generated Pledge ID
 */
function logPledgeMaster(ss, data, customerId, status, scheduleId, campaignId) {
  try {
    var sheet = ss.getSheetByName('Pledges');
    if (!sheet) {
      sheet = ss.insertSheet('Pledges');
      sheet.appendRow([
        'Pledge ID', 'Customer ID', 'Created Date', 'Donor', 'Campaign',
        'Amount', 'Status', 'Amount Paid', 'Balance',
        'Display Name', 'Memo', 'Anonymous', 'Teams',
        'Method', 'Schedule ID', 'Notes'
      ]);
      sheet.getRange('1:1').setFontWeight('bold');
    }

    var pledgeId = generatePledgeIdMaster(sheet);
    var amount = parseFloat(data.amount) || 0;
    var amountPaid = status === 'Processed' ? amount : 0;
    var balance = amount - amountPaid;
    var method = data.method || '';
    if (!method && data.cardToken) method = 'Credit Card';

    sheet.appendRow([
      pledgeId,                                                      // A: Pledge ID
      customerId || '',                                              // B: Customer ID
      data.date ? new Date(data.date + 'T12:00:00') : new Date(),   // C: Created Date
      (data.firstName || '') + ' ' + (data.lastName || ''),          // D: Donor
      campaignId || data.campaignCode || data.campaign || '',        // E: Campaign
      amount,                                                        // F: Amount
      status,                                                        // G: Status
      amountPaid,                                                    // H: Amount Paid
      balance,                                                       // I: Balance
      data.displayName || '',                                        // J: Display Name
      data.memo || data.wallMemo || '',                              // K: Memo
      data.anonymous ? 'Yes' : 'No',                                // L: Anonymous
      String(data.teams || ''),                                      // M: Teams
      method,                                                        // N: Method
      scheduleId || '',                                              // O: Schedule ID
      data.notes || ''                                               // P: Notes
    ]);

    return pledgeId;
  } catch (err) {
    Logger.log('logPledgeMaster failed: ' + err.toString());
    return null;
  }
}


/**
 * Generate a sequential Pledge ID for the master version.
 * @param {Sheet} sheet - Pledges sheet
 * @returns {string} Next Pledge ID (PLG-XXXXXX)
 */
function generatePledgeIdMaster(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return 'PLG-000001';

  var lastRow = sheet.getLastRow();
  var lastId = String(sheet.getRange(lastRow, 1).getValue() || '');
  var match = lastId.match(/PLG-(\d+)/);
  var nextNum = match ? parseInt(match[1]) + 1 : 1;
  return 'PLG-' + String(nextNum).padStart(6, '0');
}


// ============================================================
// HELPER — LOG TRANSACTION TO CAMPAIGN SHEET (Master version)
// ============================================================
/**
 * Create a transaction record in a campaign's Transactions sheet.
 * @param {Spreadsheet} ss - Campaign spreadsheet
 * @param {string} pledgeId - Pledge ID
 * @param {string} customerId - Customer ID
 * @param {string} donorName - Donor full name
 * @param {number} amount - Payment amount
 * @param {Object} paymentResult - Gateway result or manual result
 * @param {string} paymentNum - Payment number
 */
function logTransactionMaster(ss, pledgeId, customerId, donorName, amount, paymentResult, paymentNum, fee) {
  try {
    var sheet = ss.getSheetByName('Transactions');
    if (!sheet) {
      sheet = ss.insertSheet('Transactions');
      sheet.appendRow([
        'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net', 'Donor Name', 'Pledge ID',
        'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date'
      ]);
      sheet.getRange('1:1').setFontWeight('bold');
    }

    var isGatewayTx = paymentResult.xResult === 'A';
    var funded = isGatewayTx ? 'Pending' : '';
    var txFee = parseFloat(fee) || 0;
    var txNet = amount - txFee;

    sheet.appendRow([
      new Date(),                                    // A: Timestamp
      paymentResult.xRefNum || '',                   // B: Reference
      amount,                                        // C: Amount Charged
      txFee,                                         // D: Fees
      txNet,                                         // E: Net
      donorName || '',                               // F: Donor Name
      pledgeId || '',                                // G: Pledge ID
      customerId || '',                              // H: Customer ID
      paymentResult.xResult || 'Manual',             // I: Result
      paymentResult.xMaskedCardNumber || '',          // J: Method
      paymentResult.xCardType || '',                  // K: Card Type
      paymentNum || '',                              // L: Payment #
      funded,                                        // M: Funded
      ''                                             // N: Funded Date
    ]);
  } catch (err) {
    Logger.log('logTransactionMaster failed: ' + err.toString());
  }
}


// ============================================================
// HELPER — SEND DONATION RECEIPT (for general donations)
// ============================================================
/**
 * Send a donation receipt email for an online donation and log to Receipt_Log.
 * @param {Object} data - Donation data
 * @param {Object} paymentResult - Gateway result
 * @param {string} campaignId - Campaign ID
 */
function sendDonationReceipt(data, paymentResult, campaignId) {
  try {
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var receiptId = 'NC-R-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMddHHmmss');
    var masterSS = null;

    if (masterSheetId) {
      try {
        masterSS = SpreadsheetApp.openById(masterSheetId);
        receiptId = getNextReceiptId(masterSS);
      } catch (e) {
        Logger.log('Could not open masterSS for receipt ID: ' + e.toString());
      }
    }

    var donorName = ((data.firstName || '') + ' ' + (data.lastName || '')).trim() || 'Supporter';
    var amount = parseFloat(data.amount) || 0;

    // Log to Receipt_Log in Master Sheet
    if (masterSS) {
      logReceipt(masterSS, {
        receiptId: receiptId,
        campaignId: campaignId || 'general',
        donorName: donorName,
        companyName: data.companyName || '',
        donorEmail: data.email || '',
        sentToEmail: data.email || '',
        amount: amount,
        issuedBy: 'Online Gateway',
        source: 'Online',
        transactionRef: paymentResult ? (paymentResult.xRefNum || '') : '',
        alsoSentOriginal: 'No',
        notes: 'Auto-issued on successful payment'
      });
    }

    if (!data.email) return;

    var receiptHtml = buildReceiptHtml({
      receiptId: receiptId,
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      companyName: data.companyName || '',
      email: data.email || '',
      phone: data.phone || '',
      street: data.street || '',
      city: data.city || '',
      state: data.state || '',
      zip: data.zip || '',
      amount: amount,
      date: new Date(),
      method: paymentResult ? (paymentResult.xMaskedCardNumber || paymentResult.xCardType || 'Credit Card') : 'Credit Card',
      campaign: campaignId || 'General Fund',
      refNum: paymentResult ? (paymentResult.xRefNum || '') : '',
      anonymous: data.anonymous || false,
      isManual: false
    });

    MailApp.sendEmail({
      to: data.email,
      subject: 'Donation Receipt ' + receiptId + ' — Notzer Chesed — $' + amount.toFixed(2),
      body: 'Thank you for your tax-deductible donation of $' + amount.toFixed(2) + ' to Notzer Chesed. Receipt ID: ' + receiptId,
      htmlBody: receiptHtml,
      name: 'Notzer Chesed'
    });
  } catch (err) {
    Logger.log('sendDonationReceipt failed: ' + err.toString());
  }
}


// ============================================================
// UTILITY — ADDRESS BUILDER
// ============================================================
/**
 * Build a formatted address string from data fields.
 * @param {Object} data - { street, city, state, zip }
 * @returns {string} Formatted address
 */
function buildAddress(data) {
  var parts = [];
  if (data.street) parts.push(data.street);
  if (data.city) parts.push(data.city);
  if (data.state && data.zip) parts.push(data.state + ' ' + data.zip);
  else if (data.state) parts.push(data.state);
  else if (data.zip) parts.push(data.zip);
  return parts.join(', ') || 'Not provided';
}


// ============================================================
// UTILITY — HTML ESCAPE
// ============================================================
/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str - Input string
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// ============================================================
// UTILITY — FORMAT DATE SHORT
// ============================================================
/**
 * Format a date as a short string (MM/DD/YYYY).
 * @param {Date} date - Date object
 * @returns {string} Formatted date
 */
function formatDateShort(date) {
  if (!date || !(date instanceof Date)) return '';
  return (date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getFullYear();
}


// ============================================================
// HELPER — CALCULATE CREDIT CARD PROCESSING FEE
// ============================================================
/**
 * Calculate standard credit card processing fee (2.9% + $0.30).
 * @param {number} amount - Transaction amount
 * @returns {number} Fee amount (rounded to 2 decimal places)
 */
// ── Fee Schedule (reads from campaign's Fee_Config sheet, auto-creates with defaults) ──
var _feeScheduleCaches = {};

function loadFeeSchedule_(ss) {
  var ssId = ss.getId();
  if (_feeScheduleCaches[ssId]) return _feeScheduleCaches[ssId];
  try {
    var sheet = ss.getSheetByName('Fee_Config');
    if (!sheet) {
      // Auto-create with comprehensive defaults
      sheet = ss.insertSheet('Fee_Config');
      sheet.appendRow(['Method', 'Rate', 'Flat Fee']);
      var defaults = getMasterFeeDefaults_();
      for (var d = 0; d < defaults.length; d++) {
        sheet.appendRow(defaults[d]);
      }
      sheet.getRange('A1:C1').setFontWeight('bold');
      sheet.setColumnWidth(1, 200);
      sheet.setColumnWidth(2, 80);
      sheet.setColumnWidth(3, 80);
      sheet.getRange('B2:B100').setNumberFormat('0.000');
      sheet.getRange('C2:C100').setNumberFormat('$#,##0.00');
      syncFeeConfigFromPledges_(ss, sheet);
      Logger.log('Created Fee_Config sheet for ' + ssId);
    }
    if (sheet.getLastRow() < 2) {
      _feeScheduleCaches[ssId] = { 'Credit Card': { rate: 0.029, flat: 0.30 } };
      return _feeScheduleCaches[ssId];
    }
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    var schedule = {};
    for (var i = 0; i < data.length; i++) {
      var method = String(data[i][0] || '').trim();
      if (method) {
        schedule[method] = {
          rate: parseFloat(data[i][1]) || 0,
          flat: parseFloat(data[i][2]) || 0
        };
      }
    }
    _feeScheduleCaches[ssId] = schedule;
    return schedule;
  } catch (e) {
    Logger.log('loadFeeSchedule_ error: ' + e.toString());
    _feeScheduleCaches[ssId] = { 'Credit Card': { rate: 0.029, flat: 0.30 } };
    return _feeScheduleCaches[ssId];
  }
}

function calculateFee(method, amount, ss) {
  var schedule;
  if (ss) {
    schedule = loadFeeSchedule_(ss);
  } else {
    // Fallback: hardcoded default
    schedule = { 'Credit Card': { rate: 0.029, flat: 0.30 } };
  }
  // Direct match
  if (schedule[method]) {
    var s = schedule[method];
    return Math.round((amount * s.rate + s.flat) * 100) / 100;
  }
  // Pattern matching
  var ml = (method || '').toLowerCase();
  if (ml.startsWith('daf') && schedule['DAF']) {
    var s = schedule['DAF'];
    return Math.round((amount * s.rate + s.flat) * 100) / 100;
  }
  if (/^\d/.test(method) || ml.includes('visa') || ml.includes('mastercard') || ml.includes('card')) {
    if (schedule['Credit Card']) {
      var s = schedule['Credit Card'];
      return Math.round((amount * s.rate + s.flat) * 100) / 100;
    }
  }
  if (ml.includes('matbia') && schedule['Matbia']) {
    var s = schedule['Matbia'];
    return Math.round((amount * s.rate + s.flat) * 100) / 100;
  }
  return 0;
}

// Backward compatible wrapper
function calculateCCFee(amount) {
  return calculateFee('Credit Card', amount);
}

/**
 * Scan Pledges for unique methods and add any missing to Fee_Config with $0 default.
 * @param {Spreadsheet} ss - Campaign spreadsheet.
 * @param {Sheet} [feeSheet] - Optional Fee_Config sheet.
 */
function syncFeeConfigFromPledges_(ss, feeSheet) {
  try {
    if (!feeSheet) {
      feeSheet = ss.getSheetByName('Fee_Config');
      if (!feeSheet) return;
    }
    var existingMethods = {};
    if (feeSheet.getLastRow() >= 2) {
      var feeData = feeSheet.getRange(2, 1, feeSheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < feeData.length; i++) {
        var m = String(feeData[i][0] || '').trim();
        if (m) existingMethods[m] = true;
      }
    }
    var pledgesSheet = ss.getSheetByName('Pledges');
    if (!pledgesSheet || pledgesSheet.getLastRow() < 2) return;
    var pHeaders = pledgesSheet.getRange(1, 1, 1, pledgesSheet.getLastColumn()).getValues()[0];
    var methodCol = -1;
    for (var h = 0; h < pHeaders.length; h++) {
      var hn = String(pHeaders[h]).trim().toLowerCase();
      if (hn === 'method' || hn === 'payment method') { methodCol = h; break; }
    }
    if (methodCol < 0) return;
    var pData = pledgesSheet.getRange(2, methodCol + 1, pledgesSheet.getLastRow() - 1, 1).getValues();
    var newMethods = {};
    for (var j = 0; j < pData.length; j++) {
      var pm = String(pData[j][0] || '').trim();
      if (pm && !existingMethods[pm] && !newMethods[pm]) {
        newMethods[pm] = true;
      }
    }
    var added = Object.keys(newMethods);
    for (var k = 0; k < added.length; k++) {
      feeSheet.appendRow([added[k], 0, 0]);
    }
    if (added.length > 0) {
      Logger.log('syncFeeConfig: added ' + added.length + ' methods from Pledges: ' + added.join(', '));
    }
  } catch (e) {
    Logger.log('syncFeeConfigFromPledges_ error: ' + e.toString());
  }
}


// ============================================================
// BOOKKEEPER ENDPOINTS (Master Version)
// ============================================================

/**
 * Returns all Scheduled and Overdue payments for a specific campaign's bookkeeper dashboard.
 * @param {string} campaignId - Campaign slug
 * @param {string} providedKey - Wall access key or admin auth key
 */
function getScheduledForBookkeeperMaster_(campaignId, providedKey, authMethod) {
  try {
    var campCode = String(campaignId || 'ksy').trim();
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) {
      return { status: 'error', message: 'Platform not configured.' };
    }

    var campRow = getCampaignRow(campCode);
    var sheetId = '';
    var wallAccessKey = '';
    var campaignName = campCode;

    if (campRow) {
      campaignName = String(campRow[1] || campCode).trim();
      sheetId = String(campRow[3] || '').trim();
      wallAccessKey = String(campRow[21] || '').trim();
    } else {
      sheetId = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID') || masterSheetId;
    }

    // ── Authorization Check ──
    // Authorized if:
    // 1. providedKey === '5786' (Platform Master Key)
    // 2. OR providedKey matches campaign wallAccessKey (if wallAccessKey is configured and non-empty)
    // 3. OR providedKey is a valid session token whose user has role 'bookkeeper', 'campaign_manager', 'campaign_owner', or 'super_admin' for campCode
    // 4. OR authMethod === 'google' and providedKey is a valid Google ID token for an authorized user
    var isAuthorized = false;

    if (providedKey === '5786' || (wallAccessKey && providedKey === wallAccessKey)) {
      isAuthorized = true;
    } else if (providedKey) {
      var sessionRes = validateSessionToken(providedKey);
      if (sessionRes.valid) {
        var uRes = lookupUser(sessionRes.email, 'session', campCode);
        if (uRes.valid && checkPermission(uRes.user, 'bookkeeper', campCode)) {
          isAuthorized = true;
        }
      } else if (authMethod === 'google') {
        var gRes = validateGoogleToken(providedKey);
        if (gRes.valid) {
          var guRes = lookupUser(gRes.email, 'google', campCode);
          if (guRes.valid && checkPermission(guRes.user, 'bookkeeper', campCode)) {
            isAuthorized = true;
          }
        }
      }
    }

    if (!isAuthorized) {
      return {
        status: 'error',
        authRequired: true,
        message: providedKey ? 'Unauthorized. Invalid credentials or access key for this campaign.' : 'Authentication required. Please sign in.'
      };
    }

    if (!sheetId) {
      return { status: 'error', message: 'No spreadsheet linked for campaign: ' + campCode };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var schedSheet = ss.getSheetByName('Scheduled Payments');
    if (!schedSheet || schedSheet.getLastRow() < 2) {
      return { status: 'success', campaignId: campCode, campaignName: campaignName, payments: [], total: 0 };
    }

    var schedData = schedSheet.getRange(1, 1, schedSheet.getLastRow(), schedSheet.getLastColumn()).getValues();
    var schedHeaders = schedData[0];

    // Dynamic header mapping
    var sCol = {};
    for (var sh = 0; sh < schedHeaders.length; sh++) {
      var sn = String(schedHeaders[sh]).trim().toLowerCase();
      if (sn === 'pledge id') sCol.pledgeId = sh;
      if (sn === 'schedule id' || sn === 'recurring id') sCol.scheduleId = sh;
      if (sn === 'customer id') sCol.customerId = sh;
      if (sn === 'donor' || sn === 'donor name') sCol.donor = sh;
      if (sn === 'per-payment amt' || sn === 'usd amount' || sn === 'amount') sCol.perPayment = sh;
      if (sn === 'payment #' || sn === 'sequence' || sn === 'count') sCol.payNum = sh;
      if (sn === 'due date' || sn === 'datedue') sCol.dueDate = sh;
      if (sn === 'status') sCol.status = sh;
      if (sn === 'total pledge') sCol.totalPledge = sh;
      if (sn === 'frequency') sCol.frequency = sh;
      if (sn === 'transaction ref' || sn === 'ref') sCol.txRef = sh;
    }

    // Fallbacks
    if (sCol.dueDate === undefined) sCol.dueDate = 10;
    if (sCol.status === undefined) sCol.status = 11;
    if (sCol.scheduleId === undefined) sCol.scheduleId = 1;
    if (sCol.pledgeId === undefined) sCol.pledgeId = 2;
    if (sCol.customerId === undefined) sCol.customerId = 3;
    if (sCol.donor === undefined) sCol.donor = 4;
    if (sCol.perPayment === undefined) sCol.perPayment = 5;
    if (sCol.payNum === undefined) sCol.payNum = 9;

    var today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build pledgeId -> method map from Pledges sheet
    var methodMap = {};
    var pledgesSheet = ss.getSheetByName('Pledges');
    if (pledgesSheet && pledgesSheet.getLastRow() >= 2) {
      var pledgesData = pledgesSheet.getRange(1, 1, pledgesSheet.getLastRow(), pledgesSheet.getLastColumn()).getValues();
      var pHeaders = pledgesData[0];
      var pColId = -1, pColMethod = -1;
      for (var ph = 0; ph < pHeaders.length; ph++) {
        var phn = String(pHeaders[ph]).trim().toLowerCase();
        if (phn === 'pledge id') pColId = ph;
        if (phn === 'method' || phn === 'payment method') pColMethod = ph;
      }
      if (pColId >= 0 && pColMethod >= 0) {
        for (var pr = 1; pr < pledgesData.length; pr++) {
          var pid = String(pledgesData[pr][pColId] || '').trim();
          if (pid) methodMap[pid] = String(pledgesData[pr][pColMethod] || '').trim();
        }
      }
    }

    var payments = [];
    for (var r = 1; r < schedData.length; r++) {
      var rowStatus = String(schedData[r][sCol.status] || '').trim();
      if (rowStatus !== 'Scheduled' && rowStatus !== 'Overdue') continue;

      var dueDateVal = schedData[r][sCol.dueDate];
      var dueDate = dueDateVal ? new Date(dueDateVal) : null;
      var effectiveStatus = rowStatus;

      // Mark past-due Scheduled rows as Overdue
      if (dueDate && !isNaN(dueDate.getTime())) {
        dueDate.setHours(0, 0, 0, 0);
        if (dueDate <= today && rowStatus === 'Scheduled') {
          effectiveStatus = 'Overdue';
        }
      }

      var rowPledgeId = String(schedData[r][sCol.pledgeId] || '').trim();

      payments.push({
        rowIndex: r + 1,
        scheduleId: String(schedData[r][sCol.scheduleId] || '').trim(),
        pledgeId: rowPledgeId,
        customerId: String(schedData[r][sCol.customerId] || '').trim(),
        donorName: String(schedData[r][sCol.donor] || '').trim(),
        amount: parseFloat(schedData[r][sCol.perPayment]) || 0,
        totalPledge: sCol.totalPledge !== undefined ? (parseFloat(schedData[r][sCol.totalPledge]) || 0) : 0,
        frequency: sCol.frequency !== undefined ? String(schedData[r][sCol.frequency] || '').trim() : '',
        paymentNum: String(schedData[r][sCol.payNum] || '').trim(),
        dueDate: dueDate && !isNaN(dueDate.getTime()) ? Utilities.formatDate(dueDate, 'America/New_York', 'yyyy-MM-dd') : '',
        status: effectiveStatus,
        method: methodMap[rowPledgeId] || ''
      });
    }

    return {
      status: 'success',
      campaignId: campCode,
      campaignName: campaignName,
      payments: payments,
      total: payments.length
    };
  } catch (err) {
    Logger.log('getScheduledForBookkeeperMaster_ failed: ' + err.toString());
    return { status: 'error', message: 'Failed to retrieve scheduled payments: ' + err.toString() };
  }
}

/**
 * Return fee schedule config for a campaign bookkeeper frontend.
 * @param {string} campaignId
 * @param {string} providedKey
 */
function getFeeConfigMaster_(campaignId, providedKey) {
  try {
    var campCode = String(campaignId || 'ksy').trim();
    var campRow = getCampaignRow(campCode);
    var sheetId = '';
    if (campRow) {
      sheetId = String(campRow[3] || '').trim();
    } else {
      sheetId = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID') || PropertiesService.getScriptProperties().getProperty('MASTER_SHEET_ID');
    }

    if (!sheetId) {
      return { status: 'error', message: 'Campaign has no linked spreadsheet.' };
    }

    var feeSS = SpreadsheetApp.openById(sheetId);
    syncFeeConfigFromPledges_(feeSS);
    var schedule = loadFeeSchedule_(feeSS);
    var methods = [];
    for (var mk in schedule) {
      methods.push({ method: mk, rate: schedule[mk].rate, flat: schedule[mk].flat });
    }
    return { status: 'success', campaignId: campCode, methods: methods };
  } catch (feeErr) {
    return { status: 'error', message: 'Failed to read fee config: ' + feeErr.toString() };
  }
}

/**
 * Process a payment on behalf of a bookkeeper.
 * Finds the scheduled payment, creates a transaction, marks it paid,
 * and updates the pledge balance.
 * @param {Object} data - { campaignId, pledgeId, scheduleId, paymentNum, amount, fee, method, key }
 * @returns {{ status: string, transactionRef?: string, updatedPledge?: Object, message?: string }}
 */
function processBookkeeperPayment(data) {
  try {
    var campaignId = data.campaignId || data.campaign || 'ksy';
    if (!data.pledgeId || !data.amount) {
      return { status: 'error', message: 'pledgeId and amount are required.' };
    }

    var campRow = getCampaignRow(campaignId);
    var sheetId = '';
    var wallAccessKey = '';
    if (campRow) {
      sheetId = String(campRow[3] || '').trim();
      wallAccessKey = String(campRow[21] || '').trim();
    } else {
      sheetId = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID') || PropertiesService.getScriptProperties().getProperty('MASTER_SHEET_ID');
    }

    if (wallAccessKey && wallAccessKey !== data.key && data.key !== '5786') {
      return { status: 'error', message: 'Invalid authorization key.' };
    }

    if (!sheetId) {
      return { status: 'error', message: 'Campaign spreadsheet not found.' };
    }

    var ss = SpreadsheetApp.openById(sheetId);

    // Find matching scheduled payment row
    var spSheet = ss.getSheetByName('Scheduled Payments');
    var spRow = -1;
    var donor = '';
    var customerId = '';
    var spColStatus = 12;
    var spColRef = 13;

    if (spSheet && spSheet.getLastRow() >= 2) {
      var spLastRow = spSheet.getLastRow();
      var spData = spSheet.getRange(1, 1, spLastRow, spSheet.getLastColumn()).getValues();
      var spHeaders = spData[0];
      var sColSched = -1, sColPayNum = -1, sColPledge = -1, sColDonor = -1, sColCust = -1, sColStat = -1, sColTxRef = -1;
      for (var sh = 0; sh < spHeaders.length; sh++) {
        var sn = String(spHeaders[sh]).trim().toLowerCase();
        if (sn === 'schedule id' || sn === 'recurring id') sColSched = sh;
        if (sn === 'payment #' || sn === 'sequence') sColPayNum = sh;
        if (sn === 'pledge id') sColPledge = sh;
        if (sn === 'donor' || sn === 'donor name') sColDonor = sh;
        if (sn === 'customer id') sColCust = sh;
        if (sn === 'status') sColStat = sh;
        if (sn === 'transaction ref' || sn === 'ref') sColTxRef = sh;
      }

      if (sColStat >= 0) spColStatus = sColStat + 1;
      if (sColTxRef >= 0) spColRef = sColTxRef + 1;

      for (var i = 1; i < spData.length; i++) {
        var spSchedId = sColSched >= 0 ? String(spData[i][sColSched] || '').trim() : '';
        var spPledgeId = sColPledge >= 0 ? String(spData[i][sColPledge] || '').trim() : '';
        var spPNum = sColPayNum >= 0 ? String(spData[i][sColPayNum] || '').trim() : '';
        var spSt = sColStat >= 0 ? String(spData[i][sColStat] || '').trim() : '';

        var match = false;
        if (data.scheduleId && spSchedId === String(data.scheduleId)) {
          if (!data.paymentNum || spPNum.indexOf(String(data.paymentNum)) !== -1) {
            match = true;
          }
        } else if (data.pledgeId && spPledgeId === String(data.pledgeId)) {
          if (!data.paymentNum || spPNum.indexOf(String(data.paymentNum)) !== -1) {
            match = true;
          }
        }

        if (match && (spSt === 'Scheduled' || spSt === 'Overdue' || !spSt)) {
          spRow = i + 1;
          donor = sColDonor >= 0 ? String(spData[i][sColDonor] || '').trim() : '';
          customerId = sColCust >= 0 ? String(spData[i][sColCust] || '').trim() : '';
          break;
        }
      }
    }

    var amount = parseFloat(data.amount) || 0;
    if (amount <= 0) {
      return { status: 'error', message: 'Payment amount must be greater than 0.' };
    }

    var fee = parseFloat(data.fee) || 0;
    var net = amount - fee;
    var method = data.method || 'Manual';

    // Generate transaction reference
    var refNum = 'BK-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 1000);

    // Create Transaction row
    var txSheet = ss.getSheetByName('Transactions');
    if (!txSheet) {
      txSheet = ss.insertSheet('Transactions');
      txSheet.appendRow([
        'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net', 'Donor Name', 'Pledge ID',
        'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date'
      ]);
      txSheet.getRange('1:1').setFontWeight('bold');
    }

    txSheet.appendRow([
      new Date(),              // A: Timestamp
      refNum,                  // B: Reference
      amount,                  // C: Amount Charged
      fee,                     // D: Fees
      net,                     // E: Net
      donor,                   // F: Donor Name
      data.pledgeId,           // G: Pledge ID
      customerId,              // H: Customer ID
      'Bookkeeper',            // I: Result
      method,                  // J: Method
      '',                      // K: Card Type
      String(data.paymentNum || '1'), // L: Payment #
      'Pending',               // M: Funded
      ''                       // N: Funded Date
    ]);

    // Update Scheduled Payment row if found
    if (spSheet && spRow > 0) {
      spSheet.getRange(spRow, spColStatus).setValue('Paid');
      spSheet.getRange(spRow, spColRef).setValue(refNum);
    }

    // Update Pledge paid/balance
    updatePledgePaid(ss, data.pledgeId, amount);

    // Read back updated pledge data for response
    var pledgesSheet = ss.getSheetByName('Pledges');
    var updatedPledge = { pledgeId: data.pledgeId };
    if (pledgesSheet && pledgesSheet.getLastRow() >= 2) {
      var pledgeIds = pledgesSheet.getRange(2, 1, pledgesSheet.getLastRow() - 1, 1).getValues().flat();
      var pIdx = pledgeIds.indexOf(data.pledgeId);
      if (pIdx !== -1) {
        var pRow = pIdx + 2;
        updatedPledge.amountPaid = parseFloat(pledgesSheet.getRange(pRow, 8).getValue()) || 0;
        updatedPledge.balance = parseFloat(pledgesSheet.getRange(pRow, 9).getValue()) || 0;
        updatedPledge.status = String(pledgesSheet.getRange(pRow, 7).getValue() || '').trim();
      }
    }

    return {
      status: 'success',
      transactionRef: refNum,
      updatedPledge: updatedPledge
    };
  } catch (err) {
    Logger.log('processBookkeeperPayment error: ' + err.toString());
    return { status: 'error', message: 'Failed to process bookkeeper payment: ' + err.toString() };
  }
}


// ============================================================
// DATE AUDIT & NORMALIZATION (super_admin only)
// ============================================================
/**
 * Audit and normalize date values across Master sheet and Campaign sheets.
 * Ensures spreadsheet timezone is America/New_York, repairs text ISO strings,
 * reconciles Receipt_Log and Report_Schedule headers/data, and applies standard date formatting.
 *
 * @param {string} callerEmail - Email of the authenticated super_admin
 * @returns {Object} { status, sheetsAudited, rowsFixed, columnsFormatted, headersReconciled, errors, details }
 */
function auditAndNormalizeDatesMaster_(callerEmail) {
  // Returns: { status, sheetsAudited, rowsFixed, columnsFormatted, headersReconciled, errors, details }

  var report = { status: 'success', sheetsAudited: 0, rowsFixed: 0, columnsFormatted: 0, headersReconciled: 0, errors: [], details: [] };

  var props = PropertiesService.getScriptProperties();
  var masterSheetId = props.getProperty('MASTER_SHEET_ID');
  if (!masterSheetId) {
    report.status = 'error';
    report.errors.push('MASTER_SHEET_ID script property not configured');
    return report;
  }
  var ss;
  try {
    ss = SpreadsheetApp.openById(masterSheetId);
  } catch (openErr) {
    report.status = 'error';
    report.errors.push('Cannot open master spreadsheet: ' + openErr.toString());
    return report;
  }

  // 1. Ensure spreadsheet timezone
  ss.setSpreadsheetTimeZone('America/New_York');
  report.details.push('Set spreadsheet timezone to America/New_York');

  // 2. OTP_Sessions repair
  var otpSheet = ss.getSheetByName('OTP_Sessions');
  if (otpSheet && otpSheet.getLastRow() >= 2) {
    var otpData = otpSheet.getRange(2, 1, otpSheet.getLastRow() - 1, 7).getValues();
    for (var i = 0; i < otpData.length; i++) {
      var row = otpData[i];
      var rowNum = i + 2;
      // Fix Col C (Created) if it's a text string
      if (row[2] && typeof row[2] === 'string') {
        var parsed = new Date(row[2]);
        if (!isNaN(parsed.getTime())) {
          otpSheet.getRange(rowNum, 3).setValue(parsed);
          report.rowsFixed++;
        }
      }
      // Fix Col D (Expires) if text
      if (row[3] && typeof row[3] === 'string') {
        var parsed = new Date(row[3]);
        if (!isNaN(parsed.getTime())) {
          otpSheet.getRange(rowNum, 4).setValue(parsed);
          report.rowsFixed++;
        }
      }
      // Fix Col F (Session Expires)
      var sessionToken = String(row[4] || '').trim();
      var used = String(row[6] || '').trim();
      if (sessionToken && used === 'Yes') {
        if (row[5] && typeof row[5] === 'string') {
          // It's text, parse and rewrite as Date
          var parsed = new Date(row[5]);
          if (!isNaN(parsed.getTime())) {
            otpSheet.getRange(rowNum, 6).setValue(parsed);
            report.rowsFixed++;
          }
        } else if (!row[5]) {
          // Session verified but no session expires — compute from Created + 24h
          var created = row[2] instanceof Date ? row[2] : new Date(row[2]);
          if (!isNaN(created.getTime())) {
            var sessionExp = new Date(created.getTime() + 24 * 60 * 60 * 1000);
            otpSheet.getRange(rowNum, 6).setValue(sessionExp);
            report.rowsFixed++;
          }
        }
      }
    }
    // Apply date format to entire columns C, D, F
    var lastRow = otpSheet.getLastRow();
    if (lastRow >= 2) {
      otpSheet.getRange(2, 3, lastRow - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
      otpSheet.getRange(2, 4, lastRow - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
      otpSheet.getRange(2, 6, lastRow - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
      report.columnsFormatted += 3;
    }
    report.sheetsAudited++;
    report.details.push('OTP_Sessions: audited ' + otpData.length + ' rows');
  }

  // 3. Authorized_Users repair
  var usersSheet = ss.getSheetByName('Authorized_Users');
  if (usersSheet && usersSheet.getLastRow() >= 2) {
    var userData = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 8).getValues();
    for (var i = 0; i < userData.length; i++) {
      var row = userData[i];
      var rowNum = i + 2;
      // Fix Col G (Added Date) if text string
      if (row[6] && typeof row[6] === 'string') {
        var parsed = new Date(row[6]);
        if (!isNaN(parsed.getTime())) {
          usersSheet.getRange(rowNum, 7).setValue(parsed);
          report.rowsFixed++;
        }
      }
      // Fix Col H (Last Login) if text string
      if (row[7] && typeof row[7] === 'string') {
        var parsed = new Date(row[7]);
        if (!isNaN(parsed.getTime())) {
          usersSheet.getRange(rowNum, 8).setValue(parsed);
          report.rowsFixed++;
        }
      }
    }
    var lastRow = usersSheet.getLastRow();
    if (lastRow >= 2) {
      usersSheet.getRange(2, 7, lastRow - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
      usersSheet.getRange(2, 8, lastRow - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
      report.columnsFormatted += 2;
    }
    report.sheetsAudited++;
    report.details.push('Authorized_Users: audited ' + userData.length + ' rows');
  }

  // 4. Campaigns tab — fix ISO text dates in cols R (18) and S (19)
  var campSheet = ss.getSheetByName('Campaigns');
  if (campSheet && campSheet.getLastRow() >= 2) {
    var campData = campSheet.getRange(2, 18, campSheet.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < campData.length; i++) {
      var rowNum = i + 2;
      // Col R (Created Date)
      if (campData[i][0] && typeof campData[i][0] === 'string') {
        var parsed = new Date(campData[i][0]);
        if (!isNaN(parsed.getTime())) {
          campSheet.getRange(rowNum, 18).setValue(parsed);
          report.rowsFixed++;
        }
      }
      // Col S (Last Modified)
      if (campData[i][1] && typeof campData[i][1] === 'string') {
        var parsed = new Date(campData[i][1]);
        if (!isNaN(parsed.getTime())) {
          campSheet.getRange(rowNum, 19).setValue(parsed);
          report.rowsFixed++;
        }
      }
    }
    var lastRow = campSheet.getLastRow();
    if (lastRow >= 2) {
      campSheet.getRange(2, 18, lastRow - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
      campSheet.getRange(2, 19, lastRow - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
      report.columnsFormatted += 2;
    }
    report.sheetsAudited++;
    report.details.push('Campaigns: audited date columns R,S');
  }

  // 5. Receipt_Log — format col B, reconcile header
  var receiptSheet = ss.getSheetByName('Receipt_Log');
  if (receiptSheet) {
    var header = receiptSheet.getRange(1, 1, 1, 13).getValues()[0];
    var expectedHeader = ['Receipt ID', 'Timestamp', 'Campaign ID', 'Donor Name', 'Company Name', 'Donor Email', 'Sent-To Email', 'Amount', 'Issued By', 'Source', 'Original Transaction Ref', 'Also Sent to Original', 'Notes'];
    if (String(header[1]).trim() === 'Campaign' || String(header[1]).trim() !== 'Timestamp') {
      receiptSheet.getRange('A1:M1').setValues([expectedHeader]);
      report.headersReconciled++;
      report.details.push('Receipt_Log: header reconciled from old schema');
      if (receiptSheet.getLastRow() >= 2) {
        report.errors.push('WARNING: Receipt_Log has ' + (receiptSheet.getLastRow() - 1) + ' data rows that may be misaligned with old schema — manual review recommended');
      }
    }
    if (receiptSheet.getLastRow() >= 2) {
      receiptSheet.getRange(2, 2, receiptSheet.getLastRow() - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
      report.columnsFormatted++;
    }
    report.sheetsAudited++;
  }

  // 6. Report_Schedule — format col E, reconcile header
  var reportSheet = ss.getSheetByName('Report_Schedule');
  if (reportSheet) {
    var header = reportSheet.getRange(1, 1, 1, 5).getValues()[0];
    if (String(header[1]).trim() === 'Frequency') {
      // Old schema: [Campaign ID, Frequency, Send To, Last Sent, Status]
      // New schema: [Campaign ID, Report Type, Recipients, Enabled, Last Sent]
      // Migrate data rows first
      if (reportSheet.getLastRow() >= 2) {
        var oldData = reportSheet.getRange(2, 1, reportSheet.getLastRow() - 1, 5).getValues();
        for (var i = 0; i < oldData.length; i++) {
          var rowNum = i + 2;
          // Old col C (Send To) → New col C (Recipients) — same position, just rename
          // Old col D (Last Sent) → New col E (Last Sent)
          var lastSent = oldData[i][3];
          reportSheet.getRange(rowNum, 4).setValue('Yes'); // D: Enabled
          reportSheet.getRange(rowNum, 5).setValue(lastSent || ''); // E: Last Sent
        }
        report.rowsFixed += oldData.length;
      }
      reportSheet.getRange('A1:E1').setValues([['Campaign ID', 'Report Type', 'Recipients', 'Enabled', 'Last Sent']]);
      report.headersReconciled++;
      report.details.push('Report_Schedule: header and data migrated from old schema');
    }
    if (reportSheet.getLastRow() >= 2) {
      reportSheet.getRange(2, 5, reportSheet.getLastRow() - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
      report.columnsFormatted++;
    }
    report.sheetsAudited++;
  }

  // 7. Campaign sheets — iterate all active campaigns and format date columns
  if (campSheet && campSheet.getLastRow() >= 2) {
    var allCamps = campSheet.getRange(2, 1, campSheet.getLastRow() - 1, 4).getValues();
    for (var c = 0; c < allCamps.length; c++) {
      var campId = String(allCamps[c][0] || '').trim();
      var campStatus = String(allCamps[c][2] || '').trim();
      var campSheetId = String(allCamps[c][3] || '').trim();
      if (!campSheetId || campStatus === 'Deleted') continue;

      try {
        var campSs = SpreadsheetApp.openById(campSheetId);

        // Transactions tab: col A (Timestamp), col N (Funded Date)
        var txSheet = campSs.getSheetByName('Transactions');
        if (txSheet && txSheet.getLastRow() >= 2) {
          var txLr = txSheet.getLastRow();
          txSheet.getRange(2, 1, txLr - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
          txSheet.getRange(2, 14, txLr - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
          report.columnsFormatted += 2;
        }

        // Pledges tab: col C (Created Date)
        var pledgeSheet = campSs.getSheetByName('Pledges');
        if (pledgeSheet && pledgeSheet.getLastRow() >= 2) {
          pledgeSheet.getRange(2, 3, pledgeSheet.getLastRow() - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
          report.columnsFormatted++;
        }

        // Scheduled Payments: col A and col K
        var spSheet = campSs.getSheetByName('Scheduled Payments');
        if (spSheet && spSheet.getLastRow() >= 2) {
          var spLr = spSheet.getLastRow();
          spSheet.getRange(2, 1, spLr - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
          spSheet.getRange(2, 11, spLr - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
          report.columnsFormatted += 2;
        }

        // Expenses: col A (Date)
        var expSheet = campSs.getSheetByName('Expenses');
        if (expSheet && expSheet.getLastRow() >= 2) {
          expSheet.getRange(2, 1, expSheet.getLastRow() - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
          report.columnsFormatted++;
        }

        // Users tab: cols G and H (Added Date, Last Login)
        var cuSheet = campSs.getSheetByName('Users');
        if (cuSheet && cuSheet.getLastRow() >= 2) {
          var cuLr = cuSheet.getLastRow();
          cuSheet.getRange(2, 7, cuLr - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
          cuSheet.getRange(2, 8, cuLr - 1, 1).setNumberFormat('M/d/yyyy H:mm:ss');
          report.columnsFormatted += 2;
        }

        report.sheetsAudited++;
        report.details.push('Campaign ' + campId + ': formatted date columns');
      } catch (campErr) {
        report.errors.push('Campaign ' + campId + ': ' + campErr.toString());
      }
    }
  }

  return report;
}


// ============================================================
// SETUP: Initialize Master and Campaign spreadsheet tabs
// ============================================================
/**
 * Creates required sheet tabs with headers. Idempotent — skips tabs that already exist.
 *
 * @param {string} mode - 'master' (master sheet only), 'campaign' (campaign sheet only), or 'all' (both)
 * @param {string} campaignSheetId - Required when mode is 'campaign' or 'all'. The Google Sheet ID of the campaign spreadsheet.
 * @returns {Object} Result with created/skipped tabs
 */
function setupMasterSheets_(mode, campaignSheetId) {
  var results = { status: 'success', master: null, campaign: null };

  // ── Master spreadsheet tabs ──
  if (mode === 'master' || mode === 'all') {
    var masterSheetId = PropertiesService.getScriptProperties().getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) {
      return { status: 'error', message: 'MASTER_SHEET_ID not set in Script Properties. Create a Google Sheet and add its ID.' };
    }

    var masterSS;
    try {
      masterSS = SpreadsheetApp.openById(masterSheetId);
    } catch (openErr) {
      return { status: 'error', message: 'Cannot open master spreadsheet: ' + openErr.toString() };
    }

    var masterTabs = [
      {
        name: 'Campaigns',
        headers: [
          'Campaign ID', 'Campaign Name', 'Status', 'Campaign Sheet ID', 'Apps Script URL',
          'Primary Gateway', 'Cardknox iFields Key', 'Cardknox Server Key',
          'USAePay Public Key', 'USAePay Server Key', 'Goal Amount',
          'Start Date', 'End Date', 'Page URL', 'Admin URL', 'Wall URL',
          'Wall Enabled', 'Created Date', 'Last Modified', 'USAePay PIN', 'Is Public', 'Wall Access Key',
          'TDF Enabled', 'TDF Account Number', 'TDF Api Key', 'TDF Validation Token', 'TDF Environment'
        ]
      },
      {
        name: 'Authorized_Users',
        headers: ['Email', 'Display Name', 'Auth Method', 'Role', 'Assigned Campaigns', 'Status', 'Added Date', 'Last Login']
      },
      {
        name: 'OTP_Sessions',
        headers: ['Email', 'OTP Code', 'Created', 'Expires', 'Session Token', 'Session Expires', 'Used']
      },
      {
        name: 'Receipt_Log',
        headers: [
          'Receipt ID', 'Timestamp', 'Campaign ID', 'Donor Name', 'Company Name',
          'Donor Email', 'Sent-To Email', 'Amount', 'Issued By',
          'Source', 'Original Transaction Ref', 'Also Sent to Original', 'Notes'
        ]
      },
      {
        name: 'Report_Schedule',
        headers: ['Campaign ID', 'Report Type', 'Recipients', 'Enabled', 'Last Sent']
      },
      {
        name: 'Templates',
        headers: [
          'Template ID', 'Template Name', 'Category', 'Description',
          'Accent Color', 'Accent Light', 'Accent Dark',
          'Preset Amounts', 'Hebrew Title', 'Subtitle',
          'Story Layout', 'Default Story EN', 'Default Story HE',
          'Features', 'Hero Image URL', 'Status', 'Created Date', 'Last Modified'
        ]
      }
    ];

    results.master = createSheetTabs_(masterSS, masterTabs);
  }

  // ── Campaign spreadsheet tabs ──
  if (mode === 'campaign' || mode === 'all') {
    if (!campaignSheetId) {
      return { status: 'error', message: 'campaignSheetId is required for mode "' + mode + '". Pass the Google Sheet ID of the campaign spreadsheet.' };
    }

    var campaignSS;
    try {
      campaignSS = SpreadsheetApp.openById(campaignSheetId);
    } catch (openErr) {
      return { status: 'error', message: 'Cannot open campaign spreadsheet: ' + openErr.toString() };
    }

    var campaignTabs = [
      {
        name: 'Pledges',
        headers: [
          'Pledge ID', 'Customer ID', 'Created Date', 'Donor', 'Campaign',
          'Amount', 'Status', 'Amount Paid', 'Balance',
          'Display Name', 'Memo', 'Anonymous', 'Teams',
          'Method', 'Schedule ID', 'Notes'
        ]
      },
      {
        name: 'Transactions',
        headers: [
          'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net', 'Donor Name', 'Pledge ID',
          'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date'
        ]
      },
      {
        name: 'Customers',
        headers: [
          'Customer ID', 'First Name', 'Last Name', 'Email', 'Phone',
          'Street', 'City', 'State', 'Zip', 'Created Date', 'Source'
        ]
      },
      {
        name: 'Scheduled Payments',
        headers: [
          'DateSubmitted', 'Recurring ID', 'Pledge ID', 'Customer ID', 'Donor Name',
          'USD Amount', 'Total Pledge', 'Frequency',
          'Count', 'Sequence', 'DateDue', 'Status', 'Transaction Ref'
        ]
      },
      {
        name: 'Teams',
        headers: [
          'Team ID', 'Team Name', 'Team Contact Name',
          'Team Contact Email', 'Notify on New Donation', 'Team Goal', 'Campaign'
        ]
      },
      {
        name: 'LinkClicks',
        headers: [
          'Timestamp', 'First Name', 'Last Name', 'Email', 'Link Clicked', 'Campaign', 'Amount'
        ]
      },
      {
        name: 'Fee_Config',
        headers: [
          'Method', 'Rate', 'Flat Fee'
        ]
      },
      {
        name: 'Expenses',
        headers: [
          'Date', 'Amount', 'Payee', 'Type', 'Purpose', 'Authorized By', 'Given by'
        ]
      },
      {
        name: 'Campaigns',
        headers: [
          'Short Code', 'Long Name Eng', 'Goal', 'Manager Email', 'Manager Name', 'Notify on New Donation'
        ]
      }
    ];

    results.campaign = createSheetTabs_(campaignSS, campaignTabs);
  }

  return results;
}

/**
 * Helper: Create sheet tabs with headers if they don't already exist.
 * @param {Spreadsheet} ss - The Google Spreadsheet object
 * @param {Array} tabs - Array of {name, headers} objects
 * @returns {Object} { created: [...], skipped: [...] }
 */
function createSheetTabs_(ss, tabs) {
  var created = [];
  var skipped = [];

  for (var i = 0; i < tabs.length; i++) {
    var tabDef = tabs[i];
    var existing = ss.getSheetByName(tabDef.name);
    if (existing) {
      skipped.push(tabDef.name);
    } else {
      var newSheet = ss.insertSheet(tabDef.name);
      newSheet.appendRow(tabDef.headers);
      newSheet.getRange('1:1').setFontWeight('bold');
      newSheet.setFrozenRows(1);
      created.push(tabDef.name);
    }
  }

  return { created: created, skipped: skipped };
}
// ============================================================================
// TDF (THE DONORS FUND) GIVING CARD INTEGRATION — PHASE 1
// ============================================================================

/**
 * 1. TDF Config Resolution
 * Resolves credentials and endpoints with this precedence:
 *   1. Per-campaign overrides in Campaigns sheet:
 *      Col W (idx 22): TDF Enabled ('Yes'/'No')
 *      Col X (idx 23): TDF Account Number (charity account)
 *      Col Y (idx 24): TDF Api Key
 *      Col Z (idx 25): TDF Validation Token
 *      Col AA (idx 26): TDF Environment ('sandbox' or 'production')
 *   2. Organization defaults in Script Properties:
 *      TDF_API_KEY, TDF_VALIDATION_TOKEN, TDF_CHARITY_ACCOUNT_NUMBER, TDF_ENVIRONMENT
 * @param {string} campaignId - Campaign slug
 * @returns {Object} { enabled, baseUrl, apiKey, validationToken, charityAccountNumber, environment, error }
 */
function getTdfConfig_(campaignId) {
  var props = PropertiesService.getScriptProperties();
  var globalEnv = props.getProperty('TDF_ENVIRONMENT') || 'production';
  
  var orgApiKey = props.getProperty('TDF_API_KEY') || '';
  var orgValToken = props.getProperty('TDF_VALIDATION_TOKEN') || '';
  var orgAccount = props.getProperty('TDF_CHARITY_ACCOUNT_NUMBER') || '2578754';
  
  var campaignRow = getCampaignRow(campaignId);
  if (!campaignRow) {
    return { enabled: false, error: 'Campaign not found' };
  }
  
  // TDF columns:
  // W(22)=TDF Enabled, X(23)=TDF Account Number, Y(24)=TDF Api Key, Z(25)=TDF Validation Token, AA(26)=TDF Environment
  var campEnabledVal = String(campaignRow[22] || '').trim().toLowerCase();
  var campAccount = String(campaignRow[23] || '').trim();
  var campApiKey = String(campaignRow[24] || '').trim();
  var campValToken = String(campaignRow[25] || '').trim();
  var campEnv = String(campaignRow[26] || '').trim().toLowerCase();
  
  var env = (campEnv === 'sandbox' || campEnv === 'production') ? campEnv : globalEnv;
  var baseUrl = env === 'sandbox' 
    ? 'https://api.tdfcharitable.org/thedonorsfund/integration'
    : 'https://api.thedonorsfund.org/thedonorsfund/integration';
  
  var finalApiKey = campApiKey || orgApiKey;
  var finalValToken = campValToken || orgValToken;
  var finalAccount = campAccount || orgAccount;
  
  var hasCreds = !!(finalApiKey && finalValToken && finalAccount);
  var enabled = campEnabledVal === 'yes' || (campEnabledVal !== 'no' && hasCreds);
  
  if (campEnabledVal === 'no') {
    return { enabled: false, error: 'TDF explicitly disabled for this campaign' };
  }
  
  if (!hasCreds) {
    return { enabled: false, error: 'Missing required TDF credentials' };
  }
  
  if (!enabled) {
    return { enabled: false, error: 'TDF not enabled for this campaign' };
  }
  
  return {
    enabled: true,
    baseUrl: baseUrl,
    apiKey: finalApiKey,
    validationToken: finalValToken,
    charityAccountNumber: finalAccount,
    environment: env
  };
}

/**
 * 2. TdfClient_ Adapter
 * Normalized outcome semantics:
 *   - CONFIRMED_ACCEPTED: TDF confirmed receipt of grant recommendation
 *   - CONFIRMED_REJECTED: TDF definitively rejected (bad card, invalid amount, etc.)
 *   - CONFIG_FAILURE: 401/403 or bad credentials
 *   - UNKNOWN: Network error, timeout, 5xx, or unparseable response
 */
var TdfClient_ = {
  _request: function(config, method, endpoint, payload) {
    var url = config.baseUrl + endpoint;
    var options = {
      method: method,
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: {
        'Api-Key': config.apiKey,
        'Validation-Token': config.validationToken,
        'Accept': 'application/json'
      }
    };
    if (payload) {
      options.payload = JSON.stringify(payload);
    }
    
    try {
      var response = UrlFetchApp.fetch(url, options);
      return {
        status: response.getResponseCode(),
        body: response.getContentText()
      };
    } catch (e) {
      Logger.log('TdfClient_ Network Error: ' + e.toString());
      return null;
    }
  },
  
  _parseResponse: function(res) {
    if (!res || !res.body) return null;
    try {
      return JSON.parse(res.body);
    } catch (e) {
      return null;
    }
  },

  createGrant: function(config, params) {
    var payload = {
      donor: params.donorName,
      email: params.email,
      cardNumber: params.cardNumber,
      amount: parseFloat(params.amount),
      charityAccountNumber: config.charityAccountNumber,
      grantPurpose: params.designation
    };
    
    var res = this._request(config, 'post', '/Create', payload);
    var maskCard = '****' + String(params.cardNumber).replace(/[^0-9]/g, '').slice(-4);
    
    if (!res) {
      return { outcome: 'UNKNOWN', errorMessage: 'Network error or timeout connecting to TDF', rawResponse: null };
    }
    
    if (res.status === 401 || res.status === 403) {
      return { outcome: 'CONFIG_FAILURE', errorMessage: 'TDF authentication failed (HTTP ' + res.status + ')', rawResponse: res.body };
    }
    
    var data = this._parseResponse(res);
    if (!data) {
      return { outcome: 'UNKNOWN', errorMessage: 'Invalid or empty JSON response from TDF (HTTP ' + res.status + ')', rawResponse: res.body };
    }
    
    if (res.status >= 200 && res.status < 300) {
      if (data.result === 'Error') {
        return { outcome: 'CONFIRMED_REJECTED', errorCode: data.errorType, errorMessage: data.errorMessage, requestId: data.requestId, rawResponse: res.body };
      }
      if (data.error || data.errorCode) {
        return { outcome: 'CONFIRMED_REJECTED', errorCode: data.errorCode, errorMessage: data.message || data.errorMessage, rawResponse: res.body };
      }
      var confNum = data.confirmationNumber || data.ConfirmationNumber || (typeof data.data === 'string' ? data.data : null);
      if (confNum) {
        return { outcome: 'CONFIRMED_ACCEPTED', confirmationNumber: confNum, requestId: data.requestId, rawResponse: res.body };
      }
      return { outcome: 'UNKNOWN', errorMessage: 'HTTP 200 received but confirmation number missing', rawResponse: res.body };
    } else if (res.status === 400) {
      return { outcome: 'CONFIRMED_REJECTED', errorCode: data.errorType || data.errorCode, errorMessage: data.errorMessage || data.message, requestId: data.requestId, rawResponse: res.body };
    } else {
      return { outcome: 'UNKNOWN', errorMessage: 'TDF server returned HTTP ' + res.status, rawResponse: res.body };
    }
  },
  
  validateCard: function(config, cardNumber) {
    var payload = { cardNumber: cardNumber };
    var res = this._request(config, 'post', '/Validate', payload);
    if (!res) return { valid: false, errorMessage: 'Network error', rawResponse: null };
    var data = this._parseResponse(res);
    if (!data) return { valid: false, errorMessage: 'Invalid JSON', rawResponse: res.body };
    
    var obj = Array.isArray(data) ? data[0] : data;
    if (res.status === 200 && (!obj.error && !obj.errorCode)) {
      return { valid: true, rawResponse: res.body };
    }
    return { valid: false, errorCode: obj.errorCode, errorMessage: obj.message, rawResponse: res.body };
  },
  
  getGrantDetails: function(config, confirmationNumber) {
    var res = this._request(config, 'get', '/Grant/Details/' + encodeURIComponent(confirmationNumber), null);
    if (!res) return { found: false, errorMessage: 'Network error', rawResponse: null };
    if (res.status === 404) return { found: false, rawResponse: res.body };
    
    var data = this._parseResponse(res);
    if (res.status >= 200 && res.status < 300 && data) {
      if (data.result === 'Error') {
        return { found: true, status: 'Error', details: data, rawResponse: res.body };
      }
      return { found: true, status: data.status || 'OK', details: data, rawResponse: res.body };
    }
    return { found: false, rawResponse: res.body };
  },
  
  cancelGrant: function(config, confirmationNumber) {
    var payload = { confirmationNumber: confirmationNumber };
    var res = this._request(config, 'put', '/Cancel', payload);
    if (!res) return { outcome: 'UNKNOWN', errorMessage: 'Network error', rawResponse: null };
    var data = this._parseResponse(res);
    
    if (res.status >= 200 && res.status < 300) {
      var obj = Array.isArray(data) ? data[0] : data;
      if (obj && (obj.error || obj.errorCode)) {
        return { outcome: 'ERROR', errorCode: obj.errorCode, errorMessage: obj.message, rawResponse: res.body };
      }
      return { outcome: 'SUCCESS', rawResponse: res.body };
    }
    return { outcome: 'ERROR', rawResponse: res.body };
  }
};

/**
 * 3. createDafGrant doPost Handler
 * Processes grant recommendation, logs to TDF_Transactions, calls TDF API
 * @param {Object} data - Post request payload
 * @returns {Object} Response object
 */
function createDafGrant(data) {
  try {
    var campaignId = data.campaignId;
    var amount = parseFloat(data.amount);
    var cardNumber = data.cardNumber;
    var donorName = data.donorName;
    var email = data.email;
    var turnstileToken = data.turnstileToken;
    var submissionId = data.submissionId;
    
    if (!campaignId || isNaN(amount) || amount <= 0 || amount > 100000 || !cardNumber || !donorName || !email || !submissionId) {
      return { status: 'error', outcome: 'INVALID_INPUT', message: 'Invalid or missing required fields' };
    }
    
    // Check max 2 decimal places
    if (Math.round(amount * 100) / 100 !== amount) {
      return { status: 'error', outcome: 'INVALID_INPUT', message: 'Amount cannot have more than 2 decimal places' };
    }
    
    if (typeof verifyTurnstile === 'function' && turnstileToken) {
      var tsResult = verifyTurnstile(turnstileToken);
      if (!tsResult || !tsResult.success) {
        return { status: 'error', outcome: 'BOT_CHECK_FAILED', message: 'Security verification failed. Please refresh and try again.' };
      }
    }
    
    var campaignRow = getCampaignRow(campaignId);
    if (!campaignRow) return { status: 'error', outcome: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found' };
    var campStatus = String(campaignRow[2] || '').trim();
    if (campStatus !== 'Active') return { status: 'error', outcome: 'CAMPAIGN_INACTIVE', message: 'Campaign is not active' };
    var campaignName = String(campaignRow[1] || '').trim();
    
    var tdfConfig = getTdfConfig_(campaignId);
    if (!tdfConfig.enabled) {
      return { status: 'error', outcome: 'CONFIG_FAILURE', message: 'The Donors Fund service is temporarily unavailable for this campaign (' + (tdfConfig.error || 'not enabled') + ').' };
    }
    
    var designation = campaignName + ' - Notzer Chesed';
    
    var campSheetId = String(campaignRow[3] || '').trim();
    if (!campSheetId) return { status: 'error', outcome: 'SHEET_NOT_FOUND', message: 'Campaign sheet not provisioned' };
    var campSS = SpreadsheetApp.openById(campSheetId);
    var tdfSheet = campSS.getSheetByName('TDF_Transactions');
    if (!tdfSheet) {
      tdfSheet = campSS.insertSheet('TDF_Transactions');
      tdfSheet.getRange('A1:S1').setValues([[
        'Created_At', 'Transaction_ID', 'Submission_ID', 'Campaign_ID', 'Amount', 'Donor_Name', 'Email', 'Method', 'TDF_Status', 'Card_Last4', 'Designation', 'TDF_Request_ID', 'TDF_Confirmation_Number', 'TDF_Submitted_At', 'Completed_At', 'Reconciled_At', 'Last_Checked_At', 'Error', 'Pledge_ID'
      ]]);
      formatHeaderRow_(tdfSheet, 'A1:S1');
      tdfSheet.getRange('E2:E1000').setNumberFormat('$#,##0.00');
    } else if (tdfSheet.getLastColumn() < 19) {
      tdfSheet.getRange('S1').setValue('Pledge_ID');
      tdfSheet.getRange('S1').setFontWeight('bold');
    }
    
    var lock = LockService.getScriptLock();
    var locked = lock.tryLock(10000);
    if (!locked) return { status: 'error', outcome: 'SYSTEM_BUSY', message: 'System busy, please try again in a moment.' };
    
    var lastRow = tdfSheet.getLastRow();
    var existingRowIdx = -1;
    var existingStatus = '';
    var existingConf = '';
    
    if (lastRow >= 2) {
      var existingData = tdfSheet.getRange(2, 1, lastRow - 1, 13).getValues();
      for (var i = 0; i < existingData.length; i++) {
        if (String(existingData[i][2]) === submissionId) {
          existingRowIdx = i + 2;
          existingStatus = String(existingData[i][8] || '');
          existingConf = String(existingData[i][12] || '');
          break;
        }
      }
    }
    
    if (existingRowIdx !== -1) {
      lock.releaseLock();
      if (existingStatus === 'SUBMIT_FAILED') {
        return { status: 'error', outcome: 'SUBMIT_FAILED', message: 'This submission previously failed. Please try again with a new submission ID.' };
      }
      return { 
        status: 'success', 
        outcome: existingStatus, 
        message: 'Submission already processed or in progress', 
        confirmationNumber: existingConf 
      };
    }
    
    var now = new Date();
    var transactionId = 'TDF-' + Utilities.formatDate(now, 'America/New_York', 'yyyyMMdd') + '-' + Utilities.getUuid().substring(0, 8);
    var maskCard = '****' + String(cardNumber).replace(/[^0-9]/g, '').slice(-4);
    
    var newRow = [
      now,                  // 1: Created_At
      transactionId,        // 2: Transaction_ID
      submissionId,         // 3: Submission_ID
      campaignId,           // 4: Campaign_ID
      amount,               // 5: Amount
      donorName,            // 6: Donor_Name
      email,                // 7: Email
      'DAF - The Donors Fund', // 8: Method
      'SUBMITTING',         // 9: TDF_Status
      maskCard,             // 10: Card_Last4
      designation,          // 11: Designation
      '',                   // 12: TDF_Request_ID
      '',                   // 13: TDF_Confirmation_Number
      '',                   // 14: TDF_Submitted_At
      '',                   // 15: Completed_At
      '',                   // 16: Reconciled_At
      '',                   // 17: Last_Checked_At
      '',                   // 18: Error
      ''                    // 19: Pledge_ID
    ];
    
    tdfSheet.appendRow(newRow);
    var rowToUpdate = tdfSheet.getLastRow();
    lock.releaseLock();
    
    var tdfParams = {
      donorName: donorName,
      email: email,
      cardNumber: cardNumber,
      amount: amount,
      designation: designation
    };
    
    var result = TdfClient_.createGrant(tdfConfig, tdfParams);
    
    var updateNow = new Date();
    tdfSheet.getRange(rowToUpdate, 17).setValue(updateNow); // Last_Checked_At
    
    if (result.outcome === 'CONFIRMED_ACCEPTED') {
      tdfSheet.getRange(rowToUpdate, 9).setValue('TDF_SUBMITTED');
      tdfSheet.getRange(rowToUpdate, 12).setValue(result.requestId || '');
      tdfSheet.getRange(rowToUpdate, 13).setValue(result.confirmationNumber || '');
      tdfSheet.getRange(rowToUpdate, 14).setValue(updateNow);

      // ── Unify into Core Campaign Sheets (Customers, Pledges, Transactions) ──
      var pledgeId = '';
      try {
        var customerId = 'ONLINE-' + Utilities.formatDate(now, 'America/New_York', 'yyyyMMddHHmmss');
        var fName = data.firstName || '';
        var lName = data.lastName || '';
        if (!fName && donorName) {
          var nameParts = donorName.trim().split(/\s+/);
          fName = nameParts[0] || '';
          lName = nameParts.slice(1).join(' ') || '';
        }

        // 1. Log Customer
        logCustomerMaster(campSS, customerId, {
          firstName: fName,
          lastName: lName,
          email: email,
          phone: data.phone || '',
          street: data.street || '',
          city: data.city || '',
          state: data.state || '',
          zip: data.zip || ''
        });

        // 2. Log Pledge (sequential PLG-XXXXXX, updates donor wall and campaign totals)
        var pledgeData = {
          amount: amount,
          firstName: fName,
          lastName: lName,
          displayName: data.displayName || donorName,
          memo: data.memo || data.wallMemo || '',
          anonymous: !!data.anonymous,
          teams: data.team || data.teams || '',
          method: 'DAF - The Donors Fund',
          notes: 'TDF Confirmation: ' + (result.confirmationNumber || '') + (result.requestId ? (' (Req: ' + result.requestId + ')') : '')
        };
        pledgeId = logPledgeMaster(campSS, pledgeData, customerId, 'Processed', '', campaignId);

        // 3. Log Transaction
        var paymentResult = {
          xRefNum: result.confirmationNumber || transactionId,
          xResult: 'Approved',
          xMaskedCardNumber: maskCard,
          xCardType: 'TDF Giving Card'
        };
        logTransactionMaster(campSS, pledgeId, customerId, donorName, amount, paymentResult, '1', 0);

        // 4. Link Pledge_ID back into TDF_Transactions
        if (tdfSheet.getLastColumn() >= 19) {
          tdfSheet.getRange(rowToUpdate, 19).setValue(pledgeId || '');
        }
      } catch (syncErr) {
        Logger.log('[TDF] Error syncing confirmed grant to core sheets: ' + syncErr.toString());
      }

      return { 
        status: 'success', 
        outcome: result.outcome, 
        confirmationNumber: result.confirmationNumber,
        pledgeId: pledgeId,
        message: 'Grant recommendation submitted successfully!'
      };
    } else if (result.outcome === 'CONFIRMED_REJECTED') {
      tdfSheet.getRange(rowToUpdate, 9).setValue('SUBMIT_FAILED');
      tdfSheet.getRange(rowToUpdate, 12).setValue(result.requestId || '');
      tdfSheet.getRange(rowToUpdate, 18).setValue(result.errorMessage || '');
      return { 
        status: 'error', 
        outcome: result.outcome, 
        message: result.errorMessage || 'The Donors Fund rejected the card or grant request.'
      };
    } else if (result.outcome === 'CONFIG_FAILURE') {
      tdfSheet.getRange(rowToUpdate, 9).setValue('CONFIG_FAILURE');
      tdfSheet.getRange(rowToUpdate, 18).setValue(result.errorMessage || '');
      return { 
        status: 'error', 
        outcome: result.outcome, 
        message: 'The Donors Fund service is temporarily unavailable. Please try again later or donate directly.' 
      };
    } else {
      tdfSheet.getRange(rowToUpdate, 9).setValue('OUTCOME_UNKNOWN');
      tdfSheet.getRange(rowToUpdate, 18).setValue(result.errorMessage || '');
      return { 
        status: 'error', 
        outcome: 'UNKNOWN', 
        message: 'We could not confirm whether your grant recommendation was received. Please do NOT submit again. We will verify with The Donors Fund and follow up by email.' 
      };
    }
    
  } catch (err) {
    Logger.log('createDafGrant error: ' + err.toString());
    return { status: 'error', outcome: 'SYSTEM_ERROR', message: 'Internal server error: ' + err.toString() };
  }
}

/**
 * 4. getDafSubmissionStatus doGet Handler
 * Opaque, safe recovery endpoint for browser reload.
 * Looks up submission by submissionId only.
 * Returns only { found, status, confirmationNumber }.
 * @param {Object} params - Query parameters
 * @returns {Object}
 */
function getDafSubmissionStatus(params) {
  try {
    var submissionId = params.submissionId;
    var campaignId = params.campaignId;
    
    if (!submissionId || !campaignId) {
      return { status: 'error', message: 'Missing submissionId or campaignId' };
    }
    
    var campaignRow = getCampaignRow(campaignId);
    if (!campaignRow) return { found: false, message: 'Campaign not found' };
    
    var campSheetId = String(campaignRow[3] || '').trim();
    if (!campSheetId) return { found: false, message: 'Campaign sheet not found' };
    
    var campSS = SpreadsheetApp.openById(campSheetId);
    var tdfSheet = campSS.getSheetByName('TDF_Transactions');
    if (!tdfSheet) return { found: false, message: 'TDF_Transactions tab not found' };
    
    var lastRow = tdfSheet.getLastRow();
    if (lastRow < 2) return { found: false };
    
    var data = tdfSheet.getRange(2, 1, lastRow - 1, 13).getValues();
    
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][2]) === submissionId) {
        return {
          found: true,
          status: String(data[i][8] || ''),
          confirmationNumber: String(data[i][12] || '')
        };
      }
    }
    
    return { found: false };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * 5. reconcileTdfPending_
 * Admin reconciliation runner (batch limited to 25 items)
 * Checks pending rows with TDF confirmation numbers and updates status
 * @returns {Object}
 */
function reconcileTdfPending_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    var ss = SpreadsheetApp.openById(masterSheetId);
    var campSheet = ss.getSheetByName('Campaigns');
    var lastRow = campSheet.getLastRow();
    if (lastRow < 2) return { status: 'error', message: 'No campaigns found' };
    
    var campaigns = campSheet.getRange(2, 1, lastRow - 1, 4).getValues();
    
    var actionsTaken = [];
    var processedCount = 0;
    
    for (var c = 0; c < campaigns.length; c++) {
      if (processedCount >= 25) break;
      
      var campId = String(campaigns[c][0]).trim();
      var sheetId = String(campaigns[c][3]).trim();
      if (!campId || !sheetId) continue;
      
      var tdfConfig = getTdfConfig_(campId);
      if (!tdfConfig.enabled) continue;
      
      try {
        var campSS = SpreadsheetApp.openById(sheetId);
        var tdfSheet = campSS.getSheetByName('TDF_Transactions');
        if (!tdfSheet) continue;
        
        var tLast = tdfSheet.getLastRow();
        if (tLast < 2) continue;
        
        var tData = tdfSheet.getRange(2, 1, tLast - 1, 13).getValues();
        
        for (var r = 0; r < tData.length; r++) {
          if (processedCount >= 25) break;
          
          var tStatus = String(tData[r][8] || '').trim();
          var confNumber = String(tData[r][12] || '').trim();
          var rowIdx = r + 2;
          
          if (tStatus === 'TDF_SUBMITTED' || tStatus === 'TDF_PENDING') {
            if (confNumber) {
              var details = TdfClient_.getGrantDetails(tdfConfig, confNumber);
              tdfSheet.getRange(rowIdx, 17).setValue(new Date()); // Last_Checked_At
              processedCount++;
              
              if (details.found) {
                if (details.status === 'Error') {
                  tdfSheet.getRange(rowIdx, 9).setValue('MANUAL_REVIEW_REQUIRED');
                  tdfSheet.getRange(rowIdx, 18).setValue(details.details ? JSON.stringify(details.details) : 'Error in details');
                  actionsTaken.push('Row ' + rowIdx + ' (' + campId + '): marked MANUAL_REVIEW_REQUIRED (API Error)');
                } else if (details.status === 'Completed' || details.status === 'Approved') {
                  tdfSheet.getRange(rowIdx, 9).setValue('COMPLETED');
                  tdfSheet.getRange(rowIdx, 15).setValue(new Date()); // Completed_At

                  // Ensure grant is recorded in Pledges and Transactions if not already synced
                  var existingPledgeId = tdfSheet.getLastColumn() >= 19 ? String(tdfSheet.getRange(rowIdx, 19).getValue() || '').trim() : '';
                  if (!existingPledgeId) {
                    try {
                      var recAmount = parseFloat(tData[r][4]) || 0;
                      var recDonorName = String(tData[r][5] || '').trim();
                      var recEmail = String(tData[r][6] || '').trim();
                      var recMaskCard = String(tData[r][9] || '').trim();
                      var recCustId = 'ONLINE-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMddHHmmss');
                      var recParts = recDonorName.split(/\s+/);
                      var recFName = recParts[0] || '';
                      var recLName = recParts.slice(1).join(' ') || '';

                      logCustomerMaster(campSS, recCustId, { firstName: recFName, lastName: recLName, email: recEmail });
                      var recPledgeId = logPledgeMaster(campSS, {
                        amount: recAmount,
                        firstName: recFName,
                        lastName: recLName,
                        displayName: recDonorName,
                        method: 'DAF - The Donors Fund',
                        notes: 'TDF Confirmation: ' + confNumber + ' (Reconciled)'
                      }, recCustId, 'Processed', '', campId);

                      logTransactionMaster(campSS, recPledgeId, recCustId, recDonorName, recAmount, {
                        xRefNum: confNumber,
                        xResult: 'Approved',
                        xMaskedCardNumber: recMaskCard,
                        xCardType: 'TDF Giving Card'
                      }, '1', 0);

                      if (tdfSheet.getLastColumn() >= 19) {
                        tdfSheet.getRange(rowIdx, 19).setValue(recPledgeId || '');
                      }
                      actionsTaken.push('Row ' + rowIdx + ' (' + campId + '): synced to Pledges as ' + recPledgeId);
                    } catch (recSyncErr) {
                      Logger.log('Reconcile sync error: ' + recSyncErr.toString());
                    }
                  }

                  actionsTaken.push('Row ' + rowIdx + ' (' + campId + '): marked COMPLETED');
                } else {
                  actionsTaken.push('Row ' + rowIdx + ' (' + campId + '): status ' + details.status);
                }
              } else {
                actionsTaken.push('Row ' + rowIdx + ' (' + campId + '): not found on TDF');
              }
            } else {
              tdfSheet.getRange(rowIdx, 9).setValue('MANUAL_REVIEW_REQUIRED');
              tdfSheet.getRange(rowIdx, 18).setValue('Missing confirmation number');
              actionsTaken.push('Row ' + rowIdx + ' (' + campId + '): marked MANUAL_REVIEW_REQUIRED (Missing confirmation)');
              processedCount++;
            }
          } else if (tStatus === 'OUTCOME_UNKNOWN' || (tStatus === 'SUBMITTING' && !confNumber)) {
            tdfSheet.getRange(rowIdx, 9).setValue('MANUAL_REVIEW_REQUIRED');
            tdfSheet.getRange(rowIdx, 18).setValue('Stuck in ' + tStatus);
            actionsTaken.push('Row ' + rowIdx + ' (' + campId + '): marked MANUAL_REVIEW_REQUIRED (' + tStatus + ')');
            processedCount++;
          }
        }
      } catch (e) {
        Logger.log('Error processing campaign ' + campId + ': ' + e.toString());
      }
    }
    
    return { status: 'success', processed: processedCount, actions: actionsTaken };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * 6. Safe admin diagnostic probe for TDF integration.
 * Does not charge or create real grants.
 * @param {string} campaignId - Campaign slug
 * @returns {Object} Diagnostic result
 */
function testTdfIntegration_(campaignId) {
  try {
    var campId = campaignId || 'ksy';
    var tdfConfig = getTdfConfig_(campId);
    
    var summary = {
      campaignId: campId,
      configEnabled: tdfConfig.enabled,
      configError: tdfConfig.error || null,
      environment: tdfConfig.environment || null,
      baseUrl: tdfConfig.baseUrl || null,
      charityAccountNumber: tdfConfig.charityAccountNumber || null,
      hasApiKey: !!(tdfConfig && tdfConfig.apiKey),
      hasValidationToken: !!(tdfConfig && tdfConfig.validationToken)
    };
    
    if (!tdfConfig.enabled) {
      return { status: 'error', outcome: 'CONFIG_FAILURE', summary: summary };
    }
    
    // 1. Live probe: GET /Charity/Account-Numbers/113049033
    var lookupRes = TdfClient_._request(tdfConfig, 'get', '/Charity/Account-Numbers/113049033', null);
    summary.charityLookup = {
      httpStatus: lookupRes ? lookupRes.status : null,
      parsed: lookupRes ? TdfClient_._parseResponse(lookupRes) : null
    };
    
    // 2. Live probe: POST /Validate with dummy card
    var valRes = TdfClient_.validateCard(tdfConfig, '1234567890123456');
    summary.cardValidation = {
      valid: valRes.valid,
      errorCode: valRes.errorCode || null,
      errorMessage: valRes.errorMessage || null,
      rawResponse: valRes.rawResponse ? TdfClient_._parseResponse({ body: valRes.rawResponse }) : null
    };
    
    // 3. Inspect campaign sheet tabs and live rows
    var campRow = getCampaignRow(campId);
    var campSheetId = campRow ? String(campRow[3] || '').trim() : '';
    if (campSheetId) {
      try {
        var campSS = SpreadsheetApp.openById(campSheetId);
        summary.tabs = campSS.getSheets().map(function(s) { return s.getName(); });
        
        var tdfSheet = campSS.getSheetByName('TDF_Transactions');
        if (tdfSheet && tdfSheet.getLastRow() >= 1) {
          summary.tdfTransactions = {
            rowCount: tdfSheet.getLastRow(),
            headers: tdfSheet.getRange(1, 1, 1, tdfSheet.getLastColumn()).getValues()[0],
            lastRows: tdfSheet.getLastRow() >= 2 ? tdfSheet.getRange(Math.max(2, tdfSheet.getLastRow() - 5), 1, Math.min(6, tdfSheet.getLastRow() - 1), tdfSheet.getLastColumn()).getDisplayValues() : []
          };
        }
        
        var linkClicksSheet = campSS.getSheetByName('LinkClicks');
        if (linkClicksSheet && linkClicksSheet.getLastRow() >= 1) {
          summary.linkClicks = {
            rowCount: linkClicksSheet.getLastRow(),
            headers: linkClicksSheet.getRange(1, 1, 1, linkClicksSheet.getLastColumn()).getValues()[0],
            lastRows: linkClicksSheet.getLastRow() >= 2 ? linkClicksSheet.getRange(Math.max(2, linkClicksSheet.getLastRow() - 5), 1, Math.min(6, linkClicksSheet.getLastRow() - 1), linkClicksSheet.getLastColumn()).getDisplayValues() : []
          };
        }
        
        var pledgesSheet = campSS.getSheetByName('Pledges');
        if (pledgesSheet && pledgesSheet.getLastRow() >= 1) {
          summary.pledges = {
            rowCount: pledgesSheet.getLastRow(),
            headers: pledgesSheet.getRange(1, 1, 1, pledgesSheet.getLastColumn()).getValues()[0],
            lastRows: pledgesSheet.getLastRow() >= 2 ? pledgesSheet.getRange(Math.max(2, pledgesSheet.getLastRow() - 5), 1, Math.min(6, pledgesSheet.getLastRow() - 1), pledgesSheet.getLastColumn()).getDisplayValues() : []
          };
        }

        var txSheet = campSS.getSheetByName('Transactions');
        if (txSheet && txSheet.getLastRow() >= 1) {
          summary.transactions = {
            rowCount: txSheet.getLastRow(),
            headers: txSheet.getRange(1, 1, 1, txSheet.getLastColumn()).getValues()[0],
            lastRows: txSheet.getLastRow() >= 2 ? txSheet.getRange(Math.max(2, txSheet.getLastRow() - 5), 1, Math.min(6, txSheet.getLastRow() - 1), txSheet.getLastColumn()).getDisplayValues() : []
          };
        }
      } catch (sheetErr) {
        summary.sheetError = sheetErr.toString();
      }
    }
    
    return { status: 'success', summary: summary };
  } catch (e) {
    return { status: 'error', message: 'Diagnostic probe error: ' + e.toString() };
  }
}


// ============================================================
// GITHUB PAGES — PUBLISH CAMPAIGN PAGES VIA CONTENTS API
// ============================================================

/**
 * One-time setup: store GitHub credentials in Script Properties.
 * Call via doGet: ?action=setupGithub&adminKey=5786&token=...&owner=...&repo=...
 */
function setupGitHubProperties_(token, owner, repo) {
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    'GITHUB_TOKEN': token,
    'GITHUB_OWNER': owner || '43334333',
    'GITHUB_REPO': repo || 'notzer-org-website'
  });
  return { status: 'success', message: 'GitHub properties configured.' };
}

/**
 * Publish campaign HTML pages to GitHub via the Contents API.
 * Creates or updates files in the repo, which auto-deploys via GitHub Pages.
 *
 * @param {Object} data - { campaignId, pages: { donation?, admin?, wall?, bookkeeper? } }
 * @returns {{ status: string, published?: string[], errors?: string[], message?: string }}
 */
function publishPagesToGitHub_(data) {
  try {
    var campaignId = String(data.campaignId || data.id || '').trim();
    if (!campaignId) {
      return { status: 'error', message: 'Campaign ID is required.' };
    }

    // Automatically persist pageConfig, goalAmount, managerEmail and update pageUrl to /campaigns/<slug>/ if donation page is published
    var pages = data.pages || {};
    var updatePayload = {};
    var pageConfig = data.pageConfig || data.config;
    if (pageConfig) updatePayload.pageConfig = pageConfig;
    if (data.goalAmount !== undefined) updatePayload.goalAmount = data.goalAmount;
    else if (pageConfig && pageConfig.goalAmount !== undefined) updatePayload.goalAmount = pageConfig.goalAmount;
    if (data.managerEmail !== undefined) updatePayload.managerEmail = data.managerEmail;
    else if (pageConfig && pageConfig.managerEmail !== undefined) updatePayload.managerEmail = pageConfig.managerEmail;
    if (pages.donation) updatePayload.pageUrl = '/campaigns/' + campaignId + '/';
    if (Object.keys(updatePayload).length > 0) {
      try {
        updateCampaign(campaignId, updatePayload);
      } catch (cfgErr) {
        Logger.log('[PUBLISH] Note: could not update campaign in sheet: ' + cfgErr.toString());
      }
    }
    if (!pages.donation && !pages.admin && !pages.wall && !pages.bookkeeper) {
      return { status: 'error', message: 'No page content provided. Include at least one of: donation, admin, wall, bookkeeper.' };
    }

    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty('GITHUB_TOKEN');
    var owner = props.getProperty('GITHUB_OWNER') || '43334333';
    var repo = props.getProperty('GITHUB_REPO') || 'notzer-org-website';

    if (!token) {
      return { status: 'error', message: 'GitHub token not configured. Run setupGitHubProperties_ first.' };
    }

    // Map page types to file paths in the repo
    var fileMap = {
      donation:   'campaigns/' + campaignId + '/index.html',
      admin:      'admin/' + campaignId + '/index.html',
      wall:       'wall/' + campaignId + '/index.html',
      bookkeeper: 'admin/' + campaignId + '/bookkeeper.html'
    };

    var published = [];
    var errors = [];
    var baseUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/';
    var commitMsg = 'publish campaign pages: ' + campaignId;

    var pageTypes = ['donation', 'admin', 'wall', 'bookkeeper'];
    for (var i = 0; i < pageTypes.length; i++) {
      var pageType = pageTypes[i];
      var content = pages[pageType];
      if (!content) continue;

      var filePath = fileMap[pageType];
      Logger.log('[PUBLISH] Publishing ' + pageType + ' -> ' + filePath);

      try {
        // Step 1: Check if file already exists (to get SHA for update)
        var existingSha = null;
        try {
          var getResp = UrlFetchApp.fetch(baseUrl + filePath, {
            method: 'GET',
            headers: {
              'Authorization': 'Bearer ' + token,
              'Accept': 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28'
            },
            muteHttpExceptions: true
          });
          if (getResp.getResponseCode() === 200) {
            var fileData = JSON.parse(getResp.getContentText());
            existingSha = fileData.sha;
          }
        } catch (getErr) {
          // File doesn't exist yet — that's fine, we'll create it
          Logger.log('[PUBLISH] File not found (will create): ' + filePath);
        }

        // Step 2: Create or update the file
        var payload = {
          message: commitMsg,
          content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
          branch: 'main'
        };
        if (existingSha) {
          payload.sha = existingSha;
        }

        var putResp = UrlFetchApp.fetch(baseUrl + filePath, {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        var putStatus = putResp.getResponseCode();
        if (putStatus === 200 || putStatus === 201) {
          published.push(filePath);
          Logger.log('[PUBLISH] Successfully published: ' + filePath);
        } else {
          var errBody = putResp.getContentText();
          Logger.log('[PUBLISH] Failed to publish ' + filePath + ': HTTP ' + putStatus + ' - ' + errBody);
          errors.push(pageType + ': HTTP ' + putStatus + ' - ' + (JSON.parse(errBody).message || errBody).substring(0, 200));
        }
      } catch (fileErr) {
        Logger.log('[PUBLISH] Error publishing ' + filePath + ': ' + fileErr.toString());
        errors.push(pageType + ': ' + fileErr.toString().substring(0, 200));
      }
    }

    if (published.length === 0 && errors.length > 0) {
      return { status: 'error', message: 'All pages failed to publish.', errors: errors };
    }

    return {
      status: 'success',
      message: 'Published ' + published.length + ' page(s) to GitHub. Site will update in ~30 seconds.',
      published: published,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (err) {
    Logger.log('[PUBLISH] publishPagesToGitHub_ error: ' + err.toString());
    return { status: 'error', message: 'Failed to publish pages: ' + err.toString() };
  }
}

// ============================================================
// NOTIFY CAMPAIGN MANAGER VIA EMAIL
// ============================================================
/**
 * Notify the campaign manager by email that the campaign pages are ready.
 * Requests a test transaction and includes all relevant links.
 * @param {Object} data - { campaignId: string, managerEmail?: string }
 * @param {Object} user - Authenticated user
 * @returns {{ status: string, message?: string }}
 */
function notifyCampaignManager(data, user) {
  try {
    var campaignId = String((data && (data.campaignId || data.id)) || '').trim();
    if (!campaignId) {
      return { status: 'error', message: 'Campaign ID is required.' };
    }

    if (!checkPermission(user, 'campaign_manager', campaignId)) {
      return { status: 'error', message: 'Insufficient permissions.' };
    }

    var props = PropertiesService.getScriptProperties();
    var masterSheetId = props.getProperty('MASTER_SHEET_ID');
    if (!masterSheetId) {
      return { status: 'error', message: 'Master Sheet ID not configured.' };
    }

    var ss = SpreadsheetApp.openById(masterSheetId);
    var sheet = ss.getSheetByName('Campaigns');
    if (!sheet || sheet.getLastRow() < 2) {
      return { status: 'error', message: 'Campaigns sheet not found.' };
    }

    var lastRow = sheet.getLastRow();
    var numCols = Math.max(28, sheet.getLastColumn());
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

    var targetRow = -1;
    var rowData = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim().toLowerCase() === campaignId.toLowerCase()) {
        targetRow = i + 2;
        rowData = rows[i];
        break;
      }
    }

    if (!rowData) {
      return { status: 'error', message: 'Campaign "' + campaignId + '" not found.' };
    }

    var campaignName = String(rowData[1] || campaignId).trim();
    var sheetId = String(rowData[3] || '').trim();
    var rawPageUrl = getStandardPageUrl_(campaignId, rowData[13]);
    var rawAdminUrl = String(rowData[14] || ('/admin/' + campaignId + '/')).trim();
    var rawWallUrl = String(rowData[15] || ('/wall/' + campaignId + '/')).trim();
    var wallKey = String(rowData[21] || '').trim();
    var recipientEmail = String((data && data.managerEmail) || rowData[27] || '').trim();

    if (!recipientEmail) {
      return { status: 'error', message: 'No manager email found or provided for this campaign.' };
    }

    // Update manager email in Master Sheet and dedicated sheet if newly provided
    if (data && data.managerEmail && String(data.managerEmail).trim() !== String(rowData[27] || '').trim()) {
      updateCampaign(campaignId, { managerEmail: recipientEmail });
    }

    // Construct full URLs
    var baseUrl = 'https://www.notzer.org';
    var pageUrl = baseUrl + (rawPageUrl.indexOf('/') === 0 ? rawPageUrl : '/' + rawPageUrl);
    var adminUrl = baseUrl + (rawAdminUrl.indexOf('/') === 0 ? rawAdminUrl : '/' + rawAdminUrl);
    var keyQuery = wallKey ? ('?key=' + encodeURIComponent(wallKey)) : '';
    var wallUrl = baseUrl + (rawWallUrl.indexOf('/') === 0 ? rawWallUrl : '/' + rawWallUrl) + keyQuery;
    var bookkeeperUrl = baseUrl + '/admin/' + campaignId + '/bookkeeper.html' + keyQuery;
    var sheetUrl = sheetId ? ('https://docs.google.com/spreadsheets/d/' + sheetId + '/edit') : '';

    var subject = 'Your Notzer Chesed Campaign is Ready: ' + campaignName + ' — Please Run a Test Transaction';

    var htmlBody = '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f9f9fb;color:#222;border-radius:12px;border:1px solid #e0e0e6;">' +
      '<div style="text-align:center;margin-bottom:20px;">' +
        '<h2 style="margin:0 0 6px;color:#1a1a2e;font-size:1.4rem;">Notzer Chesed Campaign Ready</h2>' +
        '<p style="margin:0;font-size:0.95rem;color:#666;">' + escapeHtmlGas_(campaignName) + ' (' + escapeHtmlGas_(campaignId) + ')</p>' +
      '</div>' +
      '<div style="background:#ffffff;padding:24px;border-radius:8px;border:1px solid #e8e8ed;line-height:1.6;">' +
        '<p>Shalom,</p>' +
        '<p>We are pleased to let you know that your campaign page and dedicated administrative tools are published and ready for launch on the Notzer Chesed platform.</p>' +
        '<div style="background:#f0f7ff;border-left:4px solid #3b82f6;padding:12px 16px;margin:18px 0;border-radius:0 6px 6px 0;">' +
          '<strong style="color:#1d4ed8;">Action Requested: Please Run a Test Transaction</strong><br>' +
          '<span style="font-size:0.92rem;color:#334155;">Please visit the live donation page below and complete a small test donation (e.g. $1.00 or $18.00). This confirms end-to-end payment gateway processing, automated receipt issuance, and live donor wall recording.</span>' +
        '</div>' +
        '<h4 style="margin:20px 0 10px;color:#333;border-bottom:1px solid #eee;padding-bottom:6px;">Your Campaign Links</h4>' +
        '<ul style="list-style:none;padding:0;margin:0 0 20px;">' +
          '<li style="margin-bottom:10px;">🌐 <strong>Public Donation Page:</strong><br><a href="' + pageUrl + '" target="_blank" style="color:#2563eb;word-break:break-all;">' + pageUrl + '</a></li>' +
          '<li style="margin-bottom:10px;">🛠️ <strong>Campaign Admin Console:</strong><br><a href="' + adminUrl + '" target="_blank" style="color:#2563eb;word-break:break-all;">' + adminUrl + '</a></li>' +
          '<li style="margin-bottom:10px;">🏆 <strong>Live Donor Wall:</strong><br><a href="' + wallUrl + '" target="_blank" style="color:#2563eb;word-break:break-all;">' + wallUrl + '</a></li>' +
          '<li style="margin-bottom:10px;">📖 <strong>Bookkeeper Portal:</strong><br><a href="' + bookkeeperUrl + '" target="_blank" style="color:#2563eb;word-break:break-all;">' + bookkeeperUrl + '</a></li>' +
          (sheetUrl ? '<li style="margin-bottom:10px;">📊 <strong>Google Sheet Database:</strong><br><a href="' + sheetUrl + '" target="_blank" style="color:#2563eb;word-break:break-all;">' + sheetUrl + '</a></li>' : '') +
        '</ul>' +
        (wallKey ? '<p style="font-size:0.85rem;color:#64748b;background:#f8fafc;padding:8px 12px;border-radius:6px;"><strong>Note:</strong> Your donor wall and bookkeeper links include your secure access key. Keep this key safe.</p>' : '') +
        '<p style="margin-top:24px;border-top:1px solid #eee;padding-top:16px;">If you have any questions, notice any adjustments needed, or run into any issues with your test transaction, please reply directly or email us at <a href="mailto:admin@notzer.org" style="color:#2563eb;font-weight:600;">admin@notzer.org</a>.</p>' +
        '<p style="margin-top:16px;color:#475569;">B\'hatzlacha,<br><strong>Notzer Chesed Administration</strong><br><a href="https://www.notzer.org" style="color:#64748b;font-size:0.85rem;">www.notzer.org</a></p>' +
      '</div>' +
    '</div>';

    MailApp.sendEmail({
      to: recipientEmail,
      cc: 'admin@notzer.org',
      subject: subject,
      htmlBody: htmlBody
    });

    Logger.log('[NOTIFY] Sent campaign ready email for ' + campaignId + ' to ' + recipientEmail);
    return { status: 'success', message: 'Campaign notification sent to ' + recipientEmail + ' (copy sent to admin@notzer.org).' };
  } catch (err) {
    Logger.log('[NOTIFY] notifyCampaignManager error: ' + err.toString());
    return { status: 'error', message: 'Failed to send notification email: ' + err.toString() };
  }
}

function escapeHtmlGas_(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
