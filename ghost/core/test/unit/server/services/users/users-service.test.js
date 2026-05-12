const assert = require('node:assert/strict');
const sinon = require('sinon');

const Users = require('../../../../../core/server/services/users');

describe('Users service', function () {
    describe('lockAll', function () {
        function makeUser({email, roles = []} = {}) {
            return {
                lock: sinon.stub().resolves(),
                get: sinon.stub().withArgs('email').returns(email ?? 'test_email@example.com'),
                related: sinon.stub().withArgs('roles').returns({
                    some: predicate => roles.some(role => predicate({get: key => (key === 'name' ? role : undefined)}))
                })
            };
        }

        function makeService({users} = {users: [makeUser()]}) {
            const userCollection = {
                models: users,
                filter: cb => users.filter(cb)
            };

            return new Users({
                dbBackup: {backup: sinon.stub().resolves()},
                models: {
                    Base: {transaction: cb => cb('fake_transaction')},
                    User: {findAll: sinon.stub().resolves(userCollection)}
                },
                auth: {
                    passwordreset: {
                        generateToken: sinon.stub().resolves('secret_fake_token'),
                        sendResetNotification: sinon.stub().resolves()
                    }
                },
                apiMail: 'fake_api_mail',
                apiSettings: 'fake_api_settings'
            });
        }

        it('locks every user when no role filter is given', async function () {
            const users = [makeUser({email: 'a@example.com'}), makeUser({email: 'b@example.com'})];
            const usersService = makeService({users});

            const result = await usersService.lockAll({context: {}});

            assert.equal(result.count, 2);
            sinon.assert.calledOnce(users[0].lock);
            sinon.assert.calledOnce(users[1].lock);
        });

        it('does not proactively send any reset emails', async function () {
            const users = [makeUser({email: 'a@example.com'}), makeUser({email: 'b@example.com'})];
            const usersService = makeService({users});

            await usersService.lockAll({context: {}});

            sinon.assert.notCalled(usersService.auth.passwordreset.generateToken);
            sinon.assert.notCalled(usersService.auth.passwordreset.sendResetNotification);
        });

        it('returns count=0 when no users match', async function () {
            const usersService = makeService({users: []});

            const result = await usersService.lockAll({context: {}});

            assert.equal(result.count, 0);
        });

        it('filters to users with one of the named roles when roles is given', async function () {
            const owner = makeUser({email: 'owner@example.com', roles: ['Owner']});
            const editor = makeUser({email: 'editor@example.com', roles: ['Editor']});
            const contributor = makeUser({email: 'contributor@example.com', roles: ['Contributor']});
            const usersService = makeService({users: [owner, editor, contributor]});

            const result = await usersService.lockAll({context: {}}, {roles: ['Owner', 'Editor']});

            assert.equal(result.count, 2);
            sinon.assert.calledOnce(owner.lock);
            sinon.assert.calledOnce(editor.lock);
            sinon.assert.notCalled(contributor.lock);
        });
    });
});
