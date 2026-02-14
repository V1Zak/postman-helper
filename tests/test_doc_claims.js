/**
 * Documentation verification tests
 * Verify every method claimed in CLAUDE.md actually exists and works
 * PRIORITY 1
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { PostmanRequest, Collection, Folder, InheritanceManager } = require('../models');
const { extractAppClasses } = require('./helpers/app_class_extractor');

let AppRequest, AppCollection, AppFolder, AppInheritanceManager;

before(() => {
    const classes = extractAppClasses();
    AppRequest = classes.Request;
    AppCollection = classes.Collection;
    AppFolder = classes.Folder;
    AppInheritanceManager = classes.InheritanceManager;
});

// ─── models.js Claims ──────────────────────────────────────────────────────────

describe('CLAUDE.md: models.js PostmanRequest', () => {
    it('has toPostmanJSON() method', () => {
        assert.equal(typeof PostmanRequest.prototype.toPostmanJSON, 'function');
    });

    it('has toJSON() method', () => {
        assert.equal(typeof PostmanRequest.prototype.toJSON, 'function');
    });

    it('has static fromJSON() method', () => {
        assert.equal(typeof PostmanRequest.fromJSON, 'function');
    });

    it('has generateUUID() available (shared utility, #122)', () => {
        // generateUUID is now a shared module-level function, not an instance method
        const { generateUUID } = require('../models');
        assert.equal(typeof generateUUID, 'function');
        const uuid = generateUUID();
        assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
});

describe('CLAUDE.md: models.js Collection', () => {
    it('has importFromJSON() method', () => {
        assert.equal(typeof Collection.prototype.importFromJSON, 'function');
    });

    it('has toPostmanJSON() method', () => {
        assert.equal(typeof Collection.prototype.toPostmanJSON, 'function');
    });

    it('has addRequest() method', () => {
        assert.equal(typeof Collection.prototype.addRequest, 'function');
    });

    it('has addFolder() method', () => {
        assert.equal(typeof Collection.prototype.addFolder, 'function');
    });

    it('has processPostmanItems() method', () => {
        assert.equal(typeof Collection.prototype.processPostmanItems, 'function');
    });

    it('has createRequestFromPostmanItem() method', () => {
        assert.equal(typeof Collection.prototype.createRequestFromPostmanItem, 'function');
    });

    it('has createFolderFromPostmanItem() method', () => {
        assert.equal(typeof Collection.prototype.createFolderFromPostmanItem, 'function');
    });
});

describe('CLAUDE.md: models.js Folder', () => {
    it('has addRequest() method', () => {
        assert.equal(typeof Folder.prototype.addRequest, 'function');
    });

    it('has addFolder() method', () => {
        assert.equal(typeof Folder.prototype.addFolder, 'function');
    });
});

describe('CLAUDE.md: models.js InheritanceManager', () => {
    it('has addRule() method', () => {
        assert.equal(typeof InheritanceManager.prototype.addRule, 'function');
    });

    it('has applyInheritance() method', () => {
        assert.equal(typeof InheritanceManager.prototype.applyInheritance, 'function');
    });

    it('has removeGlobalHeader() method', () => {
        assert.equal(typeof InheritanceManager.prototype.removeGlobalHeader, 'function');
    });

    it('has removeBaseEndpoint() method', () => {
        assert.equal(typeof InheritanceManager.prototype.removeBaseEndpoint, 'function');
    });

    it('has removeBodyTemplate() method', () => {
        assert.equal(typeof InheritanceManager.prototype.removeBodyTemplate, 'function');
    });

    it('has removeTestTemplate() method', () => {
        assert.equal(typeof InheritanceManager.prototype.removeTestTemplate, 'function');
    });

    it('has toJSON/fromJSON', () => {
        assert.equal(typeof InheritanceManager.prototype.toJSON, 'function');
        assert.equal(typeof InheritanceManager.fromJSON, 'function');
    });
});

// ─── app.js Claims ─────────────────────────────────────────────────────────────

describe('CLAUDE.md: app.js Collection', () => {
    it('has importFromJSON() that handles v2.1', () => {
        const col = new AppCollection();
        col.importFromJSON({
            info: { name: 'Test' },
            item: [{ name: 'Req', request: { method: 'GET', url: '/r' } }]
        });
        assert.equal(col.name, 'Test');
        assert.equal(col.requests.length, 1);
    });

    it('has toPostmanJSON() method', () => {
        assert.equal(typeof AppCollection.prototype.toPostmanJSON, 'function');
    });

    it('has processPostmanItems() method', () => {
        assert.equal(typeof AppCollection.prototype.processPostmanItems, 'function');
    });

    it('has exportToJSON() method', () => {
        assert.equal(typeof AppCollection.prototype.exportToJSON, 'function');
    });
});

describe('CLAUDE.md: app.js InheritanceManager', () => {
    it('has addGlobalHeader(key, value)', () => {
        const mgr = new AppInheritanceManager();
        mgr.addGlobalHeader('Auth', 'Bearer');
        assert.equal(mgr.getGlobalHeaders()[0].key, 'Auth');
    });

    it('has removeGlobalHeader(key)', () => {
        const mgr = new AppInheritanceManager();
        mgr.addGlobalHeader('Auth', 'Bearer');
        mgr.removeGlobalHeader('Auth');
        assert.equal(mgr.getGlobalHeaders().length, 0);
    });

    it('has removeBaseEndpoint(endpoint)', () => {
        const mgr = new AppInheritanceManager();
        mgr.addBaseEndpoint('http://test');
        mgr.removeBaseEndpoint('http://test');
        assert.equal(mgr.getBaseEndpoints().length, 0);
    });

    it('has removeBodyTemplate(name)', () => {
        const mgr = new AppInheritanceManager();
        mgr.addBodyTemplate('T', 'c');
        mgr.removeBodyTemplate('T');
        assert.equal(mgr.getBodyTemplates().length, 0);
    });

    it('has removeTestTemplate(name)', () => {
        const mgr = new AppInheritanceManager();
        mgr.addTestTemplate('T', 'c');
        mgr.removeTestTemplate('T');
        assert.equal(mgr.getTestTemplates().length, 0);
    });

    it('has addRule(target, source, properties)', () => {
        const mgr = new AppInheritanceManager();
        mgr.addRule('req', 'col', ['headers']);
        assert.equal(mgr.getRules().length, 1);
    });

    it('has toJSON/fromJSON', () => {
        assert.equal(typeof AppInheritanceManager.prototype.toJSON, 'function');
        assert.equal(typeof AppInheritanceManager.fromJSON, 'function');
    });
});

// ─── Postman v2.1 Format Compliance ────────────────────────────────────────────

describe('Postman v2.1 Format Compliance', () => {
    it('exported collection has required info fields', () => {
        const col = new Collection('Compliance Test');
        const postman = col.toPostmanJSON();
        assert.ok(postman.info, 'must have info');
        assert.ok(postman.info.name, 'must have info.name');
        assert.ok(postman.info.schema, 'must have info.schema');
        assert.ok(postman.info.schema.includes('v2.1.0'), 'schema must reference v2.1.0');
        assert.ok(Array.isArray(postman.item), 'must have item array');
    });

    it('request items have required structure', () => {
        const col = new Collection('ItemTest');
        col.addRequest(new PostmanRequest('R', 'POST', '/api', {}, '{"a":1}'));
        const postman = col.toPostmanJSON();
        const item = postman.item[0];
        assert.ok(item.name, 'item must have name');
        assert.ok(item.request, 'item must have request');
        assert.ok(item.request.method, 'request must have method');
        assert.ok(item.request.url, 'request must have url');
    });

    it('folder items are nested correctly', () => {
        const col = new Collection('FolderTest');
        const f = new Folder('MyFolder');
        f.addRequest(new PostmanRequest('SubReq'));
        col.addFolder(f);
        const postman = col.toPostmanJSON();
        const folderItem = postman.item[0];
        assert.ok(folderItem.name, 'folder must have name');
        assert.ok(Array.isArray(folderItem.item), 'folder must have item array');
        assert.equal(folderItem.item[0].name, 'SubReq');
    });
});
