import errors from '@tryghost/errors';
import tpl from '@tryghost/tpl';
import type {RouteSettings, Route, CollectionConfig, RouteData, DataEntry} from './route-settings-parser';

const messages = {
    validationError: 'The following definition "{at}" is invalid: {reason}',
    badDataError: 'Please wrap the data definition into a custom name.',
    badDataHelp: 'Example:\n data:\n  my-tag:\n    resource: tags\n    ...\n',
    authorDeprecatedError: 'Please choose a different name. We recommend not using author.'
};

const VALID_TAXONOMY_KEYS = ['tag', 'author'];
const VALID_DATA_RESOURCES: readonly string[] = ['tags', 'posts', 'pages', 'authors'];
const VALID_SHORTFORM_RESOURCES: readonly string[] = ['tag', 'page', 'post', 'author'];
const VALID_DATA_TYPES: readonly string[] = ['read', 'browse'];
const RESERVED_DATA_KEYS = ['resource', 'type', 'limit', 'order', 'include', 'filter', 'status', 'visibility', 'slug', 'redirect'];

function requireLeadingSlash(value: string, label: string): void {
    if (!value.startsWith('/')) {
        throw new errors.ValidationError({
            message: tpl(messages.validationError, {at: value, reason: 'A leading slash is required.'}),
            context: label
        });
    }
}

function requireTrailingSlash(value: string, label: string): void {
    if (!value.endsWith('/')) {
        throw new errors.ValidationError({
            message: tpl(messages.validationError, {at: value, reason: 'A trailing slash is required.'}),
            context: label
        });
    }
}

function rejectColonNotation(value: string): void {
    if (/\/:\w+/.test(value)) {
        throw new errors.ValidationError({
            message: tpl(messages.validationError, {
                at: value,
                reason: 'Please use the following notation e.g. /{slug}/.'
            })
        });
    }
}

function validateDataEntry(key: string, entry: DataEntry): void {
    if (typeof entry === 'string') {
        if (!entry.match(/^[a-zA-Z0-9_]+\.[a-zA-Z0-9_-]+$/)) {
            throw new errors.ValidationError({
                message: tpl(messages.validationError, {
                    at: entry,
                    reason: 'Incorrect Format. Please use e.g. tag.recipes'
                })
            });
        }

        const resource = entry.split('.')[0];
        if (!VALID_SHORTFORM_RESOURCES.includes(resource)) {
            throw new errors.ValidationError({
                message: tpl(messages.validationError, {
                    at: entry,
                    reason: `${resource} not supported. Please use ${VALID_SHORTFORM_RESOURCES.join(', ')}.`
                })
            });
        }
        return;
    }

    if (!entry.resource) {
        throw new errors.ValidationError({
            message: tpl(messages.validationError, {
                at: JSON.stringify(entry),
                reason: 'resource is required.'
            })
        });
    }

    if (!entry.type) {
        throw new errors.ValidationError({
            message: tpl(messages.validationError, {
                at: JSON.stringify(entry),
                reason: 'type is required.'
            })
        });
    }

    if (!VALID_DATA_TYPES.includes(entry.type)) {
        throw new errors.ValidationError({
            message: tpl(messages.validationError, {
                at: JSON.stringify(entry),
                reason: `${entry.type} not supported. Please use ${VALID_DATA_TYPES.join(', ')}.`
            })
        });
    }

    if (!VALID_DATA_RESOURCES.includes(entry.resource)) {
        throw new errors.ValidationError({
            message: tpl(messages.validationError, {
                at: JSON.stringify(entry),
                reason: `${entry.resource} not supported. Please use ${VALID_DATA_RESOURCES.join(', ')}.`
            })
        });
    }

    if (entry.type === 'read' && !('slug' in entry && entry.slug)) {
        throw new errors.ValidationError({
            message: tpl(messages.validationError, {
                at: JSON.stringify(entry),
                reason: 'slug is required for read data entries.'
            })
        });
    }
}

function validateRouteData(data: RouteData | undefined): void {
    if (data === undefined) {
        return;
    }

    if (typeof data === 'string') {
        validateDataEntry('data', data);
        return;
    }

    for (const [key, entry] of Object.entries(data)) {
        if (RESERVED_DATA_KEYS.includes(key)) {
            throw new errors.ValidationError({
                message: tpl(messages.badDataError),
                help: tpl(messages.badDataHelp)
            });
        }

        if (key === 'author') {
            throw new errors.ValidationError({
                message: tpl(messages.authorDeprecatedError)
            });
        }

        validateDataEntry(key, entry);
    }
}

function validateRoute(route: Route): void {
    requireLeadingSlash(route.path, 'route path');
    requireTrailingSlash(route.path, 'route path');
    rejectColonNotation(route.path);

    if (!route.templates || route.templates.length === 0) {
        if (route.type === 'template' && !route.data) {
            throw new errors.ValidationError({
                message: tpl(messages.validationError, {
                    at: route.path,
                    reason: 'Please define a template.'
                }),
                help: 'e.g. /about/: about'
            });
        }
    }

    validateRouteData(route.data);
}

function validateCollection(collection: CollectionConfig): void {
    requireLeadingSlash(collection.path, 'collection path');
    requireTrailingSlash(collection.path, 'collection path');

    if (!collection.permalink) {
        throw new errors.ValidationError({
            message: tpl(messages.validationError, {
                at: collection.path,
                reason: 'Please define a permalink route.'
            }),
            help: 'e.g. permalink: /{slug}/'
        });
    }

    requireLeadingSlash(collection.permalink, 'permalink');
    requireTrailingSlash(collection.permalink, 'permalink');
    rejectColonNotation(collection.permalink);

    validateRouteData(collection.data);
}

function validateTaxonomies(taxonomies: Record<string, string | undefined>): void {
    for (const [key, value] of Object.entries(taxonomies)) {
        if (!VALID_TAXONOMY_KEYS.includes(key)) {
            throw new errors.ValidationError({
                message: tpl(messages.validationError, {
                    at: key,
                    reason: 'Unknown taxonomy.'
                })
            });
        }

        if (!value) {
            throw new errors.ValidationError({
                message: tpl(messages.validationError, {
                    at: key,
                    reason: 'Please define a taxonomy permalink route.'
                }),
                help: 'e.g. tag: /tag/{slug}/'
            });
        }

        requireLeadingSlash(value, 'taxonomy permalink');
        requireTrailingSlash(value, 'taxonomy permalink');
        rejectColonNotation(value);
    }
}

/**
 * Structural validation of a RouteSettings domain model.
 */
export function validateRouteSettings(settings: RouteSettings): void {
    for (const route of settings.routes) {
        validateRoute(route);
    }

    for (const collection of settings.collections) {
        validateCollection(collection);
    }

    validateTaxonomies(settings.taxonomies as Record<string, string | undefined>);
}
