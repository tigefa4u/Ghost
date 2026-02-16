const assert = require('node:assert/strict');
const {assertExists} = require('../../../../utils/assertions');
const sinon = require('sinon');
const urlUtils = require('../../../../../core/shared/url-utils');

// Stuff we are testing
const storageUtils = require('../../../../../core/server/adapters/storage/utils');

describe('storage utils', function () {
    let urlForStub;
    let urlGetSubdirStub;

    beforeEach(function () {
        urlForStub = sinon.stub();
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('fn: getLocalImagesStoragePath', function () {
        it('should return local file storage path for absolute URL', function () {
            const url = 'http://myblog.com/content/images/2017/07/ghost-logo.png';
            let result;

            urlForStub = sinon.stub(urlUtils, 'urlFor');
            urlForStub.withArgs('home').returns('http://myblog.com/');
            urlGetSubdirStub = sinon.stub(urlUtils, 'getSubdir');
            urlGetSubdirStub.returns('');

            result = storageUtils.getLocalImagesStoragePath(url);
            assertExists(result);
            assert.equal(result, '/2017/07/ghost-logo.png');
        });

        it('should return local file storage path for absolute URL with subdirectory', function () {
            const url = 'http://myblog.com/blog/content/images/2017/07/ghost-logo.png';
            let result;

            urlForStub = sinon.stub(urlUtils, 'urlFor');
            urlForStub.withArgs('home').returns('http://myblog.com/');
            urlGetSubdirStub = sinon.stub(urlUtils, 'getSubdir');
            urlGetSubdirStub.returns('/blog');

            result = storageUtils.getLocalImagesStoragePath(url);
            assertExists(result);
            assert.equal(result, '/2017/07/ghost-logo.png');
        });

        it('should return local file storage path for relative URL', function () {
            const filePath = '/content/images/2017/07/ghost-logo.png';
            let result;

            urlForStub = sinon.stub(urlUtils, 'urlFor');
            urlForStub.withArgs('home').returns('http://myblog.com/');
            urlGetSubdirStub = sinon.stub(urlUtils, 'getSubdir');
            urlGetSubdirStub.returns('');

            result = storageUtils.getLocalImagesStoragePath(filePath);
            assertExists(result);
            assert.equal(result, '/2017/07/ghost-logo.png');
        });

        it('should return local file storage path for relative URL with subdirectory', function () {
            const filePath = '/blog/content/images/2017/07/ghost-logo.png';
            let result;

            urlForStub = sinon.stub(urlUtils, 'urlFor');
            urlForStub.withArgs('home').returns('http://myblog.com/');
            urlGetSubdirStub = sinon.stub(urlUtils, 'getSubdir');
            urlGetSubdirStub.returns('/blog');

            result = storageUtils.getLocalImagesStoragePath(filePath);
            assertExists(result);
            assert.equal(result, '/2017/07/ghost-logo.png');
        });

        it('should not sanitize URL if not local file storage', function () {
            const url = 'http://example-blog.com/ghost-logo.png';
            let result;

            urlForStub = sinon.stub(urlUtils, 'urlFor');
            urlForStub.withArgs('home').returns('http://myblog.com/');
            urlGetSubdirStub = sinon.stub(urlUtils, 'getSubdir');
            urlGetSubdirStub.returns('');

            result = storageUtils.getLocalImagesStoragePath(url);
            assertExists(result);
            assert.equal(result, 'http://example-blog.com/ghost-logo.png');
        });
    });

    describe('fn: isLocalImage', function () {
        it('should return true when absolute URL and local file', function () {
            const url = 'http://myblog.com/content/images/2017/07/ghost-logo.png';
            let result;

            urlForStub = sinon.stub(urlUtils, 'urlFor');
            urlForStub.withArgs('home').returns('http://myblog.com/');
            urlGetSubdirStub = sinon.stub(urlUtils, 'getSubdir');
            urlGetSubdirStub.returns('');

            result = storageUtils.isLocalImage(url);
            assertExists(result);
            assert.equal(result, true);
        });

        it('should return true when absolute URL with subdirectory and local file', function () {
            const url = 'http://myblog.com/blog/content/images/2017/07/ghost-logo.png';
            let result;

            urlForStub = sinon.stub(urlUtils, 'urlFor');
            urlForStub.withArgs('home').returns('http://myblog.com/');
            urlGetSubdirStub = sinon.stub(urlUtils, 'getSubdir');
            urlGetSubdirStub.returns('/blog');

            result = storageUtils.isLocalImage(url);
            assertExists(result);
            assert.equal(result, true);
        });

        it('should return true when relative URL and local file', function () {
            const url = '/content/images/2017/07/ghost-logo.png';
            let result;

            urlForStub = sinon.stub(urlUtils, 'urlFor');
            urlForStub.withArgs('home').returns('http://myblog.com/');
            urlGetSubdirStub = sinon.stub(urlUtils, 'getSubdir');
            urlGetSubdirStub.returns('');

            result = storageUtils.isLocalImage(url);
            assertExists(result);
            assert.equal(result, true);
        });

        it('should return true when relative URL and local file (blog subdir)', function () {
            const url = '/blog/content/images/2017/07/ghost-logo.png';
            let result;

            urlForStub = sinon.stub(urlUtils, 'urlFor');
            urlForStub.withArgs('home').returns('http://myblog.com/');
            urlGetSubdirStub = sinon.stub(urlUtils, 'getSubdir');
            urlGetSubdirStub.returns('/blog');

            result = storageUtils.isLocalImage(url);
            assertExists(result);
            assert.equal(result, true);
        });

        it('should return false when no local file', function () {
            const url = 'http://somewebsite.com/ghost-logo.png';
            let result;

            urlForStub = sinon.stub(urlUtils, 'urlFor');
            urlForStub.withArgs('home').returns('http://myblog.com/');
            urlGetSubdirStub = sinon.stub(urlUtils, 'getSubdir');
            urlGetSubdirStub.returns('');

            result = storageUtils.isLocalImage(url);
            assertExists(result);
            assert.equal(result, false);
        });
    });

    describe('fn: isCDNImage', function () {
        it('should return true when image URL matches configured image base URL', function () {
            const imagePath = 'https://cdn.example.com/c/site-uuid/content/images/2026/02/photo.jpg';
            const imageBaseUrl = 'https://cdn.example.com/c/site-uuid';
            const result = storageUtils.isCDNImage(imagePath, imageBaseUrl);
            assert.equal(result, true);
        });

        it('should return true when image base URL has trailing slash', function () {
            const imagePath = 'https://cdn.example.com/c/site-uuid/content/images/2026/02/photo.jpg';
            const imageBaseUrl = 'https://cdn.example.com/c/site-uuid/';
            const result = storageUtils.isCDNImage(imagePath, imageBaseUrl);
            assert.equal(result, true);
        });

        it('should return false when image URL does not match configured image base URL', function () {
            const imagePath = 'https://other.example.com/content/images/2026/02/photo.jpg';
            const imageBaseUrl = 'https://cdn.example.com/c/site-uuid';
            const result = storageUtils.isCDNImage(imagePath, imageBaseUrl);
            assert.equal(result, false);
        });

        it('should return false for relative image path', function () {
            const imagePath = '/content/images/2026/02/photo.jpg';
            const imageBaseUrl = 'https://cdn.example.com/c/site-uuid';
            const result = storageUtils.isCDNImage(imagePath, imageBaseUrl);
            assert.equal(result, false);
        });

        it('should return false when image base URL is missing', function () {
            const imagePath = 'https://cdn.example.com/c/site-uuid/content/images/2026/02/photo.jpg';
            const result = storageUtils.isCDNImage(imagePath, '');
            assert.equal(result, false);
        });

        it('should return false when image path is null', function () {
            const imagePath = null;
            const imageBaseUrl = 'https://cdn.example.com/c/site-uuid';
            const result = storageUtils.isCDNImage(imagePath, imageBaseUrl);
            assert.equal(result, false);
        });

        it('should return false when image path is undefined', function () {
            const imageBaseUrl = 'https://cdn.example.com/c/site-uuid';
            const result = storageUtils.isCDNImage(undefined, imageBaseUrl);
            assert.equal(result, false);
        });

        it('should return false when image path is an empty string', function () {
            const imagePath = '';
            const imageBaseUrl = 'https://cdn.example.com/c/site-uuid';
            const result = storageUtils.isCDNImage(imagePath, imageBaseUrl);
            assert.equal(result, false);
        });
    });
});
