import {renderHook} from '@testing-library/react';
import {AddressInfo} from 'node:net';
import http, {IncomingMessage, ServerResponse} from 'node:http';
import React, {ReactNode} from 'react';
import {vi} from 'vitest';
import {FrameworkProvider} from '../../../src/providers/framework-provider';
import {useFetchApi} from '../../../src/hooks/use-fetch-api';
import {TimeoutError} from '../../../src/utils/errors';

const wrapper: React.FC<{ children: ReactNode }> = ({children}) => (
    <FrameworkProvider
        externalNavigate={() => {}}
        ghostVersion='5.x'
        sentryDSN=''
        unsplashConfig={{
            Authorization: '',
            'Accept-Version': '',
            'Content-Type': '',
            'App-Pragma': '',
            'X-Unsplash-Cache': true
        }}
        onDelete={() => {}}
        onInvalidate={() => {}}
        onUpdate={() => {}}
    >
        {children}
    </FrameworkProvider>
);

describe('useFetchApi', () => {
    let server: http.Server;
    let baseUrl: string;
    let receivedRequest: {
        method: string | undefined;
        headers: IncomingMessage['headers'];
        body: string;
    };

    beforeEach(async () => {
        server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
            const chunks: Buffer[] = [];

            req.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });

            req.on('end', () => {
                receivedRequest = {
                    method: req.method,
                    headers: req.headers,
                    body: Buffer.concat(chunks).toString('utf8')
                };

                const sendResponse = () => {
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': '*',
                        'Access-Control-Allow-Headers': '*',
                        'Access-Control-Allow-Credentials': 'true'
                    });
                    res.end(JSON.stringify({test: 1}));
                };

                if (req.url?.includes('/slow/')) {
                    setTimeout(sendResponse, 100);
                    return;
                }

                sendResponse();
            });
        });

        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                const address = server.address() as AddressInfo;
                baseUrl = `http://127.0.0.1:${address.port}`;
                resolve();
            });
        });
    });

    afterEach(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    });

    it('makes an API request', async () => {
        const {result} = renderHook(() => useFetchApi(), {wrapper});

        const data = await result.current<{test: number}>(`${baseUrl}/ghost/api/admin/test/`, {
            method: 'POST',
            body: 'test',
            retry: false
        });

        expect(data).toEqual({test: 1});

        expect(receivedRequest.method).toBe('POST');
        expect(receivedRequest.body).toBe('test');
        expect(receivedRequest.headers['x-ghost-version']).toBe('5.x');
        expect(receivedRequest.headers['app-pragma']).toBe('no-cache');
        expect(receivedRequest.headers['content-type']).toBe('application/json');
    });

    it('throws a timeout error when request exceeds timeout', async () => {
        const {result} = renderHook(() => useFetchApi(), {wrapper});

        await expect(result.current(`${baseUrl}/ghost/api/admin/slow/`, {
            timeout: 20,
            retry: false
        })).rejects.toBeInstanceOf(TimeoutError);
    });

    it('uses XMLHttpRequest and emits upload progress when onUploadProgress is provided', async () => {
        const {result} = renderHook(() => useFetchApi(), {wrapper});

        const onUploadProgress = vi.fn();

        const data = await result.current<{test: number}>(`${baseUrl}/ghost/api/admin/test/`, {
            method: 'POST',
            body: 'test',
            retry: false,
            onUploadProgress
        });

        expect(data).toEqual({test: 1});

        expect(receivedRequest.method).toBe('POST');
        expect(receivedRequest.body).toBe('test');
        expect(receivedRequest.headers['x-ghost-version']).toBe('5.x');
        expect(receivedRequest.headers['app-pragma']).toBe('no-cache');
        expect(receivedRequest.headers['content-type']).toBe('application/json');

        expect(onUploadProgress).toHaveBeenCalledWith(expect.any(Number));
    });
});
