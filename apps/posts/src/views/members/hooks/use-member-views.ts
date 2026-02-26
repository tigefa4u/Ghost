import {getSettingValue, useBrowseSettings, useEditSettings} from '@tryghost/admin-x-framework/api/settings';
import {useCallback, useMemo} from 'react';
import {z} from 'zod';
import type {Filter} from '@tryghost/shade';

// Schema for a single view (color optional for member views)
const memberViewSchema = z.object({
    name: z.string(),
    route: z.string(),
    color: z.string().optional(),
    icon: z.string().optional(),
    filter: z.record(z.string(), z.string().nullable())
});

const sharedViewsSchema = z.array(memberViewSchema);

export type MemberView = z.infer<typeof memberViewSchema>;

/**
 * Convert Filter[] (UI state) to a record for storage
 * e.g., [{field: 'status', operator: 'is', values: ['paid']}] → {status: 'is:paid'}
 */
export function filtersToRecord(filters: Filter[]): Record<string, string> {
    const record: Record<string, string> = {};
    for (const filter of filters) {
        if (filter.values[0] !== undefined) {
            record[filter.field] = `${filter.operator}:${String(filter.values[0])}`;
        }
    }
    return record;
}

/**
 * Convert a filter record to URL search params string
 * e.g., {status: 'is:paid'} → 'status=is%3Apaid'
 */
export function filterRecordToSearchParams(filter: Record<string, string | null>): URLSearchParams {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filter)) {
        if (value !== null && value !== undefined) {
            params.set(key, value);
        }
    }
    return params;
}

/**
 * Check if two filter records are equal
 */
function isFilterEqual(a: Record<string, string | null>, b: Record<string, string | null>): boolean {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();

    if (aKeys.length !== bKeys.length) {
        return false;
    }

    return aKeys.every((key, i) => key === bKeys[i] && a[key] === b[key]);
}

/**
 * Read all shared views from settings
 */
function parseSharedViews(settingsData: {settings: Array<{key: string; value: string | boolean | null}>} | undefined): MemberView[] {
    const json = getSettingValue<string>(settingsData?.settings ?? null, 'shared_views') ?? '[]';
    try {
        const parsed: unknown = JSON.parse(json);
        const result = sharedViewsSchema.safeParse(parsed);
        if (!result.success) {
            return [];
        }
        return result.data;
    } catch {
        return [];
    }
}

/**
 * Hook to read member views from the shared_views setting
 */
export function useMemberViews() {
    const {data: settingsData} = useBrowseSettings();

    const memberViews = useMemo(() => {
        const allViews = parseSharedViews(settingsData);
        return allViews.filter(v => v.route === 'members');
    }, [settingsData]);

    return memberViews;
}

/**
 * Hook to save a new member view
 */
export function useSaveMemberView() {
    const {data: settingsData} = useBrowseSettings();
    const {mutateAsync: editSettings} = useEditSettings();

    const save = useCallback(async (name: string, filters: Filter[]) => {
        const allViews = parseSharedViews(settingsData);
        const filterRecord = filtersToRecord(filters);

        // Check for duplicate name with different filter
        const duplicate = allViews.find(v => v.route === 'members' &&
            v.name.trim().toLowerCase() === name.trim().toLowerCase() &&
            !isFilterEqual(v.filter, filterRecord)
        );

        if (duplicate) {
            throw new Error('A view with this name already exists');
        }

        // Check if an identical view already exists (same filter)
        const existing = allViews.find(v => v.route === 'members' &&
            isFilterEqual(v.filter, filterRecord)
        );

        let updatedViews: MemberView[];
        if (existing) {
            // Update existing view
            updatedViews = allViews.map(v => (v === existing ? {...v, name: name.trim()} : v)
            );
        } else {
            // Add new view
            updatedViews = [...allViews, {
                name: name.trim(),
                route: 'members',
                filter: filterRecord
            }];
        }

        await editSettings([{
            key: 'shared_views',
            value: JSON.stringify(updatedViews)
        }]);
    }, [settingsData, editSettings]);

    return save;
}

/**
 * Hook to delete a member view
 */
export function useDeleteMemberView() {
    const {data: settingsData} = useBrowseSettings();
    const {mutateAsync: editSettings} = useEditSettings();

    const deleteView = useCallback(async (view: MemberView) => {
        const allViews = parseSharedViews(settingsData);
        const updatedViews = allViews.filter(v => !(v.route === 'members' && v.name === view.name && isFilterEqual(v.filter, view.filter))
        );

        await editSettings([{
            key: 'shared_views',
            value: JSON.stringify(updatedViews)
        }]);
    }, [settingsData, editSettings]);

    return deleteView;
}

/**
 * Find the active member view based on current filters
 */
export function useActiveMemberView(views: MemberView[], filters: Filter[]): MemberView | null {
    return useMemo(() => {
        if (filters.length === 0 || views.length === 0) {
            return null;
        }

        const currentFilter = filtersToRecord(filters);
        return views.find(v => isFilterEqual(v.filter, currentFilter)) ?? null;
    }, [views, filters]);
}
