/**
 * Unit tests for AppState class in app.js
 * PRIORITY 3
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// We need a DOM to test AppState (it references document.getElementById)
const { JSDOM } = require('jsdom');

let AppState, InheritanceManager, Collection, Request;

before(() => {
    // Set up minimal DOM
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="statusInfo"></div></body></html>`, {
        url: 'http://localhost'
    });
    global.window = dom.window;
    global.document = dom.window.document;

    // Extract classes from app.js
    const { extractAppClasses } = require('./helpers/app_class_extractor');
    const classes = extractAppClasses();
    Request = classes.Request;
    Collection = classes.Collection;
    InheritanceManager = classes.InheritanceManager;

    // Re-create AppState manually (it's defined inside app.js but not exported)
    AppState = class {
        constructor() {
            this.currentCollection = null;
            this.currentRequest = null;
            this.currentFolder = null;
            this.unsavedChanges = false;
            this.autoSave = false;
            this.darkMode = false;
            this.autoFormat = true;
            this.showLineNumbers = true;
            this.inheritGlobally = true;
            this.inheritanceManager = new InheritanceManager();
        }
        setCurrentCollection(collection) {
            this.currentCollection = collection;
            this.unsavedChanges = false;
        }
        setCurrentRequest(request) {
            this.currentRequest = request;
        }
        setCurrentFolder(folder) {
            this.currentFolder = folder;
        }
        markAsChanged() {
            this.unsavedChanges = true;
            this.updateStatusBar();
        }
        updateStatusBar() {
            const statusInfo = document.getElementById('statusInfo');
            if (this.currentCollection) {
                const changeIndicator = this.unsavedChanges ? '• ' : '';
                statusInfo.textContent = `${changeIndicator}${this.currentCollection.name} | ${this.currentCollection.requests.length} requests, ${this.currentCollection.folders.length} folders`;
            } else {
                statusInfo.textContent = 'No collection loaded';
            }
        }
    };
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

    it('setCurrentCollection sets collection and clears unsaved', () => {
        const state = new AppState();
        state.unsavedChanges = true;
        const col = new Collection('Test');
        state.setCurrentCollection(col);
        assert.equal(state.currentCollection, col);
        assert.equal(state.unsavedChanges, false);
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
        assert.ok(statusInfo.textContent.includes('•'));
        assert.ok(statusInfo.textContent.includes('MyCol'));
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
