/**
 * Unit tests for AppState class in app.js
 * PRIORITY 3
 *
 * Extracts the real AppState class from app.js source code to test
 * actual implementation, not a re-created copy (#88).
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// We need a DOM to test AppState (it references document.getElementById)
const { JSDOM } = require('jsdom');

let AppState, Collection, Request, stripDangerousKeys, sanitizeAutoSaveData;

before(() => {
    // Set up minimal DOM and localStorage before extracting AppState
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="statusInfo"></div></body></html>`, {
        url: 'http://localhost'
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.localStorage = dom.window.localStorage;

    // Extract real classes from app.js
    const { extractAppClasses, extractAppState, extractAutoSaveSanitizers } = require('./helpers/app_class_extractor');
    const classes = extractAppClasses();
    Request = classes.Request;
    Collection = classes.Collection;

    // Extract the REAL AppState class from app.js (not a re-created copy)
    AppState = extractAppState();

    // Extract autosave sanitisation utilities (#118, #115)
    const sanitizers = extractAutoSaveSanitizers();
    stripDangerousKeys = sanitizers.stripDangerousKeys;
    sanitizeAutoSaveData = sanitizers.sanitizeAutoSaveData;
});

describe('AppState', () => {
    it('constructor sets defaults', () => {
        const state = new AppState();
        assert.equal(state.currentCollection, null);
        assert.equal(state.currentRequest, null);
        assert.equal(state.currentFolder, null);
        assert.equal(state.unsavedChanges, false);
        assert.ok(state.inheritanceManager);
    });

    it('setCurrentCollection sets collection without resetting unsaved', () => {
        const state = new AppState();
        state.unsavedChanges = true;
        const col = new Collection('Test');
        state.setCurrentCollection(col);
        assert.equal(state.currentCollection, col);
        // setCurrentCollection no longer resets unsavedChanges (#83)
        assert.equal(state.unsavedChanges, true);
    });

    it('setCurrentRequest sets request', () => {
        const state = new AppState();
        const req = new Request('R1');
        state.setCurrentRequest(req);
        assert.equal(state.currentRequest, req);
    });

    it('setCurrentFolder sets folder', () => {
        const state = new AppState();
        state.setCurrentFolder({ name: 'F1' });
        assert.equal(state.currentFolder.name, 'F1');
    });

    it('markAsChanged sets flag and updates status bar', () => {
        const state = new AppState();
        const col = new Collection('MyCol');
        col.addRequest(new Request('R'));
        state.setCurrentCollection(col);
        state.markAsChanged();
        assert.equal(state.unsavedChanges, true);
        const statusInfo = document.getElementById('statusInfo');
        assert.ok(statusInfo.textContent.includes('\u2022') || statusInfo.textContent.includes('MyCol'));
    });

    it('updateStatusBar shows "No collection loaded" when no collection', () => {
        const state = new AppState();
        state.updateStatusBar();
        const statusInfo = document.getElementById('statusInfo');
        assert.equal(statusInfo.textContent, 'No collection loaded');
    });

    it('updateStatusBar shows collection stats', () => {
        const state = new AppState();
        const col = new Collection('API');
        col.addRequest(new Request('R1'));
        col.addRequest(new Request('R2'));
        state.setCurrentCollection(col);
        state.updateStatusBar();
        const statusInfo = document.getElementById('statusInfo');
        assert.ok(statusInfo.textContent.includes('API'));
        assert.ok(statusInfo.textContent.includes('2 requests'));
        assert.ok(statusInfo.textContent.includes('0 folders'));
    });

    it('addCollection adds to collections array', () => {
        const state = new AppState();
        const col1 = new Collection('Col1');
        const col2 = new Collection('Col2');
        state.addCollection(col1);
        state.addCollection(col2);
        assert.equal(state.collections.length, 2);
        assert.equal(state.currentCollection, col1); // first added becomes current
    });

    it('removeCollection removes and switches current', () => {
        const state = new AppState();
        const col1 = new Collection('Col1');
        const col2 = new Collection('Col2');
        state.addCollection(col1);
        state.addCollection(col2);
        state.currentCollection = col1;
        state.removeCollection(col1);
        assert.equal(state.collections.length, 1);
        assert.equal(state.currentCollection, col2);
    });

    it('removeCollection sets null when last removed', () => {
        const state = new AppState();
        const col = new Collection('Only');
        state.addCollection(col);
        state.currentCollection = col;
        state.removeCollection(col);
        assert.equal(state.collections.length, 0);
        assert.equal(state.currentCollection, null);
    });

    it('setCurrentCollection auto-adds to collections', () => {
        const state = new AppState();
        const col = new Collection('Auto');
        state.setCurrentCollection(col);
        assert.equal(state.collections.length, 1);
        assert.ok(state.collections.includes(col));
    });

    it('setCurrentCollection does not duplicate', () => {
        const state = new AppState();
        const col = new Collection('NoDup');
        state.addCollection(col);
        state.setCurrentCollection(col);
        assert.equal(state.collections.length, 1);
    });

    it('inheritanceManager has all expected methods', () => {
        const state = new AppState();
        const mgr = state.inheritanceManager;
        assert.equal(typeof mgr.addGlobalHeader, 'function');
        assert.equal(typeof mgr.removeGlobalHeader, 'function');
        assert.equal(typeof mgr.addBaseEndpoint, 'function');
        assert.equal(typeof mgr.removeBaseEndpoint, 'function');
        assert.equal(typeof mgr.addBodyTemplate, 'function');
        assert.equal(typeof mgr.removeBodyTemplate, 'function');
        assert.equal(typeof mgr.addTestTemplate, 'function');
        assert.equal(typeof mgr.removeTestTemplate, 'function');
        assert.equal(typeof mgr.addRule, 'function');
    });
});

// Autosave sanitisation tests (#118, #115)
describe('stripDangerousKeys', () => {
    it('removes __proto__ keys', () => {
        const input = JSON.parse('{"a": 1, "__proto__": {"polluted": true}}');
        const result = stripDangerousKeys(input);
        assert.equal(result.a, 1);
        assert.equal(result.__proto__.polluted, undefined); // should be Object.prototype
        assert.ok(!result.hasOwnProperty('__proto__'));
    });

    it('removes constructor keys', () => {
        const result = stripDangerousKeys({ constructor: { bad: true }, ok: 42 });
        assert.equal(result.ok, 42);
        assert.ok(!result.hasOwnProperty('constructor') || typeof result.constructor === 'function');
    });

    it('removes prototype keys', () => {
        const result = stripDangerousKeys({ prototype: { x: 1 }, y: 2 });
        assert.equal(result.y, 2);
        assert.ok(!result.hasOwnProperty('prototype'));
    });

    it('recurses into nested objects', () => {
        const result = stripDangerousKeys({ a: { __proto__: { x: 1 }, b: 2 } });
        assert.equal(result.a.b, 2);
    });

    it('handles arrays', () => {
        const result = stripDangerousKeys([{ __proto__: { x: 1 }, a: 1 }, { b: 2 }]);
        assert.ok(Array.isArray(result));
        assert.equal(result[0].a, 1);
        assert.equal(result[1].b, 2);
    });

    it('returns primitives unchanged', () => {
        assert.equal(stripDangerousKeys('hello'), 'hello');
        assert.equal(stripDangerousKeys(42), 42);
        assert.equal(stripDangerousKeys(null), null);
        assert.equal(stripDangerousKeys(true), true);
    });

    it('respects max depth of 10', () => {
        // Build a deeply nested object (15 levels)
        let obj = { val: 'deep' };
        for (let i = 0; i < 15; i++) {
            obj = { child: obj, __proto__: { bad: true } };
        }
        const result = stripDangerousKeys(obj);
        // Should not throw; deep levels are returned as-is (not recursed)
        assert.ok(result);
    });
});

describe('sanitizeAutoSaveData', () => {
    it('returns null for non-object input', () => {
        assert.equal(sanitizeAutoSaveData(null), null);
        assert.equal(sanitizeAutoSaveData('string'), null);
        assert.equal(sanitizeAutoSaveData(42), null);
        assert.equal(sanitizeAutoSaveData([1, 2]), null);
    });

    it('returns sanitised copy for valid data', () => {
        const result = sanitizeAutoSaveData({ version: 2, collections: [] });
        assert.ok(result);
        assert.equal(result.version, 2);
        assert.deepEqual(result.collections, []);
    });

    it('strips aiApiKey from settings', () => {
        const result = sanitizeAutoSaveData({
            settings: { aiApiKey: 'sk-secret-key', darkMode: true }
        });
        assert.equal(result.settings.aiApiKey, undefined);
        assert.equal(result.settings.darkMode, true);
    });

    it('fixes invalid version to 1', () => {
        assert.equal(sanitizeAutoSaveData({ version: 'bad' }).version, 1);
        assert.equal(sanitizeAutoSaveData({ version: -5 }).version, 1);
    });

    it('filters non-object entries from collections array', () => {
        const result = sanitizeAutoSaveData({
            collections: [{ name: 'Valid' }, null, 'string', 42, [1, 2]]
        });
        assert.equal(result.collections.length, 1);
        assert.equal(result.collections[0].name, 'Valid');
    });

    it('resets collections to empty array if not an array', () => {
        const result = sanitizeAutoSaveData({ collections: 'not-array' });
        assert.deepEqual(result.collections, []);
    });

    it('removes collection (v1) if not a plain object', () => {
        const result = sanitizeAutoSaveData({ collection: [1, 2] });
        assert.equal(result.collection, undefined);
    });

    it('clamps activeCollectionIndex', () => {
        assert.equal(sanitizeAutoSaveData({ activeCollectionIndex: -3 }).activeCollectionIndex, 0);
        assert.equal(sanitizeAutoSaveData({ activeCollectionIndex: 'bad' }).activeCollectionIndex, 0);
        assert.equal(sanitizeAutoSaveData({ activeCollectionIndex: 5 }).activeCollectionIndex, 5);
    });

    it('removes settings if not a plain object', () => {
        assert.equal(sanitizeAutoSaveData({ settings: 'bad' }).settings, undefined);
        assert.equal(sanitizeAutoSaveData({ settings: [1] }).settings, undefined);
    });

    it('clamps sidebarWidth to reasonable bounds', () => {
        const r1 = sanitizeAutoSaveData({ settings: { sidebarWidth: 50 } });
        assert.equal(r1.settings.sidebarWidth, undefined);
        const r2 = sanitizeAutoSaveData({ settings: { sidebarWidth: 5000 } });
        assert.equal(r2.settings.sidebarWidth, undefined);
        const r3 = sanitizeAutoSaveData({ settings: { sidebarWidth: 300 } });
        assert.equal(r3.settings.sidebarWidth, 300);
    });

    it('resets environments to array if invalid', () => {
        const result = sanitizeAutoSaveData({ environments: 'bad' });
        assert.deepEqual(result.environments, []);
    });

    it('filters non-string expandedFolders', () => {
        const result = sanitizeAutoSaveData({ expandedFolders: ['a', 42, null, 'b'] });
        assert.deepEqual(result.expandedFolders, ['a', 'b']);
    });

    it('removes non-string currentRequestName', () => {
        assert.equal(sanitizeAutoSaveData({ currentRequestName: 42 }).currentRequestName, undefined);
        assert.equal(sanitizeAutoSaveData({ currentRequestName: 'valid' }).currentRequestName, 'valid');
    });

    it('removes non-string currentFolderName', () => {
        assert.equal(sanitizeAutoSaveData({ currentFolderName: {} }).currentFolderName, undefined);
        assert.equal(sanitizeAutoSaveData({ currentFolderName: 'folder1' }).currentFolderName, 'folder1');
    });

    it('removes analytics if not a plain object', () => {
        assert.equal(sanitizeAutoSaveData({ analytics: [1, 2] }).analytics, undefined);
        assert.ok(sanitizeAutoSaveData({ analytics: { total: 5 } }).analytics);
    });

    it('removes inheritance if not a plain object', () => {
        assert.equal(sanitizeAutoSaveData({ inheritance: 'bad' }).inheritance, undefined);
        assert.ok(sanitizeAutoSaveData({ inheritance: { rules: [] } }).inheritance);
    });

    it('strips __proto__ from nested autosave data', () => {
        const malicious = JSON.parse('{"settings": {"__proto__": {"isAdmin": true}, "darkMode": false}}');
        const result = sanitizeAutoSaveData(malicious);
        assert.equal(result.settings.darkMode, false);
        assert.equal(result.settings.isAdmin, undefined);
    });
});
