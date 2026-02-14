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

let AppState, Collection, Request;

before(() => {
    // Set up minimal DOM and localStorage before extracting AppState
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="statusInfo"></div></body></html>`, {
        url: 'http://localhost'
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.localStorage = dom.window.localStorage;

    // Extract real classes from app.js
    const { extractAppClasses, extractAppState } = require('./helpers/app_class_extractor');
    const classes = extractAppClasses();
    Request = classes.Request;
    Collection = classes.Collection;

    // Extract the REAL AppState class from app.js (not a re-created copy)
    AppState = extractAppState();
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
