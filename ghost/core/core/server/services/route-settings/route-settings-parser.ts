import yaml from 'js-yaml';

export type DataShortFormResource = 'tag' | 'page' | 'post' | 'author';
export type DataLongFormResource = 'tags' | 'posts' | 'pages' | 'authors';

export type DataShortForm = `${DataShortFormResource}.${string}`;

export interface DataReadEntry {
    type: 'read';
    resource: DataLongFormResource;
    slug: string;
    redirect?: boolean;
    include?: string;
    visibility?: string;
    status?: string;
}

export interface DataBrowseEntry {
    type: 'browse';
    resource: DataLongFormResource;
    filter?: string;
    limit?: number | 'all';
    order?: string;
    include?: string;
    fields?: string;
    visibility?: string;
    status?: string;
    page?: number;
}

export type DataLongFormEntry = DataReadEntry | DataBrowseEntry;
export type DataEntry = DataShortForm | DataLongFormEntry;
export type RouteData = DataShortForm | Record<string, DataEntry>;

interface RouteBase {
    path: string;
    templates?: string[];
    data?: RouteData;
}

export interface ChannelRoute extends RouteBase {
    type: 'channel';
    filter?: string;
    order?: string;
    limit?: number | 'all';
    rss: boolean;
}

export interface TemplateRoute extends RouteBase {
    type: 'template';
    contentType?: string;
}

export type Route = ChannelRoute | TemplateRoute;

export interface CollectionConfig {
    path: string;
    permalink: string;
    templates?: string[];
    filter?: string;
    order?: string;
    limit?: number | 'all';
    rss?: boolean;
    data?: RouteData;
}

export interface TaxonomyConfig {
    tag?: string;
    author?: string;
}

export interface RouteSettings {
    routes: Route[];
    collections: CollectionConfig[];
    taxonomies: TaxonomyConfig;
}

// ---------------------------------------------------------------------------
// Raw YAML shape — what js-yaml.load() returns for a routes.yaml file
// ---------------------------------------------------------------------------

interface RawRouteValue {
    template?: string | string[];
    data?: unknown;
    content_type?: string;
    controller?: string;
    filter?: string;
    order?: string;
    limit?: number | 'all';
    rss?: boolean;
}

interface RawCollectionValue {
    permalink: string;
    template?: string | string[];
    data?: unknown;
    filter?: string;
    order?: string;
    limit?: number | 'all';
    rss?: boolean;
}

interface RawYaml {
    routes?: Record<string, string | RawRouteValue> | null;
    collections?: Record<string, RawCollectionValue> | null;
    taxonomies?: Record<string, string> | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeTemplates(value: string | string[] | undefined): string[] {
    if (!value) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

function parseRoute(path: string, value: string | RawRouteValue): Route {
    if (typeof value === 'string') {
        return {type: 'template', path, templates: [value]};
    }

    const templates = normalizeTemplates(value.template);

    if (value.controller === 'channel') {
        const route: ChannelRoute = {
            type: 'channel',
            path,
            templates,
            rss: value.rss !== undefined ? value.rss : true
        };
        if (value.filter !== undefined) {
            route.filter = value.filter;
        }
        if (value.order !== undefined) {
            route.order = value.order;
        }
        if (value.limit !== undefined) {
            route.limit = value.limit;
        }
        if (value.data !== undefined) {
            route.data = value.data as RouteData;
        }
        return route;
    }

    const route: TemplateRoute = {type: 'template', path, templates};
    if (value.content_type !== undefined) {
        route.contentType = value.content_type;
    }
    if (value.data !== undefined) {
        route.data = value.data as RouteData;
    }
    return route;
}

function parseCollection(path: string, value: RawCollectionValue): CollectionConfig {
    const collection: CollectionConfig = {
        path,
        permalink: value.permalink,
        templates: normalizeTemplates(value.template)
    };
    if (value.filter !== undefined) {
        collection.filter = value.filter;
    }
    if (value.order !== undefined) {
        collection.order = value.order;
    }
    if (value.limit !== undefined) {
        collection.limit = value.limit;
    }
    if (value.rss !== undefined) {
        collection.rss = value.rss;
    }
    if (value.data !== undefined) {
        collection.data = value.data as RouteData;
    }
    return collection;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseRouteSettings(raw: unknown): RouteSettings {
    const obj = (raw || {}) as RawYaml;

    const routes: Route[] = [];
    if (obj.routes && typeof obj.routes === 'object') {
        for (const [path, value] of Object.entries(obj.routes)) {
            routes.push(parseRoute(path, value));
        }
    }

    const collections: CollectionConfig[] = [];
    if (obj.collections && typeof obj.collections === 'object') {
        for (const [path, value] of Object.entries(obj.collections)) {
            collections.push(parseCollection(path, value));
        }
    }

    const taxonomies: TaxonomyConfig = {};
    if (obj.taxonomies && typeof obj.taxonomies === 'object') {
        const rawTaxonomies = obj.taxonomies as Record<string, string>;
        if (rawTaxonomies.tag) {
            taxonomies.tag = rawTaxonomies.tag;
        }
        if (rawTaxonomies.author) {
            taxonomies.author = rawTaxonomies.author;
        }
    }

    return {routes, collections, taxonomies};
}

export function serializeRouteSettings(settings: RouteSettings): string {
    const obj: Record<string, unknown> = {};

    // Routes: array → object keyed by path
    const routes: Record<string, unknown> = {};
    for (const route of settings.routes) {
        if (route.type === 'template' && route.templates?.length === 1 && !route.data && !(route as TemplateRoute).contentType) {
            routes[route.path] = route.templates[0];
        } else {
            const entry: Record<string, unknown> = {};
            if (route.templates && route.templates.length > 0) {
                entry.template = route.templates.length === 1 ? route.templates[0] : route.templates;
            }
            if (route.data !== undefined) {
                entry.data = route.data;
            }
            if (route.type === 'channel') {
                const channel = route as ChannelRoute;
                entry.controller = 'channel';
                if (channel.filter !== undefined) {
                    entry.filter = channel.filter;
                }
                if (channel.order !== undefined) {
                    entry.order = channel.order;
                }
                if (channel.limit !== undefined) {
                    entry.limit = channel.limit;
                }
                if (channel.rss !== true) {
                    entry.rss = channel.rss;
                }
            } else {
                const tmpl = route as TemplateRoute;
                if (tmpl.contentType !== undefined) {
                    entry.content_type = tmpl.contentType;
                }
            }
            routes[route.path] = entry;
        }
    }
    obj.routes = Object.keys(routes).length > 0 ? routes : null;

    // Collections: array → object keyed by path
    const collections: Record<string, unknown> = {};
    for (const coll of settings.collections) {
        const entry: Record<string, unknown> = {permalink: coll.permalink};
        if (coll.templates && coll.templates.length > 0) {
            entry.template = coll.templates.length === 1 ? coll.templates[0] : coll.templates;
        }
        if (coll.filter !== undefined) {
            entry.filter = coll.filter;
        }
        if (coll.order !== undefined) {
            entry.order = coll.order;
        }
        if (coll.limit !== undefined) {
            entry.limit = coll.limit;
        }
        if (coll.rss !== undefined) {
            entry.rss = coll.rss;
        }
        if (coll.data !== undefined) {
            entry.data = coll.data;
        }
        collections[coll.path] = entry;
    }
    obj.collections = Object.keys(collections).length > 0 ? collections : null;

    // Taxonomies
    obj.taxonomies = Object.keys(settings.taxonomies).length > 0 ? settings.taxonomies : null;

    return yaml.dump(obj, {quotingType: '\'', forceQuotes: false});
}
