import {expect, test} from '@playwright/test';
import {globalDataRequests, mockApi, responseFixtures} from '@tryghost/admin-x-framework/test/acceptance';

test.describe('DangerZone', async () => {
    test('Delete all content', async ({page}) => {
        const {lastApiRequests} = await mockApi({page, requests: {
            ...globalDataRequests,
            deleteAllContent: {method: 'DELETE', path: '/db/', response: {}}
        }});

        await page.goto('/');

        const dangerZone = page.getByTestId('dangerzone');

        await dangerZone.getByTestId('delete-all-content').getByRole('button', {name: 'Delete', exact: true}).click();

        const modal = page.getByTestId('confirmation-modal');
        await modal.getByRole('button', {name: 'Delete', exact: true}).click();

        await expect(page.getByTestId('toast-success')).toContainText('All content deleted from database');

        expect(lastApiRequests.deleteAllContent).toBeTruthy();
    });

    test('Reset all authentication', async ({page}) => {
        const {lastApiRequests} = await mockApi({page, requests: {
            ...globalDataRequests,
            browseConfig: {
                ...globalDataRequests.browseConfig,
                response: {
                    config: {
                        ...responseFixtures.config.config,
                        labs: {
                            ...(responseFixtures.config.config as {labs?: Record<string, boolean>}).labs,
                            dangerZoneResetAuth: true
                        }
                    }
                }
            },
            resetAuth: {
                method: 'POST',
                path: '/authentication/reset/',
                response: {
                    security_action: [{action: 'reset_authentication', api_keys_rotated: 4, users_locked: 3}]
                }
            }
        }});

        await page.goto('/');

        const dangerZone = page.getByTestId('dangerzone');
        await dangerZone.getByTestId('reset-all-authentication').getByRole('button', {name: 'Reset', exact: true}).click();

        const modal = page.getByTestId('confirmation-modal');
        await modal.getByRole('button', {name: 'Reset all authentication'}).click();

        expect(lastApiRequests.resetAuth).toBeTruthy();
    });
});
