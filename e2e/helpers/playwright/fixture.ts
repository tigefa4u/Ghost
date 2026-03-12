import baseDebug from '@tryghost/debug';
import {AnalyticsOverviewPage} from '@/helpers/pages';
import {Browser, BrowserContext, Page, TestInfo, test as base} from '@playwright/test';
import {GhostInstance, getEnvironmentManager} from '@/helpers/environment';
import {SettingsService} from '@/helpers/services/settings/settings-service';
import {faker} from '@faker-js/faker';
import {loginToGetAuthenticatedSession} from '@/helpers/playwright/flows/sign-in';
import {setupUser} from '@/helpers/utils';

const debug = baseDebug('e2e:ghost-fixture');

type ResolvedIsolation = 'per-file' | 'per-test';

interface PerFileInstanceCache {
    suiteKey: string;
    configSignature: string;
    instance: GhostInstance;
}

interface PerFileAuthenticatedSessionCache {
    ghostAccountOwner: User;
    storageState: Awaited<ReturnType<BrowserContext['storageState']>>;
}

interface TestEnvironmentContext {
    holder: GhostInstance;
    resolvedIsolation: ResolvedIsolation;
    cycle: () => Promise<void>;
}

interface InternalFixtures {
    _testEnvironmentContext: TestEnvironmentContext;
}

interface WorkerFixtures {
    _cleanupPerFileInstance: void;
}

let cachedPerFileInstance: PerFileInstanceCache | null = null;
let cachedPerFileGhostAccountOwner: User | null = null;
let cachedPerFileAuthenticatedSession: PerFileAuthenticatedSessionCache | null = null;

export interface User {
    name: string;
    email: string;
    password: string;
}

export interface GhostConfig {
    hostSettings__billing__enabled?: string;
    hostSettings__billing__url?: string;
    hostSettings__forceUpgrade?: string;
}

export interface GhostInstanceFixture {
    ghostInstance: GhostInstance;
    isolation?: 'per-test';
    resolvedIsolation: ResolvedIsolation;
    resetEnvironment: () => Promise<void>;
    labs?: Record<string, boolean>;
    config?: GhostConfig;
    stripeConnected?: boolean;
    ghostAccountOwner: User;
    pageWithAuthenticatedUser: {
        page: Page;
        context: BrowserContext;
        ghostAccountOwner: User
    };
}

function getConfigSignature(config?: GhostConfig): string {
    return JSON.stringify(config ?? {});
}

function getSuiteKey(testInfo: TestInfo): string {
    return `${testInfo.project.name}:${testInfo.file}`;
}

function getResolvedIsolation(testInfo: TestInfo, isolation?: 'per-test'): ResolvedIsolation {
    if (testInfo.config.fullyParallel || isolation === 'per-test') {
        return 'per-test';
    }

    return 'per-file';
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

async function setupAuthenticatedPageFromStorageState(browser: Browser, baseURL: string, authenticatedSession: PerFileAuthenticatedSessionCache) {
    debug('Reusing authenticated storage state for Ghost instance:', baseURL);

    const context = await browser.newContext({
        baseURL: baseURL,
        extraHTTPHeaders: {
            Origin: baseURL
        },
        storageState: authenticatedSession.storageState
    });
    const page = await context.newPage();
    await page.goto('/ghost/#/');

    const analyticsPage = new AnalyticsOverviewPage(page);
    const billingIframe = page.getByTitle('Billing');
    await Promise.race([
        analyticsPage.header.waitFor({state: 'visible'}),
        billingIframe.waitFor({state: 'visible'})
    ]);

    return {
        page,
        context,
        ghostAccountOwner: authenticatedSession.ghostAccountOwner
    };
}

/**
 * Playwright fixture that provides a unique Ghost instance for each test
 * Each instance gets its own database, runs on a unique port, and includes authentication
 *
 * Uses the unified E2E environment manager:
 * - Dev mode (default): Worker-scoped containers with per-test database cloning
 * - Build mode: Same isolation model, but Ghost runs from a prebuilt image
 *
 * Optionally allows setting labs flags via test.use({labs: {featureName: true}})
 * and Stripe connection via test.use({stripeConnected: true})
 */
export const test = base.extend<GhostInstanceFixture & InternalFixtures, WorkerFixtures>({
    _cleanupPerFileInstance: [async ({}, use) => {
        await use();

        if (!cachedPerFileInstance) {
            return;
        }

        const environmentManager = await getEnvironmentManager();
        await environmentManager.perTestTeardown(cachedPerFileInstance.instance);
        cachedPerFileInstance = null;
        cachedPerFileGhostAccountOwner = null;
        cachedPerFileAuthenticatedSession = null;
    }, {
        scope: 'worker',
        auto: true
    }],

    _testEnvironmentContext: async ({config, isolation}, use, testInfo: TestInfo) => {
        const environmentManager = await getEnvironmentManager();
        const resolvedIsolation = getResolvedIsolation(testInfo, isolation);
        const suiteKey = getSuiteKey(testInfo);
        const configSignature = getConfigSignature(config);

        if (resolvedIsolation === 'per-test') {
            const perTestInstance = await environmentManager.perTestSetup({config});
            const previousPerFileInstance = cachedPerFileInstance?.instance;
            cachedPerFileInstance = null;
            cachedPerFileGhostAccountOwner = null;
            cachedPerFileAuthenticatedSession = null;

            if (previousPerFileInstance) {
                await environmentManager.perTestTeardown(previousPerFileInstance);
            }

            await use({
                holder: perTestInstance,
                resolvedIsolation,
                cycle: async () => {
                    debug('resetEnvironment() is a no-op in per-test isolation mode');
                }
            });

            await environmentManager.perTestTeardown(perTestInstance);
            return;
        }

        const mustRecyclePerFileInstance = !cachedPerFileInstance ||
            cachedPerFileInstance.suiteKey !== suiteKey ||
            cachedPerFileInstance.configSignature !== configSignature;

        if (mustRecyclePerFileInstance) {
            const previousPerFileInstance = cachedPerFileInstance?.instance;
            const nextPerFileInstance = await environmentManager.perTestSetup({config});
            cachedPerFileInstance = {
                suiteKey,
                configSignature,
                instance: nextPerFileInstance
            };
            cachedPerFileGhostAccountOwner = null;
            cachedPerFileAuthenticatedSession = null;

            if (previousPerFileInstance) {
                await environmentManager.perTestTeardown(previousPerFileInstance);
            }
        }

        const activePerFileInstance = cachedPerFileInstance;
        if (!activePerFileInstance) {
            throw new Error('[e2e fixture] Failed to initialize per-file Ghost instance.');
        }

        const holder = {...activePerFileInstance.instance};
        const cycle = async () => {
            const previousInstance = cachedPerFileInstance?.instance;
            const nextInstance = await environmentManager.perTestSetup({config});

            if (previousInstance) {
                await environmentManager.perTestTeardown(previousInstance);
            }

            cachedPerFileInstance = {
                suiteKey,
                configSignature,
                instance: nextInstance
            };
            cachedPerFileGhostAccountOwner = null;
            cachedPerFileAuthenticatedSession = null;

            Object.assign(holder, nextInstance);
        };

        await use({
            holder,
            resolvedIsolation,
            cycle
        });
    },

    // Define options that can be set per test or describe block
    config: [undefined, {option: true}],
    isolation: [undefined, {option: true}],
    labs: [undefined, {option: true}],
    stripeConnected: [false, {option: true}],

    ghostInstance: async ({_testEnvironmentContext}, use, testInfo: TestInfo) => {
        debug('Using Ghost instance for test:', {
            testTitle: testInfo.title,
            resolvedIsolation: _testEnvironmentContext.resolvedIsolation,
            ..._testEnvironmentContext.holder
        });
        await use(_testEnvironmentContext.holder);
    },

    resolvedIsolation: async ({_testEnvironmentContext}, use) => {
        await use(_testEnvironmentContext.resolvedIsolation);
    },

    resetEnvironment: async ({_testEnvironmentContext}, use) => {
        await use(async () => {
            if (_testEnvironmentContext.resolvedIsolation === 'per-test') {
                debug('resetEnvironment() is a no-op in per-test isolation mode');
                return;
            }

            await _testEnvironmentContext.cycle();
        });
    },

    baseURL: async ({ghostInstance}, use) => {
        await use(ghostInstance.baseUrl);
    },

    // Create user credentials only (no authentication)
    ghostAccountOwner: async ({ghostInstance, _testEnvironmentContext}, use) => {
        if (!ghostInstance.baseUrl) {
            throw new Error('baseURL is not defined');
        }

        if (_testEnvironmentContext.resolvedIsolation === 'per-file' && cachedPerFileGhostAccountOwner) {
            await use(cachedPerFileGhostAccountOwner);
            return;
        }

        // Create user in this Ghost instance
        const ghostAccountOwner: User = {
            name: 'Test User',
            email: `test${faker.string.uuid()}@ghost.org`,
            password: 'test@123@test'
        };
        await setupUser(ghostInstance.baseUrl, ghostAccountOwner);

        if (_testEnvironmentContext.resolvedIsolation === 'per-file') {
            cachedPerFileGhostAccountOwner = ghostAccountOwner;
        }

        await use(ghostAccountOwner);
    },

    // Intermediate fixture that sets up the page and returns all setup data
    pageWithAuthenticatedUser: async ({browser, ghostInstance, ghostAccountOwner, _testEnvironmentContext}, use) => {
        if (!ghostInstance.baseUrl) {
            throw new Error('baseURL is not defined');
        }

        const pageWithAuthenticatedUser =
            _testEnvironmentContext.resolvedIsolation === 'per-file' && cachedPerFileAuthenticatedSession
                ? await setupAuthenticatedPageFromStorageState(browser, ghostInstance.baseUrl, cachedPerFileAuthenticatedSession)
                : await setupNewAuthenticatedPage(browser, ghostInstance.baseUrl, ghostAccountOwner);

        if (_testEnvironmentContext.resolvedIsolation === 'per-file' && !cachedPerFileAuthenticatedSession) {
            cachedPerFileAuthenticatedSession = {
                ghostAccountOwner: pageWithAuthenticatedUser.ghostAccountOwner,
                storageState: await pageWithAuthenticatedUser.context.storageState()
            };
        }

        await use(pageWithAuthenticatedUser);
        await pageWithAuthenticatedUser.context.close();
    },

    // Extract the page from pageWithAuthenticatedUser and apply labs/stripe settings
    page: async ({pageWithAuthenticatedUser, labs, stripeConnected}, use) => {
        const page = pageWithAuthenticatedUser.page;
        const settingsService = new SettingsService(page.request);

        if (stripeConnected) {
            debug('Setting up Stripe connection for test');
            await settingsService.setStripeConnected();
        }

        const labsFlagsSpecified = labs && Object.keys(labs).length > 0;
        if (labsFlagsSpecified) {
            debug('Updating labs settings:', labs);
            await settingsService.updateLabsSettings(labs);
        }

        const needsReload = stripeConnected || labsFlagsSpecified;
        if (needsReload) {
            await page.reload({waitUntil: 'load'});
            debug('Settings applied and page reloaded');
        }

        await use(page);
    }
});

export {expect} from '@playwright/test';
