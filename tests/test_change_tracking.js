/**
 * Unit tests for per-request change tracking (Issue #9)
 * Tests: AppState dirty tracking, clean snapshots, dirty indicators
 *
 * Extracts the real AppState class from app.js source code to test
 * actual implementation, not a re-created copy (#88).
 */
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

let AppState, Request, Collection;

before(() => {
    // Set up minimal DOM and localStorage before extracting AppState
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
        <div id="statusInfo"></div>
        <div id="collectionTree"></div>
    </body></html>`, {
        url: 'http://localhost'
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.localStorage = dom.window.localStorage;

    // Extract real classes from app.js (not re-created copies)
    const { extractAppClasses, extractAppState } = require('./helpers/app_class_extractor');
    const classes = extractAppClasses();
    Request = classes.Request;
    Collection = classes.Collection;

    // Extract the REAL AppState class from app.js
    AppState = extractAppState();
});

describe('Change Tracking: Dirty State Basics', () => {
    it('fresh AppState has empty _dirtyRequests set', () => {
        const state = new AppState();
        assert.equal(state._dirtyRequests.size, 0);
    });

    it('fresh AppState has empty _cleanSnapshots map', () => {
        const state = new AppState();
        assert.equal(state._cleanSnapshots.size, 0);
    });

    it('markRequestDirty adds request to dirty set', () => {
        const state = new AppState();
        const col = new Collection('C');
        state.setCurrentCollection(col);
        state.markRequestDirty('uuid-123');
        assert.ok(state.isRequestDirty('uuid-123'));
    });

    it('markRequestDirty with null/undefined is a no-op', () => {
        const state = new AppState();
        state.markRequestDirty(null);
        state.markRequestDirty(undefined);
        assert.equal(state._dirtyRequests.size, 0);
    });

    it('markRequestClean removes request from dirty set', () => {
        const state = new AppState();
        const col = new Collection('C');
        state.setCurrentCollection(col);
        state.markRequestDirty('uuid-1');
        assert.ok(state.isRequestDirty('uuid-1'));
        state.markRequestClean('uuid-1');
        assert.ok(!state.isRequestDirty('uuid-1'));
    });

    it('markRequestClean with null/undefined is a no-op', () => {
        const state = new AppState();
        state.markRequestClean(null);
        state.markRequestClean(undefined);
        // Should not throw
    });

    it('isRequestDirty returns false for unknown request', () => {
        const state = new AppState();
        assert.ok(!state.isRequestDirty('nonexistent'));
    });

    it('markRequestDirty calls markAsChanged()', () => {
        const state = new AppState();
        const col = new Collection('C');
        state.setCurrentCollection(col);
        state.unsavedChanges = false;
        state.markRequestDirty('uuid-1');
        assert.ok(state.unsavedChanges);
    });

    it('multiple requests can be independently dirty', () => {
        const state = new AppState();
        const col = new Collection('C');
        state.setCurrentCollection(col);
        state.markRequestDirty('uuid-1');
        state.markRequestDirty('uuid-2');
        state.markRequestDirty('uuid-3');
        assert.equal(state._dirtyRequests.size, 3);
        state.markRequestClean('uuid-2');
        assert.ok(state.isRequestDirty('uuid-1'));
        assert.ok(!state.isRequestDirty('uuid-2'));
        assert.ok(state.isRequestDirty('uuid-3'));
    });

    it('clearAllDirty resets both sets', () => {
        const state = new AppState();
        const col = new Collection('C');
        state.setCurrentCollection(col);
        const req = new Request('R1', 'GET', '/api');
        state.markRequestDirty(req.uuid);
        state.takeCleanSnapshot(req);
        assert.equal(state._dirtyRequests.size, 1);
        assert.equal(state._cleanSnapshots.size, 1);
        state.clearAllDirty();
        assert.equal(state._dirtyRequests.size, 0);
        assert.equal(state._cleanSnapshots.size, 0);
    });
});

describe('Change Tracking: Clean Snapshots', () => {
    it('takeCleanSnapshot stores a snapshot keyed by uuid', () => {
        const state = new AppState();
        const req = new Request('R1', 'POST', '/api/users');
        req.body = '{"name":"test"}';
        req.description = 'Create user';
        state.takeCleanSnapshot(req);
        assert.ok(state._cleanSnapshots.has(req.uuid));
        const snap = state._cleanSnapshots.get(req.uuid);
        assert.equal(snap.method, 'POST');
        assert.equal(snap.url, '/api/users');
        assert.equal(snap.body, '{"name":"test"}');
        assert.equal(snap.description, 'Create user');
    });

    it('takeCleanSnapshot with null request is a no-op', () => {
        const state = new AppState();
        state.takeCleanSnapshot(null);
        assert.equal(state._cleanSnapshots.size, 0);
    });

    it('takeCleanSnapshot with request missing uuid is a no-op', () => {
        const state = new AppState();
        state.takeCleanSnapshot({ name: 'R1', method: 'GET' });
        assert.equal(state._cleanSnapshots.size, 0);
    });

    it('takeCleanSnapshot defaults method to GET', () => {
        const state = new AppState();
        const req = new Request('R1');
        state.takeCleanSnapshot(req);
        assert.equal(state._cleanSnapshots.get(req.uuid).method, 'GET');
    });

    it('takeCleanSnapshot defaults url, body, tests, description to empty string', () => {
        const state = new AppState();
        const req = new Request('R1');
        state.takeCleanSnapshot(req);
        const snap = state._cleanSnapshots.get(req.uuid);
        assert.equal(snap.url, '');
        assert.equal(snap.body, '');
        assert.equal(snap.tests, '');
        assert.equal(snap.description, '');
    });

    it('takeCleanSnapshot serializes headers as JSON string', () => {
        const state = new AppState();
        const req = new Request('R1', 'GET', '/api');
        req.headers = { 'Authorization': 'Bearer token' };
        state.takeCleanSnapshot(req);
        const snap = state._cleanSnapshots.get(req.uuid);
        assert.equal(snap.headers, JSON.stringify({ 'Authorization': 'Bearer token' }));
    });

    it('takeCleanSnapshot overwrites previous snapshot for same request', () => {
        const state = new AppState();
        const req = new Request('R1', 'GET', '/v1');
        state.takeCleanSnapshot(req);
        assert.equal(state._cleanSnapshots.get(req.uuid).url, '/v1');
        req.url = '/v2';
        state.takeCleanSnapshot(req);
        assert.equal(state._cleanSnapshots.get(req.uuid).url, '/v2');
        assert.equal(state._cleanSnapshots.size, 1);
    });
});

describe('Change Tracking: hasRequestChanged', () => {
    it('returns false for null request', () => {
        const state = new AppState();
        assert.ok(!state.hasRequestChanged(null));
    });

    it('returns false when no snapshot exists', () => {
        const state = new AppState();
        const req = new Request('R1', 'GET');
        assert.ok(!state.hasRequestChanged(req));
    });

    it('returns false when request matches snapshot exactly', () => {
        const state = new AppState();
        const req = new Request('R1', 'POST', '/api/users');
        req.body = '{"name":"test"}';
        req.tests = 'pm.test("ok")';
        req.description = 'desc';
        state.takeCleanSnapshot(req);
        assert.ok(!state.hasRequestChanged(req));
    });

    it('detects method change', () => {
        const state = new AppState();
        const req = new Request('R1', 'GET', '/api');
        state.takeCleanSnapshot(req);
        req.method = 'POST';
        assert.ok(state.hasRequestChanged(req));
    });

    it('detects url change', () => {
        const state = new AppState();
        const req = new Request('R1', 'GET', '/api/v1');
        state.takeCleanSnapshot(req);
        req.url = '/api/v2';
        assert.ok(state.hasRequestChanged(req));
    });

    it('detects body change', () => {
        const state = new AppState();
        const req = new Request('R1', 'POST', '/api');
        req.body = '{}';
        state.takeCleanSnapshot(req);
        req.body = '{"changed":true}';
        assert.ok(state.hasRequestChanged(req));
    });

    it('detects tests change', () => {
        const state = new AppState();
        const req = new Request('R1', 'GET', '/api');
        req.tests = '';
        state.takeCleanSnapshot(req);
        req.tests = 'pm.test("new")';
        assert.ok(state.hasRequestChanged(req));
    });

    it('detects description change', () => {
        const state = new AppState();
        const req = new Request('R1', 'GET', '/api');
        req.description = 'original';
        state.takeCleanSnapshot(req);
        req.description = 'modified';
        assert.ok(state.hasRequestChanged(req));
    });

    it('detects headers change', () => {
        const state = new AppState();
        const req = new Request('R1', 'GET', '/api');
        req.headers = { 'Content-Type': 'application/json' };
        state.takeCleanSnapshot(req);
        req.headers = { 'Content-Type': 'text/plain' };
        assert.ok(state.hasRequestChanged(req));
    });
});

describe('Change Tracking: Status Bar Integration', () => {
    it('status bar shows unsaved count when requests are dirty', () => {
        const state = new AppState();
        const col = new Collection('MyAPI');
        const req = new Request('R1');
        col.addRequest(req);
        state.setCurrentCollection(col);
        state.markRequestDirty(req.uuid);
        state.updateStatusBar();
        const statusText = document.getElementById('statusInfo').textContent;
        assert.ok(statusText.includes('1 unsaved'), `Expected "1 unsaved" in: "${statusText}"`);
    });

    it('status bar shows no unsaved label when no dirty requests', () => {
        const state = new AppState();
        const col = new Collection('MyAPI');
        col.addRequest(new Request('R1'));
        state.setCurrentCollection(col);
        state.updateStatusBar();
        const statusText = document.getElementById('statusInfo').textContent;
        assert.ok(!statusText.includes('unsaved'), `Expected no "unsaved" in: "${statusText}"`);
    });

    it('status bar updates count as requests become dirty/clean', () => {
        const state = new AppState();
        const col = new Collection('MyAPI');
        const req1 = new Request('R1');
        const req2 = new Request('R2');
        col.addRequest(req1);
        col.addRequest(req2);
        state.setCurrentCollection(col);

        state.markRequestDirty(req1.uuid);
        state.markRequestDirty(req2.uuid);
        state.updateStatusBar();
        let statusText = document.getElementById('statusInfo').textContent;
        assert.ok(statusText.includes('2 unsaved'), `Expected "2 unsaved" in: "${statusText}"`);

        state.markRequestClean(req1.uuid);
        state.updateStatusBar();
        statusText = document.getElementById('statusInfo').textContent;
        assert.ok(statusText.includes('1 unsaved'), `Expected "1 unsaved" in: "${statusText}"`);

        state.markRequestClean(req2.uuid);
        state.updateStatusBar();
        statusText = document.getElementById('statusInfo').textContent;
        assert.ok(!statusText.includes('unsaved'), `Expected no "unsaved" in: "${statusText}"`);
    });
});

describe('Change Tracking: Save Flow', () => {
    it('marking dirty then clean simulates save flow', () => {
        const state = new AppState();
        const col = new Collection('C');
        state.setCurrentCollection(col);
        const req = new Request('R1', 'POST', '/api');
        req.body = '{"orig": true}';

        // Load request: take snapshot
        state.takeCleanSnapshot(req);
        assert.ok(!state.hasRequestChanged(req));

        // User edits body
        req.body = '{"modified": true}';
        state.markRequestDirty(req.uuid);
        assert.ok(state.isRequestDirty(req.uuid));
        assert.ok(state.hasRequestChanged(req));

        // User saves: mark clean and take new snapshot
        state.markRequestClean(req.uuid);
        state.takeCleanSnapshot(req);
        assert.ok(!state.isRequestDirty(req.uuid));
        assert.ok(!state.hasRequestChanged(req));
    });

    it('export clears all dirty state', () => {
        const state = new AppState();
        const col = new Collection('C');
        state.setCurrentCollection(col);
        const req1 = new Request('R1');
        const req2 = new Request('R2');
        state.markRequestDirty(req1.uuid);
        state.markRequestDirty(req2.uuid);
        state.takeCleanSnapshot(req1);
        state.takeCleanSnapshot(req2);

        // Simulate export
        state.clearAllDirty();
        assert.equal(state._dirtyRequests.size, 0);
        assert.equal(state._cleanSnapshots.size, 0);
    });
});

describe('Change Tracking: Edge Cases', () => {
    it('marking same request dirty multiple times does not duplicate', () => {
        const state = new AppState();
        const col = new Collection('C');
        state.setCurrentCollection(col);
        state.markRequestDirty('uuid-same');
        state.markRequestDirty('uuid-same');
        state.markRequestDirty('uuid-same');
        assert.equal(state._dirtyRequests.size, 1);
    });

    it('cleaning a request that is not dirty is a no-op', () => {
        const state = new AppState();
        state.markRequestClean('nonexistent');
        assert.equal(state._dirtyRequests.size, 0);
    });

    it('hasRequestChanged handles request with minimal fields', () => {
        const state = new AppState();
        const req = new Request('R1');
        state.takeCleanSnapshot(req);
        assert.ok(!state.hasRequestChanged(req));

        // Add a field
        req.body = 'something';
        assert.ok(state.hasRequestChanged(req));
    });

    it('snapshot captures headers as empty object by default', () => {
        const state = new AppState();
        const req = new Request('R1');
        state.takeCleanSnapshot(req);
        const snap = state._cleanSnapshots.get(req.uuid);
        // Request headers default can be {} or []
        assert.equal(snap.headers, JSON.stringify(req.headers || {}));
    });

    it('dirty indicator count reflects only unique requests', () => {
        const state = new AppState();
        const col = new Collection('C');
        const req = new Request('R1');
        col.addRequest(req);
        state.setCurrentCollection(col);
        state.markRequestDirty(req.uuid);
        state.markRequestDirty(req.uuid);
        assert.equal(state._dirtyRequests.size, 1);
        state.updateStatusBar();
        const statusText = document.getElementById('statusInfo').textContent;
        assert.ok(statusText.includes('1 unsaved'));
    });

    it('two requests with same name have different UUIDs for dirty tracking', () => {
        const state = new AppState();
        const col = new Collection('C');
        state.setCurrentCollection(col);
        const req1 = new Request('Get Users', 'GET', '/api/users');
        const req2 = new Request('Get Users', 'GET', '/api/admin/users');
        assert.notEqual(req1.uuid, req2.uuid);

        state.markRequestDirty(req1.uuid);
        assert.ok(state.isRequestDirty(req1.uuid));
        assert.ok(!state.isRequestDirty(req2.uuid));

        state.takeCleanSnapshot(req1);
        state.takeCleanSnapshot(req2);
        assert.equal(state._cleanSnapshots.size, 2);
    });

    it('setCurrentCollection does not reset unsavedChanges', () => {
        const state = new AppState();
        const col1 = new Collection('C1');
        state.setCurrentCollection(col1);
        state.unsavedChanges = true;
        const col2 = new Collection('C2');
        state.setCurrentCollection(col2);
        assert.ok(state.unsavedChanges);
    });
});
