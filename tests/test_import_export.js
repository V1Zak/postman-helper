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
        assert.equal(col2.requests[0].name, col1.requests[0].name);
    });

    it('models.js: import v2.1 → export v2.1 → import v2.1 preserves data', () => {
        const col1 = new Collection();
        col1.importFromJSON(postmanV21JSON);

        const exported = col1.toPostmanJSON();
        const col2 = new Collection();
        col2.importFromJSON(exported);

        assert.equal(col2.name, col1.name);
        assert.equal(col2.requests.length, col1.requests.length);
        assert.equal(col2.folders.length, col1.folders.length);
    });
});

// ─── app.js Import Tests ───────────────────────────────────────────────────────

describe('app.js Import', () => {
    it('imports simple JSON format', () => {
        const col = new AppCollection();
        col.importFromJSON(simpleJSON);
        assert.equal(col.name, 'Simple Collection');
        assert.equal(col.requests.length, 2);
        assert.equal(col.folders.length, 1);
    });

    it('imports Postman v2.1 format', () => {
        const col = new AppCollection();
        col.importFromJSON(postmanV21JSON);
        assert.equal(col.name, 'Postman V2.1 Collection');
        assert.equal(col.requests.length, 2);
        assert.equal(col.folders.length, 1);
        assert.equal(col.folders[0].name, 'Authentication');
    });

    it('imports nested folders from Postman v2.1', () => {
        const nestedData = {
            info: { name: 'Nested' },
            item: [{
                name: 'Top',
                item: [{
                    name: 'Sub',
                    item: [{ name: 'Req', request: { method: 'GET', url: '/deep' } }]
                }]
            }]
        };
        const col = new AppCollection();
        col.importFromJSON(nestedData);
        assert.equal(col.folders[0].folders[0].name, 'Sub');
        assert.equal(col.folders[0].folders[0].requests[0].name, 'Req');
    });
});

// ─── app.js Export Tests ───────────────────────────────────────────────────────

describe('app.js Export', () => {
    it('exportToJSON returns internal format', () => {
        const col = new AppCollection('Internal');
        col.addRequest(new AppRequest('R1', 'GET', '/r'));
        const json = col.exportToJSON();
        assert.equal(json.name, 'Internal');
        assert.ok(json.requests);
        assert.ok(!json.info, 'should not have Postman info block');
    });

    it('toPostmanJSON returns v2.1 format', () => {
        const col = new AppCollection('Postman');
        col.addRequest(new AppRequest('R1', 'GET', '/r'));
        const postman = col.toPostmanJSON();
        assert.ok(postman.info);
        assert.ok(postman.info.schema.includes('v2.1.0'));
        assert.equal(postman.item.length, 1);
    });

    it('toPostmanJSON includes headers and body', () => {
        const col = new AppCollection('WithDetails');
        const req = new AppRequest('Post', 'POST', '/api', { 'Content-Type': 'application/json' }, '{"data":true}');
        col.addRequest(req);
        const postman = col.toPostmanJSON();
        const item = postman.item[0];
        assert.ok(item.request.header.length > 0);
        assert.equal(item.request.body.raw, '{"data":true}');
    });
});

// ─── app.js Round-trip ─────────────────────────────────────────────────────────

describe('app.js Round-trip', () => {
    it('import v2.1 → toPostmanJSON → import v2.1', () => {
        const col1 = new AppCollection();
        col1.importFromJSON(postmanV21JSON);

        const exported = col1.toPostmanJSON();
        const col2 = new AppCollection();
        col2.importFromJSON(exported);

        assert.equal(col2.name, col1.name);
        assert.equal(col2.requests.length, col1.requests.length);
        assert.equal(col2.folders.length, col1.folders.length);
    });
});
