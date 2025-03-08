import {create} from 'zustand';

import {type Post} from '../../api/activitypub'; // @TODO: Move this type to state/types?

interface PostStore {
    /**
     * A map of post IDs to posts
     */
    posts: Map<string, Post>;
    /**
     * A map of collection keys to sets of post IDs.
     */
    collections: Map<string, Set<string>>;
    /**
     * Add a post to the store
     */
    addPost: (post: Post) => void;
    /**
     * Add a post to a collection
     */
    addPostToCollection: (collectionKey: string, postId: string, placement?: 'start' | 'end' | number) => void;
    /**
     * Remove a post from a collection
     */
    removePostFromCollection: (collectionKey: string, postId: string) => void;
    /**
     * Update a post by ID
     */
    updatePostById: (postId: string, update: (post: Post) => Post) => void;
    /**
     * Get a collection by key
     */
    getCollection: (collectionKey: string) => Post[];
    /**
     * Get the position of a post in a collection
     */
    getPositionInCollection: (collectionKey: string, postId: string) => number;
    /**
     * Get a post by ID
     */
    getPostById: (postId: string) => Post | undefined;
}

export const usePostStore = create<PostStore>((set, get) => ({
    posts: new Map(),
    collections: new Map(),
    addPost: (post: Post) => set((state) => {
        const posts = new Map(state.posts);

        posts.set(post.id, post);

        return {
            posts
        };
    }),
    addPostToCollection: (collectionKey: string, postId: string, placement: 'start' | 'end' | number = 'end') => set((state) => {
        const existingCollection = state.collections.get(collectionKey) || new Set();

        let updatedCollection;

        if (placement === 'start') {
            updatedCollection = new Set([postId, ...existingCollection]);
        } else if (placement === 'end') {
            updatedCollection = new Set([...existingCollection, postId]);
        } else {
            const collectionArray = Array.from(existingCollection);

            collectionArray.splice(placement, 0, postId);

            updatedCollection = new Set(collectionArray);
        }

        return {
            collections: new Map(state.collections).set(collectionKey, updatedCollection)
        };
    }),
    removePostFromCollection: (collectionKey: string, postId: string) => set((state) => {
        const existingCollection = state.collections.get(collectionKey);

        if (!existingCollection) {
            return {
                collections: state.collections
            };
        }

        const updatedCollection = new Set(existingCollection);
        updatedCollection.delete(postId);

        const updatedCollections = new Map(state.collections);
        updatedCollections.set(collectionKey, updatedCollection);

        return {
            collections: updatedCollections
        };
    }),
    updatePostById: (postId: string, update: (post: Post) => Post) => set((state) => {
        const existingPost = state.posts.get(postId);

        if (!existingPost) {
            return {
                posts: state.posts
            };
        }

        const posts = new Map(state.posts);

        posts.set(postId, update(existingPost));

        return {
            posts
        };
    }),
    getCollection: (collectionKey: string) => {
        return Array.from(get().collections.get(collectionKey) || [])
            .map(id => get().posts.get(id))
            .filter((post): post is Post => post !== undefined);
    },
    getPositionInCollection: (collectionKey: string, postId: string) => {
        return Array.from(get().collections.get(collectionKey) || [])
            .indexOf(postId);
    },
    getPostById: (postId: string) => {
        return get().posts.get(postId);
    }
}));
