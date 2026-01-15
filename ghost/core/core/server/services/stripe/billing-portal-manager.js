/**
 * @typedef {import('./stripe-api')} StripeAPI
 */

/**
 * @typedef {object} StripeBillingPortalModel
 * @prop {string?} configuration_id
 */

/**
 * @typedef {object} StripeBillingPortal
 * @prop {(data: StripeBillingPortalModel) => Promise<void>} save
 * @prop {() => Promise<StripeBillingPortalModel>} get
 */

/**
 * @typedef {object} BillingPortalConfig
 * @prop {string} siteUrl - The URL to return to after the portal session
 * @prop {string} siteTitle - The publication name to display in the portal
 */

module.exports = class BillingPortalManager {
    /**
     * @param {object} deps
     * @param {StripeBillingPortal} deps.StripeBillingPortal
     * @param {StripeAPI} deps.api
     */
    constructor({
        StripeBillingPortal,
        api
    }) {
        /** @private */
        this.StripeBillingPortal = StripeBillingPortal;
        /** @private */
        this.api = api;
    }

    /**
     * Configures the Billing Portal Manager.
     *
     * @param {BillingPortalConfig} config
     *
     * @returns {void}
     */
    configure(config) {
        this.config = config;
    }

    /**
     * Starts the Billing Portal Manager by ensuring a configuration exists in Stripe.
     *
     * @returns {Promise<void>}
     */
    async start() {
        if (!this.config) {
            return;
        }

        const billingPortalConfiguration = await this.StripeBillingPortal.get();
        if (!billingPortalConfiguration.configuration_id) {

        }

        const configuration = await this.setupConfiguration(existing.configuration_id);

        await this.StripeBillingPortal.save({
            configuration_id: configuration.id
        });
    }

    /**
     * Setup the Stripe Billing Portal Configuration.
     * - If no configuration exists, create a new one
     * - If a configuration exists, update it with current settings
     * - If update fails (resource_missing), create a new one
     *
     * @param {string} [id] - Existing configuration ID
     *
     * @returns {Promise<{id: string}>}
     */
    async setupConfiguration(id) {
        const configOptions = this.getConfigurationOptions();

        if (!id) {
            const configuration = await this.api.createBillingPortalConfiguration(configOptions);
            return {
                id: configuration.id
            };
        }

        try {
            const configuration = await this.api.updateBillingPortalConfiguration(id, configOptions);
            return {
                id: configuration.id
            };
        } catch (err) {
            if (err.code === 'resource_missing') {
                const configuration = await this.api.createBillingPortalConfiguration(configOptions);
                return {
                    id: configuration.id
                };
            }
            throw err;
        }
    }

    /**
     * Get the configuration options for the Stripe Billing Portal.
     *
     * @returns {object}
     */
    getConfigurationOptions() {
        return {
            business_profile: {
                headline: `Manage your ${this.config.siteTitle} subscription`
            },
            features: {
                invoice_history: {
                    enabled: true
                },
                payment_method_update: {
                    enabled: true
                },
                subscription_cancel: {
                    enabled: true
                }
            },
            default_return_url: this.config.siteUrl
        };
    }
};
