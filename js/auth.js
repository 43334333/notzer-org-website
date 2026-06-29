// ═══════════════════════════════════════════════════════════
// auth.js — Shared Dual-Auth Module
// Loaded by: admin/login.html, admin/index.html, admin/*/index.html
//
// Supports two authentication methods:
//   1. Google Sign-In (via Google Identity Services)
//   2. Email OTP (6-digit code sent to authorized email)
//
// Both methods are validated server-side by MasterCode.gs.
// ═══════════════════════════════════════════════════════════

const AUTH_CONFIG = {
    masterScriptUrl: '{{MASTER_APPS_SCRIPT_URL}}',
    googleClientId: '{{GOOGLE_CLIENT_ID}}',
    loginPage: '/admin/login.html',
    sessionKey: 'nc_auth_session',  // sessionStorage key
};

// ── State ──
let _currentUser = null;    // { email, name, role, campaigns, authMethod }
let _authToken = null;      // Google ID token or OTP session token
let _authMethod = null;     // 'google' or 'otp'
let _tokenRefreshTimer = null;  // Timer for Google token refresh

// ═══════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════

/**
 * Initialize auth module. Call on page load.
 * Checks for existing session in sessionStorage, validates with server,
 * and loads Google Identity Services library.
 * @returns {Promise<boolean>} true if user is authenticated
 */
async function initAuth() {
    // 1. Check sessionStorage for existing session
    const stored = sessionStorage.getItem(AUTH_CONFIG.sessionKey);
    if (stored) {
        try {
            const session = JSON.parse(stored);
            _authToken = session.token;
            _authMethod = session.method;
            _currentUser = session.user || null;

            // Validate with server
            const result = await validateWithServer(_authToken, _authMethod);
            if (result.valid) {
                _currentUser = result.user;
                persistSession();

                // Set up token refresh for Google auth
                if (_authMethod === 'google') {
                    scheduleGoogleTokenRefresh();
                }

                return true;
            }

            // Token expired or invalid — clear
            sessionStorage.removeItem(AUTH_CONFIG.sessionKey);
            _authToken = null;
            _authMethod = null;
            _currentUser = null;
        } catch (e) {
            console.warn('auth.js: Failed to parse stored session', e);
            sessionStorage.removeItem(AUTH_CONFIG.sessionKey);
        }
    }

    // 2. Load Google Identity Services library
    await loadGoogleGSI();
    return false;
}

/**
 * Page guard — redirect to login if not authenticated or insufficient role.
 * Call at the top of every protected page.
 * @param {string} requiredRole - 'super_admin' | 'campaign_manager' | 'viewer'
 * @param {string} [campaignId] - Optional campaign-specific access check
 */
async function requireAuth(requiredRole, campaignId) {
    const authenticated = await initAuth();
    if (!authenticated) {
        const redirect = encodeURIComponent(window.location.href);
        window.location.href = AUTH_CONFIG.loginPage + '?redirect=' + redirect;
        return;
    }
    // Check role
    if (!hasRole(_currentUser, requiredRole, campaignId)) {
        showAccessDenied('Insufficient permissions. You need the "' + requiredRole + '" role to access this page.');
    }
}

/**
 * Get auth parameters for API calls.
 * @returns {{ authToken: string, authMethod: string }}
 */
function getAuthParams() {
    return { authToken: _authToken, authMethod: _authMethod };
}

/**
 * Make authenticated GET request to Master Apps Script.
 * @param {string} action - The API action name
 * @param {Object} [params={}] - Additional query parameters
 * @returns {Promise<Object>} Parsed JSON response
 */
async function authGet(action, params = {}) {
    const url = new URL(AUTH_CONFIG.masterScriptUrl);
    url.searchParams.set('action', action);
    url.searchParams.set('authToken', _authToken);
    url.searchParams.set('authMethod', _authMethod);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const resp = await fetch(url.toString());
    if (!resp.ok) {
        throw new Error('API request failed: ' + resp.status);
    }
    return resp.json();
}

/**
 * Make authenticated POST request to Master Apps Script.
 * Uses Content-Type: text/plain;charset=utf-8 to avoid CORS preflight
 * (Apps Script doesn't support OPTIONS requests).
 * @param {string} action - The API action name
 * @param {Object} [data={}] - Request body data
 * @returns {Promise<Object>} Parsed JSON response
 */
async function authPost(action, data = {}) {
    const body = {
        action,
        authToken: _authToken,
        authMethod: _authMethod,
        ...data
    };

    const resp = await fetch(AUTH_CONFIG.masterScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
    });

    if (!resp.ok) {
        throw new Error('API request failed: ' + resp.status);
    }
    return resp.json();
}

/**
 * Get current authenticated user.
 * @returns {{ email: string, name: string, role: string, campaigns: string|string[], authMethod: string } | null}
 */
function getCurrentUser() {
    return _currentUser;
}

/**
 * Sign out — clear session, disable Google auto-select, redirect to login.
 */
function signOut() {
    // Clear refresh timer
    if (_tokenRefreshTimer) {
        clearTimeout(_tokenRefreshTimer);
        _tokenRefreshTimer = null;
    }

    sessionStorage.removeItem(AUTH_CONFIG.sessionKey);

    if (_authMethod === 'google' && typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        google.accounts.id.disableAutoSelect();
    }

    _currentUser = null;
    _authToken = null;
    _authMethod = null;
    window.location.href = AUTH_CONFIG.loginPage;
}

// ═══════════════════════════════════════════════════════════
// Google Sign-In
// ═══════════════════════════════════════════════════════════

/**
 * Initialize Google Sign-In and render the sign-in button.
 * @param {string} containerElementId - DOM element ID to render the button into
 */
function initGoogleSignIn(containerElementId) {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
        console.warn('auth.js: Google Identity Services not loaded yet');
        return;
    }

    google.accounts.id.initialize({
        client_id: AUTH_CONFIG.googleClientId,
        callback: handleGoogleCredential,
        auto_select: false,
    });

    google.accounts.id.renderButton(
        document.getElementById(containerElementId),
        {
            theme: 'filled_black',
            size: 'large',
            shape: 'rectangular',
            width: 320,
        }
    );
}

/**
 * Handle the credential response from Google Sign-In.
 * Validates the ID token with the server, persists session on success.
 * @param {Object} response - Google credential response containing { credential: string }
 */
async function handleGoogleCredential(response) {
    _authToken = response.credential;
    _authMethod = 'google';

    try {
        const result = await validateWithServer(_authToken, _authMethod);
        if (result.valid) {
            _currentUser = result.user;
            persistSession();
            scheduleGoogleTokenRefresh();
            onAuthSuccess();
        } else {
            showAuthError(result.message || 'Account not authorized. Please contact an administrator.');
        }
    } catch (err) {
        showAuthError('Authentication failed. Please try again.');
        console.error('auth.js: Google auth error', err);
    }
}

// ═══════════════════════════════════════════════════════════
// Email OTP
// ═══════════════════════════════════════════════════════════

/**
 * Request an OTP code to be sent to the given email address.
 * @param {string} email - The email address to send the code to
 * @returns {Promise<{ status: string, message: string }>}
 */
async function requestOTP(email) {
    const result = await fetch(AUTH_CONFIG.masterScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'generateOTP', email })
    }).then(r => r.json());
    return result;
}

/**
 * Submit the OTP code for verification.
 * On success, persists the session token and triggers onAuthSuccess.
 * @param {string} email - The email address
 * @param {string} code - The 6-digit OTP code
 * @returns {Promise<{ status: string, sessionToken?: string, expiresAt?: string, user?: Object, message?: string }>}
 */
async function submitOTP(email, code) {
    const result = await fetch(AUTH_CONFIG.masterScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'verifyOTP', email, code })
    }).then(r => r.json());

    if (result.status === 'success') {
        _authToken = result.sessionToken;
        _authMethod = 'otp';
        _currentUser = result.user;
        persistSession();
        onAuthSuccess();
    }
    return result;
}

// ═══════════════════════════════════════════════════════════
// Internal / Private Functions
// ═══════════════════════════════════════════════════════════

/**
 * Persist the current session to sessionStorage.
 */
function persistSession() {
    sessionStorage.setItem(AUTH_CONFIG.sessionKey, JSON.stringify({
        token: _authToken,
        method: _authMethod,
        user: _currentUser,
        timestamp: Date.now()
    }));
}

/**
 * Validate a token with the server by calling the authenticate action.
 * @param {string} token - The auth token (Google ID token or OTP session token)
 * @param {string} method - 'google' or 'otp'
 * @returns {Promise<{ valid: boolean, user?: Object, message?: string }>}
 */
async function validateWithServer(token, method) {
    try {
        const resp = await fetch(AUTH_CONFIG.masterScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'authenticate', method, token })
        });
        return resp.json();
    } catch (err) {
        console.error('auth.js: Server validation failed', err);
        return { valid: false, message: 'Unable to reach authentication server.' };
    }
}

/**
 * Check if a user has the required role, optionally for a specific campaign.
 * Role hierarchy: super_admin > campaign_manager > viewer
 * @param {Object} user - User object with role and campaigns properties
 * @param {string} requiredRole - The minimum required role
 * @param {string} [campaignId] - Optional campaign-specific access check
 * @returns {boolean}
 */
function hasRole(user, requiredRole, campaignId) {
    if (!user || !user.role) return false;
    if (user.role === 'super_admin') return true;

    const roleLevel = { super_admin: 3, campaign_manager: 2, viewer: 1 };
    const userLevel = roleLevel[user.role] || 0;
    const requiredLevel = roleLevel[requiredRole] || 0;

    if (userLevel < requiredLevel) return false;

    // Campaign-specific access check
    if (campaignId && user.campaigns !== '*') {
        const userCampaigns = Array.isArray(user.campaigns)
            ? user.campaigns
            : (user.campaigns || '').split(',').map(c => c.trim());
        return userCampaigns.includes(campaignId);
    }

    return true;
}

/**
 * Called after successful authentication.
 * Checks for a redirect URL in query params and navigates there,
 * otherwise stays on current page.
 * Can be overridden by pages that need custom post-auth behavior.
 */
function onAuthSuccess() {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    if (redirect) {
        window.location.href = decodeURIComponent(redirect);
    }
    // If no redirect, the login page handles showing the success state
}

/**
 * Dynamically load the Google Identity Services library.
 * @returns {Promise<void>}
 */
function loadGoogleGSI() {
    return new Promise((resolve, reject) => {
        // Already loaded
        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
            resolve();
            return;
        }

        // Check if script tag already exists
        const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
        if (existing) {
            existing.addEventListener('load', resolve);
            existing.addEventListener('error', () => reject(new Error('Failed to load GIS')));
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
        document.head.appendChild(script);
    });
}

/**
 * Schedule a Google token refresh before expiry.
 * Google ID tokens expire after ~1 hour. We re-prompt 5 minutes before.
 */
function scheduleGoogleTokenRefresh() {
    if (_tokenRefreshTimer) {
        clearTimeout(_tokenRefreshTimer);
    }

    // Google ID tokens expire in ~3600 seconds (1 hour)
    // Try to decode the token to get the actual expiry
    let expiresInMs = 55 * 60 * 1000; // Default: 55 minutes (5 min before 1h expiry)

    try {
        const payload = JSON.parse(atob(_authToken.split('.')[1]));
        if (payload.exp) {
            const expiresAt = payload.exp * 1000; // Convert to ms
            const now = Date.now();
            const timeUntilExpiry = expiresAt - now;
            // Refresh 5 minutes before expiry, but at least 1 minute from now
            expiresInMs = Math.max(timeUntilExpiry - (5 * 60 * 1000), 60 * 1000);
        }
    } catch (e) {
        console.warn('auth.js: Could not decode token expiry, using default refresh interval');
    }

    _tokenRefreshTimer = setTimeout(() => {
        refreshGoogleToken();
    }, expiresInMs);

    console.log('auth.js: Token refresh scheduled in ' + Math.round(expiresInMs / 60000) + ' minutes');
}

/**
 * Attempt to silently refresh the Google ID token by prompting.
 * If the user has an active Google session, this will return a new token
 * without user interaction via auto-select or One Tap.
 */
function refreshGoogleToken() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
        console.warn('auth.js: Cannot refresh — GIS not loaded');
        return;
    }

    console.log('auth.js: Attempting Google token refresh...');

    google.accounts.id.initialize({
        client_id: AUTH_CONFIG.googleClientId,
        callback: async (response) => {
            _authToken = response.credential;
            const result = await validateWithServer(_authToken, 'google');
            if (result.valid) {
                _currentUser = result.user;
                persistSession();
                scheduleGoogleTokenRefresh();
                console.log('auth.js: Token refreshed successfully');
            } else {
                console.warn('auth.js: Token refresh validation failed, signing out');
                signOut();
            }
        },
        auto_select: true,
    });

    // Prompt for silent re-authentication
    google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            console.warn('auth.js: Silent token refresh not possible, user may need to sign in again');
            // Don't sign out immediately — the token might still be valid for a few more minutes
        }
    });
}

// ═══════════════════════════════════════════════════════════
// UI Helpers (can be overridden by consuming pages)
// ═══════════════════════════════════════════════════════════

/**
 * Show an authentication error message.
 * Pages can override this function for custom error display.
 * @param {string} message - Error message to display
 */
function showAuthError(message) {
    // Default implementation — pages should override for custom UI
    const el = document.getElementById('auth-error');
    if (el) {
        el.textContent = message;
        el.style.display = 'block';
    } else {
        console.error('auth.js: Auth error —', message);
    }
}

/**
 * Show an access denied message when user lacks required permissions.
 * @param {string} message - Description of what permission is needed
 */
function showAccessDenied(message) {
    // Default implementation — pages can override
    document.body.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;
                    background:#121212;color:#EFEFEF;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
            <div style="text-align:center;max-width:420px;padding:40px;">
                <div style="font-size:3rem;margin-bottom:20px;">🔒</div>
                <h2 style="color:#ff5252;margin:0 0 12px;">Access Denied</h2>
                <p style="color:#aaa;line-height:1.6;">${message}</p>
                <button onclick="signOut()" style="margin-top:24px;padding:10px 28px;background:#6c63ff;
                    color:#fff;border:none;border-radius:6px;font-size:0.95rem;cursor:pointer;
                    transition:background 0.2s;">Sign Out</button>
            </div>
        </div>
    `;
}
