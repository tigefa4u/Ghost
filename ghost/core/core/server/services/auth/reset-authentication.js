const logging = require('@tryghost/logging');

/**
 * Build the "reset all authentication" action: rotate every API key, refresh
 * the in-process key cache, re-issue every queued scheduler callback under
 * the new key, lock every user, and destroy every session. Best-effort audit
 * entry is recorded last.
 *
 * @param {Object} deps
 * @param {Object} deps.models                       - bookshelf model registry
 * @param {Map<string, Promise<{id: string, secret: string}>>} deps.internalKeys
 * @param {Object} deps.postScheduling               - exposes rescheduleAll({previousKey})
 * @param {Object} deps.automations                  - exposes rescheduleAll({previousKey})
 * @param {Object} deps.giftService                  - exposes rescheduleAll({previousKey})
 * @param {Object} deps.userService                  - exposes lockAll(options)
 * @param {() => Promise<void>} deps.deleteAllSessions
 * @returns {(opts: {options: Object}) => Promise<{apiKeysRotated: number, usersLocked: number}>}
 */
module.exports = function createResetAuthentication({
    models,
    internalKeys,
    postScheduling,
    automations,
    giftService,
    userService,
    deleteAllSessions
}) {
    return async function resetAuthentication({options}) {
        // Snapshot the current scheduler key BEFORE rotation so adapter-queued
        // URLs can be reconstructed for unschedule; after rotation that secret
        // is gone.
        const previousSchedulerKey = await internalKeys.get('ghost-scheduler');

        const {count: apiKeysRotated} = await models.Base.transaction(
            t => models.ApiKey.refreshAllSecrets(Object.assign({}, options, {transacting: t}))
        );

        internalKeys.clear();

        const rescheduleOptions = {previousKey: previousSchedulerKey};
        await postScheduling.rescheduleAll(rescheduleOptions);
        await automations.rescheduleAll(rescheduleOptions);
        await giftService.rescheduleAll(rescheduleOptions);

        const {count: usersLocked} = await userService.lockAll(options);
        await deleteAllSessions();

        await recordAuditAction({
            models,
            event: 'reset_authentication',
            options,
            context: {apiKeysRotated, usersLocked}
        });

        return {apiKeysRotated, usersLocked};
    };
};

/**
 * Best-effort audit entry. Failure here must not break the user-visible
 * action — the rotation already happened.
 */
async function recordAuditAction({models, event, options, context}) {
    const actorId = options && options.context && options.context.user;
    if (!actorId) {
        return;
    }
    try {
        await models.Action.add({
            event,
            resource_type: 'security_action',
            resource_id: null,
            actor_type: 'user',
            actor_id: actorId,
            context: Object.assign({action_name: event}, context)
        }, {autoRefresh: false});
    } catch (err) {
        logging.error({
            event: {name: 'auth.security-action-audit.error'},
            err,
            action: event
        }, 'Failed to record security action audit entry');
    }
}
