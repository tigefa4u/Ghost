const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');

const INVALIDATE_MEMBERS_CACHE = {value: '/members/'};

const messages = {
    memberNotFound: 'Member not found.'
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'comment_bans',

    add: {
        statusCode: 200,
        headers: {
            cacheInvalidate: INVALIDATE_MEMBERS_CACHE
        },
        options: [
            'id'
        ],
        data: [
            'reason',
            'expires_at'
        ],
        validation: {
            options: {
                id: {
                    required: true
                }
            }
        },
        permissions: {
            method: 'edit',
            docName: 'member'
        },
        async query(frame) {
            const member = await models.Member.findOne({id: frame.options.id}, {require: false});

            if (!member) {
                throw new errors.NotFoundError({
                    message: tpl(messages.memberNotFound)
                });
            }

            const inputData = frame.data.comment_bans[0];
            const banData = {
                reason: inputData.reason,
                expires_at: inputData.expires_at || null
            };

            await models.Member.edit(
                {comment_ban: banData},
                {
                    id: frame.options.id,
                    context: frame.options.context,
                    actionName: 'banned_from_commenting'
                }
            );

            // Refetch to get updated data with relations
            return await models.Member.findOne({id: frame.options.id}, {require: true});
        }
    },

    destroy: {
        statusCode: 200,
        headers: {
            cacheInvalidate: INVALIDATE_MEMBERS_CACHE
        },
        options: [
            'id'
        ],
        validation: {
            options: {
                id: {
                    required: true
                }
            }
        },
        permissions: {
            method: 'edit',
            docName: 'member'
        },
        async query(frame) {
            const member = await models.Member.findOne({id: frame.options.id}, {require: false});

            if (!member) {
                throw new errors.NotFoundError({
                    message: tpl(messages.memberNotFound)
                });
            }

            await models.Member.edit(
                {comment_ban: null},
                {
                    id: frame.options.id,
                    context: frame.options.context,
                    actionName: 'unbanned_from_commenting'
                }
            );

            // Refetch to get updated data with relations
            return await models.Member.findOne({id: frame.options.id}, {require: true});
        }
    }
};

module.exports = controller;
