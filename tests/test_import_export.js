/**
 * Integration tests for import/export functionality
 * Tests both models.js and app.js Collection import/export paths
 * PRIORITY 2
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { PostmanRequest, Collection, Folder } = require('../models');
const { extractAppClasses } = require('./helpers/app_class_extractor');

let AppCollection, AppRequest, AppFolder;

before(() => {
    const classes = extractAppClasses();
    AppCollection = classes.Collection;
    AppRequest = classes.Request;
    AppFolder = classes.Folder;
});

// ─── Sample Data ───────────────────────────────────────────────────────────────

const simpleJSON = {
    name: 'Simple Collection',
    requests: [
        { name: 'Get Users', method: 'GET', url: '/users', headers: {}, body: '' },
        { name: 'Create User', method: 'POST', url: '/users', headers: {}, body: '{"name":"John"}' }
    ],
    folders: [
        {
            name: 'Auth',
            requests: [
                { name: 'Login', method: 'POST', url: '/auth/login', headers: {}, body: '{"user":"a"}' }
            ]
        }
    ]
};

const postmanV21JSON = {
    info: {
        name: 'Postman V2.1 Collection',
        description: 'Test collection',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: [
        {
            name: 'Get Users',
            request: {
                method: 'GET',
                header: [{ key: 'Accept', value: 'application/json', type: 'text' }],
                url: {
                    raw: 'https://api.example.com/users',
                    protocol: 'https',
                    host: ['api', 'example', 'com'],
                    path: ['users']
                }
            },
            response: []
        },
        {
            name: 'Create User',
            request: {
                method: 'POST',
                header: [{ key: 'Content-Type', value: 'application/json', type: 'text' }],
                url: { raw: 'https://api.example.com/users' },
                body: {
                    mode: 'raw',
                    raw: '{"name":"John","email":"john@test.com"}'
                }
            },
            event: [
                {
                    listen: 'test',
                    script: {
                        type: 'text/javascript',
                        exec: ['pm.test("Created", function() {', '    pm.response.to.have.status(201);', '});']
                    }
                }
            ]
        },
        {
            name: 'Authentication',
            item: [
                {
                    name: 'Login',
                    request: {
                        method: 'POST',
                        url: { raw: 'https://api.example.com/auth/login' },
                        body: { mode: 'raw', raw: '{"username":"admin"}' }
                    }
                },
                {
                    name: 'Token Refresh',
                    request: {
                        method: 'POST',
                        url: 'https://api.example.com/auth/refresh'
                    }
                }
            ]
        }
    ]
};

// ─── models.js Import Tests ────────────────────────────────────────────────────

describe('models.js Import', () => {
    it('imports simple JSON format', () => {
        const col = new Collection();
        col.importFromJSON(simpleJSON);
        assert.equal(col.name, 'Simple Collection');
        assert.equal(col.requests.length, 2);
        assert.equal(col.folders.length, 1);
    });

    it('imports Postman v2.1 format', () => {
        const col = new Collection();
        col.importFromJSON(postmanV21JSON);
        assert.equal(col.name, 'Postman V2.1 Collection');
        assert.equal(col.requests.length, 2);
        assert.equal(col.requests[0].name, 'Get Users');
        assert.equal(col.requests[0].url, 'https://api.example.com/users');
        assert.equal(col.requests[1].name, 'Create User');
        assert.equal(col.folders.length, 1);
        assert.equal(col.folders[0].name, 'Authentication');
        assert.equal(col.folders[0].requests.length, 2);
    });

    it('imports test scripts from Postman v2.1', () => {
        const col = new Collection();
        col.importFromJSON(postmanV21JSON);
        assert.ok(col.requests[1].tests, 'Create User should have tests');
        assert.ok(col.requests[1].tests.includes('pm.test'));
    });

    it('imports string JSON', () => {
        const col = new Collection();
        col.importFromJSON(JSON.stringify(simpleJSON));
        assert.equal(col.name, 'Simple Collection');
        assert.equal(col.requests.length, 2);
    });

    it('throws on malformed JSON string', () => {
        const col = new Collection();
        assert.throws(() => col.importFromJSON('{ broken json'));
    });
});

// ─── models.js Export Tests ────────────────────────────────────────────────────

describe('models.js Export', () => {
    it('toPostmanJSON produces valid v2.1 structure', () => {
        const col = new Collection('TestExport');
        col.addRequest(new PostmanRequest('Get', 'GET', '/items'));
        const f = new Folder('Group');
        f.addRequest(new PostmanRequest('Create', 'POST', '/items'));
        col.addFolder(f);

        const postman = col.toPostmanJSON();
        assert.equal(postman.info.name, 'TestExport');
        assert.ok(postman.info.schema.includes('v2.1.0'));
        assert.equal(postman.item.length, 2);
        // Root request
        assert.equal(postman.item[0].name, 'Get');
        assert.equal(postman.item[0].request.method, 'GET');
        // Folder
        assert.equal(postman.item[1].name, 'Group');
        assert.ok(Array.isArray(postman.item[1].item));
        assert.equal(postman.item[1].item[0].name, 'Create');
    });

    it('PostmanRequest.toPostmanJSON produces valid item', () => {
        const req = new PostmanRequest('Test', 'POST', '/api', { 'Auth': 'token' }, '{"a":1}', 'Description');
        req.tests = 'pm.test("ok", function(){});';
        const item = req.toPostmanJSON();

        assert.equal(item.name, 'Test');
        assert.equal(item.request.method, 'POST');
        assert.equal(item.request.url.raw, '/api');
        assert.ok(item.request.header.length > 0);
        assert.equal(item.request.body.raw, '{"a":1}');
        assert.equal(item.request.description, 'Description');
        assert.ok(item.event);
    });
});

// ─── Round-trip Tests ──────────────────────────────────────────────────────────

describe('Round-trip Import/Export', () => {
    it('models.js: import simple → export v2.1 → import v2.1 preserves data', () => {
        // Step 1: Import simple
        const col1 = new Collection();
        col1.importFromJSON(simpleJSON);

        // Step 2: Export to Postman v2.1
        const exported = col1.toPostmanJSON();
        assert.ok(exported.info.schema.includes('v2.1.0'));

        // Step 3: Import the exported v2.1
        const col2 = new Collection();
        col2.importFromJSON(exported);

        assert.equal(col2.name, col1.name);
        assert.equal(col2.requests.length, col1.requests.length);
        assert.equal(col2.folders.length, col1.folders.length);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Expanded Import Test Suite (Issue #10)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Auth Configuration Import ─────────────────────────────────────────────────

describe('Auth Configuration Import', () => {
    it('imports v2.1 item with bearer token auth without crashing', () => {
        const v21WithAuth = {
            info: { name: 'Auth Collection', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
            item: [{
                name: 'Authenticated Request',
                request: {
                    method: 'GET',
                    url: { raw: 'https://api.example.com/protected' },
                    header: [{ key: 'Accept', value: 'application/json' }],
                    auth: {
                        type: 'bearer',
                        bearer: [{ key: 'token', value: '{{authToken}}', type: 'string' }]
                    }
                }
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(v21WithAuth);
        assert.equal(col.requests.length, 1);
        assert.equal(col.requests[0].name, 'Authenticated Request');
        assert.equal(col.requests[0].method, 'GET');
        assert.equal(col.requests[0].url, 'https://api.example.com/protected');
    });

    it('imports v2.1 item with API key auth without crashing', () => {
        const data = {
            info: { name: 'API Key Auth' },
            item: [{
                name: 'API Key Request',
                request: {
                    method: 'GET',
                    url: { raw: 'https://api.example.com/data' },
                    header: [],
                    auth: {
                        type: 'apikey',
                        apikey: [
                            { key: 'key', value: 'X-API-Key', type: 'string' },
                            { key: 'value', value: '{{apiKey}}', type: 'string' },
                            { key: 'in', value: 'header', type: 'string' }
                        ]
                    }
                }
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests.length, 1);
        assert.equal(col.requests[0].name, 'API Key Request');
    });

    it('imports v2.1 item with basic auth without crashing', () => {
        const data = {
            info: { name: 'Basic Auth' },
            item: [{
                name: 'Basic Auth Request',
                request: {
                    method: 'POST',
                    url: { raw: 'https://api.example.com/login' },
                    header: [],
                    auth: {
                        type: 'basic',
                        basic: [
                            { key: 'username', value: 'admin', type: 'string' },
                            { key: 'password', value: 'secret', type: 'string' }
                        ]
                    }
                }
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests.length, 1);
        assert.equal(col.requests[0].method, 'POST');
    });

    it('imports collection-level auth without crashing', () => {
        const data = {
            info: { name: 'Collection Auth' },
            auth: {
                type: 'bearer',
                bearer: [{ key: 'token', value: '{{globalToken}}', type: 'string' }]
            },
            item: [{
                name: 'Inherits Auth',
                request: { method: 'GET', url: { raw: '/protected' }, header: [] }
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests.length, 1);
    });

    it('app.js: imports v2.1 item with auth without crashing', () => {
        const data = {
            info: { name: 'App Auth' },
            item: [{
                name: 'Auth Req',
                request: {
                    method: 'GET',
                    url: { raw: '/secure' },
                    header: [],
                    auth: { type: 'bearer', bearer: [{ key: 'token', value: 'abc', type: 'string' }] }
                }
            }]
        };
        const col = new AppCollection('test');
        col.importFromJSON(data);
        assert.equal(col.requests.length, 1);
        assert.equal(col.requests[0].name, 'Auth Req');
    });
});

// ─── Pre-request Script Import ─────────────────────────────────────────────────

describe('Pre-request Script Import', () => {
    it('imports test script but pre-request is currently not captured', () => {
        const data = {
            info: { name: 'Pre-req Collection' },
            item: [{
                name: 'Setup Request',
                request: { method: 'POST', url: { raw: 'https://api.example.com/setup' }, header: [] },
                event: [
                    { listen: 'prerequest', script: { exec: ['console.log("pre-request");'] } },
                    { listen: 'test', script: { exec: ['tests["ok"] = true;'] } }
                ]
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests.length, 1);
        // Test script IS imported
        assert.ok(col.requests[0].tests.includes('tests["ok"] = true;'));
        // Pre-request script is NOT imported (documents current behavior)
    });

    it('handles item with only pre-request script, no test script', () => {
        const data = {
            info: { name: 'Pre-req Only' },
            item: [{
                name: 'Pre-req Only',
                request: { method: 'GET', url: { raw: '/setup' }, header: [] },
                event: [
                    { listen: 'prerequest', script: { exec: ['pm.environment.set("token", "abc");'] } }
                ]
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests.length, 1);
        // No tests imported (only prerequest was present)
        assert.ok(!col.requests[0].tests || col.requests[0].tests === '');
    });

    it('handles empty event array', () => {
        const data = {
            info: { name: 'Empty Events' },
            item: [{
                name: 'No Events',
                request: { method: 'GET', url: { raw: '/x' }, header: [] },
                event: []
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests.length, 1);
    });

    it('handles event with empty exec array', () => {
        const data = {
            info: { name: 'Empty Exec' },
            item: [{
                name: 'Empty Script',
                request: { method: 'GET', url: { raw: '/x' }, header: [] },
                event: [{ listen: 'test', script: { exec: [] } }]
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests.length, 1);
        // Empty exec array joins to empty string
        assert.equal(col.requests[0].tests, '');
    });

    it('handles event with exec as single string', () => {
        const data = {
            info: { name: 'String Exec' },
            item: [{
                name: 'String Script',
                request: { method: 'GET', url: { raw: '/x' }, header: [] },
                event: [{ listen: 'test', script: { exec: 'tests["single"] = true;' } }]
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests[0].tests, 'tests["single"] = true;');
    });

    it('app.js: handles pre-request and test events', () => {
        const data = {
            info: { name: 'App Events' },
            item: [{
                name: 'Event Req',
                request: { method: 'POST', url: { raw: '/api' }, header: [] },
                event: [
                    { listen: 'prerequest', script: { exec: ['console.log("pre");'] } },
                    { listen: 'test', script: { exec: ['pm.test("ok", function(){});'] } }
                ]
            }]
        };
        const col = new AppCollection('test');
        col.importFromJSON(data);
        assert.ok(col.requests[0].tests.includes('pm.test'));
    });
});

// ─── Empty Collection Edge Cases ───────────────────────────────────────────────

describe('Empty Collection Edge Cases', () => {
    it('imports empty v2.1 collection (no items)', () => {
        const empty = { info: { name: 'Empty' }, item: [] };
        const col = new Collection('test');
        col.importFromJSON(empty);
        assert.equal(col.name, 'Empty');
        assert.equal(col.requests.length, 0);
        assert.equal(col.folders.length, 0);
    });

    it('imports simple format with empty requests array', () => {
        const col = new Collection('test');
        col.importFromJSON({ name: 'Empty Simple', requests: [], folders: [] });
        assert.equal(col.name, 'Empty Simple');
        assert.equal(col.requests.length, 0);
        assert.equal(col.folders.length, 0);
    });

    it('imports v2.1 with empty folder', () => {
        const data = {
            info: { name: 'With Empty Folder' },
            item: [{ name: 'Empty Folder', item: [] }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.folders.length, 1);
        assert.equal(col.folders[0].name, 'Empty Folder');
        assert.equal(col.folders[0].requests.length, 0);
    });

    it('imports collection with missing item field', () => {
        const col = new Collection('test');
        col.importFromJSON({ info: { name: 'No Items' } });
        assert.equal(col.name, 'No Items');
        assert.equal(col.requests.length, 0);
    });

    it('exports empty collection to valid v2.1 JSON', () => {
        const col = new Collection('Empty');
        const json = col.toPostmanJSON();
        assert.ok(json.info);
        assert.equal(json.info.name, 'Empty');
        assert.deepEqual(json.item, []);
    });

    it('app.js: imports empty v2.1 collection', () => {
        const col = new AppCollection('test');
        col.importFromJSON({ info: { name: 'Empty App' }, item: [] });
        assert.equal(col.name, 'Empty App');
        assert.equal(col.requests.length, 0);
        assert.equal(col.folders.length, 0);
    });

    it('app.js: imports simple format with empty arrays', () => {
        const col = new AppCollection('test');
        col.importFromJSON({ name: 'Empty', requests: [], folders: [] });
        assert.equal(col.requests.length, 0);
        assert.equal(col.folders.length, 0);
    });

    it('app.js: imports collection with missing item field', () => {
        const col = new AppCollection('test');
        col.importFromJSON({ info: { name: 'No Items App' } });
        assert.equal(col.name, 'No Items App');
        assert.equal(col.requests.length, 0);
    });
});

// ─── Duplicate Request Names ───────────────────────────────────────────────────

describe('Duplicate Request Names', () => {
    it('imports collection with duplicate request names (both kept)', () => {
        const data = {
            info: { name: 'Dupes' },
            item: [
                { name: 'Get Data', request: { method: 'GET', url: { raw: '/a' }, header: [] } },
                { name: 'Get Data', request: { method: 'POST', url: { raw: '/b' }, header: [] } }
            ]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests.length, 2);
        assert.equal(col.requests[0].name, 'Get Data');
        assert.equal(col.requests[1].name, 'Get Data');
        assert.equal(col.requests[0].method, 'GET');
        assert.equal(col.requests[1].method, 'POST');
    });

    it('exports collection with duplicate names preserves both', () => {
        const col = new Collection('Dupes');
        col.addRequest(new PostmanRequest('Same', 'GET', '/a'));
        col.addRequest(new PostmanRequest('Same', 'POST', '/b'));
        const json = col.toPostmanJSON();
        assert.equal(json.item.length, 2);
        assert.equal(json.item[0].name, 'Same');
        assert.equal(json.item[1].name, 'Same');
    });

    it('round-trip preserves duplicate names', () => {
        const col1 = new Collection('Dupes');
        col1.addRequest(new PostmanRequest('Same', 'GET', '/a'));
        col1.addRequest(new PostmanRequest('Same', 'POST', '/b'));
        const exported = col1.toPostmanJSON();
        const col2 = new Collection('test');
        col2.importFromJSON(exported);
        assert.equal(col2.requests.length, 2);
        assert.equal(col2.requests[0].url, '/a');
        assert.equal(col2.requests[1].url, '/b');
    });

    it('app.js: imports duplicate request names', () => {
        const data = {
            info: { name: 'App Dupes' },
            item: [
                { name: 'Dup', request: { method: 'GET', url: { raw: '/x' }, header: [] } },
                { name: 'Dup', request: { method: 'DELETE', url: { raw: '/y' }, header: [] } }
            ]
        };
        const col = new AppCollection('test');
        col.importFromJSON(data);
        assert.equal(col.requests.length, 2);
        assert.equal(col.requests[0].method, 'GET');
        assert.equal(col.requests[1].method, 'DELETE');
    });
});

// ─── Large Collection Stress Tests ─────────────────────────────────────────────

describe('Large Collection Performance', () => {
    it('imports collection with 200 requests', () => {
        const items = [];
        for (let i = 0; i < 200; i++) {
            items.push({
                name: `Request ${i}`,
                request: {
                    method: ['GET', 'POST', 'PUT', 'DELETE'][i % 4],
                    url: { raw: `https://api.example.com/endpoint/${i}` },
                    header: [{ key: 'X-Index', value: `${i}` }]
                }
            });
        }
        const data = { info: { name: 'Large Collection' }, item: items };
        const col = new Collection('test');
        const start = Date.now();
        col.importFromJSON(data);
        const elapsed = Date.now() - start;
        assert.equal(col.requests.length, 200);
        assert.ok(elapsed < 5000, `Import took ${elapsed}ms, expected < 5000ms`);
    });

    it('imports deeply nested folder structure (5 levels)', () => {
        let innermost = { name: 'Deep Request', request: { method: 'GET', url: { raw: '/deep' }, header: [] } };
        let current = { name: 'Level 4', item: [innermost] };
        for (let i = 3; i >= 0; i--) {
            current = { name: `Level ${i}`, item: [current] };
        }
        const data = { info: { name: 'Deep Nesting' }, item: [current] };
        const col = new Collection('test');
        col.importFromJSON(data);

        // Walk the folder tree to verify depth
        assert.equal(col.folders.length, 1);
        assert.equal(col.folders[0].name, 'Level 0');
        let folder = col.folders[0];
        for (let i = 1; i <= 3; i++) {
            assert.equal(folder.folders.length, 1, `Level ${i-1} should have 1 subfolder`);
            folder = folder.folders[0];
            assert.equal(folder.name, `Level ${i}`);
        }
        // Innermost folder has the request
        assert.equal(folder.folders.length, 1);
        const deepest = folder.folders[0];
        assert.equal(deepest.name, 'Level 4');
        assert.equal(deepest.requests.length, 1);
        assert.equal(deepest.requests[0].name, 'Deep Request');
    });

    it('round-trips 100 requests without data loss', () => {
        const col1 = new Collection('Big');
        for (let i = 0; i < 100; i++) {
            col1.addRequest(new PostmanRequest(
                `Req ${i}`, ['GET', 'POST', 'PUT', 'DELETE'][i % 4],
                `/api/${i}`, { 'X-Index': `${i}` },
                i % 2 === 0 ? `{"id":${i}}` : '', `Description ${i}`
            ));
        }
        const exported = col1.toPostmanJSON();
        const col2 = new Collection('test');
        col2.importFromJSON(exported);

        assert.equal(col2.requests.length, 100);
        for (let i = 0; i < 100; i++) {
            assert.equal(col2.requests[i].name, `Req ${i}`);
            assert.equal(col2.requests[i].url, `/api/${i}`);
            assert.equal(col2.requests[i].method, ['GET', 'POST', 'PUT', 'DELETE'][i % 4]);
        }
    });

    it('app.js: imports 200 requests', () => {
        const items = [];
        for (let i = 0; i < 200; i++) {
            items.push({
                name: `AppReq ${i}`,
                request: { method: 'GET', url: { raw: `/ep/${i}` }, header: [] }
            });
        }
        const col = new AppCollection('test');
        col.importFromJSON({ info: { name: 'Big App' }, item: items });
        assert.equal(col.requests.length, 200);
    });
});

// ─── Structurally Invalid Input ────────────────────────────────────────────────

describe('Structurally Invalid Input', () => {
    it('handles v2.1 item missing request field (treated as folder without subitems)', () => {
        const data = {
            info: { name: 'Bad Items' },
            item: [{ name: 'No Request Field' }]
        };
        const col = new Collection('test');
        // No .request and no .item → skipped by processPostmanItems
        col.importFromJSON(data);
        assert.equal(col.requests.length, 0);
        assert.equal(col.folders.length, 0);
    });

    it('handles v2.1 item with null request', () => {
        const data = { info: { name: 'Null' }, item: [{ name: 'Null Req', request: null }] };
        const col = new Collection('test');
        // request is null → falsy → skipped
        col.importFromJSON(data);
        assert.equal(col.requests.length, 0);
    });

    it('handles request with url as string instead of object', () => {
        const data = {
            info: { name: 'String URLs' },
            item: [{ name: 'Simple URL', request: { method: 'GET', url: 'https://example.com', header: [] } }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests.length, 1);
        assert.equal(col.requests[0].url, 'https://example.com');
    });

    it('handles request with missing method (defaults to GET)', () => {
        const data = {
            info: { name: 'No Method' },
            item: [{ name: 'Default Method', request: { url: { raw: '/api' }, header: [] } }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests[0].method, 'GET');
    });

    it('handles request with missing url (defaults to /)', () => {
        const data = {
            info: { name: 'No URL' },
            item: [{ name: 'Default URL', request: { method: 'GET', header: [] } }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests[0].url, '/');
    });

    it('handles request with missing name (defaults to Unnamed)', () => {
        const data = {
            info: { name: 'No Names' },
            item: [{ request: { method: 'GET', url: { raw: '/x' }, header: [] } }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests[0].name, 'Unnamed Request');
    });

    it('handles null input by throwing', () => {
        const col = new Collection('test');
        assert.throws(() => col.importFromJSON(null));
    });

    it('handles number input by throwing or ignoring', () => {
        const col = new Collection('test');
        // Number has no .info, no .name, no .requests → should not crash or should throw
        try {
            col.importFromJSON(42);
            // If it doesn't throw, collection should be unchanged
            assert.equal(col.requests.length, 0);
        } catch (e) {
            // Throwing is also acceptable behavior
            assert.ok(e);
        }
    });

    it('app.js: handles item missing request field', () => {
        const data = { info: { name: 'Bad' }, item: [{ name: 'Orphan' }] };
        const col = new AppCollection('test');
        col.importFromJSON(data);
        assert.equal(col.requests.length, 0);
        assert.equal(col.folders.length, 0);
    });

    it('app.js: handles url as plain string', () => {
        const data = {
            info: { name: 'Str URL' },
            item: [{ name: 'Str', request: { method: 'POST', url: 'https://example.com/api', header: [] } }]
        };
        const col = new AppCollection('test');
        col.importFromJSON(data);
        assert.equal(col.requests[0].url, 'https://example.com/api');
    });

    it('app.js: defaults missing method to GET', () => {
        const data = {
            info: { name: 'No Method' },
            item: [{ name: 'X', request: { url: { raw: '/y' }, header: [] } }]
        };
        const col = new AppCollection('test');
        col.importFromJSON(data);
        assert.equal(col.requests[0].method, 'GET');
    });
});

// ─── Header Format Edge Cases ──────────────────────────────────────────────────

describe('Header Format Edge Cases', () => {
    it('imports disabled headers from v2.1 (included, not filtered)', () => {
        const data = {
            info: { name: 'Headers' },
            item: [{
                name: 'With Disabled Header',
                request: {
                    method: 'GET', url: { raw: '/x' },
                    header: [
                        { key: 'Active', value: 'yes' },
                        { key: 'Disabled', value: 'no', disabled: true }
                    ]
                }
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        const headers = col.requests[0].headers;
        // Current behavior: disabled flag is ignored, both headers are imported
        assert.equal(headers['Active'], 'yes');
        assert.equal(headers['Disabled'], 'no');
    });

    it('imports headers with empty value', () => {
        const data = {
            info: { name: 'Empty Val Headers' },
            item: [{
                name: 'Req',
                request: {
                    method: 'GET', url: { raw: '/x' },
                    header: [{ key: 'X-Empty', value: '' }]
                }
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests[0].headers['X-Empty'], '');
    });

    it('imports headers with missing value (defaults to empty string)', () => {
        const data = {
            info: { name: 'No Val Headers' },
            item: [{
                name: 'Req',
                request: {
                    method: 'GET', url: { raw: '/x' },
                    header: [{ key: 'X-NoValue' }]
                }
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests[0].headers['X-NoValue'], '');
    });

    it('skips headers without key', () => {
        const data = {
            info: { name: 'No Key Headers' },
            item: [{
                name: 'Req',
                request: {
                    method: 'GET', url: { raw: '/x' },
                    header: [{ value: 'orphan' }, { key: 'Valid', value: 'yes' }]
                }
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(Object.keys(col.requests[0].headers).length, 1);
        assert.equal(col.requests[0].headers['Valid'], 'yes');
    });

    it('handles null header array', () => {
        const data = {
            info: { name: 'Null Headers' },
            item: [{
                name: 'Req',
                request: { method: 'GET', url: { raw: '/x' }, header: null }
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests.length, 1);
        // Headers should be an empty object
        assert.deepEqual(col.requests[0].headers, {});
    });

    it('handles missing header field entirely', () => {
        const data = {
            info: { name: 'No Headers Field' },
            item: [{
                name: 'Req',
                request: { method: 'GET', url: { raw: '/x' } }
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests.length, 1);
        assert.deepEqual(col.requests[0].headers, {});
    });

    it('exports headers as array of {key, value, type} objects', () => {
        const col = new Collection('Export Headers');
        col.addRequest(new PostmanRequest('Req', 'GET', '/api', { 'Content-Type': 'application/json', 'Accept': '*/*' }));
        const json = col.toPostmanJSON();
        const exportedHeaders = json.item[0].request.header;
        assert.ok(Array.isArray(exportedHeaders));
        assert.equal(exportedHeaders.length, 2);
        assert.ok(exportedHeaders.some(h => h.key === 'Content-Type'));
        assert.ok(exportedHeaders.some(h => h.key === 'Accept'));
    });

    it('round-trips headers without data loss', () => {
        const col1 = new Collection('Headers RT');
        col1.addRequest(new PostmanRequest('Req', 'GET', '/api', {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token123',
            'X-Custom': 'value'
        }));
        const exported = col1.toPostmanJSON();
        const col2 = new Collection('test');
        col2.importFromJSON(exported);
        assert.equal(col2.requests[0].headers['Content-Type'], 'application/json');
        assert.equal(col2.requests[0].headers['Authorization'], 'Bearer token123');
        assert.equal(col2.requests[0].headers['X-Custom'], 'value');
    });

    it('app.js: imports disabled headers', () => {
        const data = {
            info: { name: 'App Headers' },
            item: [{
                name: 'Req',
                request: {
                    method: 'GET', url: { raw: '/x' },
                    header: [
                        { key: 'Active', value: 'yes' },
                        { key: 'Off', value: 'no', disabled: true }
                    ]
                }
            }]
        };
        const col = new AppCollection('test');
        col.importFromJSON(data);
        assert.equal(col.requests[0].headers['Active'], 'yes');
        assert.equal(col.requests[0].headers['Off'], 'no');
    });
});

// ─── Body Format Edge Cases ────────────────────────────────────────────────────

describe('Body Format Edge Cases', () => {
    it('imports raw JSON body from v2.1', () => {
        const data = {
            info: { name: 'Bodies' },
            item: [{
                name: 'JSON Body',
                request: {
                    method: 'POST', url: { raw: '/api' }, header: [],
                    body: { mode: 'raw', raw: '{"key":"value"}' }
                }
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests[0].body, '{"key":"value"}');
    });

    it('imports body as plain string', () => {
        const data = {
            info: { name: 'String Body' },
            item: [{
                name: 'Str Body',
                request: {
                    method: 'POST', url: { raw: '/api' }, header: [],
                    body: 'plain text body'
                }
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests[0].body, 'plain text body');
    });

    it('imports body with mode but no raw (serializes body object)', () => {
        const data = {
            info: { name: 'No Raw' },
            item: [{
                name: 'Form Body',
                request: {
                    method: 'POST', url: { raw: '/api' }, header: [],
                    body: { mode: 'formdata', formdata: [{ key: 'name', value: 'John' }] }
                }
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        // No .raw → falls through to JSON.stringify of the body object
        assert.ok(col.requests[0].body.includes('formdata'));
    });

    it('handles null body', () => {
        const data = {
            info: { name: 'Null Body' },
            item: [{
                name: 'No Body',
                request: { method: 'GET', url: { raw: '/api' }, header: [], body: null }
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests[0].body, '');
    });

    it('handles missing body field', () => {
        const data = {
            info: { name: 'No Body Field' },
            item: [{
                name: 'No Body',
                request: { method: 'GET', url: { raw: '/api' }, header: [] }
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests[0].body, '');
    });

    it('round-trips body content', () => {
        const body = '{\n  "users": [\n    {"name": "Alice"},\n    {"name": "Bob"}\n  ]\n}';
        const col1 = new Collection('Body RT');
        col1.addRequest(new PostmanRequest('Post', 'POST', '/api', {}, body));
        const exported = col1.toPostmanJSON();
        const col2 = new Collection('test');
        col2.importFromJSON(exported);
        assert.equal(col2.requests[0].body, body);
    });
});

// ─── Mixed Content & Folder Ordering ───────────────────────────────────────────

describe('Mixed Content and Ordering', () => {
    it('preserves order of requests and folders from v2.1', () => {
        const data = {
            info: { name: 'Ordered' },
            item: [
                { name: 'First Req', request: { method: 'GET', url: { raw: '/1' }, header: [] } },
                { name: 'First Folder', item: [
                    { name: 'Nested Req', request: { method: 'POST', url: { raw: '/nested' }, header: [] } }
                ]},
                { name: 'Second Req', request: { method: 'PUT', url: { raw: '/2' }, header: [] } },
                { name: 'Second Folder', item: [] }
            ]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        // Requests and folders are separated (all requests first, then folders)
        assert.equal(col.requests.length, 2);
        assert.equal(col.requests[0].name, 'First Req');
        assert.equal(col.requests[1].name, 'Second Req');
        assert.equal(col.folders.length, 2);
        assert.equal(col.folders[0].name, 'First Folder');
        assert.equal(col.folders[1].name, 'Second Folder');
    });

    it('imports collection with only folders, no root requests', () => {
        const data = {
            info: { name: 'Folders Only' },
            item: [
                { name: 'F1', item: [{ name: 'R1', request: { method: 'GET', url: '/a' } }] },
                { name: 'F2', item: [{ name: 'R2', request: { method: 'POST', url: '/b' } }] }
            ]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.requests.length, 0);
        assert.equal(col.folders.length, 2);
        assert.equal(col.folders[0].requests.length, 1);
        assert.equal(col.folders[1].requests.length, 1);
    });

    it('imports folder with mixed requests and subfolders', () => {
        const data = {
            info: { name: 'Mixed Folder' },
            item: [{
                name: 'Parent',
                item: [
                    { name: 'Child Req', request: { method: 'GET', url: { raw: '/child' }, header: [] } },
                    { name: 'Child Folder', item: [
                        { name: 'Grandchild', request: { method: 'POST', url: { raw: '/gc' }, header: [] } }
                    ]}
                ]
            }]
        };
        const col = new Collection('test');
        col.importFromJSON(data);
        assert.equal(col.folders[0].name, 'Parent');
        assert.equal(col.folders[0].requests.length, 1);
        assert.equal(col.folders[0].folders.length, 1);
        assert.equal(col.folders[0].folders[0].requests[0].name, 'Grandchild');
    });
});
