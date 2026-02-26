import { useMemo } from 'react';
import { z } from 'zod';
import { useBrowseSettings, getSettingValue } from '@tryghost/admin-x-framework/api/settings';

const memberViewSchema = z.object({
    name: z.string(),
    route: z.string(),
    filter: z.record(z.string(), z.string().nullable())
});
const sharedViewsSchema = z.array(memberViewSchema);

export type MemberView = z.infer<typeof memberViewSchema>;

export function useMemberViews() {
    const { data: settingsData } = useBrowseSettings();

    return useMemo(() => {
        const json = getSettingValue<string>(settingsData?.settings, 'shared_views') ?? '[]';

        try {
            const parsed: unknown = JSON.parse(json);
            const result = sharedViewsSchema.safeParse(parsed);

            if (!result.success) {
                return [];
            }

            return result.data.filter(view => view.route === 'members');
        } catch {
            return [];
        }
    }, [settingsData]);
}
