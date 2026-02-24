import * as Sentry from '@sentry/react';
import {useFramework} from '../providers/framework-provider';
import {APIError, MaintenanceError, ServerUnreachableError, TimeoutError} from '../utils/errors';
import {getGhostPaths} from '../utils/helpers';
import handleResponse from '../utils/api/handle-response';

export interface RequestOptions {
    method?: string;
    body?: string | FormData;
    headers?: {
        'Content-Type'?: string;
    };
    credentials?: 'include' | 'omit' | 'same-origin';
    timeout?: number;
    retry?: boolean;
    onUploadProgress?: (progress: number) => void;
}

const requestWithXhr = (endpoint: string | URL, requestHeaders: Record<string, string>, options: RequestOptions, onUploadProgress: (progress: number) => void): Promise<Response> => {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        let didTimeout = false;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        xhr.open(options.method || 'GET', endpoint.toString(), true);
        xhr.withCredentials = options.credentials !== 'omit';
        xhr.responseType = 'arraybuffer';

        Object.entries(requestHeaders).forEach(([headerName, headerValue]) => {
            xhr.setRequestHeader(headerName, headerValue);
        });

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const progress = (event.loaded / event.total) * 100;
                onUploadProgress(progress);
            }
        };

        xhr.onload = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            const responseHeaders = new Headers();

            xhr.getAllResponseHeaders()?.trim().split(/[\r\n]+/).forEach((header) => {
                if (!header) {
                    return;
                }

                const separatorIndex = header.indexOf(':');

                if (separatorIndex === -1) {
                    return;
                }

                const headerName = header.slice(0, separatorIndex).trim();
                const headerValue = header.slice(separatorIndex + 1).trim();
                responseHeaders.append(headerName, headerValue);
            });

            resolve(new Response(xhr.response, {
                status: xhr.status,
                statusText: xhr.statusText,
                headers: responseHeaders
            }));
        };

        xhr.onerror = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            reject(new Error('Network request failed'));
        };

        xhr.onabort = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            if (didTimeout) {
                reject(new TimeoutError());
                return;
            }
            reject(new Error('Request aborted'));
        };

        if (options.timeout) {
            timeoutId = setTimeout(() => {
                didTimeout = true;
                xhr.abort();
            }, options.timeout);
        }

        if (typeof options.body === 'string' || options.body instanceof FormData) {
            xhr.send(options.body);
            return;
        }

        xhr.send();
    });
};

const requestWithFetch = (endpoint: string | URL, requestHeaders: Record<string, string>, options: RequestOptions) => {
    const controller = new AbortController();
    const {timeout} = options;

    if (timeout) {
        setTimeout(() => controller.abort(), timeout);
    }

    return fetch(endpoint, {
        headers: requestHeaders,
        method: 'GET',
        mode: 'cors',
        credentials: 'include',
        signal: controller.signal,
        ...options
    });
};

export const useFetchApi = () => {
    const {ghostVersion, sentryDSN} = useFramework();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return async <ResponseData = any>(endpoint: string | URL, {headers = {}, retry, onUploadProgress, ...options}: RequestOptions = {}): Promise<ResponseData> => {
        // By default, we set the Content-Type header to application/json
        const defaultHeaders: Record<string, string> = {
            'app-pragma': 'no-cache'
        };

        // Only include version header if ghostVersion is provided
        // This allows forward admin deployments to skip version checks
        if (ghostVersion) {
            defaultHeaders['x-ghost-version'] = ghostVersion;
        }

        if (typeof options.body === 'string') {
            defaultHeaders['content-type'] = 'application/json';
        }

        // attempt retries for 15 seconds in two situations:
        // 1. Server Unreachable error from the browser (code 0 or TypeError), typically from short internet blips
        // 2. Maintenance error from Ghost, upgrade in progress so API is temporarily unavailable
        let attempts = 0;
        const shouldRetry = retry !== false;
        let retryingMs = 0;
        const startTime = Date.now();
        const maxRetryingMs = 15_000;
        const retryPeriods = [500, 1000];
        const retryableErrors = [ServerUnreachableError, MaintenanceError, TypeError];

        const getErrorData = (error?: APIError, response?: Response) => {
            const data: Record<string, unknown> = {
                errorName: error?.name,
                attempts,
                totalSeconds: retryingMs / 1000,
                endpoint: endpoint.toString()
            };
            if (endpoint.toString().includes('/ghost/api/')) {
                data.server = response?.headers.get('server');
            }
            return data;
        };

        while (attempts === 0 || shouldRetry) {
            try {
                const requestHeaders = {
                    ...defaultHeaders,
                    ...headers
                };

                // Only `XMLHttpRequest` supports progress, so we use that if we have to.
                // Otherwise, we prefer `fetch`.
                const response = onUploadProgress
                    ? await requestWithXhr(endpoint, requestHeaders, options, onUploadProgress)
                    : await requestWithFetch(endpoint, requestHeaders, options);

                return handleResponse(response) as ResponseData;
            } catch (error) {
                retryingMs = Date.now() - startTime;

                if (shouldRetry && (import.meta.env.MODE !== 'development' && retryableErrors.some(errorClass => error instanceof errorClass) && retryingMs <= maxRetryingMs)) {
                    await new Promise((resolve) => {
                        setTimeout(resolve, retryPeriods[attempts] || retryPeriods[retryPeriods.length - 1]);
                    });
                    attempts += 1;
                    continue;
                }

                if (attempts !== 0 && sentryDSN) {
                    Sentry.captureMessage('Request failed after multiple attempts', {extra: getErrorData()});
                }

                if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
                    throw new TimeoutError();
                }

                let newError = error;

                if (!(error instanceof APIError)) {
                    newError = new ServerUnreachableError({cause: error});
                }

                throw newError;
            };
        }

        // Used for type checking
        // this can't happen, but TS isn't smart enough to undeerstand that the loop will never exit without an error or return
        // because of shouldRetry + attemps usage combination
        return undefined as never;
    };
};

const {apiRoot, activityPubRoot} = getGhostPaths();

export const apiUrl = (path: string, searchParams: Record<string, string> = {}, useActivityPub: boolean = false) => {
    const root = useActivityPub ? activityPubRoot : apiRoot;
    const url = new URL(`${root}${path}`, window.location.origin);
    url.search = new URLSearchParams(searchParams).toString();
    return url.toString();
};
