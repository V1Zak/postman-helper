/**
 * Unit tests for version history and diffs (Issue #7)
 * Tests: Request._history, takeSnapshot, restoreVersion, DiffUtil, persistence helpers
 */
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { extractAppClasses } = require('./helpers/app_class_extractor');

let Request, Collection, Folder, InheritanceManager, DiffUtil;

/**
 * Extract DiffUtil from app.js source.
 * It sits between "// DiffUtil" and "// AppState class"
 */
function extractDiffUtil() {
    const appPath = path.join(__dirname, '..', 'app.js');
    const src = fs.readFileSync(appPath, 'utf-8');
    const lines = src.split('\n');

    let blockStart = -1;
    let blockEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^\/\/ DiffUtil/) && blockStart === -1) {
            blockStart = i + 1;
        }
        if (blockStart > -1 && lines[i].match(/^\/\/ AppState class/)) {
            blockEnd = i;
            break;
        }
    }

    if (blockStart === -1 || blockEnd === -1) {
        throw new Error(`Could not find DiffUtil in app.js (start=${blockStart}, end=${blockEnd})`);
    }

    const blockCode = lines.slice(blockStart, blockEnd).join('\n');
    const code = `${blockCode}\nmodule.exports = { DiffUtil };`;

    const Module = require('module');
    const m = new Module();
    m._compile(code, 'diff_util_virtual.js');
    return m.exports.DiffUtil;
}

before(() => {
    const classes = extractAppClasses();
    Request = classes.Request;
    Collection = classes.Collection;
    Folder = classes.Folder;
    InheritanceManager = classes.InheritanceManager;
    DiffUtil = extractDiffUtil();
});

// ===================== Request History =====================

describe('Request: History Data Structure', () => {
    it('new Request has empty _history array', () => {
        const req = new Request('R1');
        assert.ok(Array.isArray(req._history));
        assert.equal(req._history.length, 0);
    });

    it('new Request has _maxHistoryDepth of 20', () => {
        const req = new Request('R1');
        assert.equal(req._maxHistoryDepth, 20);
    });

    it('getHistory returns the _history array', () => {
        const req = new Request('R1');
        assert.strictEqual(req.getHistory(), req._history);
    });
});

describe('Request: takeSnapshot', () => {
    it('stores a snapshot with all fields', () => {
        const req = new Request('R1', 'POST', '/api/users');
        req.body = '{"name":"test"}';
        req.tests = 'pm.test("ok")';
        req.description = 'Create user';
        req.headers = { 'Content-Type': 'application/json' };
        req.takeSnapshot();

        assert.equal(req._history.length, 1);
        const snap = req._history[0];
        assert.equal(snap.name, 'R1');
        assert.equal(snap.method, 'POST');
        assert.equal(snap.url, '/api/users');
        assert.equal(snap.body, '{"name":"test"}');
        assert.equal(snap.tests, 'pm.test("ok")');
        assert.equal(snap.description, 'Create user');
        assert.deepEqual(snap.headers, { 'Content-Type': 'application/json' });
        assert.ok(snap.timestamp);
    });

    it('newest snapshot is first (unshift)', () => {
        const req = new Request('R1', 'GET', '/v1');
        req.takeSnapshot(); // Captures /v1
        req.url = '/v2';
        req.takeSnapshot(); // Captures /v2

        assert.equal(req._history.length, 2);
        // Newest first: [0] = /v2, [1] = /v1
        assert.equal(req._history[0].url, '/v2');
        assert.equal(req._history[1].url, '/v1');
    });

    it('respects _maxHistoryDepth', () => {
        const req = new Request('R1', 'GET', '/api');
        req._maxHistoryDepth = 3;
        for (let i = 0; i < 5; i++) {
            req.url = `/api/v${i}`;
            req.takeSnapshot();
        }
        assert.equal(req._history.length, 3);
        // Oldest should be dropped
        assert.equal(req._history[0].url, '/api/v4');
        assert.equal(req._history[2].url, '/api/v2');
    });

    it('includes ISO timestamp', () => {
        const req = new Request('R1');
        req.takeSnapshot();
        const ts = req._history[0].timestamp;
        assert.ok(ts);
        assert.ok(!isNaN(Date.parse(ts)), 'timestamp should be parseable');
    });

    it('deep clones headers (no reference sharing)', () => {
        const req = new Request('R1');
        req.headers = { 'Auth': 'Bearer token' };
        req.takeSnapshot();
        req.headers['Auth'] = 'changed';
        assert.equal(req._history[0].headers['Auth'], 'Bearer token');
    });

    it('skips duplicate snapshot if nothing changed', () => {
        const req = new Request('R1', 'GET', '/api');
        req.body = 'test';
        req.takeSnapshot();
        req.takeSnapshot(); // Same state, should be skipped
        assert.equal(req._history.length, 1);
    });

    it('records snapshot when any field changes', () => {
        const req = new Request('R1', 'GET', '/api');
        req.takeSnapshot();
        req.body = 'changed';
        req.takeSnapshot();
        assert.equal(req._history.length, 2);
    });

    it('handles request with no tests property', () => {
        const req = new Request('R1');
        // tests is not set by default on the basic Request class
        req.takeSnapshot();
        assert.equal(req._history[0].tests, '');
    });
});

describe('Request: restoreVersion', () => {
    it('restores fields from a snapshot', () => {
        const req = new Request('R1', 'GET', '/v1');
        req.body = 'original body';
        req.tests = 'original tests';
        req.description = 'original desc';
        req.headers = { 'X-Old': 'yes' };
        req.takeSnapshot();

        // Modify the request
        req.method = 'POST';
        req.url = '/v2';
        req.body = 'new body';
        req.tests = 'new tests';
        req.description = 'new desc';
        req.headers = { 'X-New': 'yes' };

        const result = req.restoreVersion(0);
        assert.ok(result);
        assert.equal(req.method, 'GET');
        assert.equal(req.url, '/v1');
        assert.equal(req.body, 'original body');
        assert.equal(req.tests, 'original tests');
        assert.equal(req.description, 'original desc');
        assert.deepEqual(req.headers, { 'X-Old': 'yes' });
    });

    it('saves current state to history before restoring', () => {
        const req = new Request('R1', 'GET', '/v1');
        req.takeSnapshot(); // v1 snapshot

        req.url = '/v2';
        // Now restore v1 — the current state (/v2) should be saved first
        req.restoreVersion(0);

        // History should have: [0] = /v2 (saved before restore), [1] = /v1 (original)
        assert.ok(req._history.length >= 2);
        assert.equal(req._history[0].url, '/v2');
    });

    it('returns false for invalid index', () => {
        const req = new Request('R1');
        assert.equal(req.restoreVersion(0), false);
        assert.equal(req.restoreVersion(-1), false);
        assert.equal(req.restoreVersion(999), false);
    });

    it('does not modify name on restore', () => {
        const req = new Request('R1', 'GET', '/v1');
        req.takeSnapshot();
        req.name = 'R2';
        req.url = '/v2';
        req.restoreVersion(0);
        // Name should stay as 'R2' — restoreVersion does not change name
        assert.equal(req.name, 'R2');
    });

    it('deep clones headers on restore (no reference sharing)', () => {
        const req = new Request('R1');
        req.headers = { 'Auth': 'Bearer original' };
        req.takeSnapshot();
        req.headers = {};

        req.restoreVersion(0);
        assert.equal(req.headers['Auth'], 'Bearer original');

        // Modify the restored headers — should not affect snapshot
        req.headers['Auth'] = 'changed';
        assert.equal(req._history[1].headers['Auth'], 'Bearer original');
    });
});

// ===================== DiffUtil =====================

describe('DiffUtil.diffLines', () => {
    it('returns same for identical lines', () => {
        const result = DiffUtil.diffLines('hello\nworld', 'hello\nworld');
        assert.equal(result.length, 2);
        assert.equal(result[0].type, 'same');
        assert.equal(result[0].line, 'hello');
        assert.equal(result[1].type, 'same');
        assert.equal(result[1].line, 'world');
    });

    it('detects added lines', () => {
        const result = DiffUtil.diffLines('hello', 'hello\nworld');
        assert.equal(result.length, 2);
        assert.equal(result[0].type, 'same');
        assert.equal(result[1].type, 'added');
        assert.equal(result[1].line, 'world');
    });

    it('detects removed lines', () => {
        const result = DiffUtil.diffLines('hello\nworld', 'hello');
        assert.equal(result.length, 2);
        assert.equal(result[0].type, 'same');
        assert.equal(result[1].type, 'removed');
        assert.equal(result[1].line, 'world');
    });

    it('detects changed lines as removed + added', () => {
        const result = DiffUtil.diffLines('old line', 'new line');
        assert.equal(result.length, 2);
        assert.equal(result[0].type, 'removed');
        assert.equal(result[0].line, 'old line');
        assert.equal(result[1].type, 'added');
        assert.equal(result[1].line, 'new line');
    });

    it('handles empty strings', () => {
        const result = DiffUtil.diffLines('', '');
        assert.equal(result.length, 1);
        assert.equal(result[0].type, 'same');
        assert.equal(result[0].line, '');
    });

    it('handles null/undefined as empty', () => {
        const result = DiffUtil.diffLines(null, undefined);
        assert.equal(result.length, 1);
        assert.equal(result[0].type, 'same');
    });

    it('handles multi-line diff', () => {
        const old = 'line1\nline2\nline3';
        const _new = 'line1\nchanged\nline3\nline4';
        const result = DiffUtil.diffLines(old, _new);
        // line1: same, line2/changed: removed+added, line3: same, line4: added
        const types = result.map(r => r.type);
        assert.ok(types.includes('same'));
        assert.ok(types.includes('removed'));
        assert.ok(types.includes('added'));
    });
});

describe('DiffUtil.diffRequest', () => {
    it('returns all fields with changed flags', () => {
        const snapA = { method: 'GET', url: '/v1', headers: {}, body: '', tests: '', description: '' };
        const snapB = { method: 'GET', url: '/v1', headers: {}, body: '', tests: '', description: '' };
        const diff = DiffUtil.diffRequest(snapA, snapB);

        assert.ok('method' in diff);
        assert.ok('url' in diff);
        assert.ok('headers' in diff);
        assert.ok('body' in diff);
        assert.ok('tests' in diff);
        assert.ok('description' in diff);
    });

    it('detects no changes for identical snapshots', () => {
        const snap = { method: 'POST', url: '/api', headers: { 'Auth': 'yes' }, body: '{}', tests: 'test', description: 'desc' };
        const diff = DiffUtil.diffRequest(snap, { ...snap, headers: { ...snap.headers } });

        assert.equal(diff.method.changed, false);
        assert.equal(diff.url.changed, false);
        assert.equal(diff.headers.changed, false);
        assert.equal(diff.body.changed, false);
        assert.equal(diff.tests.changed, false);
        assert.equal(diff.description.changed, false);
    });

    it('detects method change', () => {
        const snapA = { method: 'GET', url: '', headers: {}, body: '', tests: '', description: '' };
        const snapB = { method: 'POST', url: '', headers: {}, body: '', tests: '', description: '' };
        const diff = DiffUtil.diffRequest(snapA, snapB);
        assert.equal(diff.method.changed, true);
        assert.equal(diff.method.old, 'GET');
        assert.equal(diff.method.new, 'POST');
    });

    it('detects URL change', () => {
        const snapA = { method: 'GET', url: '/v1', headers: {}, body: '', tests: '', description: '' };
        const snapB = { method: 'GET', url: '/v2', headers: {}, body: '', tests: '', description: '' };
        const diff = DiffUtil.diffRequest(snapA, snapB);
        assert.equal(diff.url.changed, true);
    });

    it('detects body change with line diff', () => {
        const snapA = { method: 'GET', url: '', headers: {}, body: 'old body', tests: '', description: '' };
        const snapB = { method: 'GET', url: '', headers: {}, body: 'new body', tests: '', description: '' };
        const diff = DiffUtil.diffRequest(snapA, snapB);
        assert.equal(diff.body.changed, true);
        assert.ok(Array.isArray(diff.body.diff));
        assert.ok(diff.body.diff.some(d => d.type === 'removed'));
        assert.ok(diff.body.diff.some(d => d.type === 'added'));
    });

    it('detects tests change', () => {
        const snapA = { method: 'GET', url: '', headers: {}, body: '', tests: 'old test', description: '' };
        const snapB = { method: 'GET', url: '', headers: {}, body: '', tests: 'new test', description: '' };
        const diff = DiffUtil.diffRequest(snapA, snapB);
        assert.equal(diff.tests.changed, true);
    });

    it('detects headers change', () => {
        const snapA = { method: 'GET', url: '', headers: { 'A': '1' }, body: '', tests: '', description: '' };
        const snapB = { method: 'GET', url: '', headers: { 'A': '2' }, body: '', tests: '', description: '' };
        const diff = DiffUtil.diffRequest(snapA, snapB);
        assert.equal(diff.headers.changed, true);
    });

    it('detects description change', () => {
        const snapA = { method: 'GET', url: '', headers: {}, body: '', tests: '', description: 'old' };
        const snapB = { method: 'GET', url: '', headers: {}, body: '', tests: '', description: 'new' };
        const diff = DiffUtil.diffRequest(snapA, snapB);
        assert.equal(diff.description.changed, true);
    });

    it('handles missing fields gracefully', () => {
        const diff = DiffUtil.diffRequest({}, {});
        assert.equal(diff.method.changed, false);
        assert.equal(diff.url.changed, false);
        assert.equal(diff.body.changed, false);
    });
});

// ===================== models.js PostmanRequest History =====================

describe('PostmanRequest (models.js): History', () => {
    let PostmanRequest;

    before(() => {
        const models = require('../models.js');
        PostmanRequest = models.PostmanRequest;
    });

    it('has _history array', () => {
        const req = new PostmanRequest('R1');
        assert.ok(Array.isArray(req._history));
        assert.equal(req._history.length, 0);
    });

    it('takeSnapshot works', () => {
        const req = new PostmanRequest('R1', 'POST', '/api');
        req.body = '{"test":true}';
        req.takeSnapshot();
        assert.equal(req._history.length, 1);
        assert.equal(req._history[0].method, 'POST');
        assert.equal(req._history[0].url, '/api');
    });

    it('restoreVersion works', () => {
        const req = new PostmanRequest('R1', 'GET', '/v1');
        req.takeSnapshot();
        req.url = '/v2';
        const result = req.restoreVersion(0);
        assert.ok(result);
        assert.equal(req.url, '/v1');
    });

    it('getHistory returns array', () => {
        const req = new PostmanRequest('R1');
        assert.ok(Array.isArray(req.getHistory()));
    });

    it('toJSON does not include _history', () => {
        const req = new PostmanRequest('R1', 'GET', '/api');
        req.takeSnapshot();
        const json = req.toJSON();
        assert.equal(json._history, undefined);
    });

    it('toPostmanJSON does not include _history', () => {
        const req = new PostmanRequest('R1', 'GET', '/api');
        req.takeSnapshot();
        const json = req.toPostmanJSON();
        assert.equal(json._history, undefined);
    });
});

// ===================== Full Save/Restore Workflow =====================

describe('Version History: Save Workflow', () => {
    it('simulates multiple saves building up history', () => {
        const req = new Request('R1', 'GET', '/api');
        req.body = 'v1';

        // First save
        req.takeSnapshot();
        req.body = 'v2';

        // Second save
        req.takeSnapshot();
        req.body = 'v3';

        // Third save
        req.takeSnapshot();
        req.body = 'v4';

        assert.equal(req._history.length, 3);
        assert.equal(req._history[0].body, 'v3');
        assert.equal(req._history[1].body, 'v2');
        assert.equal(req._history[2].body, 'v1');
    });

    it('restore then continue editing creates more history', () => {
        const req = new Request('R1', 'GET', '/v1');
        req.takeSnapshot(); // snapshot of v1
        req.url = '/v2';
        req.takeSnapshot(); // snapshot of v2
        req.url = '/v3';

        // Restore v1 (index 1)
        req.restoreVersion(1);
        assert.equal(req.url, '/v1');

        // Edit again
        req.url = '/v4';
        req.takeSnapshot();

        // History should have snapshots for v1, v2, v3, v4
        assert.ok(req._history.length >= 3);
    });
});

describe('Version History: Edge Cases', () => {
    it('works with empty headers object', () => {
        const req = new Request('R1');
        req.headers = {};
        req.takeSnapshot();
        assert.deepEqual(req._history[0].headers, {});
    });

    it('works with array headers', () => {
        const req = new Request('R1');
        req.headers = [{ key: 'Auth', value: 'token' }];
        req.takeSnapshot();
        assert.deepEqual(req._history[0].headers, [{ key: 'Auth', value: 'token' }]);
    });

    it('handles very long body text', () => {
        const req = new Request('R1');
        req.body = 'x'.repeat(100000);
        req.takeSnapshot();
        assert.equal(req._history[0].body.length, 100000);
    });

    it('handles special characters in fields', () => {
        const req = new Request('R1');
        req.url = 'https://api.example.com/path?q=hello%20world&foo=bar<>"';
        req.body = '{"emoji":"\\ud83d\\ude00"}';
        req.takeSnapshot();
        assert.equal(req._history[0].url, req.url);
        assert.equal(req._history[0].body, req.body);
    });
});
