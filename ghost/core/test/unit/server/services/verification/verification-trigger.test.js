// Switch these lines once there are useful utils
// const testUtils = require('./utils');
const sinon = require('sinon');
const assert = require('node:assert/strict');
require('should');
const {VerificationTrigger} = require('../../../../../core/server/services/verification');
const DomainEvents = require('@tryghost/domain-events');
const {MemberCreatedEvent} = require('../../../../../core/shared/events');

describe('Import threshold', function () {
    beforeEach(function () {
        // Stub this method to prevent unnecessary subscriptions to domain events
        sinon.stub(DomainEvents, 'subscribe');
    });
    afterEach(function () {
        sinon.restore();
    });

    it('Creates a threshold based on config', async function () {
        const trigger = new VerificationTrigger({
            getImportTriggerThreshold: () => 2,
            eventRepository: {
                getSignupEvents: async () => ({
                    meta: {
                        pagination: {
                            total: 1
                        }
                    }
                })
            },
            isVerified: () => false
        });

        const result = await trigger.getImportThreshold();
        assert.equal(result, 2);
    });

    it('Increases the import threshold to the number of members', async function () {
        const trigger = new VerificationTrigger({
            getImportTriggerThreshold: () => 2,
            eventRepository: {
                getSignupEvents: async () => ({
                    meta: {
                        pagination: {
                            total: 3
                        }
                    }
                })
            },
            isVerified: () => false
        });

        const result = await trigger.getImportThreshold();
        assert.equal(result, 3);
    });

    it('Does not check members count when config threshold is infinite', async function () {
        const membersStub = sinon.stub().resolves(null);
        const trigger = new VerificationTrigger({
            getImportTriggerThreshold: () => Infinity,
            eventRepository: {
                getSignupEvents: membersStub
            },
            isVerified: () => false
        });

        const result = await trigger.getImportThreshold();
        assert.equal(result, Infinity);
        assert.equal(membersStub.callCount, 0);
    });
});

describe('Email verification flow', function () {
    let domainEventsStub;

    beforeEach(function () {
        domainEventsStub = sinon.stub(DomainEvents, 'subscribe');
    });
    afterEach(function () {
        sinon.restore();
    });

    it('Triggers verification process', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const trigger = new VerificationTrigger({
            Settings: {
                edit: settingsStub
            },
            isVerified: () => false,
            isVerificationRequired: () => false,
            sendVerificationWebhook: emailStub
        });

        const result = await trigger._startVerificationProcess({
            amount: 10,
            throwOnTrigger: false
        });

        assert.equal(result.needsVerification, true);
        assert.equal(emailStub.callCount, 1);
        assert.equal(settingsStub.callCount, 1);
    });

    it('Does not trigger verification when already verified', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const trigger = new VerificationTrigger({
            Settings: {
                edit: settingsStub
            },
            isVerified: () => true,
            isVerificationRequired: () => false,
            sendVerificationWebhook: emailStub
        });

        const result = await trigger._startVerificationProcess({
            amount: 10,
            throwOnTrigger: false
        });

        assert.equal(result.needsVerification, false);
        assert.equal(emailStub.callCount, 0);
        assert.equal(settingsStub.callCount, 0);
    });

    it('Does not trigger verification when already in progress', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const trigger = new VerificationTrigger({
            Settings: {
                edit: settingsStub
            },
            isVerified: () => false,
            isVerificationRequired: () => true,
            sendVerificationWebhook: emailStub
        });

        const result = await trigger._startVerificationProcess({
            amount: 10,
            throwOnTrigger: false
        });

        assert.equal(result.needsVerification, false);
        assert.equal(emailStub.callCount, 0);
        assert.equal(settingsStub.callCount, 0);
    });

    it('Throws when `throwsOnTrigger` is true', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const trigger = new VerificationTrigger({
            Settings: {
                edit: settingsStub
            },
            isVerified: () => false,
            isVerificationRequired: () => false,
            sendVerificationWebhook: emailStub
        });

        await assert.rejects(
            trigger._startVerificationProcess({
                amount: 10,
                throwOnTrigger: true
            })
        );
    });

    it('Sends webhook with amountTriggered, threshold, and method', async function () {
        const webhookStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const trigger = new VerificationTrigger({
            Settings: {
                edit: settingsStub
            },
            isVerified: () => false,
            isVerificationRequired: () => false,
            sendVerificationWebhook: webhookStub
        });

        await trigger._startVerificationProcess({
            amount: 10,
            threshold: 5,
            method: 'import',
            throwOnTrigger: false
        });

        assert.deepEqual(webhookStub.lastCall.firstArg, {
            amountTriggered: 10,
            threshold: 5,
            method: 'import'
        });
    });

    it('Triggers when a number of API events are dispatched', async function () {
        // We need to use the real event repository here to test event handling
        domainEventsStub.restore();
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const eventStub = sinon.stub().callsFake(async (_unused, {source}) => {
            if (source === 'member') {
                return {
                    meta: {
                        pagination: {
                            total: 15
                        }
                    }
                };
            } else {
                return {
                    meta: {
                        pagination: {
                            total: 10
                        }
                    }
                };
            }
        });

        new VerificationTrigger({
            getApiTriggerThreshold: () => 2,
            Settings: {
                edit: settingsStub
            },
            isVerified: () => false,
            isVerificationRequired: () => false,
            sendVerificationWebhook: emailStub,
            eventRepository: {
                getSignupEvents: eventStub
            }
        });

        DomainEvents.dispatch(MemberCreatedEvent.create({
            memberId: 'hello!',
            source: 'api'
        }, new Date()));

        assert.equal(eventStub.callCount, 1);
        assert('source' in eventStub.lastCall.lastArg);
        assert.equal(eventStub.lastCall.lastArg.source, 'api');
        assert('created_at' in eventStub.lastCall.lastArg);
        assert('$gt' in eventStub.lastCall.lastArg.created_at);
        assert.match(eventStub.lastCall.lastArg.created_at.$gt, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    it('Does not trigger when site is already verified', async function () {
        // We need to use the real event repository here to test event handling
        domainEventsStub.restore();
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const eventStub = sinon.stub();

        new VerificationTrigger({
            getApiTriggerThreshold: () => 2,
            Settings: {
                edit: settingsStub
            },
            isVerified: () => true,
            isVerificationRequired: () => false,
            sendVerificationWebhook: emailStub,
            eventRepository: {
                getSignupEvents: eventStub
            }
        });

        DomainEvents.dispatch(MemberCreatedEvent.create({
            memberId: 'hello!',
            source: 'api'
        }, new Date()));

        assert.equal(eventStub.callCount, 0);
    });

    it('Triggers when a number of members are imported', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const eventStub = sinon.stub().callsFake(async (_unused, {source}) => {
            if (source === 'member') {
                return {
                    meta: {
                        pagination: {
                            total: 15
                        }
                    }
                };
            } else {
                return {
                    meta: {
                        pagination: {
                            total: 10
                        }
                    }
                };
            }
        });

        const trigger = new VerificationTrigger({
            getImportTriggerThreshold: () => 2,
            Settings: {
                edit: settingsStub
            },
            isVerified: () => false,
            isVerificationRequired: () => false,
            sendVerificationWebhook: emailStub,
            eventRepository: {
                getSignupEvents: eventStub
            }
        });

        await trigger.testImportThreshold();

        assert.equal(eventStub.callCount, 2);
        assert('source' in eventStub.firstCall.lastArg);
        assert.equal(eventStub.firstCall.lastArg.source, 'import');
        assert('created_at' in eventStub.firstCall.lastArg);
        assert('$gt' in eventStub.firstCall.lastArg.created_at);
        assert.match(eventStub.firstCall.lastArg.created_at.$gt, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);

        assert.equal(emailStub.callCount, 1);
        assert.deepEqual(emailStub.lastCall.firstArg, {
            amountTriggered: 10,
            threshold: 5,
            method: 'import'
        });
    });

    it('checkVerificationRequired also checks import', async function () {
        const emailStub = sinon.stub().resolves(null);
        let isVerificationRequired = false;
        const isVerificationRequiredStub = sinon.stub().callsFake(() => {
            return isVerificationRequired;
        });
        const settingsStub = sinon.stub().callsFake(() => {
            isVerificationRequired = true;
            return Promise.resolve();
        });
        const eventStub = sinon.stub().callsFake(async (_unused, {source}) => {
            if (source === 'member') {
                return {
                    meta: {
                        pagination: {
                            total: 15
                        }
                    }
                };
            } else {
                return {
                    meta: {
                        pagination: {
                            total: 10
                        }
                    }
                };
            }
        });

        const trigger = new VerificationTrigger({
            getImportTriggerThreshold: () => 2,
            Settings: {
                edit: settingsStub
            },
            isVerified: () => false,
            isVerificationRequired: isVerificationRequiredStub,
            sendVerificationWebhook: emailStub,
            eventRepository: {
                getSignupEvents: eventStub
            }
        });

        assert.equal(await trigger.checkVerificationRequired(), true);
        sinon.assert.calledOnce(emailStub);
    });

    it('testImportThreshold does not calculate anything if already verified', async function () {
        const trigger = new VerificationTrigger({
            getImportTriggerThreshold: () => 2,
            isVerified: () => true
        });

        assert.equal(await trigger.testImportThreshold(), undefined);
    });

    it('testImportThreshold does not calculate anything if already pending', async function () {
        const trigger = new VerificationTrigger({
            getImportTriggerThreshold: () => 2,
            isVerified: () => false,
            isVerificationRequired: () => true
        });

        assert.equal(await trigger.testImportThreshold(), undefined);
    });

    it('Triggers when a number of members are added from Admin', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const eventStub = sinon.stub().callsFake(async (_unused, {source}) => {
            if (source === 'member') {
                return {
                    meta: {
                        pagination: {
                            total: 0
                        }
                    }
                };
            } else {
                return {
                    meta: {
                        pagination: {
                            total: 10
                        }
                    }
                };
            }
        });

        const trigger = new VerificationTrigger({
            getAdminTriggerThreshold: () => 2,
            Settings: {
                edit: settingsStub
            },
            isVerified: () => false,
            isVerificationRequired: () => false,
            sendVerificationWebhook: emailStub,
            eventRepository: {
                getSignupEvents: eventStub
            }
        });

        await trigger._handleMemberCreatedEvent({
            data: {
                source: 'admin'
            }
        });

        assert.equal(eventStub.callCount, 2);
        assert('source' in eventStub.firstCall.lastArg);
        assert.equal(eventStub.firstCall.lastArg.source, 'admin');
        assert('created_at' in eventStub.firstCall.lastArg);
        assert('$gt' in eventStub.firstCall.lastArg.created_at);
        assert.match(eventStub.firstCall.lastArg.created_at.$gt, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);

        assert.equal(emailStub.callCount, 1);
        assert.deepEqual(emailStub.lastCall.firstArg, {
            amountTriggered: 10,
            threshold: 2,
            method: 'admin'
        });
    });

    it('Triggers when a number of members are added from API', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const eventStub = sinon.stub().callsFake(async (_unused, {source}) => {
            if (source === 'member') {
                return {
                    meta: {
                        pagination: {
                            total: 0
                        }
                    }
                };
            } else {
                return {
                    meta: {
                        pagination: {
                            total: 10
                        }
                    }
                };
            }
        });

        const trigger = new VerificationTrigger({
            getAdminTriggerThreshold: () => 2,
            getApiTriggerThreshold: () => 2,
            Settings: {
                edit: settingsStub
            },
            isVerified: () => false,
            isVerificationRequired: () => false,
            sendVerificationWebhook: emailStub,
            eventRepository: {
                getSignupEvents: eventStub
            }
        });

        await trigger._handleMemberCreatedEvent({
            data: {
                source: 'api'
            }
        });

        assert.equal(eventStub.callCount, 2);
        assert('source' in eventStub.firstCall.lastArg);
        assert.equal(eventStub.firstCall.lastArg.source, 'api');
        assert('created_at' in eventStub.firstCall.lastArg);
        assert('$gt' in eventStub.firstCall.lastArg.created_at);
        assert.match(eventStub.firstCall.lastArg.created_at.$gt, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);

        assert.equal(emailStub.callCount, 1);
        assert.deepEqual(emailStub.lastCall.firstArg, {
            amountTriggered: 10,
            threshold: 2,
            method: 'api'
        });
    });

    it('Does not fetch events and trigger when threshold is Infinity', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const eventStub = sinon.stub().callsFake(async (_unused, {source}) => {
            if (source === 'member') {
                return {
                    meta: {
                        pagination: {
                            total: 15
                        }
                    }
                };
            } else {
                return {
                    meta: {
                        pagination: {
                            total: 10
                        }
                    }
                };
            }
        });

        const trigger = new VerificationTrigger({
            getImportTriggerThreshold: () => Infinity,
            Settings: {
                edit: settingsStub
            },
            isVerified: () => false,
            isVerificationRequired: () => false,
            sendVerificationWebhook: emailStub,
            eventRepository: {
                getSignupEvents: eventStub
            }
        });

        await trigger.testImportThreshold();

        // We shouldn't be fetching the events if the threshold is Infinity
        assert.equal(eventStub.callCount, 0);

        // We shouldn't be sending emails if the threshold is Infinity
        assert.equal(emailStub.callCount, 0);
    });
});
