const assert = require('node:assert/strict');
const Module = require('module');
const sinon = require('sinon');

describe('JobService', function () {
    const jobServicePath = '../../../../../core/server/services/jobs/job-service';
    let originalLoad;
    let workerMessageHandler;
    let handleModelEvent;

    beforeEach(function () {
        originalLoad = Module._load;
        handleModelEvent = sinon.stub().resolves(true);

        Module._load = function (request, parent, isMain) {
            if (request === '@tryghost/job-manager') {
                return class JobManager {
                    constructor(options) {
                        workerMessageHandler = options.workerMessageHandler;
                    }
                };
            }

            if (request === './worker-model-event-bridge') {
                return class WorkerModelEventBridge {
                    isModelEventMessage(message) {
                        return message && message.type === 'model-event';
                    }

                    handle(message, meta) {
                        return handleModelEvent(message, meta);
                    }
                };
            }

            if (request === '@tryghost/logging') {
                return {
                    info: sinon.stub(),
                    warn: sinon.stub(),
                    error: sinon.stub()
                };
            }

            if (request === '../../models') {
                return {Job: {}};
            }

            if (request === '../../../shared/sentry') {
                return {captureException: sinon.stub()};
            }

            if (request === '@tryghost/domain-events') {
                return {};
            }

            if (request === '../../../shared/config') {
                return {};
            }

            if (request === '../../lib/common/events') {
                return {emit: sinon.stub()};
            }

            return originalLoad.call(this, request, parent, isMain);
        };

        delete require.cache[require.resolve(jobServicePath)];
        require(jobServicePath);
    });

    afterEach(function () {
        Module._load = originalLoad;
        delete require.cache[require.resolve(jobServicePath)];
        sinon.restore();
    });

    it('routes model-event worker messages without leaving them as raw domain events', function () {
        const message = {
            type: 'model-event',
            event: 'member.edited',
            model: 'Member',
            id: 'member-id',
            previous: {status: 'comped'},
            changed: {status: 'free'}
        };

        workerMessageHandler({name: 'clean-expired-comped', message});

        sinon.assert.calledOnceWithExactly(handleModelEvent, {
            type: 'model-event',
            event: 'member.edited',
            model: 'Member',
            id: 'member-id',
            previous: {status: 'comped'},
            changed: {status: 'free'}
        }, {
            jobName: 'clean-expired-comped'
        });
        assert.equal(message.event, undefined);
    });
});
