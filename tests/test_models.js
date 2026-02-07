/**
 * Unit tests for models.js — PostmanRequest, Collection, Folder, InheritanceManager
 * PRIORITY 1
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { PostmanRequest, Collection, Folder, InheritanceManager } = require('../models');

// ─── PostmanRequest ────────────────────────────────────────────────────────────

describe('PostmanRequest', () => {
    it('constructor sets defaults', () => {
        const req = new PostmanRequest();
        assert.equal(req.name, 'New Request');
        assert.equal(req.method, 'GET');
        assert.equal(req.url, '');
        assert.equal(req.body, '');
        assert.equal(req.description, '');
        assert.ok(req.uuid, 'should have a uuid');
        assert.deepEqual(req.events, { prerequest: '', test: '' });
    });

    it('constructor accepts all parameters', () => {
        const req = new PostmanRequest('Login', 'POST', '/auth', { 'Content-Type': 'application/json' }, '{"u":"a"}', 'Login request', { prerequest: 'x', test: 'y' });
        assert.equal(req.name, 'Login');
        assert.equal(req.method, 'POST');
        assert.equal(req.url, '/auth');
        assert.equal(req.body, '{"u":"a"}');
        assert.equal(req.description, 'Login request');
    });

    it('generateUUID produces unique values', () => {
        const r1 = new PostmanRequest();
        const r2 = new PostmanRequest();
        assert.notEqual(r1.uuid, r2.uuid);
    });

    it('generateUUID matches UUID v4 pattern', () => {
        const req = new PostmanRequest();
        assert.match(req.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('toJSON/fromJSON roundtrip preserves data', () => {
        const original = new PostmanRequest('Test', 'PUT', '/api', { key: 'val' }, 'body', 'desc', { prerequest: 'pre', test: 'tst' });
        const json = original.toJSON();
        const restored = PostmanRequest.fromJSON(json);
        assert.equal(restored.name, original.name);
        assert.equal(restored.method, original.method);
        assert.equal(restored.url, original.url);
        assert.equal(restored.body, original.body);
        assert.equal(restored.description, original.description);
        assert.equal(restored.uuid, original.uuid);
    });

    it('toPostmanJSON returns Postman v2.1 item format', () => {
        const req = new PostmanRequest('Get Users', 'GET', '/users', {}, '', 'Fetch users');
        req.tests = 'pm.test("ok", function(){});';
        const item = req.toPostmanJSON();
        assert.equal(item.name, 'Get Users');
        assert.equal(item.request.method, 'GET');
        assert.equal(item.request.url.raw, '/users');
        assert.equal(item.request.description, 'Fetch users');
        assert.ok(item.event, 'should have events');
        assert.equal(item.event[0].listen, 'test');
        assert.ok(Array.isArray(item.event[0].script.exec));
    });

    it('toPostmanJSON includes body when present', () => {
        const req = new PostmanRequest('Create', 'POST', '/items', {}, '{"a":1}');
        const item = req.toPostmanJSON();
        assert.equal(item.request.body.mode, 'raw');
        assert.equal(item.request.body.raw, '{"a":1}');
    });

    it('toPostmanJSON converts object headers to Postman format', () => {
        const req = new PostmanRequest('H', 'GET', '/', { 'Authorization': 'Bearer abc' });
        const item = req.toPostmanJSON();
        assert.equal(item.request.header.length, 1);
        assert.equal(item.request.header[0].key, 'Authorization');
        assert.equal(item.request.header[0].value, 'Bearer abc');
    });
});

// ─── Collection ────────────────────────────────────────────────────────────────

describe('Collection', () => {
    it('constructor sets defaults', () => {
        const col = new Collection();
        assert.equal(col.name, 'New Collection');
        assert.deepEqual(col.requests, []);
        assert.deepEqual(col.folders, []);
        assert.ok(col.uuid);
    });

    it('addRequest and addFolder work', () => {
        const col = new Collection('Test');
        const req = new PostmanRequest('R1');
        const folder = new Folder('F1');
        col.addRequest(req);
        col.addFolder(folder);
        assert.equal(col.requests.length, 1);
        assert.equal(col.folders.length, 1);
    });

    it('toJSON/fromJSON roundtrip', () => {
        const col = new Collection('My API');
        col.addRequest(new PostmanRequest('Get', 'GET', '/get'));
        col.addFolder(new Folder('Auth'));
        const json = col.toJSON();
        const restored = Collection.fromJSON(json);
        assert.equal(restored.name, 'My API');
        assert.equal(restored.requests.length, 1);
        assert.equal(restored.folders.length, 1);
        assert.equal(restored.requests[0].name, 'Get');
        assert.equal(restored.folders[0].name, 'Auth');
    });

    it('importFromJSON handles simple format', () => {
        const col = new Collection();
        const data = {
            name: 'Imported',
            requests: [{ name: 'R1', method: 'POST', url: '/r1' }],
            folders: [{ name: 'F1', requests: [] }]
        };
        col.importFromJSON(data);
        assert.equal(col.name, 'Imported');
        assert.equal(col.requests.length, 1);
        assert.equal(col.folders.length, 1);
    });

    it('importFromJSON handles string JSON', () => {
        const col = new Collection();
        const data = JSON.stringify({ name: 'FromString', requests: [], folders: [] });
        col.importFromJSON(data);
        assert.equal(col.name, 'FromString');
    });

    it('importFromJSON handles Postman v2.1 format', () => {
        const col = new Collection();
        const postmanData = {
            info: {
                name: 'Postman Collection',
                schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
            },
            item: [
                {
                    name: 'Get Users',
                    request: {
                        method: 'GET',
                        url: { raw: 'https://api.example.com/users' }
                    }
                },
                {
                    name: 'Auth',
                    item: [
                        {
                            name: 'Login',
                            request: {
                                method: 'POST',
                                url: { raw: 'https://api.example.com/auth/login' },
                                body: { mode: 'raw', raw: '{"user":"a"}' }
                            }
                        }
                    ]
                }
            ]
        };
        col.importFromJSON(postmanData);
        assert.equal(col.name, 'Postman Collection');
        assert.equal(col.requests.length, 1);
        assert.equal(col.requests[0].name, 'Get Users');
        assert.equal(col.requests[0].url, 'https://api.example.com/users');
        assert.equal(col.folders.length, 1);
        assert.equal(col.folders[0].name, 'Auth');
        assert.equal(col.folders[0].requests.length, 1);
        assert.equal(col.folders[0].requests[0].name, 'Login');
    });

    it('importFromJSON handles Postman v2.1 with test events', () => {
        const col = new Collection();
        const postmanData = {
            info: { name: 'WithTests' },
            item: [{
                name: 'TestReq',
                request: { method: 'GET', url: '/test' },
                event: [{
                    listen: 'test',
                    script: { exec: ['pm.test("ok", function(){});'] }
                }]
            }]
        };
        col.importFromJSON(postmanData);
        assert.equal(col.requests[0].tests, 'pm.test("ok", function(){});');
    });

    it('toPostmanJSON returns valid Postman v2.1 collection', () => {
        const col = new Collection('Export Test');
        col.addRequest(new PostmanRequest('Get', 'GET', '/items'));
        const folder = new Folder('Group');
        folder.addRequest(new PostmanRequest('Create', 'POST', '/items'));
        col.addFolder(folder);

        const postman = col.toPostmanJSON();
        assert.equal(postman.info.name, 'Export Test');
        assert.ok(postman.info.schema.includes('v2.1.0'));
        assert.equal(postman.item.length, 2);
        assert.equal(postman.item[0].name, 'Get');
        assert.equal(postman.item[0].request.method, 'GET');
        assert.equal(postman.item[1].name, 'Group');
        assert.ok(Array.isArray(postman.item[1].item));
        assert.equal(postman.item[1].item[0].name, 'Create');
    });

    it('round-trip: import v2.1 then export v2.1 preserves structure', () => {
        const original = {
            info: { name: 'RoundTrip', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
            item: [
                { name: 'Req1', request: { method: 'GET', url: { raw: '/api/items' } } },
                { name: 'Folder1', item: [
                    { name: 'SubReq', request: { method: 'POST', url: '/api/create' } }
                ]}
            ]
        };

        const col = new Collection();
        col.importFromJSON(original);
        const exported = col.toPostmanJSON();

        assert.equal(exported.info.name, 'RoundTrip');
        assert.equal(exported.item.length, 2);
        assert.equal(exported.item[0].name, 'Req1');
        assert.equal(exported.item[1].name, 'Folder1');
        assert.equal(exported.item[1].item.length, 1);
        assert.equal(exported.item[1].item[0].name, 'SubReq');
    });
});

// ─── Folder ────────────────────────────────────────────────────────────────────

describe('Folder', () => {
    it('constructor sets defaults', () => {
        const f = new Folder();
        assert.equal(f.name, 'New Folder');
        assert.deepEqual(f.requests, []);
        assert.deepEqual(f.folders, []);
        assert.ok(f.uuid);
    });

    it('addRequest and addFolder work', () => {
        const f = new Folder('Parent');
        f.addRequest(new PostmanRequest('R'));
        f.addFolder(new Folder('Child'));
        assert.equal(f.requests.length, 1);
        assert.equal(f.folders.length, 1);
    });

    it('nested serialization works', () => {
        const parent = new Folder('Parent');
        const child = new Folder('Child');
        child.addRequest(new PostmanRequest('Nested'));
        parent.addFolder(child);
        const json = parent.toJSON();
        const restored = Folder.fromJSON(json);
        assert.equal(restored.name, 'Parent');
        assert.equal(restored.folders[0].name, 'Child');
        assert.equal(restored.folders[0].requests[0].name, 'Nested');
    });
});

// ─── InheritanceManager ────────────────────────────────────────────────────────

describe('InheritanceManager', () => {
    it('constructor initializes empty arrays', () => {
        const mgr = new InheritanceManager();
        assert.deepEqual(mgr.globalHeaders, []);
        assert.deepEqual(mgr.baseEndpoints, []);
        assert.deepEqual(mgr.bodyTemplates, []);
        assert.deepEqual(mgr.testTemplates, []);
        assert.deepEqual(mgr.rules, []);
    });

    it('add methods work', () => {
        const mgr = new InheritanceManager();
        mgr.addGlobalHeader({ key: 'Auth', value: 'Bearer token' });
        mgr.addBaseEndpoint('https://api.test.com');
        mgr.addBodyTemplate({ name: 'JSON', content: '{}' });
        mgr.addTestTemplate({ name: 'Status', content: 'pm.test(...)' });
        assert.equal(mgr.globalHeaders.length, 1);
        assert.equal(mgr.baseEndpoints.length, 1);
        assert.equal(mgr.bodyTemplates.length, 1);
        assert.equal(mgr.testTemplates.length, 1);
    });

    it('getter methods return correct data', () => {
        const mgr = new InheritanceManager();
        mgr.addGlobalHeader({ key: 'X' });
        mgr.addBaseEndpoint('http://localhost');
        assert.equal(mgr.getGlobalHeaders().length, 1);
        assert.equal(mgr.getBaseEndpoints().length, 1);
        assert.equal(mgr.getBodyTemplates().length, 0);
        assert.equal(mgr.getTestTemplates().length, 0);
    });

    it('remove methods work', () => {
        const mgr = new InheritanceManager();
        mgr.addGlobalHeader({ key: 'A' });
        mgr.addGlobalHeader({ key: 'B' });
        mgr.addBaseEndpoint('http://one');
        mgr.addBaseEndpoint('http://two');
        mgr.addBodyTemplate({ name: 'T1' });
        mgr.addTestTemplate({ name: 'TT1' });

        mgr.removeGlobalHeader(0);
        assert.equal(mgr.globalHeaders.length, 1);
        assert.equal(mgr.globalHeaders[0].key, 'B');

        mgr.removeBaseEndpoint(0);
        assert.equal(mgr.baseEndpoints.length, 1);
        assert.equal(mgr.baseEndpoints[0], 'http://two');

        mgr.removeBodyTemplate(0);
        assert.equal(mgr.bodyTemplates.length, 0);

        mgr.removeTestTemplate(0);
        assert.equal(mgr.testTemplates.length, 0);
    });

    it('remove with invalid index does nothing', () => {
        const mgr = new InheritanceManager();
        mgr.addGlobalHeader({ key: 'X' });
        mgr.removeGlobalHeader(-1);
        mgr.removeGlobalHeader(5);
        assert.equal(mgr.globalHeaders.length, 1);
    });

    it('addRule stores rules', () => {
        const mgr = new InheritanceManager();
        mgr.addRule('request', 'collection', ['headers']);
        assert.equal(mgr.getRules().length, 1);
        assert.deepEqual(mgr.getRules()[0], { target: 'request', source: 'collection', properties: ['headers'] });
    });

    it('applyInheritance merges global headers', () => {
        const mgr = new InheritanceManager();
        mgr.addGlobalHeader({ key: 'Authorization', value: 'Bearer abc' });
        const req = { name: 'Test', headers: [{ key: 'Content-Type', value: 'json' }] };
        const result = mgr.applyInheritance(req);
        assert.equal(result.headers.length, 2);
        assert.equal(result.headers[0].key, 'Authorization');
        assert.equal(result.headers[1].key, 'Content-Type');
    });

    it('toJSON/fromJSON roundtrip', () => {
        const mgr = new InheritanceManager();
        mgr.addGlobalHeader({ key: 'X' });
        mgr.addBaseEndpoint('http://test.com');
        mgr.addRule('a', 'b', ['c']);
        const json = mgr.toJSON();
        const restored = InheritanceManager.fromJSON(json);
        assert.equal(restored.globalHeaders.length, 1);
        assert.equal(restored.baseEndpoints.length, 1);
        assert.equal(restored.rules.length, 1);
    });
});
