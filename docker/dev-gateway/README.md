# Dev Gateway (Caddy)

This directory contains the Caddy reverse proxy configuration for the Ghost development environment.

## Purpose

The Caddy reverse proxy container:

1. **Routes Ghost requests** to the Ghost container backend
2. **Proxies asset requests** to local dev servers running on the host
3. **Enables hot-reload** for frontend development without rebuilding Ghost


## Configuration

### Environment Variables

Caddy uses environment variables (set in `compose.dev.yaml`) to configure proxy targets:

- `GHOST_BACKEND` - Ghost container hostname (e.g., `ghost-dev:2368`)
- `ADMIN_DEV_SERVER` - React admin dev server (e.g., `host.docker.internal:5173`)
- `ADMIN_LIVE_RELOAD_SERVER` - Ember live reload WebSocket (e.g., `host.docker.internal:4201`)
- `PORTAL_DEV_SERVER` - Portal dev server (e.g., `host.docker.internal:4175`)
- `COMMENTS_DEV_SERVER` - Comments UI (e.g., `host.docker.internal:7173`)
- `SIGNUP_DEV_SERVER` - Signup form (e.g., `host.docker.internal:6174`)
- `SEARCH_DEV_SERVER` - Sodo search (e.g., `host.docker.internal:4178`)
- `ANNOUNCEMENT_DEV_SERVER` - Announcement bar (e.g., `host.docker.internal:4177`)
- `LEXICAL_DEV_SERVER` - *Optional:* Local Lexical editor (e.g., `host.docker.internal:4173`)
  - Automatically falls through to Ghost backend if dev server is not running
  - No need to comment/uncomment - just start the Lexical dev server when needed

**Note:** AdminX React apps (admin-x-settings, activitypub, posts, stats) are served through the admin dev server so they don't need separate proxy entries.

### Routing Rules

The Caddyfile defines these routing rules:

| Path Pattern                | Target                               | Purpose                                                                  |
|-----------------------------|--------------------------------------|--------------------------------------------------------------------------|
| `/ember-cli-live-reload.js` | Admin live reload server (port 4201) | Ember hot-reload script and WebSocket                                    |
| `/ghost/api/*`              | Ghost backend                        | Ghost API (bypasses admin dev server)                                    |
| `/ghost/*`                  | Admin dev server (port 5173)         | React admin interface and assets (with WebSocket support)                |
| `/lexical/*`                | Lexical dev server (port 4173)       | *Optional:* Local Lexical editor (falls through to Ghost if not running) |
| `/portal.min.js`            | Portal dev server (port 4175)        | Membership UI                                                            |
| `/comments-ui.min.js`       | Comments dev server (port 7173)      | Comments widget                                                          |
| `/signup-form.min.js`       | Signup dev server (port 6174)        | Signup form widget                                                       |
| `/sodo-search.min.js`       | Search dev server (port 4178)        | Search widget (CSS loaded directly)                                      |
| `/announcement-bar.min.js`  | Announcement dev server (port 4177)  | Announcement widget                                                      |
| Everything else             | Ghost backend                        | Main Ghost application                                                   |

**Note:** All port numbers listed are the host ports where dev servers run. AdminX React apps are bundled through the Ember admin dev server.

## Usage

This is automatically used when running `yarn dev` at the root of teh repository.

## Logs

To view Caddy logs for debugging:

```bash
docker compose -f compose.dev.yaml logs -f ghost-dev-gateway
```
