const {agentProvider, fixtureManager, matchers, mockManager, configUtils} = require('../../utils/e2e-framework');
const {anyContentVersion, anyErrorId, anyEtag} = matchers;
const models = require('../../../core/server/models');
const assert = require('assert/strict');
const sinon = require('sinon');
const settingsCache = require('../../../core/shared/settings-cache');

describe('Member Comment Ban API', function () {
    let agent;
    let member;
    let owner;

    before(async function () {
        agent = await agentProvider.getAdminAPIAgent();
        await fixtureManager.init('members');
        await agent.loginAsOwner();
        owner = await fixtureManager.get('users', 0);
    });

    beforeEach(async function () {
        // Create a fresh member for each test
        member = await models.Member.add({
            name: 'Test Member',
            email: `test-${Date.now()}@example.com`,
            email_disabled: false
        });
    });

    afterEach(async function () {
        // Clean up the test member
        if (member) {
            await models.Member.destroy({id: member.id});
        }
    });

    describe('POST /members/:id/comment-ban', function () {
        it('Can ban a member with reason only (indefinite ban)', async function () {
            const {body} = await agent
                .post(`members/${member.id}/comment-ban`)
                .body({
                    comment_bans: [{
                        reason: 'Repeated spam comments'
                    }]
                })
                .expectStatus(200)
                .matchHeaderSnapshot({
                    'content-version': anyContentVersion,
                    etag: anyEtag
                });

            // Verify the member is banned
            assert.equal(body.members[0].can_comment, false);
            assert.equal(body.members[0].comment_ban.reason, 'Repeated spam comments');
            assert.equal(body.members[0].comment_ban.expires_at, null);
        });

        it('Can ban a member with reason and expiry date (temporary ban)', async function () {
            const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days from now

            const {body} = await agent
                .post(`members/${member.id}/comment-ban`)
                .body({
                    comment_bans: [{
                        reason: 'Cooling off period',
                        expires_at: futureDate
                    }]
                })
                .expectStatus(200)
                .matchHeaderSnapshot({
                    'content-version': anyContentVersion,
                    etag: anyEtag
                });

            // Verify the member is banned
            assert.equal(body.members[0].can_comment, false);
            assert.equal(body.members[0].comment_ban.reason, 'Cooling off period');
            assert.ok(body.members[0].comment_ban.expires_at);
        });

        it('Returns 422 when reason is missing', async function () {
            await agent
                .post(`members/${member.id}/comment-ban`)
                .body({
                    comment_bans: [{
                        expires_at: null
                    }]
                })
                .expectStatus(422)
                .matchBodySnapshot({
                    errors: [{
                        id: anyErrorId
                    }]
                })
                .matchHeaderSnapshot({
                    'content-version': anyContentVersion,
                    etag: anyEtag
                });
        });

        it('Returns 422 when expires_at is invalid date format', async function () {
            await agent
                .post(`members/${member.id}/comment-ban`)
                .body({
                    comment_bans: [{
                        reason: 'Test ban',
                        expires_at: 'invalid-date'
                    }]
                })
                .expectStatus(422)
                .matchBodySnapshot({
                    errors: [{
                        id: anyErrorId
                    }]
                })
                .matchHeaderSnapshot({
                    'content-version': anyContentVersion,
                    etag: anyEtag
                });
        });

        it('Returns 404 for non-existent member', async function () {
            await agent
                .post('members/aaaaaaaaaaaaaaaaaaaaaaaa/comment-ban')
                .body({
                    comment_bans: [{
                        reason: 'Test reason'
                    }]
                })
                .expectStatus(404)
                .matchBodySnapshot({
                    errors: [{
                        id: anyErrorId
                    }]
                })
                .matchHeaderSnapshot({
                    'content-version': anyContentVersion,
                    etag: anyEtag
                });
        });
    });

    describe('DELETE /members/:id/comment-ban', function () {
        it('Can unban a banned member', async function () {
            // First ban the member
            await agent
                .post(`members/${member.id}/comment-ban`)
                .body({
                    comment_bans: [{
                        reason: 'Test ban'
                    }]
                })
                .expectStatus(200);

            // Then unban
            const {body} = await agent
                .delete(`members/${member.id}/comment-ban`)
                .expectStatus(200)
                .matchHeaderSnapshot({
                    'content-version': anyContentVersion,
                    etag: anyEtag
                });

            // Verify the member is unbanned
            assert.equal(body.members[0].can_comment, true);
            assert.equal(body.members[0].comment_ban, null);
        });

        it('Unbanning a non-banned member works (idempotent)', async function () {
            const {body} = await agent
                .delete(`members/${member.id}/comment-ban`)
                .expectStatus(200)
                .matchHeaderSnapshot({
                    'content-version': anyContentVersion,
                    etag: anyEtag
                });

            // Member should still be able to comment
            assert.equal(body.members[0].can_comment, true);
            assert.equal(body.members[0].comment_ban, null);
        });

        it('Returns 404 for non-existent member', async function () {
            await agent
                .delete('members/aaaaaaaaaaaaaaaaaaaaaaaa/comment-ban')
                .expectStatus(404)
                .matchBodySnapshot({
                    errors: [{
                        id: anyErrorId
                    }]
                })
                .matchHeaderSnapshot({
                    'content-version': anyContentVersion,
                    etag: anyEtag
                });
        });
    });

    describe('Member API responses with ban data', function () {
        it('New members have can_comment: true by default', async function () {
            const {body} = await agent
                .get(`members/${member.id}`)
                .expectStatus(200);

            assert.equal(body.members[0].can_comment, true);
            assert.equal(body.members[0].comment_ban, null);
        });

        it('Banned members have can_comment: false', async function () {
            await agent
                .post(`members/${member.id}/comment-ban`)
                .body({
                    comment_bans: [{
                        reason: 'Test ban'
                    }]
                })
                .expectStatus(200);

            const {body} = await agent
                .get(`members/${member.id}`)
                .expectStatus(200);

            assert.equal(body.members[0].can_comment, false);
            assert.ok(body.members[0].comment_ban);
            assert.equal(body.members[0].comment_ban.reason, 'Test ban');
        });

        it('Members with expired ban have can_comment: true', async function () {
            const pastDate = new Date(Date.now() - 1000).toISOString(); // 1 second ago

            // Directly set an expired ban in the database
            await models.Member.edit({
                comment_ban: {
                    reason: 'Expired ban',
                    expires_at: pastDate
                }
            }, {id: member.id});

            const {body} = await agent
                .get(`members/${member.id}`)
                .expectStatus(200);

            // Should be able to comment since ban expired
            assert.equal(body.members[0].can_comment, true);
            // But ban data is still present
            assert.ok(body.members[0].comment_ban);
            assert.equal(body.members[0].comment_ban.reason, 'Expired ban');
        });

        it('Members with future expiry ban have can_comment: false', async function () {
            const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 1 day from now

            await agent
                .post(`members/${member.id}/comment-ban`)
                .body({
                    comment_bans: [{
                        reason: 'Temporary ban',
                        expires_at: futureDate
                    }]
                })
                .expectStatus(200);

            const {body} = await agent
                .get(`members/${member.id}`)
                .expectStatus(200);

            assert.equal(body.members[0].can_comment, false);
            assert.ok(body.members[0].comment_ban.expires_at);
        });
    });

    describe('Actions/audit log', function () {
        it('Ban action is logged with the staff member as actor', async function () {
            await agent
                .post(`members/${member.id}/comment-ban`)
                .body({
                    comment_bans: [{
                        reason: 'Spam behavior'
                    }]
                })
                .expectStatus(200);

            // Query actions for this member, include actor
            const {body} = await agent
                .get(`actions?filter=resource_id:'${member.id}'%2Bresource_type:member&include=actor`)
                .expectStatus(200);

            const editAction = body.actions.find(a => a.event === 'edited');

            assert.ok(editAction);
            assert.deepEqual(editAction.actor, {
                id: owner.id,
                name: owner.name,
                slug: owner.slug,
                image: owner.profile_image
            });
        });

        it('Unban action is logged with the staff member as actor', async function () {
            // First ban the member
            await agent
                .post(`members/${member.id}/comment-ban`)
                .body({
                    comment_bans: [{
                        reason: 'Test ban'
                    }]
                })
                .expectStatus(200);

            // Then unban
            await agent
                .delete(`members/${member.id}/comment-ban`)
                .expectStatus(200);

            // Query actions for this member, include actor
            const {body} = await agent
                .get(`actions?filter=resource_id:'${member.id}'%2Bresource_type:member&include=actor`)
                .expectStatus(200);

            const editActions = body.actions.filter(a => a.event === 'edited');

            assert.ok(editActions.length >= 2);
            assert.deepEqual(editActions[0].actor, {
                id: owner.id,
                name: owner.name,
                slug: owner.slug,
                image: owner.profile_image
            });
        });
    });
});

describe('Comment Ban Model Behavior', function () {
    let adminAgent;
    let member;

    before(async function () {
        adminAgent = await agentProvider.getAdminAPIAgent();
        await fixtureManager.init('members');
        await adminAgent.loginAsOwner();
    });

    beforeEach(async function () {
        // Create a fresh member for each test
        member = await models.Member.add({
            name: 'Test Commenter',
            email: `commenter-${Date.now()}@example.com`,
            email_disabled: false
        });
    });

    afterEach(async function () {
        // Clean up the test member
        if (member) {
            await models.Member.destroy({id: member.id});
        }
    });

    it('Banned member model has can_comment: false', async function () {
        // Ban the member
        await adminAgent
            .post(`members/${member.id}/comment-ban`)
            .body({comment_bans: [{reason: 'Spam behavior'}]})
            .expectStatus(200);

        // Verify the model's computed property
        const memberData = await models.Member.findOne({id: member.id});
        assert.equal(memberData.get('can_comment'), false);
    });

    it('Member with expired ban has can_comment: true', async function () {
        const pastDate = new Date(Date.now() - 60000).toISOString(); // 1 minute ago

        // Set an expired ban directly
        await models.Member.edit({
            comment_ban: {
                reason: 'Expired ban',
                expires_at: pastDate
            }
        }, {id: member.id});

        // Verify the member can comment (ban has expired)
        const updatedMember = await models.Member.findOne({id: member.id});
        assert.equal(updatedMember.get('can_comment'), true);
    });

    it('Member with invalid expires_at has can_comment: true (fail open with logging)', async function () {
        // Directly insert invalid date via raw query to bypass API validation
        const knex = require('../../../core/server/data/db').knex;
        await knex('members').where('id', member.id).update({
            comment_ban: JSON.stringify({
                reason: 'Ban with invalid date',
                expires_at: 'invalid-garbage-date'
            })
        });

        // Verify the member can comment (fail open - prefer false negatives over false positives)
        const updatedMember = await models.Member.findOne({id: member.id});
        assert.equal(updatedMember.get('can_comment'), true);
    });

    it('Unbanned member has can_comment: true again', async function () {
        // Ban the member
        await adminAgent
            .post(`members/${member.id}/comment-ban`)
            .body({comment_bans: [{reason: 'Temporary ban'}]})
            .expectStatus(200);

        // Verify banned
        let memberData = await models.Member.findOne({id: member.id});
        assert.equal(memberData.get('can_comment'), false);

        // Unban the member
        await adminAgent
            .delete(`members/${member.id}/comment-ban`)
            .expectStatus(200);

        // Verify unbanned
        memberData = await models.Member.findOne({id: member.id});
        assert.equal(memberData.get('can_comment'), true);
    });
});

describe('Banned Member Comment Restriction', function () {
    let adminAgent;
    let membersAgent;
    let member;
    let postId;

    before(async function () {
        adminAgent = await agentProvider.getAdminAPIAgent();
        membersAgent = await agentProvider.getMembersAPIAgent();
        await fixtureManager.init('posts', 'members');
        await adminAgent.loginAsOwner();

        postId = fixtureManager.get('posts', 0).id;
    });

    beforeEach(async function () {
        mockManager.mockMail();

        // Create a fresh member for each test
        member = await models.Member.add({
            name: 'Banned Test Member',
            email: `banned-test-${Date.now()}@example.com`,
            email_disabled: false
        });

        // Enable comments
        const getStub = sinon.stub(settingsCache, 'get');
        getStub.callsFake((key, options) => {
            if (key === 'comments_enabled') {
                return 'all';
            }
            return getStub.wrappedMethod.call(settingsCache, key, options);
        });
    });

    afterEach(async function () {
        sinon.restore();
        mockManager.restore();
        await configUtils.restore();

        // Clean up the test member
        if (member) {
            await models.Member.destroy({id: member.id});
        }
    });

    it('Banned member cannot post a comment', async function () {
        // Log in as the member
        await membersAgent.loginAs(member.get('email'));

        // Ban the member via admin API
        await adminAgent
            .post(`members/${member.id}/comment-ban`)
            .body({comment_bans: [{reason: 'Spam behavior'}]})
            .expectStatus(200);

        // Try to post a comment as the banned member
        await membersAgent
            .post('/api/comments/')
            .body({comments: [{
                post_id: postId,
                html: '<p>This comment should be blocked</p>'
            }]})
            .expectStatus(403)
            .matchBodySnapshot({
                errors: [{
                    id: anyErrorId
                }]
            })
            .matchHeaderSnapshot({
                etag: anyEtag
            });
    });

    it('Banned member cannot reply to a comment', async function () {
        // Create a comment to reply to
        const parentComment = await models.Comment.add({
            post_id: postId,
            member_id: fixtureManager.get('members', 0).id,
            html: '<p>Parent comment</p>'
        });

        // Log in as the member
        await membersAgent.loginAs(member.get('email'));

        // Ban the member via admin API
        await adminAgent
            .post(`members/${member.id}/comment-ban`)
            .body({comment_bans: [{reason: 'Harassment'}]})
            .expectStatus(200);

        // Try to reply as the banned member
        await membersAgent
            .post('/api/comments/')
            .body({comments: [{
                post_id: postId,
                parent_id: parentComment.id,
                html: '<p>This reply should be blocked</p>'
            }]})
            .expectStatus(403)
            .matchBodySnapshot({
                errors: [{
                    id: anyErrorId
                }]
            })
            .matchHeaderSnapshot({
                etag: anyEtag
            });
    });

    it('Banned member cannot like a comment', async function () {
        // Create a comment to like
        const comment = await models.Comment.add({
            post_id: postId,
            member_id: fixtureManager.get('members', 0).id,
            html: '<p>A comment to like</p>'
        });

        // Log in as the member
        await membersAgent.loginAs(member.get('email'));

        // Ban the member via admin API
        await adminAgent
            .post(`members/${member.id}/comment-ban`)
            .body({comment_bans: [{reason: 'Abuse'}]})
            .expectStatus(200);

        // Try to like as the banned member
        await membersAgent
            .post(`/api/comments/${comment.id}/like/`)
            .expectStatus(403)
            .matchBodySnapshot({
                errors: [{
                    id: anyErrorId
                }]
            })
            .matchHeaderSnapshot({
                etag: anyEtag
            });
    });

    it('Banned member cannot edit their own comment', async function () {
        // Log in as the member first
        await membersAgent.loginAs(member.get('email'));

        // Create a comment as the member before ban
        const comment = await models.Comment.add({
            post_id: postId,
            member_id: member.id,
            html: '<p>My original comment</p>'
        });

        // Ban the member via admin API
        await adminAgent
            .post(`members/${member.id}/comment-ban`)
            .body({comment_bans: [{reason: 'Policy violation'}]})
            .expectStatus(200);

        // Try to edit the comment as the banned member
        await membersAgent
            .put(`/api/comments/${comment.id}/`)
            .body({comments: [{
                html: '<p>Trying to edit my comment</p>'
            }]})
            .expectStatus(403)
            .matchBodySnapshot({
                errors: [{
                    id: anyErrorId
                }]
            })
            .matchHeaderSnapshot({
                etag: anyEtag
            });
    });

    it('Banned member cannot delete their own comment', async function () {
        // Log in as the member first
        await membersAgent.loginAs(member.get('email'));

        // Create a comment as the member before ban
        const comment = await models.Comment.add({
            post_id: postId,
            member_id: member.id,
            html: '<p>My comment to delete</p>'
        });

        // Ban the member via admin API
        await adminAgent
            .post(`members/${member.id}/comment-ban`)
            .body({comment_bans: [{reason: 'Misconduct'}]})
            .expectStatus(200);

        // Try to delete the comment as the banned member
        await membersAgent
            .delete(`/api/comments/${comment.id}/`)
            .expectStatus(403)
            .matchBodySnapshot({
                errors: [{
                    id: anyErrorId
                }]
            })
            .matchHeaderSnapshot({
                etag: anyEtag
            });
    });

    it('Banned member cannot unlike a comment', async function () {
        // Create a comment to like
        const comment = await models.Comment.add({
            post_id: postId,
            member_id: fixtureManager.get('members', 0).id,
            html: '<p>A comment to like then unlike</p>'
        });

        // Log in as the member
        await membersAgent.loginAs(member.get('email'));

        // Like the comment before ban
        await membersAgent
            .post(`/api/comments/${comment.id}/like/`)
            .expectStatus(204);

        // Ban the member via admin API
        await adminAgent
            .post(`members/${member.id}/comment-ban`)
            .body({comment_bans: [{reason: 'Abuse'}]})
            .expectStatus(200);

        // Try to unlike as the banned member
        await membersAgent
            .delete(`/api/comments/${comment.id}/like/`)
            .expectStatus(403)
            .matchBodySnapshot({
                errors: [{
                    id: anyErrorId
                }]
            })
            .matchHeaderSnapshot({
                etag: anyEtag
            });
    });

    it('Member with expired ban can comment', async function () {
        const pastDate = new Date(Date.now() - 60000).toISOString(); // 1 minute ago

        // Log in as the member
        await membersAgent.loginAs(member.get('email'));

        // Set an expired ban directly in the database
        await models.Member.edit({
            comment_ban: {
                reason: 'Expired ban',
                expires_at: pastDate
            }
        }, {id: member.id});

        // Member should be able to comment since ban is expired
        await membersAgent
            .post('/api/comments/')
            .body({comments: [{
                post_id: postId,
                html: '<p>This comment should be allowed</p>'
            }]})
            .expectStatus(201);
    });

    it('Unbanned member can comment again', async function () {
        // Log in as the member
        await membersAgent.loginAs(member.get('email'));

        // Ban the member
        await adminAgent
            .post(`members/${member.id}/comment-ban`)
            .body({comment_bans: [{reason: 'Temporary ban'}]})
            .expectStatus(200);

        // Verify comment is blocked
        await membersAgent
            .post('/api/comments/')
            .body({comments: [{
                post_id: postId,
                html: '<p>Should be blocked</p>'
            }]})
            .expectStatus(403);

        // Unban the member
        await adminAgent
            .delete(`members/${member.id}/comment-ban`)
            .expectStatus(200);

        // Now the member should be able to comment
        await membersAgent
            .post('/api/comments/')
            .body({comments: [{
                post_id: postId,
                html: '<p>This comment should now be allowed</p>'
            }]})
            .expectStatus(201);
    });
});
