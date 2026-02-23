const assert = require('node:assert/strict');
const sinon = require('sinon');
const errors = require('@tryghost/errors');
const DomainEvents = require('@tryghost/domain-events');
const MemberRepository = require('../../../../../../../core/server/services/members/members-api/repositories/member-repository');
const {SubscriptionCreatedEvent, OfferRedemptionEvent} = require('../../../../../../../core/shared/events');

const mockOfferRedemption = {
    add: sinon.stub(),
    findOne: sinon.stub()
};

describe('MemberRepository', function () {
    afterEach(function () {
        sinon.restore();
    });

    describe('#isComplimentarySubscription', function () {
        it('Does not error when subscription.plan is null', function () {
            const repo = new MemberRepository({OfferRedemption: mockOfferRedemption});
            repo.isComplimentarySubscription({});
        });
    });

    describe('#resolveContextSource', function (){
        it('Maps context to source', function (){
            const repo = new MemberRepository({OfferRedemption: mockOfferRedemption});

            let source = repo._resolveContextSource({
                import: true
            });
            assert.equal(source, 'import');

            source = repo._resolveContextSource({
                importer: true
            });
            assert.equal(source, 'import');

            source = repo._resolveContextSource({
                user: true
            });
            assert.equal(source, 'admin');

            source = repo._resolveContextSource({
                user: true,
                api_key: true
            });
            assert.equal(source, 'api');

            source = repo._resolveContextSource({
                api_key: true
            });
            assert.equal(source, 'api');

            source = repo._resolveContextSource({
            });
            assert.equal(source, 'member');

            source = repo._resolveContextSource({
                generic_context: true
            });
            assert.equal(source, 'member');
        });
    });

    describe('#getMRR', function () {
        let repo;

        beforeEach(function () {
            repo = new MemberRepository({OfferRedemption: mockOfferRedemption});
        });

        it('returns 0 for signup trial subscriptions', function () {
            const subscriptionStartDate = new Date('2026-02-21T00:00:00.000Z');
            const trialStartDate = new Date('2026-02-21T00:00:00.000Z');

            const mrr = repo.getMRR({
                interval: 'month',
                amount: 500,
                status: 'trialing',
                subscriptionStartDate,
                trialStartDate
            });

            assert.equal(mrr, 0);
        });

        it('returns full MRR for retention trial subscriptions', function () {
            const subscriptionStartDate = new Date('2026-02-21T00:00:00.000Z');
            const trialStartDate = new Date('2026-03-10T00:00:00.000Z');

            const mrr = repo.getMRR({
                interval: 'month',
                amount: 500,
                status: 'trialing',
                subscriptionStartDate,
                trialStartDate
            });

            assert.equal(mrr, 500);
        });

        ['incomplete', 'incomplete_expired', 'canceled'].forEach((status) => {
            it(`returns 0 for ${status} subscriptions`, function () {
                const mrr = repo.getMRR({
                    interval: 'month',
                    amount: 500,
                    status
                });

                assert.equal(mrr, 0);
            });
        });

        it('returns 0 for subscriptions canceled at period end', function () {
            const mrr = repo.getMRR({
                interval: 'month',
                amount: 500,
                canceled: true
            });

            assert.equal(mrr, 0);
        });

        it('applies forever percentage discounts to MRR', function () {
            const mrr = repo.getMRR({
                interval: 'month',
                amount: 500,
                discount: {
                    end: null,
                    coupon: {
                        duration: 'forever',
                        amount_off: null,
                        percent_off: 20
                    }
                }
            });

            assert.equal(mrr, 400);
        });

        it('applies forever amount off discounts and floors MRR at zero', function () {
            const mrr = repo.getMRR({
                interval: 'month',
                amount: 50,
                discount: {
                    end: null,
                    coupon: {
                        duration: 'forever',
                        amount_off: 60,
                        percent_off: null
                    }
                }
            });

            assert.equal(mrr, 0);
        });

        it('does not apply discounts that have an end date', function () {
            const mrr = repo.getMRR({
                interval: 'month',
                amount: 500,
                discount: {
                    end: 1735689600,
                    coupon: {
                        duration: 'forever',
                        amount_off: null,
                        percent_off: 50
                    }
                }
            });

            assert.equal(mrr, 500);
        });

        it('converts yearly plans to monthly MRR', function () {
            const mrr = repo.getMRR({
                interval: 'year',
                amount: 1200
            });

            assert.equal(mrr, 100);
        });

        it('converts weekly plans to monthly MRR', function () {
            const mrr = repo.getMRR({
                interval: 'week',
                amount: 100
            });

            assert.equal(mrr, 400);
        });

        it('converts daily plans to monthly MRR', function () {
            const mrr = repo.getMRR({
                interval: 'day',
                amount: 10
            });

            assert.equal(mrr, 300);
        });
    });

    describe('setComplimentarySubscription', function () {
        let Member;
        let productRepository;

        beforeEach(function () {
            Member = {
                findOne: sinon.stub().resolves({
                    id: 'member_id_123',
                    related: () => {
                        return {
                            fetch: () => {
                                return {
                                    models: []
                                };
                            }
                        };
                    }
                })
            };
        });

        it('throws an error when there is no default product', async function () {
            productRepository = {
                getDefaultProduct: sinon.stub().resolves(null)
            };

            const repo = new MemberRepository({
                Member,
                stripeAPIService: {
                    configured: true
                },
                productRepository,
                OfferRedemption: mockOfferRedemption
            });

            try {
                await repo.setComplimentarySubscription({
                    id: 'member_id_123'
                }, {
                    transacting: true
                });

                assert.fail('setComplimentarySubscription should have thrown');
            } catch (err) {
                assert.equal(err.message, 'Could not find Product "default"');
            }
        });

        it('uses the right options for fetching default product', async function () {
            productRepository = {
                getDefaultProduct: sinon.stub().resolves({
                    toJSON: () => {
                        return null;
                    }
                })
            };

            const repo = new MemberRepository({
                Member,
                stripeAPIService: {
                    configured: true
                },
                productRepository,
                OfferRedemption: mockOfferRedemption
            });

            try {
                await repo.setComplimentarySubscription({
                    id: 'member_id_123'
                }, {
                    transacting: true,
                    withRelated: ['labels']
                });

                assert.fail('setComplimentarySubscription should have thrown');
            } catch (err) {
                assert.equal(productRepository.getDefaultProduct.calledWith({withRelated: ['stripePrices'], transacting: true}), true);
                assert.equal(err.message, 'Could not find Product "default"');
            }
        });
    });

    describe('newsletter subscriptions', function () {
        let Member;
        let MemberProductEvent;
        let productRepository;
        let stripeAPIService;
        let existingNewsletters;
        let MemberSubscribeEvent;

        beforeEach(async function () {
            sinon.spy();
            existingNewsletters = [
                {
                    id: 'newsletter_id_123',
                    attributes: {
                        status: 'active'
                    },
                    get: sinon.stub().withArgs('status').returns('active')
                },
                {
                    id: 'newsletter_id_1234_archive',
                    attributes: {
                        status: 'archived'
                    },
                    get: sinon.stub().withArgs('status').returns('archived')
                }
            ];

            Member = {
                findOne: sinon.stub().resolves({
                    get: sinon.stub().returns('member_id_123'),
                    related: sinon.stub().withArgs('newsletters').returns({
                        models: existingNewsletters
                    }),
                    toJSON: sinon.stub().returns({})
                }),
                edit: sinon.stub().resolves({
                    attributes: {},
                    _previousAttributes: {}
                })
            };

            stripeAPIService = {
                configured: false
            };

            MemberSubscribeEvent = {
                add: sinon.stub().resolves()
            };
        });

        it('Does not create false archived newsletter events', async function () {
            const repo = new MemberRepository({
                Member,
                MemberProductEvent,
                productRepository,
                stripeAPIService,
                MemberSubscribeEventModel: MemberSubscribeEvent,
                OfferRedemption: mockOfferRedemption
            });

            await repo.update({
                email: 'test@email.com',
                newsletters: [{
                    id: 'newsletter_id_123'
                },
                {
                    id: 'newsletter_id_456'
                },
                {
                    id: 'newsletter_id_new'
                },
                {
                    id: 'newsletter_id_1234_archive'
                }]
            },{
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            assert.equal(MemberSubscribeEvent.add.calledTwice, true);
        });
    });

    describe('linkSubscription', function (){
        let Member;
        let MemberPaidSubscriptionEvent;
        let StripeCustomerSubscription;
        let MemberProductEvent;
        let stripeAPIService;
        let productRepository;
        let offersAPI;
        let labsService;
        let subscriptionData;
        let subscriptionCreatedNotifySpy;
        let offerRedemptionNotifySpy;

        afterEach(function () {
            sinon.restore();
        });

        beforeEach(async function () {
            subscriptionCreatedNotifySpy = sinon.spy();
            offerRedemptionNotifySpy = sinon.spy();

            subscriptionData = {
                id: 'sub_123',
                customer: 'cus_123',
                status: 'active',
                items: {
                    type: 'list',
                    data: [{
                        id: 'item_123',
                        price: {
                            id: 'price_123',
                            product: 'product_123',
                            active: true,
                            nickname: 'Monthly',
                            currency: 'usd',
                            recurring: {
                                interval: 'month'
                            },
                            unit_amount: 500,
                            type: 'recurring'
                        }
                    }]
                },
                start_date: Date.now() / 1000,
                current_period_end: Date.now() / 1000 + (60 * 60 * 24 * 31),
                cancel_at_period_end: false
            };

            Member = {
                findOne: sinon.stub().resolves({
                    related: (relation) => {
                        return {
                            query: sinon.stub().returns({
                                fetchOne: sinon.stub().resolves({})
                            }),
                            toJSON: sinon.stub().returns(relation === 'products' ? [] : {}),
                            fetch: sinon.stub().resolves({
                                toJSON: sinon.stub().returns(relation === 'products' ? [] : {}),
                                models: []
                            })
                        };
                    },
                    toJSON: sinon.stub().returns({})
                }),
                edit: sinon.stub().resolves({
                    attributes: {},
                    _previousAttributes: {}
                })
            };
            MemberPaidSubscriptionEvent = {
                add: sinon.stub().resolves()
            };
            StripeCustomerSubscription = {
                add: sinon.stub().resolves({
                    get: sinon.stub().returns()
                }),
                edit: sinon.stub().resolves({
                    get: sinon.stub().returns()
                })
            };
            MemberProductEvent = {
                add: sinon.stub().resolves({})
            };

            stripeAPIService = {
                configured: true,
                getSubscription: sinon.stub().resolves(subscriptionData),
                getCustomer: sinon.stub().resolves({
                    id: 'cus_123',
                    invoice_settings: {
                        default_payment_method: null
                    },
                    subscriptions: {data: []}
                })
            };

            productRepository = {
                get: sinon.stub().resolves({
                    get: sinon.stub().returns(),
                    toJSON: sinon.stub().returns({})
                }),
                update: sinon.stub().resolves({})
            };

            labsService = {
                isSet: sinon.stub().returns(true)
            };

            offersAPI = {
                ensureOfferForStripeCoupon: sinon.stub().resolves({
                    id: 'offer_new'
                })
            };
        });

        it('dispatches paid subscription event', async function (){
            const repo = new MemberRepository({
                stripeAPIService,
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            DomainEvents.subscribe(SubscriptionCreatedEvent, subscriptionCreatedNotifySpy);
            DomainEvents.subscribe(OfferRedemptionEvent, offerRedemptionNotifySpy);

            await repo.linkSubscription({
                subscription: subscriptionData
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            assert.equal(subscriptionCreatedNotifySpy.calledOnce, true);
            assert.equal(offerRedemptionNotifySpy.called, false);
        });

        it('dispatches the offer redemption event for a new member starting a subscription', async function (){
            // When a new member starts a paid subscription, the subscription is created with the offer ID
            const repo = new MemberRepository({
                stripeAPIService,
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                offersAPI,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            // No existing subscription
            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            DomainEvents.subscribe(SubscriptionCreatedEvent, subscriptionCreatedNotifySpy);
            DomainEvents.subscribe(OfferRedemptionEvent, offerRedemptionNotifySpy);

            await repo.linkSubscription({
                id: 'member_id_123',
                subscription: subscriptionData,
                offerId: 'offer_123'
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            assert.equal(subscriptionCreatedNotifySpy.calledOnce, true);
            assert.equal(subscriptionCreatedNotifySpy.calledWith(sinon.match((event) => {
                if (event.data.offerId === 'offer_123') {
                    return true;
                }
                return false;
            })), true);

            assert.equal(offerRedemptionNotifySpy.called, true);
            assert.equal(offerRedemptionNotifySpy.calledWith(sinon.match((event) => {
                if (event.data.offerId === 'offer_123') {
                    return true;
                }
                return false;
            })), true);
        });

        it('dispatches the offer redemption event for an existing member upgrading to a paid subscription', async function (){
            // When an existing free member upgrades to a paid subscription, the subscription is first created _without_ the offer id
            // Then it is updated with the offer id after the checkout.completed webhook is received
            const repo = new MemberRepository({
                stripeAPIService,
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves({
                get: sinon.stub().withArgs('offer_id').returns(null)
            });

            DomainEvents.subscribe(SubscriptionCreatedEvent, subscriptionCreatedNotifySpy);
            DomainEvents.subscribe(OfferRedemptionEvent, offerRedemptionNotifySpy);

            await repo.linkSubscription({
                id: 'member_id_123',
                subscription: subscriptionData,
                offerId: 'offer_123'
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            assert.equal(subscriptionCreatedNotifySpy.calledOnce, false);

            assert.equal(offerRedemptionNotifySpy.called, true);
            assert.equal(offerRedemptionNotifySpy.calledWith(sinon.match((event) => {
                if (event.data.offerId === 'offer_123') {
                    return true;
                }
                return false;
            })), true);
        });

        it('creates an offer from a Stripe coupon', async function () {
            offersAPI = {
                ensureOfferForStripeCoupon: sinon.stub().resolves({id: 'offer_new'})
            };

            const productRepositoryWithTier = {
                get: sinon.stub().resolves({
                    get: sinon.stub().callsFake((key) => {
                        if (key === 'id') {
                            return 'tier_1';
                        }
                        if (key === 'name') {
                            return 'Tier One';
                        }
                        return null;
                    }),
                    toJSON: sinon.stub().returns({})
                }),
                update: sinon.stub().resolves({})
            };

            const stripeCoupon = {
                id: 'coupon_abc',
                percent_off: 20,
                duration: 'forever'
            };

            const repo = new MemberRepository({
                stripeAPIService: {
                    ...stripeAPIService,
                    getSubscription: sinon.stub().resolves({
                        ...subscriptionData,
                        discount: {
                            coupon: stripeCoupon
                        }
                    })
                },
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository: productRepositoryWithTier,
                offersAPI,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            const transacting = {
                executionPromise: Promise.resolve()
            };

            await repo.linkSubscription({
                id: 'member_id_123',
                subscription: {...subscriptionData, discount: {coupon: {id: 'coupon_abc'}}}
            }, {
                transacting,
                context: {}
            });

            assert.equal(offersAPI.ensureOfferForStripeCoupon.calledOnce, true);
            // Verify the coupon, cadence, tier, and options are passed correctly
            assert.deepEqual(offersAPI.ensureOfferForStripeCoupon.firstCall.args[0], stripeCoupon);
            assert.equal(offersAPI.ensureOfferForStripeCoupon.firstCall.args[1], 'month');
            assert.deepEqual(offersAPI.ensureOfferForStripeCoupon.firstCall.args[2], {id: 'tier_1', name: 'Tier One'});
            assert.equal(offersAPI.ensureOfferForStripeCoupon.firstCall.args[3].transacting, transacting);
            assert.equal(StripeCustomerSubscription.add.firstCall.args[0].offer_id, 'offer_new');
        });

        it('sets offer_id to null if Stripe coupon is known to be incompatible with Ghost offers', async function () {
            const invalidCouponError = new errors.ValidationError({
                message: 'Offer `duration` must be "once" or "forever" for the "yearly" cadence.',
                code: 'INVALID_YEARLY_DURATION'
            });

            offersAPI = {
                ensureOfferForStripeCoupon: sinon.stub().rejects(invalidCouponError)
            };

            const productRepositoryWithTier = {
                get: sinon.stub().resolves({
                    get: sinon.stub().callsFake((key) => {
                        if (key === 'id') {
                            return 'tier_1';
                        }
                        if (key === 'name') {
                            return 'Tier One';
                        }
                        return null;
                    }),
                    toJSON: sinon.stub().returns({})
                }),
                update: sinon.stub().resolves({})
            };

            const stripeCoupon = {
                id: 'coupon_invalid',
                percent_off: 20,
                duration: 'repeating',
                duration_in_months: 3
            };

            const repo = new MemberRepository({
                stripeAPIService: {
                    ...stripeAPIService,
                    getSubscription: sinon.stub().resolves({
                        ...subscriptionData,
                        discount: {
                            coupon: stripeCoupon
                        }
                    })
                },
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository: productRepositoryWithTier,
                offersAPI,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            const transacting = {
                executionPromise: Promise.resolve()
            };

            // Should not throw despite the offer validation failure
            await repo.linkSubscription({
                id: 'member_id_123',
                subscription: {...subscriptionData, discount: {coupon: {id: 'coupon_invalid'}}}
            }, {
                transacting,
                context: {}
            });

            // Verify ensureOfferForStripeCoupon was called
            assert.equal(offersAPI.ensureOfferForStripeCoupon.calledOnce, true);

            // Verify subscription was still created, but without an offer_id
            assert.equal(StripeCustomerSubscription.add.calledOnce, true);
            assert.equal(StripeCustomerSubscription.add.firstCall.args[0].offer_id, null);
        });

        it('throws other validation errors from ensureOfferForStripeCoupon', async function () {
            const otherValidationError = new errors.ValidationError({
                message: 'Some other validation error'
            });

            offersAPI = {
                ensureOfferForStripeCoupon: sinon.stub().rejects(otherValidationError)
            };

            const productRepositoryWithTier = {
                get: sinon.stub().resolves({
                    get: sinon.stub().callsFake((key) => {
                        if (key === 'id') {
                            return 'tier_1';
                        }
                        if (key === 'name') {
                            return 'Tier One';
                        }
                        return null;
                    }),
                    toJSON: sinon.stub().returns({})
                }),
                update: sinon.stub().resolves({})
            };

            const stripeCoupon = {
                id: 'coupon_abc',
                percent_off: 20,
                duration: 'forever'
            };

            const repo = new MemberRepository({
                stripeAPIService: {
                    ...stripeAPIService,
                    getSubscription: sinon.stub().resolves({
                        ...subscriptionData,
                        discount: {
                            coupon: stripeCoupon
                        }
                    })
                },
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository: productRepositoryWithTier,
                offersAPI,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            const transacting = {
                executionPromise: Promise.resolve()
            };

            // Should throw because it's not the INVALID_YEARLY_DURATION error
            await assert.rejects(
                repo.linkSubscription({
                    id: 'member_id_123',
                    subscription: {...subscriptionData, discount: {coupon: {id: 'coupon_abc'}}}
                }, {
                    transacting,
                    context: {}
                }),
                (err) => {
                    assert.equal(err.message, 'Some other validation error');
                    return true;
                }
            );

            // Verify ensureOfferForStripeCoupon was called
            assert.equal(offersAPI.ensureOfferForStripeCoupon.calledOnce, true);

            // Verify subscription was NOT created because the error was rethrown
            assert.equal(StripeCustomerSubscription.add.called, false);
        });

        it('persists discount_start and discount_end for a new subscription', async function () {
            const discountStart = 1768940436;
            const discountEnd = 1784578836;

            const subscriptionWithDiscount = {
                ...subscriptionData,
                discount: {
                    id: 'di_1SrlPkB8iNXqDnZRX03bQHnQ',
                    coupon: {
                        id: 'H4H47PbG',
                        percent_off: 20,
                        duration: 'repeating',
                        duration_in_months: 6
                    },
                    start: discountStart,
                    end: discountEnd
                }
            };

            const repo = new MemberRepository({
                stripeAPIService: {
                    ...stripeAPIService,
                    getSubscription: sinon.stub().resolves(subscriptionWithDiscount)
                },
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                offersAPI,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            // No existing subscription
            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            await repo.linkSubscription({
                subscription: subscriptionWithDiscount
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            // Verify discount_start and discount_end are set correctly
            assert.equal(StripeCustomerSubscription.add.calledOnce, true);
            const addedSubscriptionData = StripeCustomerSubscription.add.firstCall.args[0];

            assert.ok(addedSubscriptionData.discount_start instanceof Date);
            assert.ok(addedSubscriptionData.discount_end instanceof Date);
            assert.equal(addedSubscriptionData.discount_start.getTime(), discountStart * 1000);
            assert.equal(addedSubscriptionData.discount_end.getTime(), discountEnd * 1000);
        });

        it('persists discount_start and discount_end for an existing subscription', async function () {
            const discountStart = 1768940436;
            const discountEnd = 1784578836;

            const subscriptionWithDiscount = {
                ...subscriptionData,
                discount: {
                    id: 'di_1SrlPkB8iNXqDnZRX03bQHnQ',
                    coupon: {
                        id: 'H4H47PbG',
                        percent_off: 20,
                        duration: 'repeating',
                        duration_in_months: 6
                    },
                    start: discountStart,
                    end: discountEnd
                }
            };

            const repo = new MemberRepository({
                stripeAPIService: {
                    ...stripeAPIService,
                    getSubscription: sinon.stub().resolves(subscriptionWithDiscount)
                },
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                offersAPI,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            // Existing subscription
            sinon.stub(repo, 'getSubscriptionByStripeID').resolves({
                get: sinon.stub().withArgs('offer_id').returns(null)
            });

            await repo.linkSubscription({
                subscription: subscriptionWithDiscount
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            // Verify edit was called (not add) since subscription exists
            assert.equal(StripeCustomerSubscription.add.called, false);
            assert.equal(StripeCustomerSubscription.edit.calledOnce, true);

            const editedSubscriptionData = StripeCustomerSubscription.edit.firstCall.args[0];

            assert.ok(editedSubscriptionData.discount_start instanceof Date);
            assert.ok(editedSubscriptionData.discount_end instanceof Date);
            assert.equal(editedSubscriptionData.discount_start.getTime(), discountStart * 1000);
            assert.equal(editedSubscriptionData.discount_end.getTime(), discountEnd * 1000);
        });

        it('nullifies discount_start and discount_end when discount is removed from Stripe subscription', async function () {
            const repo = new MemberRepository({
                stripeAPIService,
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            const subscriptionWithNoDiscount = {
                ...subscriptionData,
                discount: null
            };

            await repo.linkSubscription({
                subscription: subscriptionWithNoDiscount
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            assert.equal(StripeCustomerSubscription.add.calledOnce, true);
            const addedSubscriptionData = StripeCustomerSubscription.add.firstCall.args[0];

            assert.equal(addedSubscriptionData.discount_start, null);
            assert.equal(addedSubscriptionData.discount_end, null);
        });

        it('falls back to customer default payment method when subscription has none', async function () {
            const repo = new MemberRepository({
                stripeAPIService: {
                    ...stripeAPIService,
                    getSubscription: sinon.stub().resolves({
                        ...subscriptionData,
                        default_payment_method: null
                    }),
                    getCustomer: sinon.stub().resolves({
                        id: 'cus_123',
                        invoice_settings: {
                            default_payment_method: 'pm_customer_default'
                        },
                        subscriptions: {data: []}
                    }),
                    getCardPaymentMethod: sinon.stub().resolves({
                        id: 'pm_customer_default',
                        type: 'card',
                        card: {
                            last4: '8888'
                        }
                    })
                },
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            await repo.linkSubscription({
                subscription: subscriptionData
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            sinon.assert.calledOnce(StripeCustomerSubscription.add);
            const addedData = StripeCustomerSubscription.add.firstCall.args[0];
            assert.equal(addedData.default_payment_card_last4, '8888');
        });

        it('sets card last4 to null when neither subscription nor customer has a default payment method', async function () {
            const repo = new MemberRepository({
                stripeAPIService: {
                    ...stripeAPIService,
                    getSubscription: sinon.stub().resolves({
                        ...subscriptionData,
                        default_payment_method: null
                    }),
                    getCustomer: sinon.stub().resolves({
                        id: 'cus_123',
                        invoice_settings: {
                            default_payment_method: null
                        },
                        subscriptions: {data: []}
                    })
                },
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            await repo.linkSubscription({
                subscription: subscriptionData
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            sinon.assert.calledOnce(StripeCustomerSubscription.add);
            const addedData = StripeCustomerSubscription.add.firstCall.args[0];
            assert.equal(addedData.default_payment_card_last4, null);
        });

        it('uses subscription default payment method when available', async function () {
            const repo = new MemberRepository({
                stripeAPIService: {
                    ...stripeAPIService,
                    getSubscription: sinon.stub().resolves({
                        ...subscriptionData,
                        default_payment_method: 'pm_sub_default'
                    }),
                    getCardPaymentMethod: sinon.stub().resolves({
                        id: 'pm_sub_default',
                        type: 'card',
                        card: {
                            last4: '4242'
                        }
                    })
                },
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            await repo.linkSubscription({
                subscription: subscriptionData
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            sinon.assert.calledOnce(StripeCustomerSubscription.add);
            const addedData = StripeCustomerSubscription.add.firstCall.args[0];
            assert.equal(addedData.default_payment_card_last4, '4242');
        });

        it('handles expanded customer object on subscription when falling back', async function () {
            const repo = new MemberRepository({
                stripeAPIService: {
                    ...stripeAPIService,
                    getSubscription: sinon.stub().resolves({
                        ...subscriptionData,
                        customer: {id: 'cus_123', object: 'customer'},
                        default_payment_method: null
                    }),
                    getCustomer: sinon.stub().resolves({
                        id: 'cus_123',
                        invoice_settings: {
                            default_payment_method: {id: 'pm_expanded', type: 'card', card: {last4: '1234'}}
                        },
                        subscriptions: {data: []}
                    }),
                    getCardPaymentMethod: sinon.stub().resolves({
                        id: 'pm_expanded',
                        type: 'card',
                        card: {
                            last4: '1234'
                        }
                    })
                },
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            await repo.linkSubscription({
                subscription: {...subscriptionData, customer: {id: 'cus_123', object: 'customer'}}
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            sinon.assert.calledOnce(StripeCustomerSubscription.add);
            const addedData = StripeCustomerSubscription.add.firstCall.args[0];
            assert.equal(addedData.default_payment_card_last4, '1234');
        });

        it('handles discounts with no end date (e.g. forever discounts)', async function () {
            const discountStart = 1768940436;

            const subscriptionWithForeverDiscount = {
                ...subscriptionData,
                discount: {
                    id: 'di_forever',
                    coupon: {
                        id: 'forever_coupon',
                        percent_off: 20,
                        duration: 'forever'
                    },
                    start: discountStart,
                    end: null
                }
            };

            const repo = new MemberRepository({
                stripeAPIService: {
                    ...stripeAPIService,
                    getSubscription: sinon.stub().resolves(subscriptionWithForeverDiscount)
                },
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                offersAPI,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            await repo.linkSubscription({
                subscription: subscriptionWithForeverDiscount
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            assert.equal(StripeCustomerSubscription.add.calledOnce, true);
            const addedSubscriptionData = StripeCustomerSubscription.add.firstCall.args[0];

            assert.ok(addedSubscriptionData.discount_start instanceof Date);
            assert.equal(addedSubscriptionData.discount_start.getTime(), discountStart * 1000);
            assert.equal(addedSubscriptionData.discount_end, null);
        });

        it('creates a new trialing subscription without an existing subscription offer lookup', async function () {
            const startTimestamp = Math.floor(Date.now() / 1000);
            const futureTrialEnd = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);

            offersAPI = {
                ensureOfferForStripeCoupon: sinon.stub().resolves({id: 'offer_new'}),
                getOffer: sinon.stub().resolves({id: 'trial_offer_123', type: 'trial'})
            };

            stripeAPIService.getSubscription.resolves({
                ...subscriptionData,
                status: 'trialing',
                start_date: startTimestamp,
                trial_start: startTimestamp,
                trial_end: futureTrialEnd,
                discount: null
            });

            const repo = new MemberRepository({
                stripeAPIService,
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                offersAPI,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            await repo.linkSubscription({
                id: 'member_id_123',
                subscription: subscriptionData
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            sinon.assert.calledOnce(StripeCustomerSubscription.add);
            const addedData = StripeCustomerSubscription.add.firstCall.args[0];
            assert.equal(addedData.status, 'trialing');
            assert.equal(addedData.offer_id, null);
            assert.equal(addedData.mrr, 0);

            sinon.assert.notCalled(offersAPI.getOffer);
        });

        it('clears offer_id when existing subscription has no active trial and no Stripe discount', async function () {
            // Subscription has an old offer_id but the Stripe discount has expired (no discount in webhook data)
            // and there is no active trial — offer_id should be cleared (not preserved)
            const repo = new MemberRepository({
                stripeAPIService,
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves({
                id: 'sub_db_id',
                get: sinon.stub().callsFake((key) => {
                    if (key === 'offer_id') {
                        return 'old_offer_123';
                    }
                    if (key === 'trial_end_at') {
                        return null;
                    }
                    return null;
                })
            });

            DomainEvents.subscribe(OfferRedemptionEvent, offerRedemptionNotifySpy);

            await repo.linkSubscription({
                subscription: subscriptionData // no discount, so offer_id resolves to null
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            assert.equal(StripeCustomerSubscription.edit.calledOnce, true);
            const editedData = StripeCustomerSubscription.edit.firstCall.args[0];

            // offer_id should NOT have been deleted — it should be null (clearing the stale value)
            assert.ok('offer_id' in editedData, 'offer_id should be present in the update data');
            assert.equal(editedData.offer_id, null);
        });

        it('preserves offer_id when existing subscription has an active trial', async function () {
            // Trial offers don't create Stripe discounts, so offer_id can't be resolved from Stripe.
            // When the trial is active, offer_id should be preserved (not cleared).
            const futureTrialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

            const repo = new MemberRepository({
                stripeAPIService,
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves({
                id: 'sub_db_id',
                get: sinon.stub().callsFake((key) => {
                    if (key === 'offer_id') {
                        return 'trial_offer_123';
                    }
                    return null;
                })
            });

            stripeAPIService.getSubscription.resolves({
                ...subscriptionData,
                trial_start: (Date.now() / 1000) - (7 * 24 * 60 * 60),
                trial_end: futureTrialEnd.getTime() / 1000
            });

            await repo.linkSubscription({
                subscription: subscriptionData // no discount, so offer_id resolves to null
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            assert.equal(StripeCustomerSubscription.edit.calledOnce, true);
            const editedData = StripeCustomerSubscription.edit.firstCall.args[0];

            // offer_id should have been deleted from the update data (preserving the existing value)
            assert.ok(!('offer_id' in editedData), 'offer_id should be deleted from update data to preserve existing value');
        });

        it('clears offer_id when existing subscription has an expired trial', async function () {
            // Trial is over — offer_id should be allowed to clear
            const pastTrialEnd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

            const repo = new MemberRepository({
                stripeAPIService,
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves({
                id: 'sub_db_id',
                get: sinon.stub().callsFake((key) => {
                    if (key === 'offer_id') {
                        return 'trial_offer_123';
                    }
                    return null;
                })
            });

            stripeAPIService.getSubscription.resolves({
                ...subscriptionData,
                trial_start: (pastTrialEnd.getTime() / 1000) - (7 * 24 * 60 * 60),
                trial_end: pastTrialEnd.getTime() / 1000
            });

            await repo.linkSubscription({
                subscription: subscriptionData // no discount
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            assert.equal(StripeCustomerSubscription.edit.calledOnce, true);
            const editedData = StripeCustomerSubscription.edit.firstCall.args[0];

            // offer_id should NOT have been deleted — it should be null (clearing the stale value)
            assert.ok('offer_id' in editedData, 'offer_id should be present in the update data');
            assert.equal(editedData.offer_id, null);
        });

        it('does not create a paid subscription event when free_months starts a Stripe trial', async function () {
            const futureTrialEndUnix = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);

            offersAPI = {
                ensureOfferForStripeCoupon: sinon.stub().resolves({id: 'offer_new'}),
                getOffer: sinon.stub().resolves({id: 'free_months_offer_123', type: 'free_months'})
            };

            stripeAPIService.getSubscription.resolves({
                ...subscriptionData,
                status: 'trialing',
                trial_start: Math.floor(Date.now() / 1000) - (24 * 60 * 60),
                trial_end: futureTrialEndUnix,
                discount: null
            });

            StripeCustomerSubscription.edit = sinon.stub().resolves({
                id: 'sub_db_id',
                get: sinon.stub().callsFake((key) => {
                    const data = {
                        id: 'sub_db_id',
                        offer_id: 'free_months_offer_123',
                        mrr: 500,
                        status: 'trialing',
                        cancel_at_period_end: false,
                        plan_id: 'price_123',
                        created_at: new Date()
                    };
                    return data[key] ?? null;
                })
            });

            const repo = new MemberRepository({
                stripeAPIService,
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                offersAPI,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves({
                id: 'sub_db_id',
                get: sinon.stub().callsFake((key) => {
                    const data = {
                        id: 'sub_db_id',
                        offer_id: 'free_months_offer_123',
                        mrr: 500,
                        status: 'active',
                        cancel_at_period_end: false,
                        plan_id: 'price_123'
                    };
                    return data[key] ?? null;
                })
            });

            await repo.linkSubscription({
                id: 'member_id_123',
                subscription: subscriptionData
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            sinon.assert.notCalled(offersAPI.getOffer);
            sinon.assert.calledOnce(StripeCustomerSubscription.edit);

            const editedData = StripeCustomerSubscription.edit.firstCall.args[0];
            assert.equal(editedData.mrr, 500);

            sinon.assert.notCalled(MemberPaidSubscriptionEvent.add);
        });

        it('creates a positive MRR delta when a trialing subscription becomes active', async function () {
            const pastTrialEndUnix = Math.floor(Date.now() / 1000) - 60;

            stripeAPIService.getSubscription.resolves({
                ...subscriptionData,
                status: 'active',
                trial_start: pastTrialEndUnix - (7 * 24 * 60 * 60),
                trial_end: pastTrialEndUnix,
                current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
                discount: null
            });

            StripeCustomerSubscription.edit = sinon.stub().resolves({
                id: 'sub_db_id',
                get: sinon.stub().callsFake((key) => {
                    const data = {
                        id: 'sub_db_id',
                        offer_id: null,
                        mrr: 500,
                        status: 'active',
                        cancel_at_period_end: false,
                        plan_id: 'price_123',
                        created_at: new Date()
                    };
                    return data[key] ?? null;
                })
            });

            const repo = new MemberRepository({
                stripeAPIService,
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                offersAPI,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves({
                id: 'sub_db_id',
                get: sinon.stub().callsFake((key) => {
                    const data = {
                        id: 'sub_db_id',
                        offer_id: 'trial_offer_123',
                        mrr: 0,
                        status: 'trialing',
                        cancel_at_period_end: false,
                        plan_id: 'price_123'
                    };
                    return data[key] ?? null;
                })
            });

            await repo.linkSubscription({
                id: 'member_id_123',
                subscription: subscriptionData
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            sinon.assert.calledOnce(StripeCustomerSubscription.edit);

            const editedData = StripeCustomerSubscription.edit.firstCall.args[0];
            assert.equal(editedData.mrr, 500);
            assert.ok('offer_id' in editedData, 'offer_id should be present and cleared after trial end');
            assert.equal(editedData.offer_id, null);

            sinon.assert.calledOnce(MemberPaidSubscriptionEvent.add);
            const paidEvent = MemberPaidSubscriptionEvent.add.firstCall.args[0];
            assert.equal(paidEvent.type, 'updated');
            assert.equal(paidEvent.mrr_delta, 500);
            assert.equal(paidEvent.from_plan, 'price_123');
            assert.equal(paidEvent.to_plan, 'price_123');
        });

        it('dispatches OfferRedemptionEvent when offer_id changes from one offer to another', async function () {
            // A retention offer replaces an expired signup offer (old → new)
            // The event timestamp should use the Stripe discount start time, not the subscription created_at
            const discountStartUnix = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
            const subscriptionWithDiscount = {
                ...subscriptionData,
                discount: {
                    coupon: {
                        id: 'coupon_retention',
                        percent_off: 20,
                        duration: 'once'
                    },
                    start: discountStartUnix,
                    end: null
                }
            };

            const repo = new MemberRepository({
                stripeAPIService: {
                    ...stripeAPIService,
                    getSubscription: sinon.stub().resolves(subscriptionWithDiscount)
                },
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                offersAPI,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves({
                id: 'sub_db_id',
                get: sinon.stub().callsFake((key) => {
                    if (key === 'offer_id') {
                        return 'old_offer_123';
                    }
                    if (key === 'trial_end_at') {
                        return null;
                    }
                    return null;
                })
            });

            DomainEvents.subscribe(OfferRedemptionEvent, offerRedemptionNotifySpy);

            await repo.linkSubscription({
                id: 'member_id_123',
                subscription: subscriptionWithDiscount,
                offerId: 'new_retention_offer_456'
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            assert.equal(offerRedemptionNotifySpy.called, true);
            assert.equal(offerRedemptionNotifySpy.calledWith(sinon.match((event) => {
                return event.data.offerId === 'new_retention_offer_456';
            })), true);

            // Timestamp should be the discount start, not the subscription created_at
            const event = offerRedemptionNotifySpy.firstCall.args[0];

            assert.equal(event.timestamp.getTime(), discountStartUnix * 1000);
        });

        it('dispatches OfferRedemptionEvent with created_at timestamp when no Stripe discount is present', async function () {
            // Trial/free_months offers don't have Stripe discounts — timestamp falls back to created_at
            const subCreatedAt = new Date('2025-06-15T00:00:00Z');

            const repo = new MemberRepository({
                stripeAPIService,
                StripeCustomerSubscription: {
                    ...StripeCustomerSubscription,
                    edit: sinon.stub().resolves({
                        id: 'sub_db_id',
                        get: sinon.stub().callsFake((key) => {
                            if (key === 'created_at') {
                                return subCreatedAt;
                            }
                            return null;
                        })
                    })
                },
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves({
                id: 'sub_db_id',
                get: sinon.stub().callsFake((key) => {
                    if (key === 'offer_id') {
                        return null;
                    }
                    if (key === 'trial_end_at') {
                        return null;
                    }
                    return null;
                })
            });

            DomainEvents.subscribe(OfferRedemptionEvent, offerRedemptionNotifySpy);

            await repo.linkSubscription({
                id: 'member_id_123',
                subscription: subscriptionData,
                offerId: 'trial_offer_789'
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            assert.equal(offerRedemptionNotifySpy.called, true);

            const event = offerRedemptionNotifySpy.firstCall.args[0];

            assert.equal(event.data.offerId, 'trial_offer_789');
            assert.equal(event.timestamp.getTime(), subCreatedAt.getTime());
        });

        it('overwrites offer_id when new offer arrives via Stripe even with an active trial', async function () {
            // A subscription has an active trial AND a new discount arrives from Stripe
            // The new offer should overwrite the existing one (the trial guard only applies when offer_id is null)
            const futureTrialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            const subscriptionWithDiscount = {
                ...subscriptionData,
                trial_start: (Date.now() / 1000) - (7 * 24 * 60 * 60),
                trial_end: futureTrialEnd.getTime() / 1000,
                discount: {
                    coupon: {
                        id: 'coupon_new',
                        percent_off: 15,
                        duration: 'forever'
                    },
                    start: Date.now() / 1000,
                    end: null
                }
            };

            const repo = new MemberRepository({
                stripeAPIService: {
                    ...stripeAPIService,
                    getSubscription: sinon.stub().resolves(subscriptionWithDiscount)
                },
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                offersAPI,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves({
                id: 'sub_db_id',
                get: sinon.stub().callsFake((key) => {
                    if (key === 'offer_id') {
                        return 'old_trial_offer';
                    }
                    if (key === 'trial_end_at') {
                        return futureTrialEnd;
                    }
                    return null;
                })
            });

            DomainEvents.subscribe(OfferRedemptionEvent, offerRedemptionNotifySpy);

            await repo.linkSubscription({
                subscription: subscriptionWithDiscount
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            assert.equal(StripeCustomerSubscription.edit.calledOnce, true);
            const editedData = StripeCustomerSubscription.edit.firstCall.args[0];

            // New offer should overwrite — offer_id should be present and set to the new offer
            assert.ok('offer_id' in editedData, 'offer_id should be present in the update data');
            assert.equal(editedData.offer_id, 'offer_new'); // from offersAPI.ensureOfferForStripeCoupon stub

            // Should dispatch redemption event for the new offer
            assert.equal(offerRedemptionNotifySpy.called, true);
            assert.equal(offerRedemptionNotifySpy.calledWith(sinon.match((event) => {
                return event.data.offerId === 'offer_new';
            })), true);
        });

        it('does not dispatch OfferRedemptionEvent when offer_id stays the same', async function () {
            // Same offer synced again via webhook — no new event
            const subscriptionWithDiscount = {
                ...subscriptionData,
                discount: {
                    coupon: {
                        id: 'coupon_abc',
                        percent_off: 20,
                        duration: 'forever'
                    },
                    start: Date.now() / 1000,
                    end: null
                }
            };

            const repo = new MemberRepository({
                stripeAPIService: {
                    ...stripeAPIService,
                    getSubscription: sinon.stub().resolves(subscriptionWithDiscount)
                },
                StripeCustomerSubscription,
                MemberPaidSubscriptionEvent,
                MemberProductEvent,
                productRepository,
                offersAPI,
                labsService,
                Member,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves({
                id: 'sub_db_id',
                get: sinon.stub().callsFake((key) => {
                    if (key === 'offer_id') {
                        return 'offer_new'; // same as what ensureOfferForStripeCoupon returns
                    }
                    if (key === 'trial_end_at') {
                        return null;
                    }
                    return null;
                })
            });

            DomainEvents.subscribe(OfferRedemptionEvent, offerRedemptionNotifySpy);

            await repo.linkSubscription({
                subscription: subscriptionWithDiscount
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            assert.equal(offerRedemptionNotifySpy.called, false);
        });
    });

    describe('create - outbox integration', function () {
        let Member;
        let Outbox;
        let MemberStatusEvent;
        let MemberSubscribeEvent;
        let newslettersService;
        let AutomatedEmail;
        let labsService;
        const oldNodeEnv = process.env.NODE_ENV;

        beforeEach(function () {
            Member = {
                transaction: sinon.stub().callsFake((callback) => {
                    return callback({executionPromise: Promise.resolve()});
                }),
                add: sinon.stub().resolves({
                    id: 'member_id_123',
                    get: sinon.stub().callsFake((key) => {
                        const data = {
                            email: 'test@example.com',
                            name: 'Test Member',
                            status: 'free',
                            created_at: new Date()
                        };
                        return data[key];
                    }),
                    related: sinon.stub().callsFake((relation) => {
                        if (relation === 'products') {
                            return {models: []};
                        }
                        if (relation === 'newsletters') {
                            return {models: []};
                        }
                        return {models: []};
                    }),
                    toJSON: sinon.stub().returns({
                        id: 'member_id_123',
                        email: 'test@example.com',
                        name: 'Test Member',
                        status: 'free'
                    })
                })
            };

            Outbox = {
                add: sinon.stub().resolves()
            };

            MemberStatusEvent = {
                add: sinon.stub().resolves()
            };

            MemberSubscribeEvent = {
                add: sinon.stub().resolves()
            };

            newslettersService = {
                getDefaultNewsletters: sinon.stub().resolves([]),
                getAll: sinon.stub().resolves([])
            };

            AutomatedEmail = {
                findOne: sinon.stub().resolves({
                    get: sinon.stub().callsFake((key) => {
                        const data = {lexical: '{"root":{}}', status: 'active'};
                        return data[key];
                    })
                })
            };

            labsService = {
                isSet: sinon.stub().callsFake((flag) => {
                    if (flag === 'welcomeEmails') {
                        return true;
                    }
                    return false;
                })
            };
        });

        afterEach(function () {
            process.env.NODE_ENV = oldNodeEnv;
        });

        it('creates outbox entry for allowed source', async function () {
            const repo = new MemberRepository({
                Member,
                Outbox,
                MemberStatusEvent,
                MemberSubscribeEventModel: MemberSubscribeEvent,
                newslettersService,
                AutomatedEmail,
                labsService,
                OfferRedemption: mockOfferRedemption
            });

            await repo.create({email: 'test@example.com', name: 'Test Member'}, {});

            sinon.assert.calledOnce(Outbox.add);
            const outboxCall = Outbox.add.firstCall.args[0];
            assert.equal(outboxCall.event_type, 'MemberCreatedEvent');

            const payload = JSON.parse(outboxCall.payload);
            assert.equal(payload.memberId, 'member_id_123');
            assert.equal(payload.email, 'test@example.com');
            assert.equal(payload.name, 'Test Member');
            assert.equal(payload.source, 'member');
        });

        it('does NOT create outbox entry when welcomeEmails labs flag is off', async function () {
            labsService.isSet.withArgs('welcomeEmails').returns(false);

            const repo = new MemberRepository({
                Member,
                Outbox,
                MemberStatusEvent,
                MemberSubscribeEventModel: MemberSubscribeEvent,
                newslettersService,
                AutomatedEmail,
                labsService,
                OfferRedemption: mockOfferRedemption
            });

            await repo.create({email: 'test@example.com', name: 'Test Member'}, {});

            sinon.assert.notCalled(Outbox.add);
        });

        it('does not create outbox entry for disallowed sources', async function () {
            const repo = new MemberRepository({
                Member,
                Outbox,
                MemberStatusEvent,
                MemberSubscribeEventModel: MemberSubscribeEvent,
                newslettersService,
                AutomatedEmail,
                labsService,
                OfferRedemption: mockOfferRedemption
            });

            const disallowedSources = [
                {name: 'import', context: {import: true}},
                {name: 'admin', context: {user: true}},
                {name: 'api', context: {api_key: true}}
            ];

            for (const source of disallowedSources) {
                Outbox.add.resetHistory();
                await repo.create({email: 'test@example.com', name: 'Test Member'}, {context: source.context});
                sinon.assert.notCalled(Outbox.add);
            }
        });

        it('includes timestamp in outbox payload', async function () {
            const repo = new MemberRepository({
                Member,
                Outbox,
                MemberStatusEvent,
                MemberSubscribeEventModel: MemberSubscribeEvent,
                newslettersService,
                AutomatedEmail,
                labsService,
                OfferRedemption: mockOfferRedemption
            });

            await repo.create({email: 'test@example.com', name: 'Test Member'}, {});

            const payload = JSON.parse(Outbox.add.firstCall.args[0].payload);
            assert.ok(payload.timestamp);
            assert.ok(new Date(payload.timestamp).getTime() > 0);
        });

        it('passes transaction to outbox entry creation', async function () {
            const repo = new MemberRepository({
                Member,
                Outbox,
                MemberStatusEvent,
                MemberSubscribeEventModel: MemberSubscribeEvent,
                newslettersService,
                AutomatedEmail,
                labsService,
                OfferRedemption: mockOfferRedemption
            });

            await repo.create({email: 'test@example.com', name: 'Test Member'}, {});

            const outboxOptions = Outbox.add.firstCall.args[1];
            assert.ok(outboxOptions.transacting);
        });

        it('does NOT create outbox entry when welcome email is inactive', async function () {
            AutomatedEmail.findOne.resolves({
                get: sinon.stub().callsFake((key) => {
                    const data = {lexical: '{"root":{}}', status: 'inactive'};
                    return data[key];
                })
            });

            const repo = new MemberRepository({
                Member,
                Outbox,
                MemberStatusEvent,
                MemberSubscribeEventModel: MemberSubscribeEvent,
                newslettersService,
                AutomatedEmail,
                labsService,
                OfferRedemption: mockOfferRedemption
            });

            await repo.create({email: 'test@example.com', name: 'Test Member'}, {});

            sinon.assert.notCalled(Outbox.add);
        });
        it('does NOT create outbox entry when member is signing up for a paid subscription (stripeCustomer is present)', async function () {
            const StripeCustomer = {
                upsert: sinon.stub().resolves()
            };

            const repo = new MemberRepository({
                Member,
                Outbox,
                MemberStatusEvent,
                MemberSubscribeEventModel: MemberSubscribeEvent,
                newslettersService,
                AutomatedEmail,
                StripeCustomer,
                labsService,
                OfferRedemption: mockOfferRedemption
            });

            // Stub linkSubscription to avoid needing all the stripe-related mocks
            sinon.stub(repo, 'linkSubscription').resolves();
            sinon.stub(repo, 'upsertCustomer').resolves();

            // Create a member with a stripeCustomer (i.e., signing up for paid subscription)
            await repo.create({
                email: 'test@example.com',
                name: 'Test Member',
                stripeCustomer: {
                    id: 'cus_123',
                    name: 'Test Member',
                    email: 'test@example.com',
                    subscriptions: {
                        data: [{
                            id: 'sub_123',
                            customer: 'cus_123',
                            status: 'active'
                        }]
                    }
                }
            }, {});

            // The free welcome email should NOT be sent when stripeCustomer is present
            sinon.assert.notCalled(Outbox.add);
        });
    });

    describe('linkSubscription - outbox integration', function () {
        let Member;
        let Outbox;
        let MemberPaidSubscriptionEvent;
        let StripeCustomerSubscription;
        let MemberProductEvent;
        let MemberStatusEvent;
        let stripeAPIService;
        let productRepository;
        let AutomatedEmail;
        let labsService;
        let subscriptionData;

        beforeEach(function () {
            subscriptionData = {
                id: 'sub_123',
                customer: 'cus_123',
                status: 'active',
                items: {
                    type: 'list',
                    data: [{
                        id: 'item_123',
                        price: {
                            id: 'price_123',
                            product: 'product_123',
                            active: true,
                            nickname: 'Monthly',
                            currency: 'usd',
                            recurring: {
                                interval: 'month'
                            },
                            unit_amount: 500,
                            type: 'recurring'
                        }
                    }]
                },
                start_date: Date.now() / 1000,
                current_period_end: Date.now() / 1000 + (60 * 60 * 24 * 31),
                cancel_at_period_end: false
            };

            Member = {
                findOne: sinon.stub().resolves({
                    id: 'member_id_123',
                    get: sinon.stub().callsFake((key) => {
                        const data = {
                            email: 'test@example.com',
                            name: 'Test Member'
                        };
                        return data[key];
                    }),
                    related: (relation) => {
                        return {
                            query: sinon.stub().returns({
                                fetchOne: sinon.stub().resolves({})
                            }),
                            toJSON: sinon.stub().returns(relation === 'products' ? [] : {}),
                            fetch: sinon.stub().resolves({
                                toJSON: sinon.stub().returns(relation === 'products' ? [] : {}),
                                models: []
                            })
                        };
                    },
                    toJSON: sinon.stub().returns({})
                }),
                edit: sinon.stub().resolves({
                    attributes: {},
                    _previousAttributes: {}
                })
            };

            Outbox = {
                add: sinon.stub().resolves()
            };

            MemberPaidSubscriptionEvent = {
                add: sinon.stub().resolves()
            };

            StripeCustomerSubscription = {
                add: sinon.stub().resolves({
                    id: 'stripe_sub_id_123',
                    get: sinon.stub().callsFake((key) => {
                        const data = {
                            created_at: new Date(),
                            status: 'active',
                            cancel_at_period_end: false
                        };
                        return data[key];
                    })
                }),
                edit: sinon.stub().resolves({
                    id: 'stripe_sub_id_123',
                    get: sinon.stub().callsFake((key) => {
                        const data = {
                            created_at: new Date(),
                            status: 'active',
                            cancel_at_period_end: false
                        };
                        return data[key];
                    })
                })
            };

            MemberProductEvent = {
                add: sinon.stub().resolves({})
            };

            MemberStatusEvent = {
                add: sinon.stub().resolves()
            };

            stripeAPIService = {
                configured: true,
                getSubscription: sinon.stub().resolves(subscriptionData),
                getCustomer: sinon.stub().resolves({
                    id: 'cus_123',
                    invoice_settings: {
                        default_payment_method: null
                    },
                    subscriptions: {data: []}
                })
            };

            productRepository = {
                get: sinon.stub().resolves({
                    get: sinon.stub().returns(),
                    toJSON: sinon.stub().returns({})
                }),
                update: sinon.stub().resolves({})
            };

            AutomatedEmail = {
                findOne: sinon.stub().resolves({
                    get: sinon.stub().callsFake((key) => {
                        const data = {lexical: '{"root":{}}', status: 'active'};
                        return data[key];
                    })
                })
            };

            labsService = {
                isSet: sinon.stub().callsFake((flag) => {
                    if (flag === 'welcomeEmails') {
                        return true;
                    }
                    return false;
                })
            };
        });

        afterEach(function () {
            sinon.restore();
        });

        it('creates outbox entry when member status changes to paid', async function () {
            Member.edit.resolves({
                attributes: {status: 'paid'},
                _previousAttributes: {status: 'free'},
                get: sinon.stub().callsFake((key) => {
                    const data = {status: 'paid'};
                    return data[key];
                })
            });

            const repo = new MemberRepository({
                Member,
                Outbox,
                MemberPaidSubscriptionEvent,
                StripeCustomerSubscription,
                MemberProductEvent,
                MemberStatusEvent,
                stripeAPIService,
                productRepository,
                AutomatedEmail,
                labsService,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            await repo.linkSubscription({
                id: 'member_id_123',
                subscription: subscriptionData
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            sinon.assert.calledOnce(Outbox.add);
            const payload = JSON.parse(Outbox.add.firstCall.args[0].payload);
            assert.equal(payload.status, 'paid');
            assert.equal(payload.memberId, 'member_id_123');
            assert.equal(payload.email, 'test@example.com');
            assert.equal(payload.name, 'Test Member');
            assert.equal(payload.source, 'member');
            assert.ok(payload.timestamp);
        });

        it('does NOT create outbox entry when welcomeEmails labs flag is off', async function () {
            labsService.isSet.withArgs('welcomeEmails').returns(false);

            Member.edit.resolves({
                attributes: {status: 'paid'},
                _previousAttributes: {status: 'free'},
                get: sinon.stub().callsFake((key) => {
                    const data = {status: 'paid'};
                    return data[key];
                })
            });

            const repo = new MemberRepository({
                Member,
                Outbox,
                MemberPaidSubscriptionEvent,
                StripeCustomerSubscription,
                MemberProductEvent,
                MemberStatusEvent,
                stripeAPIService,
                productRepository,
                AutomatedEmail,
                labsService,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            await repo.linkSubscription({
                id: 'member_id_123',
                subscription: subscriptionData
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            sinon.assert.notCalled(Outbox.add);
        });

        it('does NOT create outbox entry for disallowed sources', async function () {
            Member.edit.resolves({
                attributes: {status: 'paid'},
                _previousAttributes: {status: 'free'},
                get: sinon.stub().callsFake((key) => {
                    const data = {status: 'paid'};
                    return data[key];
                })
            });

            const repo = new MemberRepository({
                Member,
                Outbox,
                MemberPaidSubscriptionEvent,
                StripeCustomerSubscription,
                MemberProductEvent,
                MemberStatusEvent,
                stripeAPIService,
                productRepository,
                AutomatedEmail,
                labsService,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            const disallowedSources = [
                {name: 'import', context: {import: true}},
                {name: 'admin', context: {user: true}},
                {name: 'api', context: {api_key: true}}
            ];

            for (const source of disallowedSources) {
                Outbox.add.resetHistory();
                await repo.linkSubscription({
                    id: 'member_id_123',
                    subscription: subscriptionData
                }, {
                    transacting: {
                        executionPromise: Promise.resolve()
                    },
                    context: source.context
                });
                sinon.assert.notCalled(Outbox.add);
            }
        });

        it('does NOT create outbox entry when paid welcome email is inactive', async function () {
            Member.edit.resolves({
                attributes: {status: 'paid'},
                _previousAttributes: {status: 'free'},
                get: sinon.stub().callsFake((key) => {
                    const data = {status: 'paid'};
                    return data[key];
                })
            });

            AutomatedEmail.findOne.resolves({
                get: sinon.stub().callsFake((key) => {
                    const data = {lexical: '{"root":{}}', status: 'inactive'};
                    return data[key];
                })
            });

            const repo = new MemberRepository({
                Member,
                Outbox,
                MemberPaidSubscriptionEvent,
                StripeCustomerSubscription,
                MemberProductEvent,
                MemberStatusEvent,
                stripeAPIService,
                productRepository,
                AutomatedEmail,
                labsService,
                OfferRedemption: mockOfferRedemption
            });

            sinon.stub(repo, 'getSubscriptionByStripeID').resolves(null);

            await repo.linkSubscription({
                id: 'member_id_123',
                subscription: subscriptionData
            }, {
                transacting: {
                    executionPromise: Promise.resolve()
                },
                context: {}
            });

            sinon.assert.notCalled(Outbox.add);
        });
    });
});
