const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('members', 'comment_ban', {
    type: 'text',
    maxlength: 65535,
    nullable: true
});
