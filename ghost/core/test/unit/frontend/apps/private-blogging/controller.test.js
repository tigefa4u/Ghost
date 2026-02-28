const assert = require('node:assert/strict');
const {assertExists} = require('../../../../utils/assertions');
const sinon = require('sinon');
const path = require('path');
const fs = require('fs');
const configUtils = require('../../../../utils/config-utils');
const themeEngine = require('../../../../../core/frontend/services/theme-engine');
const privateController = require('../../../../../core/frontend/apps/private-blogging/lib/router');
const hbs = require('../../../../../core/frontend/services/theme-engine/engine');
const t = require('../../../../../core/frontend/helpers/t');
const input_password = require('../../../../../core/frontend/apps/private-blogging/lib/helpers/input_password');
const themeI18n = require('../../../../../core/frontend/services/theme-engine/i18n');
const themeI18next = require('../../../../../core/frontend/services/theme-engine/i18next');
const labs = require('../../../../../core/shared/labs');

describe('Private Controller', function () {
    let res;
    let req;
    let defaultPath;
    let hasTemplateStub;

    // Helper function to prevent unit tests
    // from failing via timeout when they
    // should just immediately fail
    function failTest(done) {
        return function (err) {
            done(err);
        };
    }

    beforeEach(function () {
        hasTemplateStub = sinon.stub().returns(false);
        hasTemplateStub.withArgs('index').returns(true);

        sinon.stub(themeEngine, 'getActive').returns({
            hasTemplate: hasTemplateStub
        });

        res = {
            locals: {version: ''},
            render: sinon.spy()
        };

        req = {
            route: {path: '/private/?r=/'},
            query: {r: ''},
            params: {}
        };

        defaultPath = path.join(configUtils.config.get('paths').appRoot, '/core/frontend/apps/private-blogging/lib/views/private.hbs');

        configUtils.set({
            theme: {
                permalinks: '/:slug/'
            }
        });
    });

    afterEach(async function () {
        sinon.restore();
        await configUtils.restore();
    });

    it('Should render default password page when theme has no password template', function (done) {
        res.render = function (view, context) {
            assert.equal(view, defaultPath);
            assertExists(context);
            done();
        };

        privateController.renderer(req, res, failTest(done));
    });

    it('Should render theme password page when it exists', function (done) {
        hasTemplateStub.withArgs('private').returns(true);

        res.render = function (view, context) {
            assert.equal(view, 'private');
            assertExists(context);
            done();
        };

        privateController.renderer(req, res, failTest(done));
    });

    it('Should render with error when error is passed in', function (done) {
        res.error = 'Test Error';

        res.render = function (view, context) {
            assert.equal(view, defaultPath);
            assert.deepEqual(context, {error: 'Test Error'});
            done();
        };

        privateController.renderer(req, res, failTest(done));
    });
});

describe('private.hbs template translation', function () {
    const privateViewPath = path.join(__dirname, '../../../../../core/frontend/apps/private-blogging/lib/views/private.hbs');
    let ogI18nBasePath;
    let ogI18nextBasePath;
    const themesPath = path.join(__dirname, '../../../../utils/fixtures/themes/');

    function renderPrivateTemplate(context) {
        const templateStr = fs.readFileSync(privateViewPath, 'utf8');
        const template = hbs.handlebars.compile(templateStr);
        return template(context);
    }

    const i18nImplementations = [
        {name: 'themeI18n (legacy)', useNewTranslation: false},
        {name: 'themeI18next (new)', useNewTranslation: true}
    ];

    i18nImplementations.forEach(({name, useNewTranslation}) => {
        describe(`with ${name}`, function () {
            before(function () {
                sinon.stub(labs, 'isSet').withArgs('themeTranslation').returns(useNewTranslation);

                hbs.registerHelper('t', t);
                hbs.registerHelper('input_password', input_password);
                hbs.registerHelper('asset', function () {
                    return new hbs.SafeString('/ghost.css');
                });
                hbs.registerHelper('img_url', function () {
                    return new hbs.SafeString('');
                });

                ogI18nBasePath = themeI18n.basePath;
                ogI18nextBasePath = themeI18next.basePath;
                themeI18n.basePath = themesPath;
                themeI18next.basePath = themesPath;
            });

            after(function () {
                sinon.restore();
                themeI18n.basePath = ogI18nBasePath;
                themeI18next.basePath = ogI18nextBasePath;
                themeI18n._strings = null;
                themeI18n._locale = themeI18n.defaultLocale?.() ?? 'en';
                themeI18n._activetheme = undefined;
                themeI18next._i18n = null;
                themeI18next._locale = 'en';
                themeI18next._activeTheme = null;
            });

            it('renders English strings when locale is en', function () {
                if (useNewTranslation) {
                    themeI18next.init({activeTheme: 'locale-theme', locale: 'en'});
                } else {
                    themeI18n.init({activeTheme: 'locale-theme', locale: 'en'});
                }
                const context = {
                    site: {title: 'Test', url: 'http://test.local', locale: 'en'}
                };
                const html = renderPrivateTemplate(context);
                assertExists(html);
                assert(html.includes('This site is private.'));
                assert(html.includes('placeholder="Password"'));
                assert(html.includes('Access site'));
            });

            it('renders German strings when locale is de', function () {
                if (useNewTranslation) {
                    themeI18next.init({activeTheme: 'locale-theme', locale: 'de'});
                } else {
                    themeI18n.init({activeTheme: 'locale-theme', locale: 'de'});
                }
                const context = {
                    site: {title: 'Test', url: 'http://test.local', locale: 'de'}
                };
                const html = renderPrivateTemplate(context);
                assertExists(html);
                assert(html.includes('Diese Seite ist privat.'));
                assert(html.includes('placeholder="Passwort"'));
                assert(html.includes('Seite aufrufen'));
            });

            it('falls back to English when locale is fr (no fr.json)', function () {
                if (useNewTranslation) {
                    themeI18next.init({activeTheme: 'locale-theme', locale: 'fr'});
                } else {
                    themeI18n.init({activeTheme: 'locale-theme', locale: 'fr'});
                }
                const context = {
                    site: {title: 'Test', url: 'http://test.local', locale: 'fr'}
                };
                const html = renderPrivateTemplate(context);
                assertExists(html);
                assert(html.includes('This site is private.'));
                assert(html.includes('placeholder="Password"'));
                assert(html.includes('Access site'));
            });
        });
    });
});
