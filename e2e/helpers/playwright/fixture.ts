import baseDebug from '@tryghost/debug';
import {Browser, BrowserContext, Page, TestInfo, test as base} from '@playwright/test';
import {GhostInstance, getEnvironmentManager} from '@/helpers/environment';
import {FakeStripeServer, StripeTestService, WebhookClient} from '@/helpers/services/stripe';
import {SettingsService} from '@/helpers/services/settings/settings-service';
import {faker} from '@faker-js/faker';
import {loginToGetAuthenticatedSession} from '@/helpers/playwright/flows/sign-in';
import {setupUser} from '@/helpers/utils';

const debug = baseDebug('e2e:ghost-fixture');
const STRIPE_FAKE_SERVER_PORT = 40000 + parseInt(process.env.TEST_PARALLEL_INDEX || '0', 10);

export interface User {
    name: string;
    email: string;
    password: string;
}

export interface GhostConfig {
    memberWelcomeEmailTestInbox?: string;
    hostSettings__billing__enabled?: string;
    hostSettings__billing__url?: string;
    hostSettings__forceUpgrade?: string;
}

export interface GhostInstanceFixture {
    ghostInstance: GhostInstance;
    labs?: Record<string, boolean>;
    config?: GhostConfig;
    stripeEnabled?: boolean;
    stripe?: StripeTestService;
    ghostAccountOwner: User;
    pageWithAuthenticatedUser: {
        page: Page;
        context: BrowserContext;
        ghostAccountOwner: User
    };
}

async function setupNewAuthenticatedPage(browser: Browser, baseURL: string, ghostAccountOwner: User) {
    debug('Setting up authenticated page for Ghost instance:', baseURL);

    // Create browser context with correct baseURL and extra HTTP headers
    const context = await browser.newContext({
        baseURL: baseURL,
        extraHTTPHeaders: {
            Origin: baseURL
        }
    });
    const page = await context.newPage();

    await loginToGetAuthenticatedSession(page, ghostAccountOwner.email, ghostAccountOwner.password);
    debug('Authentication completed for Ghost instance');

    return {page, context, ghostAccountOwner};
}

/**
 * Playwright fixture that provides a unique Ghost instance for each test
 * Each instance gets its own database, runs on a unique port, and includes authentication
 *
 * Automatically detects if dev environment (yarn dev) is running:
 * - Dev mode: Uses worker-scoped containers with per-test database cloning (faster)
 * - Standalone mode: Uses per-test containers (traditional behavior)
 *
 * Optionally allows setting labs flags via test.use({labs: {featureName: true}})
 * and Stripe connection via test.use({stripeEnabled: true})
 * and Ghost config via test.use({config: {memberWelcomeEmailTestInbox: 'test@ghost.org'}})
 */
export const test = base.extend<GhostInstanceFixture>({
    // Define options that can be set per test or describe block
    config: [undefined, {option: true}],
    labs: [undefined, {option: true}],
    stripeEnabled: [false, {option: true}],

    // Each test gets its own Ghost instance with isolated database.
    ghostInstance: async ({config, stripeEnabled}, use, testInfo: TestInfo) => {
        debug('Setting up Ghost instance for test:', testInfo.title);
        const stripeConfig = stripeEnabled ? {
            STRIPE_API_HOST: 'host.docker.internal',
            STRIPE_API_PORT: String(STRIPE_FAKE_SERVER_PORT),
            STRIPE_API_PROTOCOL: 'http'
        } : {};
        const mergedConfig = {...(config || {}), ...stripeConfig};
        const environmentManager = await getEnvironmentManager();
        const ghostInstance = await environmentManager.perTestSetup({config: mergedConfig});

        debug('Ghost instance ready for test:', {
            testTitle: testInfo.title,
            ...ghostInstance
        });
        await use(ghostInstance);

        debug('Tearing down Ghost instance for test:', testInfo.title);
        await environmentManager.perTestTeardown(ghostInstance);
        debug('Teardown completed for test:', testInfo.title);
    },

    stripe: async ({stripeEnabled, baseURL}, use) => {
        if (!stripeEnabled || !baseURL) {
            await use(undefined);
            return;
        }

        const server = new FakeStripeServer(STRIPE_FAKE_SERVER_PORT);
        await server.start();
        debug('Fake Stripe server started on port', STRIPE_FAKE_SERVER_PORT);

        const webhookClient = new WebhookClient(baseURL);
        const service = new StripeTestService(server, webhookClient);
        await use(service);

        await server.stop();
        debug('Stripe server stopped');
    },

    baseURL: async ({ghostInstance}, use) => {
        await use(ghostInstance.baseUrl);
    },

    // Create user credentials only (no authentication)
    ghostAccountOwner: async ({baseURL}, use) => {
        if (!baseURL) {
            throw new Error('baseURL is not defined');
        }

        // Create user in this Ghost instance
        const ghostAccountOwner: User = {
            name: 'Test User',
            email: `test${faker.string.uuid()}@ghost.org`,
            password: 'test@123@test'
        };
        await setupUser(baseURL, ghostAccountOwner);
        await use(ghostAccountOwner);
    },

    // Intermediate fixture that sets up the page and returns all setup data
    pageWithAuthenticatedUser: async ({browser, baseURL, ghostAccountOwner}, use) => {
        if (!baseURL) {
            throw new Error('baseURL is not defined');
        }

        const pageWithAuthenticatedUser = await setupNewAuthenticatedPage(browser, baseURL, ghostAccountOwner);
        await use(pageWithAuthenticatedUser);
        await pageWithAuthenticatedUser.context.close();
    },

    // Extract the page from pageWithAuthenticatedUser and apply labs/stripe settings
    page: async ({pageWithAuthenticatedUser, labs, stripe}, use) => {
        const page = pageWithAuthenticatedUser.page;
        const settingsService = new SettingsService(page.request);

        if (stripe) {
            debug('Setting up Stripe connection for test');
            await settingsService.setStripeConnected();
            debug('Waiting for Ghost Stripe billing portal configuration...');
            await stripe.waitForBillingPortalConfig();
        }

        const labsFlagsSpecified = labs && Object.keys(labs).length > 0;
        if (labsFlagsSpecified) {
            debug('Updating labs settings:', labs);
            await settingsService.updateLabsSettings(labs);
        }

        const needsReload = Boolean(stripe) || labsFlagsSpecified;
        if (needsReload) {
            await page.reload({waitUntil: 'load'});
            debug('Settings applied and page reloaded');
        }

        await use(page);
    }
});

export {expect} from '@playwright/test';
