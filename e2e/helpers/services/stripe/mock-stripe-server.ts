import baseDebug from '@tryghost/debug';
import http from 'http';
import type {StripeCustomer, StripePaymentMethod, StripeSubscription} from './builders';

const debug = baseDebug('e2e:mock-stripe');

export class MockStripeServer {
    private server: http.Server | null = null;
    private readonly _port: number;
    private readonly customers: Map<string, StripeCustomer> = new Map();
    private readonly subscriptions: Map<string, StripeSubscription> = new Map();
    private readonly paymentMethods: Map<string, StripePaymentMethod> = new Map();
    private billingPortalConfigured: boolean = false;
    private billingPortalWaiters: Array<() => void> = [];

    constructor(port: number) {
        this._port = port;
    }

    get port(): number {
        return this._port;
    }

    upsertCustomer(customer: StripeCustomer): void {
        this.customers.set(customer.id, customer);
    }

    upsertSubscription(subscription: StripeSubscription): void {
        this.subscriptions.set(subscription.id, subscription);
    }

    upsertPaymentMethod(paymentMethod: StripePaymentMethod): void {
        this.paymentMethods.set(paymentMethod.id, paymentMethod);
    }

    /**
     * Wait for Ghost to call POST /v1/billing_portal/configurations,
     * which is the last step of Stripe reconfiguration. This confirms
     * that Ghost has picked up the Stripe keys and is using our mock server.
     */
    async waitForBillingPortalConfig(timeoutMs: number = 15000): Promise<void> {
        if (this.billingPortalConfigured) {
            return;
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Timed out waiting for Ghost to configure billing portal'));
            }, timeoutMs);

            this.billingPortalWaiters.push(() => {
                clearTimeout(timer);
                resolve();
            });
        });
    }

    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            this.server.on('error', reject);
            this.server.listen(this._port, () => {
                resolve();
            });
        });
    }

    async stop(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.server) {
                resolve();
                return;
            }
            this.server.close(() => {
                this.server = null;
                resolve();
            });
        });
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        const url = req.url ?? '';
        const method = req.method ?? '';

        debug(`${method} ${url}`);

        // GET /v1/customers/:id — returns customer with embedded subscriptions
        const customerMatch = url.match(/^\/v1\/customers\/([^/?]+)/);
        if (method === 'GET' && customerMatch) {
            const customerId = customerMatch[1];
            const customer = this.customers.get(customerId);

            if (!customer) {
                debug(`Customer not found: ${customerId}`);
                res.writeHead(404, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({error: {type: 'invalid_request_error', message: 'No such customer'}}));
                return;
            }

            // Build response with embedded subscriptions (handles expand[]=subscriptions)
            // Expand default_payment_method from ID to full object (handles expand[]=subscriptions.data.default_payment_method)
            const customerSubscriptions = Array.from(this.subscriptions.values())
                .filter(s => s.customer === customerId)
                .map(s => ({
                    ...s,
                    default_payment_method: s.default_payment_method
                        ? (this.paymentMethods.get(s.default_payment_method) ?? s.default_payment_method)
                        : null
                }));

            const response = {
                ...customer,
                subscriptions: {
                    type: 'list' as const,
                    data: customerSubscriptions
                }
            };

            debug(`Returning customer: ${customerId} with ${customerSubscriptions.length} subscription(s)`);
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(response));
            return;
        }

        // GET /v1/subscriptions/:id — returns subscription
        const subscriptionMatch = url.match(/^\/v1\/subscriptions\/([^/?]+)/);
        if (method === 'GET' && subscriptionMatch) {
            const subscriptionId = subscriptionMatch[1];
            const subscription = this.subscriptions.get(subscriptionId);

            if (!subscription) {
                debug(`Subscription not found: ${subscriptionId}`);
                res.writeHead(404, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({error: {type: 'invalid_request_error', message: 'No such subscription'}}));
                return;
            }

            debug(`Returning subscription: ${subscriptionId}`);
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(subscription));
            return;
        }

        // GET /v1/payment_methods/:id — returns payment method
        const paymentMethodMatch = url.match(/^\/v1\/payment_methods\/([^/?]+)/);
        if (method === 'GET' && paymentMethodMatch) {
            const paymentMethodId = paymentMethodMatch[1];
            const paymentMethod = this.paymentMethods.get(paymentMethodId);

            if (!paymentMethod) {
                debug(`Payment method not found: ${paymentMethodId}`);
                res.writeHead(404, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({error: {type: 'invalid_request_error', message: 'No such payment method'}}));
                return;
            }

            debug(`Returning payment method: ${paymentMethodId}`);
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(paymentMethod));
            return;
        }

        // POST /v1/billing_portal/configurations(/:id) — returns a portal config
        const portalMatch = url.match(/^\/v1\/billing_portal\/configurations\/?([^/?]*)?/);
        if (method === 'POST' && portalMatch) {
            const id = portalMatch[1] || 'bpc_fake';
            debug(`Returning billing portal configuration: ${id}`);

            // Signal that Ghost has completed Stripe reconfiguration
            this.billingPortalConfigured = true;
            for (const waiter of this.billingPortalWaiters) {
                waiter();
            }
            this.billingPortalWaiters = [];

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({id, object: 'billing_portal.configuration'}));
            return;
        }

        // Fallback: return 200 with empty object for unhandled routes
        debug(`Unhandled route: ${method} ${url} — returning fallback`);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({id: 'fake', object: 'unknown'}));
    }
}
