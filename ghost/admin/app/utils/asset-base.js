import ghostPaths from 'ghost-admin/utils/ghost-paths';

let _assetBase = null;

/**
 * Derives the asset base URL from where the Ember scripts were loaded.
 * If loaded from a CDN, returns the CDN base. If local, returns the admin root.
 *
 * Returns the base path (with trailing slash) that asset-relative paths
 * like 'assets/ghost-dark.css' can be appended to directly. Examples:
 *   CDN:   "https://assets.ghost.io/admin-forward/"
 *   Local: "https://mysite.com/ghost/"
 */
export default function assetBase() {
    if (_assetBase !== null) {
        return _assetBase;
    }

    // Find the Ember app script — its src tells us where assets are served from.
    // The browser always resolves script.src to an absolute URL.
    const script = document.querySelector('script[src*="ghost-admin"]')
                || document.querySelector('script[src*="/ghost."]');

    if (script && script.src) {
        try {
            const url = new URL(script.src);
            const assetsIdx = url.pathname.indexOf('/assets/');
            if (assetsIdx !== -1) {
                // Return the path up to (not including) /assets/, with trailing slash
                _assetBase = `${url.origin}${url.pathname.substring(0, assetsIdx)}/`;
                return _assetBase;
            }
        } catch (e) {
            // Fall through to ghostPaths
        }
    }

    _assetBase = ghostPaths().adminRoot;
    return _assetBase;
}
