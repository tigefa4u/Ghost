import {z} from 'zod';
import type {Knex} from 'knex';
import {giftLinkCodec} from './codec';
import {generateGiftLinkToken, type GiftLink, type Post} from './models';
import {type GiftLinkQueries} from './queries';
import {type RecordGiftLinkAction, type RequestContext} from './actions';

export class GiftLinkCommands {
    private knex: Knex;
    private queries: GiftLinkQueries;
    private recordAction: RecordGiftLinkAction;

    constructor({knex, queries, recordAction}: {knex: Knex; queries: GiftLinkQueries; recordAction: RecordGiftLinkAction}) {
        this.knex = knex;
        this.queries = queries;
        this.recordAction = recordAction;
    }

    async ensure(context: RequestContext, postId: string): Promise<Post> {
        const post = await this.queries.getPost(postId);
        if (post.giftLinks.length) {
            return post;
        }
        const minted = await this.mint(postId);
        await this.recordAction({context, verb: 'add', subject: postId});
        return minted;
    }

    async create(context: RequestContext, postId: string): Promise<Post> {
        await this.queries.getPost(postId); // asserts the post exists (throws NotFound)
        const minted = await this.mint(postId);
        await this.recordAction({context, verb: 'reset', subject: postId});
        return minted;
    }

    // gift_links rows are kept as history; only the live association is removed.
    async removeAll(context: RequestContext): Promise<number> {
        const removed = await this.knex('post_gift_links').del();
        if (removed > 0) {
            await this.recordAction({context, verb: 'remove', subject: null});
        }
        return removed;
    }

    private async mint(postId: string): Promise<Post> {
        const link: GiftLink = {token: generateGiftLinkToken(), createdAt: new Date()};
        await this.knex.transaction(async (trx) => {
            await this.addToHistory(trx, postId, link);
            await this.setLiveLink(trx, postId, link);
        });
        return {id: postId, giftLinks: [link]};
    }

    private addToHistory(trx: Knex.Transaction, postId: string, link: GiftLink) {
        return trx('gift_links').insert({...z.encode(giftLinkCodec, link), post_id: postId});
    }

    private setLiveLink(trx: Knex.Transaction, postId: string, link: GiftLink) {
        return trx('post_gift_links')
            .insert({post_id: postId, gift_link_token: link.token, created_at: link.createdAt})
            .onConflict('post_id')
            .merge({gift_link_token: link.token, updated_at: link.createdAt});
    }
}
