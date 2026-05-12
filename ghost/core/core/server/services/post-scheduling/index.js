const events = require('../../lib/common/events');
const PostSchedulerService = require('./post-scheduler-service');
const {sequence} = require('@tryghost/promise');

const SCHEDULED_RESOURCES = ['post', 'page'];

const loadScheduledResources = async function () {
    const api = require('../../api').endpoints;
    const results = await sequence(SCHEDULED_RESOURCES.map(resourceType => async () => {
        const result = await api.schedules.getScheduled.query({options: {resource: resourceType}});
        return result[resourceType] || [];
    }));
    return SCHEDULED_RESOURCES.reduce((obj, entry, index) => Object.assign(obj, {[entry]: results[index]}), {});
};

let _service;

const init = async ({adapter, apiUrl, internalKeys}) => {
    _service = new PostSchedulerService({apiUrl, internalKeys, adapter, events});
    if (adapter.rescheduleOnBoot) {
        await _service.reschedule(await loadScheduledResources());
    }
    return _service;
};

/**
 * Re-issue every queued schedule under the current internal-keys cache.
 * Pass the pre-rotation secret as `previousKey` so the adapter-queued
 * unschedule URLs can be reconstructed before resigning with the new key.
 *
 * @param {Object} [opts]
 * @param {import('../internal-keys').InternalApiKey} [opts.previousKey]
 */
const rescheduleAll = async ({previousKey} = {}) => {
    if (!_service) {
        return;
    }
    await _service.reschedule(await loadScheduledResources(), {previousKey});
};

exports.init = init;
exports.rescheduleAll = rescheduleAll;
