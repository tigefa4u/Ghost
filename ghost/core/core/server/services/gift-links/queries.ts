import {z} from 'zod';
import errors from '@tryghost/errors';
import type {Knex} from 'knex';
import {GiftLinkRow, giftLinkCodec, giftLinkColumns} from './codec';
import {type Post} from './models';

// The LEFT JOIN leaves every link column nullable; the explicit generic names a row shape knex
// can't infer from a dynamic column list.
type LiveLinkRow = {[K in keyof z.input<typeof GiftLinkRow>]: z.input<typeof GiftLinkRow>[K] | null};

export class GiftLinkQueries {
    private knex: Knex;

    constructor({knex}: {knex: Knex}) {
        this.knex = knex;
    }

    async getPost(postId: string): Promise<Post> {
        // Anchored on posts: zero rows means the post itself doesn't exist, not merely that it has
        // no live link.
        const rows = await this.knex('posts')
            .where('posts.id', postId)
            .leftJoin('post_gift_links', 'post_gift_links.post_id', 'posts.id')
            .leftJoin('gift_links', 'gift_links.token', 'post_gift_links.gift_link_token')
            .select<LiveLinkRow[]>(giftLinkColumns);

        if (rows.length === 0) {
            throw new errors.NotFoundError({message: `Post ${postId} does not exist.`});
        }

        const giftLinks = rows
            .filter((row): row is z.input<typeof GiftLinkRow> => row.token !== null)
            .map(row => z.decode(giftLinkCodec, row));
        return {id: postId, giftLinks};
    }

    async getPostByToken(token: string): Promise<Post | null> {
        const row = await this.knex('post_gift_links')
            .join('gift_links', 'gift_links.token', 'post_gift_links.gift_link_token')
            .where('gift_links.token', token)
            .first<z.input<typeof GiftLinkRow> & {post_id: string}>(
                [...giftLinkColumns, 'post_gift_links.post_id as post_id']
            );
        return row ? {id: row.post_id, giftLinks: [z.decode(giftLinkCodec, row)]} : null;
    }

    async isValidTokenForPost(token: string, postId: string): Promise<boolean> {
        return (await this.getPostByToken(token))?.id === postId;
    }
}
