    const GatewayManager = {
        activeGateway: null,
        cardknoxReady: false,
        usaepayReady: false,
        paymentJs: null,
        fallbackPaymentJs: null,
        fallbackCardknoxReady: false,
        usingFallback: false,
        config: null,
        _sdkLoadPromises: {},

        /**
         * Initialize the primary gateway and pre-load fallback if configured
         */
        async init(config) {
            this.config = config;
            this.activeGateway = config.primaryGateway || 'cardknox';
            await this.loadGateway(this.activeGateway);
            this.updateGatewayIndicator();
            // Pre-load fallback gateway SDK if configured
            if (config.fallback && config.fallback.gateway && config.fallback.threshold > 0) {
                await this.initFallbackGateway();
            }
        },

        /**
         * Load a gateway SDK dynamically
         */
        async loadGateway(gateway) {
            if (gateway === 'cardknox') {
                if (!this.cardknoxReady) {
                    await this.loadScript('https://cdn.cardknox.com/ifields/3.4.2602.2001/ifields.min.js', 'cardknox-sdk');
                    this.initCardknoxFields();
                    this.cardknoxReady = true;
                }
            } else if (gateway === 'usaepay') {
                if (!this.usaepayReady) {
                    await this.loadScript('https://www.usaepay.com/js/v1/pay.js', 'usaepay-sdk');
                    this.initUSAePayFields();
                    this.usaepayReady = true;
                }
            }
            this.showGatewayFields(gateway);
        },

        /**
         * Dynamically load a script tag, with dedup
         */
        loadScript(src, id) {
            if (this._sdkLoadPromises[id]) return this._sdkLoadPromises[id];

            this._sdkLoadPromises[id] = new Promise(function(resolve, reject) {
                // Check if already loaded
                if (document.getElementById(id)) {
                    resolve();
                    return;
                }
                var script = document.createElement('script');
                script.id = id;
                script.src = src;
                script.onload = resolve;
                script.onerror = function() {
                    reject(new Error('Failed to load ' + src));
                };
                document.head.appendChild(script);
            });

            return this._sdkLoadPromises[id];
        },

        /**
         * Show the appropriate payment fields for the active gateway
         */
        showGatewayFields(gateway) {
            var ckFields = document.getElementById('cardknox-fields');
            var ueFields = document.getElementById('usaepay-fields');
            var expInput = document.getElementById('card-exp');
            var dafContainer = document.getElementById('daf-options-container');
            var dafWarn = document.getElementById('daf-card-warning');

            if (gateway === 'cardknox') {
                ckFields.style.display = 'block';
                ueFields.style.display = 'none';
                // Cardknox uses its own exp field (the standard input)
                if (expInput) expInput.required = true;
                // Sola handles DAF cards directly via card entry fields
                if (dafContainer) dafContainer.style.display = 'none';
                if (dafWarn) dafWarn.style.display = 'none';
            } else {
                ckFields.style.display = 'none';
                ueFields.style.display = 'block';
                // USAePay handles exp in its own hosted field
                if (expInput) expInput.required = false;
                // USAePay requires standalone DAF options
                if (dafContainer) dafContainer.style.display = 'block';
            }
        },

        /**
         * Initialize Cardknox iFields
         */
        
    

        initCardknoxFields() {
            if (typeof setAccount !== 'function') return;

            setAccount(this.config.cardknox.ifieldsKey, 'NotzerChesed', '1.0.0');

            var fieldStyle = this.getFieldStyle();
            setIfieldStyle('card-number', fieldStyle);
            setIfieldStyle('cvv', fieldStyle);
            enableAutoFormatting(' ');

            var validStyle = Object.assign({}, fieldStyle, { 'color': '#74c0fc' });
            var invalidStyle = Object.assign({}, fieldStyle, { 'color': '#ff5252' });

            addIfieldKeyPressCallback(function(data) {
                // Card / DAF Brand Badge detection via verified data.issuer
                var brandBadgeEl = document.getElementById('card-brand-icon');
                if (brandBadgeEl) {
                    var issuer = (data.issuer || '').toLowerCase().trim();
                    if (issuer && typeof CARD_BRAND_BADGES !== 'undefined' && CARD_BRAND_BADGES[issuer]) {
                        brandBadgeEl.innerHTML = CARD_BRAND_BADGES[issuer];
                        brandBadgeEl.style.display = 'inline-flex';
                    } else {
                        brandBadgeEl.innerHTML = '';
                        brandBadgeEl.style.display = 'none';
                    }
                }

                var isCardknox = (typeof GatewayManager !== 'undefined' && GatewayManager.activeGateway === 'cardknox');
                if (data.cardNumberFormattedLength > 0) {
                    var isCardValid = data.cardNumberIsValid || (isCardknox && (data.cardNumberFormattedLength >= 19 || (data.cardNumberLength && data.cardNumberLength >= 16)));
                    setIfieldStyle('card-number', isCardValid ? validStyle : invalidStyle);
                } else {
                    setIfieldStyle('card-number', fieldStyle);
                }
                if (data.lastIfieldChanged === 'cvv') {
                    if (data.cvvLength > 0) {
                        setIfieldStyle('cvv', data.cvvIsValid ? validStyle : invalidStyle);
                    } else {
                        setIfieldStyle('cvv', fieldStyle);
                    }
                }
                // DAF card detection: only show warning for USAePay (Sola handles DAF natively)
                var dafWarn = document.getElementById('daf-card-warning');
                if (dafWarn) {
                    if (isCardknox) {
                        dafWarn.style.display = 'none';
                    } else {
                        var isFullLength = (data.cardNumberFormattedLength >= 19) || (data.cardNumberLength && data.cardNumberLength >= 16);
                        dafWarn.style.display = (isFullLength && !data.cardNumberIsValid) ? 'block' : 'none';
                    }
                }
            });
        },

        /**
         * Initialize USAePay PaymentJS hosted fields
         */
        initUSAePayFields() {
            if (typeof usaepay === 'undefined' && typeof PayJS === 'undefined') return;

            var PayJSClass = typeof usaepay !== 'undefined' && usaepay.Client ? usaepay.Client : null;
            if (!PayJSClass) return;

            try {
                this.paymentJs = new PayJSClass(this.config.usaepay.publicKey);

                this.paymentCard = this.paymentJs.createPaymentCardEntry();
                var style = this.getFieldStyleString();
                this.paymentCard.generateHTML({ base: this.getFieldStyle() });
                this.paymentCard.addHTML('usaepay-card-number');
            } catch (err) {
                console.error('USAePay init error:', err);
                document.getElementById('usaepay-error').textContent = 'Payment fields failed to load. Please try again.';
            }
        },

        /**
         * Get field style object for iFields
         */
        getFieldStyle() {
            return {
                'color': '#EFEFEF',
                'font-size': '14px',
                'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                'background-color': 'transparent',
                'border': 'none',
                'outline': 'none'
            };
        },

        /**
         * Get field style as CSS string for USAePay
         */
        getFieldStyleString() {
            return 'background-color: #333; border: none; color: #EFEFEF; font-size: 0.95rem; ' +
                   'padding: 8px 10px; width: 100%; height: 100%; box-sizing: border-box; ' +
                   'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; ' +
                   'outline: none;';
        },

        /**
         * Tokenize card data with the active gateway
         * @returns {Promise<{ token: string, cvvToken?: string, exp?: string, gateway: string }>}
         */
        tokenize(amount) {
            var self = this;
            return new Promise(function(resolve, reject) {
                if (self.activeGateway === 'cardknox') {
                    if (typeof getTokens !== 'function') {
                        reject(new Error('Cardknox SDK not loaded'));
                        return;
                    }
                    getTokens(
                        function() {
                            var cardToken = document.querySelector('[data-ifields-id="card-number-token"]').value;
                            var cvvToken = document.querySelector('[data-ifields-id="cvv-token"]').value;
                            var exp = document.getElementById('card-exp').value;
                            resolve({
                                token: cardToken,
                                cvvToken: cvvToken,
                                exp: exp,
                                gateway: 'cardknox'
                            });
                        },
                        function(error) {
                            reject(error || new Error('Failed to tokenize card with Cardknox'));
                        },
                        30000
                    );
                } else if (self.activeGateway === 'usaepay') {
                    var pjs = self.paymentJs;
                    if (!pjs) {
                        reject(new Error('USAePay SDK not loaded'));
                        return;
                    }
                    self.paymentCard.getPaymentKey().then(function(response) {
                        if (response.error) {
                            reject(new Error(response.error));
                        } else {
                            resolve({
                                token: response.key || response.payment_key || response,
                                cardType: response.card_type || '',
                                last4: response.card_last4 || '',
                                gateway: 'usaepay'
                            });
                        }
                    }).catch(function(error) {
                        var msg = 'Payment processing error';
                        if (error && error.message) msg = error.message;
                        else if (typeof error === 'string') msg = error;
                        reject(new Error(msg));
                    });
                } else {
                    reject(new Error('No active gateway configured'));
                }
            });
        },

        /**
         * Initialize the fallback gateway SDK for high-ticket routing
         */
        async initFallbackGateway() {
            var fb = this.config.fallback;
            if (!fb || !fb.gateway) return;
            try {
                if (fb.gateway === 'usaepay' && fb.usaepay && fb.usaepay.publicKey) {
                    await this.loadScript('https://www.usaepay.com/js/v1/pay.js', 'usaepay-sdk');
                    var PayJSClass = typeof usaepay !== 'undefined' && usaepay.Client ? usaepay.Client : null;
                    if (PayJSClass) {
                        this.fallbackPaymentJs = new PayJSClass(fb.usaepay.publicKey);

                    }
                } else if (fb.gateway === 'cardknox' && fb.cardknox && fb.cardknox.ifieldsKey) {
                    await this.loadScript('https://cdn.cardknox.com/ifields/3.4.2602.2001/ifields.min.js', 'cardknox-sdk');
                    // Cardknox fallback will be initialized on-demand when needed
                }
            } catch (err) {
                console.error('Fallback gateway init error:', err);
            }
        },

        /**
         * Tokenize with the fallback gateway (high-ticket amounts)
         * @returns {Promise<{ token: string, gateway: string }>}
         */
        tokenizeWithFallback() {
            var self = this;
            var fb = this.config.fallback;
            return new Promise(function(resolve, reject) {
                if (fb.gateway === 'usaepay' && self.fallbackPaymentJs) {
                    // Show USAePay fields for fallback tokenization
                    self.showGatewayFields('usaepay');
                    self.fallbackPaymentJs.getToken(
                        function(token) {
                            resolve({
                                token: token.token || token.payment_key || token,
                                cardType: token.card_type || '',
                                last4: token.card_last4 || '',
                                gateway: 'usaepay'
                            });
                        },
                        function(errors) {
                            var msg = 'Payment processing error';
                            if (errors && typeof errors === 'object') {
                                if (Array.isArray(errors)) {
                                    msg = errors.map(function(e) { return e.message || e; }).join(', ');
                                } else if (errors.message) {
                                    msg = errors.message;
                                }
                            }
                            reject(new Error(msg));
                        }
                    );
                } else if (fb.gateway === 'cardknox') {
                    // For Cardknox fallback, reinitialize iFields with fallback key
                    if (typeof setAccount === 'function' && fb.cardknox.ifieldsKey) {
                        setAccount(fb.cardknox.ifieldsKey, 'NotzerChesed', '1.0.0');
                        self.fallbackCardknoxReady = true;
                    }
                    self.showGatewayFields('cardknox');
                    if (typeof getTokens !== 'function') {
                        reject(new Error('Cardknox SDK not loaded'));
                        return;
                    }
                    getTokens(
                        function() {
                            var cardToken = document.querySelector('[data-ifields-id="card-number-token"]').value;
                            var cvvToken = document.querySelector('[data-ifields-id="cvv-token"]').value;
                            var exp = document.getElementById('card-exp').value;
                            resolve({ token: cardToken, cvvToken: cvvToken, exp: exp, gateway: 'cardknox' });
                        },
                        function(error) {
                            reject(error || new Error('Failed to tokenize card with Cardknox fallback'));
                        },
                        30000
                    );
                } else {
                    reject(new Error('Fallback gateway not initialized'));
                }
            });
        },

        /**
         * Check if amount should use fallback gateway
         * @param {number} amount - The charge amount
         * @returns {boolean}
         */
        shouldUseFallback(amount) {
            var fb = this.config.fallback;
            return !!(fb && fb.gateway && fb.threshold > 0 && amount > fb.threshold);
        },

                /**
         * Handle amount change for high-ticket routing.
         * Shows payment type selector when amount > threshold.
         * @param {number} amount - The donation amount
         */
        switchGatewayForAmount(amount) {
            var fb = this.config.fallback;
            if (!fb || !fb.gateway || !fb.threshold) return;
            var selector = document.getElementById('high-ticket-payment-type');
            if (!selector) return;
            if (amount > fb.threshold) {
                // Show payment type selector
                selector.style.display = 'block';
                // If user already selected a type, keep it; otherwise hide card fields
                if (!this._selectedPayType) {
                    // Hide both field sets until user picks
                    document.getElementById('cardknox-fields').style.display = 'none';
                    document.getElementById('usaepay-fields').style.display = 'none';
                }
            } else {
                // Below threshold — hide selector, restore primary gateway
                selector.style.display = 'none';
                this._selectedPayType = null;
                // Deactivate selector buttons
                var btns = selector.querySelectorAll('.paytype-btn');
                btns.forEach(function(b) { b.classList.remove('active'); });
                if (this.usingFallback) {
                    this.usingFallback = false;
                    this.activeGateway = this.config.primaryGateway || 'cardknox';
                    this.showGatewayFields(this.activeGateway);
                    this.updateGatewayIndicator();
                }
            }
        },

                /**
         * Called when user selects Credit Card or DAF from the high-ticket selector.
         * @param {string} payType - 'cc' or 'daf'
         */
        selectPaymentType(payType) {
            this._selectedPayType = payType;
            var self = this;
            var fb = this.config.fallback;
            // Toggle button active states
            var ccBtn = document.getElementById('pay-type-cc');
            var dafBtn = document.getElementById('pay-type-daf');
            if (ccBtn) ccBtn.classList.toggle('active', payType === 'cc');
            if (dafBtn) dafBtn.classList.toggle('active', payType === 'daf');

            if (payType === 'cc' && fb && fb.gateway) {
                // Credit card over threshold → use fallback gateway (USAePay)
                this.usingFallback = true;
                this.activeGateway = fb.gateway;
                this.showGatewayFields(fb.gateway);
                this.updateGatewayIndicator();
                // Render USAePay hosted field on-demand, deferred to allow browser reflow
                if (fb.gateway === 'usaepay' && this.fallbackPaymentJs && !this._fallbackFieldRendered) {
                    this._fallbackFieldRendered = true;
                    // Clear any stale content
                    var target = document.getElementById('usaepay-card-number');
                    if (target) target.innerHTML = '';
                    // Defer to next animation frame so container has dimensions
                    requestAnimationFrame(function() {
                        var style = self.getFieldStyleString();
                        self.fallbackPaymentCard = self.fallbackPaymentJs.createPaymentCardEntry();
                        self.fallbackPaymentCard.generateHTML({ base: self.getFieldStyle() });
                        self.fallbackPaymentCard.addHTML('usaepay-card-number');
                        // Point paymentJs/paymentCard to fallback so normal tokenize() works
                        self.paymentJs = self.fallbackPaymentJs;
                        self.paymentCard = self.fallbackPaymentCard;
                    });
                } else if (this.fallbackPaymentJs) {
                    // Already rendered, just ensure paymentJs points to fallback
                    this.paymentJs = this.fallbackPaymentJs;
                }
            } else {
                // DAF card → always use primary gateway (Cardknox/Sola)
                this.usingFallback = false;
                this.activeGateway = this.config.primaryGateway || 'cardknox';
                this.showGatewayFields(this.activeGateway);
                this.updateGatewayIndicator();
                // Restore paymentJs if it was overwritten
                this.paymentJs = null;
            }
        },

        /**
         * Switch to the fallback gateway (called on primary failure)
         */
        async switchToFallback() {
            var fallback = this.activeGateway === 'cardknox' ? 'usaepay' : 'cardknox';
            this.activeGateway = fallback;
            await this.loadGateway(fallback);
            this.updateGatewayIndicator();
        },

        /**
         * Get the fallback gateway name
