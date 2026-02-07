/**
 * Unit tests for app.js fallback classes — Request, Collection, Folder, InheritanceManager
 * PRIORITY 2
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { extractAppClasses } = require('./helpers/app_class_extractor');

let Request, Collection, Folder, InheritanceManager;

before(() => {
    const classes = extractAppClasses();
    Request = classes.Request;
    Collection = classes.Collection;
    Folder = classes.Folder;
    InheritanceManager = classes.InheritanceManager;
});

// ─── Request ───────────────────────────────────────────────────────────────────

describe('app.js Request', () => {
    it('constructor sets defaults', () => {
        const req = new Request();
        assert.equal(req.name, 'New Request');
        assert.equal(req.method, 'GET');
        assert.equal(req.url, '');
        assert.equal(req.body, '');
    });

    it('constructor accepts parameters', () => {
        const req = new Request('Login', 'POST', '/auth', { 'Authorization': 'x' }, '{"a":1}', 'desc', { prerequest: '', test: '' });
        assert.equal(req.name, 'Login');
        assert.equal(req.method, 'POST');
        assert.equal(req.url, '/auth');
    });
});

// ─── Collection ────────────────────────────────────────────────────────────────

describe('app.js Collection', () => {
    it('constructor sets defaults', () => {
        const col = new Collection();
        assert.equal(col.name, 'New Collection');
        assert.deepEqual(col.requests, []);
        assert.deepEqual(col.folders, []);
    });

    it('addRequest and addFolder work', () => {
        const col = new Collection('C');
        col.addRequest(new Request('R'));
        col.addFolder(new Folder('F'));
        assert.equal(col.requests.length, 1);
        assert.equal(col.folders.length, 1);
    });

    it('importFromJSON handles simple format', () => {
        const col = new Collection();
        col.importFromJSON({
            name: 'Simple',
            requests: [{ name: 'R1', method: 'GET', url: '/r1' }],
            folders: [{ name: 'F1', requests: [{ name: 'FR', method: 'POST', url: '/fr' }] }]
        });
        assert.equal(col.name, 'Simple');
        assert.equal(col.requests.length, 1);
        assert.equal(col.requests[0].name, 'R1');
        assert.equal(col.folders.length, 1);
        assert.equal(col.folders[0].requests[0].name, 'FR');
    });

    it('importFromJSON handles string JSON', () => {
        const col = new Collection();
        col.importFromJSON(JSON.stringify({ name: 'StringParsed', requests: [], folders: [] }));
        assert.equal(col.name, 'StringParsed');
    });

    it('importFromJSON handles Postman v2.1 format', () => {
        const col = new Collection();
        col.importFromJSON({
            info: { name: 'Postman v2.1' },
            item: [
                { name: 'GetItems', request: { method: 'GET', url: { raw: '/items' } } },
                { name: 'Group', item: [
                    { name: 'Sub', request: { method: 'POST', url: '/create' } }
                ]}
            ]
        });
        assert.equal(col.name, 'Postman v2.1');
        assert.equal(col.requests.length, 1);
        assert.equal(col.requests[0].name, 'GetItems');
        assert.equal(col.requests[0].url, '/items');
        assert.equal(col.folders.length, 1);
        assert.equal(col.folders[0].name, 'Group');
        assert.equal(col.folders[0].requests.length, 1);
    });

    it('importFromJSON handles nested folders in Postman v2.1', () => {
        const col = new Collection();
        col.importFromJSON({
            info: { name: 'NestedFolders' },
            item: [{
                name: 'TopFolder',
                item: [{
                    name: 'SubFolder',
                    item: [
                        { name: 'DeepReq', request: { method: 'GET', url: '/deep' } }
                    ]
                }]
            }]
        });
        assert.equal(col.folders.length, 1);
        assert.equal(col.folders[0].name, 'TopFolder');
        assert.equal(col.folders[0].folders.length, 1);
        assert.equal(col.folders[0].folders[0].name, 'SubFolder');
        assert.equal(col.folders[0].folders[0].requests[0].name, 'DeepReq');
    });

    it('importFromJSON throws on malformed JSON string', () => {
        const col = new Collection();
        assert.throws(() => col.importFromJSON('not valid json'), { name: 'SyntaxError' });
    });

    it('exportToJSON returns internal format', () => {
        const col = new Collection('Export');
        col.addRequest(new Request('R1', 'GET', '/r1'));
        const json = col.exportToJSON();
        assert.equal(json.name, 'Export');
        assert.ok(json.requests);
        assert.ok(json.folders);
        assert.equal(json.requests[0].name, 'R1');
    });

    it('toPostmanJSON returns Postman v2.1 format', () => {
        const col = new Collection('PostmanExport');
        col.addRequest(new Request('Req1', 'GET', '/api'));
        const f = new Folder('Grp');
        f.addRequest(new Request('SubReq', 'POST', '/api/sub'));
        col.addFolder(f);

        const postman = col.toPostmanJSON();
        assert.equal(postman.info.name, 'PostmanExport');
        assert.ok(postman.info.schema.includes('v2.1.0'));
        assert.equal(postman.item.length, 2);
        assert.equal(postman.item[0].name, 'Req1');
        assert.equal(postman.item[0].request.method, 'GET');
        assert.equal(postman.item[1].name, 'Grp');
        assert.ok(Array.isArray(postman.item[1].item));
    });

    it('toPostmanJSON includes test scripts', () => {
        const col = new Collection('WithTests');
        const req = new Request('T', 'GET', '/t');
        req.tests = 'pm.test("ok", function(){});';
        col.addRequest(req);

        const postman = col.toPostmanJSON();
        const item = postman.item[0];
        assert.ok(item.event);
        assert.equal(item.event[0].listen, 'test');
    });

    it('processPostmanItems handles empty/null', () => {
        const col = new Collection();
        col.processPostmanItems(null);
        col.processPostmanItems([]);
        assert.equal(col.requests.length, 0);
        assert.equal(col.folders.length, 0);
    });
});

// ─── Folder ────────────────────────────────────────────────────────────────────

describe('app.js Folder', () => {
    it('constructor and addRequest', () => {
        const f = new Folder('Test');
        assert.equal(f.name, 'Test');
        f.addRequest(new Request('R'));
        assert.equal(f.requests.length, 1);
    });
});

// ─── InheritanceManager ────────────────────────────────────────────────────────

describe('app.js InheritanceManager', () => {
    it('constructor initializes properly', () => {
        const mgr = new InheritanceManager();
        assert.deepEqual(mgr.getGlobalHeaders(), []);
        assert.deepEqual(mgr.getBaseEndpoints(), []);
        assert.deepEqual(mgr.getBodyTemplates(), []);
        assert.deepEqual(mgr.getTestTemplates(), []);
    });

    it('addGlobalHeader stores key-value pairs', () => {
        const mgr = new InheritanceManager();
        mgr.addGlobalHeader('Authorization', 'Bearer abc');
        const headers = mgr.getGlobalHeaders();
        assert.equal(headers.length, 1);
        assert.equal(headers[0].key, 'Authorization');
        assert.equal(headers[0].value, 'Bearer abc');
    });

    it('addBaseEndpoint stores endpoints', () => {
        const mgr = new InheritanceManager();
        mgr.addBaseEndpoint('https://api.example.com');
        assert.equal(mgr.getBaseEndpoints().length, 1);
    });

    it('addBodyTemplate and addTestTemplate work', () => {
        const mgr = new InheritanceManager();
        mgr.addBodyTemplate('JSON', '{}');
        mgr.addTestTemplate('Status', 'pm.test(...)');
        assert.equal(mgr.getBodyTemplates().length, 1);
        assert.equal(mgr.getTestTemplates().length, 1);
    });

    it('removeGlobalHeader removes by key', () => {
        const mgr = new InheritanceManager();
        mgr.addGlobalHeader('Auth', 'Bearer');
        mgr.addGlobalHeader('Content-Type', 'json');
        mgr.removeGlobalHeader('Auth');
        assert.equal(mgr.getGlobalHeaders().length, 1);
        assert.equal(mgr.getGlobalHeaders()[0].key, 'Content-Type');
    });

    it('removeBaseEndpoint removes by value', () => {
        const mgr = new InheritanceManager();
        mgr.addBaseEndpoint('http://one');
        mgr.addBaseEndpoint('http://two');
        mgr.removeBaseEndpoint('http://one');
        assert.equal(mgr.getBaseEndpoints().length, 1);
        assert.equal(mgr.getBaseEndpoints()[0], 'http://two');
    });

    it('removeBodyTemplate removes by name', () => {
        const mgr = new InheritanceManager();
        mgr.addBodyTemplate('T1', 'content1');
        mgr.addBodyTemplate('T2', 'content2');
        mgr.removeBodyTemplate('T1');
        assert.equal(mgr.getBodyTemplates().length, 1);
        assert.equal(mgr.getBodyTemplates()[0].name, 'T2');
    });

    it('removeTestTemplate removes by name', () => {
        const mgr = new InheritanceManager();
        mgr.addTestTemplate('TT1', 'script1');
        mgr.removeTestTemplate('TT1');
        assert.equal(mgr.getTestTemplates().length, 0);
    });

    it('addRule and getRules work', () => {
        const mgr = new InheritanceManager();
        mgr.addRule('request', 'collection', ['headers', 'url']);
        assert.equal(mgr.getRules().length, 1);
        assert.deepEqual(mgr.getRules()[0], { target: 'request', source: 'collection', properties: ['headers', 'url'] });
    });

    it('processRequest returns a copy', () => {
        const mgr = new InheritanceManager();
        const original = { name: 'Test', method: 'GET' };
        const processed = mgr.processRequest(original);
        assert.notEqual(processed, original);
        assert.equal(processed.name, 'Test');
    });

    it('toJSON/fromJSON roundtrip', () => {
        const mgr = new InheritanceManager();
        mgr.addGlobalHeader('X', 'Y');
        mgr.addBaseEndpoint('http://test');
        mgr.addBodyTemplate('B', 'body');
        mgr.addTestTemplate('T', 'test');
        mgr.addRule('a', 'b', ['c']);
        const json = mgr.toJSON();
        const restored = InheritanceManager.fromJSON(json);
        assert.equal(restored.getGlobalHeaders().length, 1);
        assert.equal(restored.getBaseEndpoints().length, 1);
        assert.equal(restored.getBodyTemplates().length, 1);
        assert.equal(restored.getTestTemplates().length, 1);
        assert.equal(restored.getRules().length, 1);
    });
});
