import assert from 'node:assert/strict';
import errors from '@tryghost/errors';
import {validateRouteSettings} from '../../../../../core/server/services/route-settings/validate-route-settings';
import type {RouteSettings} from '../../../../../core/server/services/route-settings/route-settings-parser';

function empty(): RouteSettings {
    return {routes: [], collections: [], taxonomies: {}};
}

describe('UNIT: services/route-settings/validate-route-settings', function () {
    it('accepts valid empty settings', function () {
        assert.doesNotThrow(() => validateRouteSettings(empty()));
    });

    it('accepts valid default settings', function () {
        assert.doesNotThrow(() => validateRouteSettings({
            routes: [],
            collections: [{path: '/', permalink: '/{slug}/', templates: ['index']}],
            taxonomies: {tag: '/tag/{slug}/', author: '/author/{slug}/'}
        }));
    });

    describe('route validation', function () {
        it('throws on route path without leading slash', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                routes: [{type: 'template', path: 'about/', templates: ['about']}]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on route path without trailing slash', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                routes: [{type: 'template', path: '/about', templates: ['about']}]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on template route with no template and no data', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                routes: [{type: 'template', path: '/empty/', templates: []}]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('accepts template route with data but no template', function () {
            assert.doesNotThrow(() => validateRouteSettings({
                ...empty(),
                routes: [{type: 'template', path: '/food/', templates: [], data: 'tag.food'}]
            }));
        });

        it('accepts channel route with no template', function () {
            assert.doesNotThrow(() => validateRouteSettings({
                ...empty(),
                routes: [{type: 'channel', path: '/featured/', templates: [], filter: 'featured:true', rss: true}]
            }));
        });

        it('throws on route path with :slug notation', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                routes: [{type: 'template', path: '/foo/:slug/', templates: ['post']}]
            }), (err: any) => err instanceof errors.ValidationError);
        });
    });

    describe('collection validation', function () {
        it('throws on collection path without leading slash', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                collections: [{path: 'blog/', permalink: '/{slug}/', templates: []}]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on collection path without trailing slash', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                collections: [{path: '/blog', permalink: '/{slug}/', templates: []}]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws when permalink is missing', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                collections: [{path: '/', permalink: '', templates: []}]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on permalink without leading slash', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                collections: [{path: '/', permalink: '{slug}/', templates: []}]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on permalink without trailing slash', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                collections: [{path: '/', permalink: '/{slug}', templates: []}]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on permalink using :slug notation', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                collections: [{path: '/', permalink: '/:slug/', templates: []}]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('accepts valid permalink with {slug}', function () {
            assert.doesNotThrow(() => validateRouteSettings({
                ...empty(),
                collections: [{path: '/', permalink: '/{slug}/', templates: []}]
            }));
        });

        it('accepts permalink with multiple params', function () {
            assert.doesNotThrow(() => validateRouteSettings({
                ...empty(),
                collections: [{path: '/', permalink: '/{primary_tag}/{slug}/', templates: []}]
            }));
        });
    });

    describe('taxonomy validation', function () {
        it('throws on unknown taxonomy key', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                taxonomies: {category: '/category/{slug}/'} as any
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on taxonomy without leading slash', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                taxonomies: {tag: 'tag/{slug}/'}
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on taxonomy without trailing slash', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                taxonomies: {tag: '/tag/{slug}'}
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on taxonomy using :slug notation', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                taxonomies: {tag: '/tag/:slug/'}
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on empty taxonomy value', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                taxonomies: {tag: ''}
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('accepts valid taxonomies', function () {
            assert.doesNotThrow(() => validateRouteSettings({
                ...empty(),
                taxonomies: {tag: '/tag/{slug}/', author: '/author/{slug}/'}
            }));
        });
    });

    describe('data validation', function () {
        it('accepts valid shortform data', function () {
            assert.doesNotThrow(() => validateRouteSettings({
                ...empty(),
                routes: [{type: 'template', path: '/food/', templates: ['food'], data: 'tag.food'}]
            }));
        });

        it('throws on invalid shortform data format', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                routes: [{type: 'template', path: '/food/', templates: ['food'], data: 'tag:food' as any}]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on shortform data with trailing junk', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                routes: [{type: 'template', path: '/food/', templates: ['food'], data: 'tag.food:' as any}]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on shortform data with extra dot segments', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                routes: [{type: 'template', path: '/food/', templates: ['food'], data: 'tag.food.extra' as any}]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on invalid shortform resource name', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                routes: [{type: 'template', path: '/food/', templates: ['food'], data: 'category.food' as any}]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('accepts valid longform data', function () {
            assert.doesNotThrow(() => validateRouteSettings({
                ...empty(),
                routes: [{
                    type: 'template', path: '/food/', templates: ['food'],
                    data: {featured: {resource: 'posts', type: 'browse', filter: 'featured:true'}}
                }]
            }));
        });

        it('throws on longform data missing resource', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                routes: [{
                    type: 'template', path: '/food/', templates: ['food'],
                    data: {featured: {type: 'browse'} as any}
                }]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on read data entry without slug', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                routes: [{
                    type: 'template', path: '/food/', templates: ['food'],
                    data: {featured: {resource: 'posts', type: 'read'} as any}
                }]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('accepts read data entry with slug', function () {
            assert.doesNotThrow(() => validateRouteSettings({
                ...empty(),
                routes: [{
                    type: 'template', path: '/food/', templates: ['food'],
                    data: {featured: {resource: 'posts', type: 'read', slug: 'my-post'}}
                }]
            }));
        });

        it('throws on longform data missing type', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                routes: [{
                    type: 'template', path: '/food/', templates: ['food'],
                    data: {featured: {resource: 'posts'} as any}
                }]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on longform data with invalid type', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                routes: [{
                    type: 'template', path: '/food/', templates: ['food'],
                    data: {featured: {resource: 'posts', type: 'edit'} as any}
                }]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on longform data with invalid resource', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                routes: [{
                    type: 'template', path: '/food/', templates: ['food'],
                    data: {featured: {resource: 'subscribers', type: 'browse'} as any}
                }]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on reserved key name in data', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                routes: [{
                    type: 'template', path: '/food/', templates: ['food'],
                    data: {resource: {resource: 'posts', type: 'browse'}} as any
                }]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('throws on author key name in data', function () {
            assert.throws(() => validateRouteSettings({
                ...empty(),
                routes: [{
                    type: 'template', path: '/food/', templates: ['food'],
                    data: {author: {resource: 'authors', type: 'read', slug: 'ghost'}} as any
                }]
            }), (err: any) => err instanceof errors.ValidationError);
        });

        it('accepts mixed shortform and longform data entries', function () {
            assert.doesNotThrow(() => validateRouteSettings({
                ...empty(),
                routes: [{
                    type: 'template', path: '/food/', templates: ['food'],
                    data: {
                        featured: {resource: 'posts', type: 'browse'},
                        main_tag: 'tag.getting-started'
                    }
                }]
            }));
        });
    });
});
