const crypto = require('crypto');
const logging = require('@tryghost/logging');
const request = require('@tryghost/request');
const ghostVersion = require('@tryghost/version');
const config = require('../../../shared/config');

class VerificationService {
    /**
     * Sends a verification webhook to the configured endpoint
     * @param {object} params
     * @param {number} params.amountTriggered - Number of members that triggered verification
     * @param {number} params.threshold - The threshold that was exceeded
     * @param {string} params.method - The source that triggered verification ('api', 'admin', or 'import')
     */
    async sendVerificationWebhook({amountTriggered, threshold, method}) {
        const webhookUrl = config.get('hostSettings:verificationTrigger:webhookUrl');
        const webhookSecret = config.get('hostSettings:verificationTrigger:webhookSecret') || '';
        const siteId = config.get('hostSettings:siteId');

        if (!webhookUrl) {
            return;
        }

        const payload = {
            siteId,
            amountTriggered,
            threshold,
            method
        };

        const reqPayload = JSON.stringify(payload);
        const ts = Date.now();

        const headers = {
            'Content-Length': Buffer.byteLength(reqPayload),
            'Content-Type': 'application/json',
            'Content-Version': `v${ghostVersion.safe}`,
            'X-Ghost-Request-Timestamp': ts
        };

        if (webhookSecret !== '') {
            const baseString = `${ts}:${reqPayload}`;
            headers['X-Ghost-Signature'] = crypto.createHmac('sha256', webhookSecret).update(baseString).digest('base64');
        }

        const opts = {
            body: reqPayload,
            headers,
            timeout: {
                request: 30 * 1000
            },
            retry: {
                limit: process.env.NODE_ENV?.startsWith('test') ? 0 : 5
            }
        };

        logging.info(`Triggering verification webhook to "${webhookUrl}"`);

        await request(webhookUrl, opts);
    }
}

module.exports = new VerificationService();
