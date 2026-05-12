import {SettingsPage} from '@/admin-pages';
import {expect, test} from '@/helpers/playwright';

test.describe('Ghost Admin - Danger Zone security actions', () => {
    test.use({labs: {dangerZoneResetAuth: true}});

    test('reset all authentication button - confirmation modal opens with the expected destructive action', async ({page}) => {
        const settingsPage = new SettingsPage(page);
        await settingsPage.dangerZoneSection.goto();

        await expect(settingsPage.dangerZoneSection.resetAuthButton).toBeVisible();

        await settingsPage.dangerZoneSection.openResetAuthModal();

        await expect(settingsPage.dangerZoneSection.resetAuthOkButton).toBeVisible();
        await expect(settingsPage.dangerZoneSection.resetAuthOkButton).toBeEnabled();
    });
});
