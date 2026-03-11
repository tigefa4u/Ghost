/* eslint-disable @typescript-eslint/no-require-imports */
import crypto from 'crypto';
const logging = require('@tryghost/logging');
const request = require('@tryghost/request');
const ghostVersion = require('@tryghost/version');
const config = require('../../../shared/config');

type VerificationTriggerMethod = 'admin' | 'api' | 'import';

type VerificationWebhookBody = {
    siteId: string | null;
    amountTriggered: number;
    threshold: number;
    method: VerificationTriggerMethod;
};

type VerificationWebhookServiceDependencies = {
    config: {
        get: (key: string) => unknown;
    };
    logging: {
        info: (message: string) => void;
    };
    request: (url: string, options: unknown) => Promise<unknown>;
};

export class VerificationWebhookService {
    #config: VerificationWebhookServiceDependencies['config'];
    #logging: VerificationWebhookServiceDependencies['logging'];
    #request: VerificationWebhookServiceDependencies['request'];

    constructor(dependencies: VerificationWebhookServiceDependencies = {config, logging, request}) {
        this.#config = dependencies.config;
        this.#logging = dependencies.logging;
        this.#request = dependencies.request;
    }

    /**
     * Sends a verification webhook to the configured endpoint.
     */
    async sendVerificationWebhook({
        amountTriggered,
        threshold,
        method
    }: {
        amountTriggered: number;
        threshold: number;
        method: VerificationTriggerMethod;
    }): Promise<void> {
        const webhookUrl = this.#config.get('hostSettings:verificationTrigger:webhookUrl');
        const webhookSecret = this.#config.get('hostSettings:verificationTrigger:webhookSecret') || '';
        const siteId = this.#config.get('hostSettings:siteId') || null;

        if (!webhookUrl || typeof webhookUrl !== 'string') {
            return;
        }

        const payload: VerificationWebhookBody = {
            siteId: typeof siteId === 'string' ? siteId : null,
            amountTriggered,
            threshold,
            method
        };

        const requestBody = JSON.stringify(payload);
        const timestamp = Date.now().toString();

        const headers: Record<string, string | number> = {
            'Content-Length': Buffer.byteLength(requestBody),
            'Content-Type': 'application/json',
            'Content-Version': `v${ghostVersion.safe}`,
            'X-Ghost-Request-Timestamp': timestamp
        };

        if (typeof webhookSecret === 'string' && webhookSecret !== '') {
            const baseString = `${timestamp}:${requestBody}`;
            headers['X-Ghost-Signature'] = crypto.createHmac('sha256', webhookSecret).update(baseString).digest('base64');
        }

        const requestOptions = {
            body: requestBody,
            headers,
            timeout: {
                request: 30 * 1000
            },
            retry: {
                limit: process.env.NODE_ENV?.startsWith('test') ? 0 : 5
            }
        };

        this.#logging.info(`Triggering verification webhook to "${webhookUrl}"`);

        await this.#request(webhookUrl, requestOptions);
    }
}

export const verificationWebhookService = new VerificationWebhookService();
