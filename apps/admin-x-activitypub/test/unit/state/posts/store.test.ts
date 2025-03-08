import {beforeEach, describe, expect, it} from 'vitest';

import {type Post} from '../../../../src/api/activitypub';
import {usePostStore} from '../../../../src/state/posts/store';

describe('Post Store', () => {
    let store: ReturnType<typeof usePostStore.getState>;

    beforeEach(() => {
        store = usePostStore.getState();
        store.posts.clear();
        store.collections.clear();
    });

    describe('addPost', () => {
        it('should add a post to the store', () => {
            const post = {id: '1', title: 'Post 1'} as Post;

            store.addPost(post);

            const storedPost = store.getPostById(post.id);

            expect(storedPost).toEqual(post);
        });

        it('should overwrite an existing post', () => {
            const post = {id: '1', title: 'Post 1'} as Post;
            const postWithUpdatedTitle = {...post, title: 'Updated Post 1'} as Post;

            store.addPost(post);
            store.addPost(postWithUpdatedTitle);

            const storedPost = store.getPostById(post.id);

            expect(storedPost).toEqual(postWithUpdatedTitle);
        });
    });

    describe('addPostToCollection', () => {
        it('should add a post to a new collection', () => {
            const post = {id: '1', title: 'Post 1'} as Post;
            const collectionKey = 'posts';

            store.addPost(post);
            store.addPostToCollection(collectionKey, post.id);

            const collection = store.getCollection(collectionKey);

            expect(collection).toHaveLength(1);
            expect(collection[0]).toEqual(post);
        });

        it('should add a post to the end of a collection by default', () => {
            const post1 = {id: '1', title: 'Post 1'} as Post;
            const post2 = {id: '2', title: 'Post 2'} as Post;
            const collectionKey = 'posts';

            store.addPost(post1);
            store.addPost(post2);

            store.addPostToCollection(collectionKey, post1.id);
            store.addPostToCollection(collectionKey, post2.id);

            const collection = store.getCollection(collectionKey);

            expect(collection).toHaveLength(2);
            expect(collection[0]).toEqual(post1);
            expect(collection[1]).toEqual(post2);
        });

        it('should add a post to the start of a collection when specified', () => {
            const post1 = {id: '1', title: 'Post 1'} as Post;
            const post2 = {id: '2', title: 'Post 2'} as Post;
            const collectionKey = 'posts';

            store.addPost(post1);
            store.addPost(post2);

            store.addPostToCollection(collectionKey, post1.id, 'start');
            store.addPostToCollection(collectionKey, post2.id, 'start');

            const collection = store.getCollection(collectionKey);

            expect(collection).toHaveLength(2);
            expect(collection[0]).toEqual(post2);
            expect(collection[1]).toEqual(post1);
        });

        it('should add a post at a specific position when specified', () => {
            const post1 = {id: '1', title: 'Post 1'} as Post;
            const post2 = {id: '2', title: 'Post 2'} as Post;
            const post3 = {id: '3', title: 'Post 3'} as Post;
            const collectionKey = 'posts';

            store.addPost(post1);
            store.addPost(post2);
            store.addPost(post3);

            store.addPostToCollection(collectionKey, post1.id);
            store.addPostToCollection(collectionKey, post2.id);
            store.addPostToCollection(collectionKey, post3.id, 1);

            const collection = store.getCollection(collectionKey);

            expect(collection).toHaveLength(3);
            expect(collection[0]).toEqual(post1);
            expect(collection[1]).toEqual(post3);
            expect(collection[2]).toEqual(post2);
        });

        it('should not add duplicate posts to a collection', () => {
            const post = {id: '1', title: 'Post 1'} as Post;
            const collectionKey = 'posts';

            store.addPost(post);
            store.addPostToCollection(collectionKey, post.id);
            store.addPostToCollection(collectionKey, post.id);

            const collection = store.getCollection(collectionKey);

            expect(collection).toHaveLength(1);
        });
    });

    describe('removePostFromCollection', () => {
        it('should remove a post from a collection', () => {
            const post = {id: '1', title: 'Post 1'} as Post;
            const collectionKey = 'posts';

            store.addPost(post);
            store.addPostToCollection(collectionKey, post.id);
            store.removePostFromCollection(collectionKey, post.id);

            const collection = store.getCollection(collectionKey);

            expect(collection).toHaveLength(0);
        });

        it('should handle removing a post from a non-existent collection', () => {
            expect(() => {
                store.removePostFromCollection('nonexistent', '1');
            }).not.toThrow();
        });
    });

    describe('updatePostById', () => {
        it('should update a post by ID', () => {
            const post = {id: '1', title: 'Post 1'} as Post;

            store.addPost(post);
            store.updatePostById(post.id, p => ({
                ...p,
                title: 'Updated Title'
            }));

            const updatedPost = store.getPostById(post.id);

            expect(updatedPost?.title).toBe('Updated Title');
        });

        it('should handle updating a non-existent post', () => {
            expect(() => {
                store.updatePostById('nonexistent', p => p);
            }).not.toThrow();
        });
    });

    describe('getCollection', () => {
        it('should return an empty array for a non-existent collection', () => {
            const collection = store.getCollection('nonexistent');

            expect(collection).toEqual([]);
        });

        it('should return only posts that exist in the store', () => {
            const post = {id: '1', title: 'Post 1'} as Post;
            const collectionKey = 'posts';

            store.addPost(post);
            store.addPostToCollection(collectionKey, post.id);
            store.addPostToCollection(collectionKey, 'nonexistent');

            const collection = store.getCollection(collectionKey);

            expect(collection).toHaveLength(1);
            expect(collection[0]).toEqual(post);
        });
    });

    describe('getPositionInCollection', () => {
        it('should return the position of a post in a collection', () => {
            const post1 = {id: '1', title: 'Post 1'} as Post;
            const post2 = {id: '2', title: 'Post 2'} as Post;
            const collectionKey = 'posts';

            store.addPost(post1);
            store.addPost(post2);

            store.addPostToCollection(collectionKey, post1.id);
            store.addPostToCollection(collectionKey, post2.id);

            const position = store.getPositionInCollection(collectionKey, post2.id);

            expect(position).toBe(1);
        });

        it('should return -1 for a post not in the collection', () => {
            const position = store.getPositionInCollection('nonexistent', 'nonexistent');

            expect(position).toBe(-1);
        });
    });

    describe('getPostById', () => {
        it('should return a post by ID', () => {
            const post = {id: '1', title: 'Post 1'} as Post;

            store.addPost(post);

            const retrievedPost = store.getPostById(post.id);

            expect(retrievedPost).toEqual(post);
        });

        it('should return undefined for a non-existent post', () => {
            const post = store.getPostById('nonexistent');

            expect(post).toBeUndefined();
        });
    });
});
