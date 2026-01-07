const debug = require('@tryghost/debug')('api:endpoints:utils:serializers:output:comment-ban');

// Reuse the member serialization logic
const membersSerializer = require('./members');

module.exports = {
    add(model, apiConfig, frame) {
        debug('add');
        // Use the members serializer to serialize the member response
        membersSerializer.edit(model, apiConfig, frame);
    },

    destroy(model, apiConfig, frame) {
        debug('destroy');
        // Use the members serializer to serialize the member response
        membersSerializer.edit(model, apiConfig, frame);
    }
};
