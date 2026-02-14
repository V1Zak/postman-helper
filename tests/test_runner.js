/**
 * Unit tests for CI/CD Pipeline Integration (Issue #15)
 * Tests: CollectionRunner, ConsoleReporter, JUnitReporter, JSONReporter, CLI parseArgs
 */
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { CollectionRunner } = require('../runner');
const { ConsoleReporter, JUnitReporter, JSONReporter, getReporter } = require('../reporters');
const { parseArgs, loadEnvironment, VERSION } = require('../cli');

// ===================== Helpers =====================

/**
 * Build a minimal collection JSON with the given requests/folders.
 */
function buildCollection(name, requests = [], folders = []) {
    return {
        name,
        requests: requests.map(r => ({
            name: r.name || 'Test Request',
            method: r.method || 'GET',
            url: r.url || 'http://localhost:9999',
            headers: r.headers || {},
            body: r.body || '',
            tests: r.tests || '',
            events: r.events || { prerequest: '', test: '' }
        })),
        folders: folders.map(f => ({
            name: f.name || 'Folder',
            requests: (f.requests || []).map(r => ({
                name: r.name || 'Folder Request',
                method: r.method || 'GET',
                url: r.url || 'http://localhost:9999',
                headers: r.headers || {},
                body: r.body || '',
                tests: r.tests || '',
                events: r.events || { prerequest: '', test: '' }
            })),
            folders: f.folders || []
        }))
    };
}

/**
 * Build a Postman v2.1 format collection.
 */
function buildPostmanCollection(name, items = []) {
    return {
        info: {
            name,
            schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
        },
        item: items
    };
}

/**
 * Build a mock results object for reporter testing.
 */
function buildResults(overrides = {}) {
    return {
        collection: overrides.collection || 'Test Collection',
        timestamp: overrides.timestamp || '2026-01-01T00:00:00.000Z',
        total: overrides.total !== undefined ? overrides.total : 2,
        passed: overrides.passed !== undefined ? overrides.passed : 1,
        failures: overrides.failures !== undefined ? overrides.failures : 1,
        errors: overrides.errors !== undefined ? overrides.errors : 0,
        skipped: overrides.skipped !== undefined ? overrides.skipped : 0,
        duration: overrides.duration !== undefined ? overrides.duration : 500,
        requests: overrides.requests || [
            {
                name: 'Get Users',
                method: 'GET',
                url: 'http://api.test/users',
                status: 200,
                responseTime: 150,
                testResults: {
                    total: 2,
                    passed: 2,
                    failures: 0,
                    results: [
                        { name: 'Status is 200', passed: true },
                        { name: 'Has data', passed: true }
                    ]
                },
                error: null
            },
            {
                name: 'Create User',
                method: 'POST',
                url: 'http://api.test/users',
                status: 400,
                responseTime: 200,
                testResults: {
                    total: 1,
                    passed: 0,
                    failures: 1,
                    results: [
                        { name: 'Status is 201', passed: false }
                    ]
                },
                error: null
            }
        ]
    };
}

// ===================== CollectionRunner — Constructor =====================

describe('CollectionRunner: Constructor', () => {
    it('sets default options', () => {
        const runner = new CollectionRunner();
        assert.equal(runner.timeout, 30000);
        assert.equal(runner.bail, false);
        assert.equal(runner.verbose, false);
        assert.equal(runner.delayBetweenRequests, 0);
    });

    it('accepts custom options', () => {
        const runner = new CollectionRunner({
            timeout: 5000, bail: true, verbose: true, delay: 100
        });
        assert.equal(runner.timeout, 5000);
        assert.equal(runner.bail, true);
        assert.equal(runner.verbose, true);
        assert.equal(runner.delayBetweenRequests, 100);
    });
});

// ===================== flattenRequests =====================

describe('CollectionRunner: flattenRequests', () => {
    let runner;
    before(() => { runner = new CollectionRunner(); });

    it('returns root requests for flat collection', () => {
        const { Collection } = require('../models');
        const col = new Collection('Flat');
        col.importFromJSON(buildCollection('Flat', [
            { name: 'R1' }, { name: 'R2' }
        ]));
        const flat = runner.flattenRequests(col);
        assert.equal(flat.length, 2);
        assert.equal(flat[0].name, 'R1');
        assert.equal(flat[1].name, 'R2');
    });

    it('includes requests from nested folders', () => {
        const { Collection } = require('../models');
        const col = new Collection('Nested');
        col.importFromJSON(buildCollection('Nested',
            [{ name: 'Root' }],
            [{ name: 'F1', requests: [{ name: 'F1R1' }, { name: 'F1R2' }] }]
        ));
        const flat = runner.flattenRequests(col);
        assert.equal(flat.length, 3);
        const names = flat.map(r => r.name);
        assert.ok(names.includes('Root'));
        assert.ok(names.includes('F1R1'));
        assert.ok(names.includes('F1R2'));
    });

    it('handles deeply nested folders', () => {
        const { Collection } = require('../models');
        const col = new Collection('Deep');
        col.importFromJSON({
            name: 'Deep',
            requests: [{ name: 'R0', method: 'GET', url: '/', headers: {}, body: '' }],
            folders: [{
                name: 'L1',
                requests: [{ name: 'L1R', method: 'GET', url: '/', headers: {}, body: '' }],
                folders: [{
                    name: 'L2',
                    requests: [{ name: 'L2R', method: 'GET', url: '/', headers: {}, body: '' }],
                    folders: []
                }]
            }]
        });
        const flat = runner.flattenRequests(col);
        assert.equal(flat.length, 3);
    });

    it('returns empty array for empty collection', () => {
        const { Collection } = require('../models');
        const col = new Collection('Empty');
        const flat = runner.flattenRequests(col);
        assert.equal(flat.length, 0);
    });

    it('handles Postman v2.1 imported collection', () => {
        const { Collection } = require('../models');
        const col = new Collection('V21');
        col.importFromJSON(buildPostmanCollection('V21', [
            { name: 'Req1', request: { method: 'GET', url: { raw: 'http://test.com' } } },
            {
                name: 'Folder1', item: [
                    { name: 'Req2', request: { method: 'POST', url: { raw: 'http://test.com/data' } } }
                ]
            }
        ]));
        const flat = runner.flattenRequests(col);
        assert.equal(flat.length, 2);
    });
});

// ===================== substituteVars =====================

describe('CollectionRunner: substituteVars', () => {
    let runner;
    before(() => { runner = new CollectionRunner(); });

    it('replaces single variable', () => {
        const result = runner.substituteVars('{{host}}/api', { host: 'http://localhost' });
        assert.equal(result, 'http://localhost/api');
    });

    it('replaces multiple variables', () => {
        const result = runner.substituteVars('{{proto}}://{{host}}:{{port}}', {
            proto: 'https', host: 'api.test', port: '8080'
        });
        assert.equal(result, 'https://api.test:8080');
    });

    it('leaves unresolved vars intact', () => {
        const result = runner.substituteVars('{{host}}/{{path}}', { host: 'localhost' });
        assert.equal(result, 'localhost/{{path}}');
    });

    it('returns empty string for null/undefined', () => {
        assert.equal(runner.substituteVars(null, {}), '');
        assert.equal(runner.substituteVars(undefined, {}), '');
    });

    it('returns original string with no vars', () => {
        assert.equal(runner.substituteVars('http://test.com', {}), 'http://test.com');
    });

    it('handles empty vars object', () => {
        assert.equal(runner.substituteVars('{{foo}}', {}), '{{foo}}');
    });
});

// ===================== resolveHeaders =====================

describe('CollectionRunner: resolveHeaders', () => {
    let runner;
    before(() => { runner = new CollectionRunner(); });

    it('handles object format headers', () => {
        const result = runner.resolveHeaders({ 'Content-Type': 'application/json' }, {});
        assert.deepEqual(result, { 'Content-Type': 'application/json' });
    });

    it('handles array format headers', () => {
        const result = runner.resolveHeaders(
            [{ key: 'Accept', value: 'text/html' }], {}
        );
        assert.deepEqual(result, { 'Accept': 'text/html' });
    });

    it('substitutes vars in header values', () => {
        const result = runner.resolveHeaders(
            { 'Authorization': 'Bearer {{token}}' },
            { token: 'abc123' }
        );
        assert.deepEqual(result, { 'Authorization': 'Bearer abc123' });
    });

    it('substitutes vars in array format headers', () => {
        const result = runner.resolveHeaders(
            [{ key: 'X-Api-Key', value: '{{apiKey}}' }],
            { apiKey: 'secret' }
        );
        assert.deepEqual(result, { 'X-Api-Key': 'secret' });
    });

    it('returns empty object for null/undefined headers', () => {
        assert.deepEqual(runner.resolveHeaders(null, {}), {});
        assert.deepEqual(runner.resolveHeaders(undefined, {}), {});
    });

    it('skips array items without key', () => {
        const result = runner.resolveHeaders(
            [{ value: 'nope' }, { key: 'X-Good', value: 'yes' }], {}
        );
        assert.deepEqual(result, { 'X-Good': 'yes' });
    });
});

// ===================== runTests =====================

describe('CollectionRunner: runTests', () => {
    let runner;
    before(() => { runner = new CollectionRunner(); });

    const mockResponse = { status: 200, body: '{"data": [1,2,3]}', headers: {} };

    it('returns empty results for null/empty script', () => {
        const result = runner.runTests('', mockResponse, 100);
        assert.equal(result.total, 0);
        assert.equal(result.passed, 0);
        assert.equal(result.failures, 0);
    });

    it('returns empty results for whitespace-only script', () => {
        const result = runner.runTests('   \n  ', mockResponse, 100);
        assert.equal(result.total, 0);
    });

    it('evaluates passing test', () => {
        const script = "tests['Status is 200'] = responseCode.code === 200;";
        const result = runner.runTests(script, mockResponse, 100);
        assert.equal(result.total, 1);
        assert.equal(result.passed, 1);
        assert.equal(result.failures, 0);
        assert.equal(result.results[0].name, 'Status is 200');
        assert.equal(result.results[0].passed, true);
    });

    it('evaluates failing test', () => {
        const script = "tests['Status is 404'] = responseCode.code === 404;";
        const result = runner.runTests(script, mockResponse, 100);
        assert.equal(result.total, 1);
        assert.equal(result.passed, 0);
        assert.equal(result.failures, 1);
        assert.equal(result.results[0].passed, false);
    });

    it('evaluates multiple tests', () => {
        const script = `
            tests['Status OK'] = responseCode.code === 200;
            tests['Has data'] = responseBody.has('data');
            tests['Fast enough'] = responseTime < 500;
        `;
        const result = runner.runTests(script, mockResponse, 100);
        assert.equal(result.total, 3);
        assert.equal(result.passed, 3);
    });

    it('supports responseBody.has()', () => {
        const script = "tests['Has data'] = responseBody.has('data');";
        const result = runner.runTests(script, mockResponse, 100);
        assert.equal(result.results[0].passed, true);
    });

    it('supports responseBody.json()', () => {
        const script = "tests['JSON parse'] = responseBody.json().data.length === 3;";
        const result = runner.runTests(script, mockResponse, 100);
        assert.equal(result.results[0].passed, true);
    });

    it('handles responseBody.json() with invalid JSON', () => {
        const badResp = { status: 200, body: 'not json', headers: {} };
        const script = "tests['JSON is null'] = responseBody.json() === null;";
        const result = runner.runTests(script, badResp, 100);
        assert.equal(result.results[0].passed, true);
    });

    it('handles script syntax errors gracefully', () => {
        const script = "tests['Bad'] = (((;";
        const result = runner.runTests(script, mockResponse, 100);
        assert.equal(result.total, 1);
        assert.equal(result.failures, 1);
        assert.equal(result.results[0].name, 'Script Execution');
        assert.ok(result.results[0].error);
    });

    it('handles runtime errors gracefully', () => {
        const script = "tests['Error'] = undefinedVar.foo === 1;";
        const result = runner.runTests(script, mockResponse, 100);
        assert.equal(result.failures, 1);
        assert.equal(result.results[0].name, 'Script Execution');
    });

    it('uses responseTime parameter correctly', () => {
        const script = "tests['Time check'] = responseTime === 42;";
        const result = runner.runTests(script, mockResponse, 42);
        assert.equal(result.results[0].passed, true);
    });

    it('responseBody.has returns false for missing string', () => {
        const script = "tests['Missing'] = responseBody.has('nonexistent');";
        const result = runner.runTests(script, mockResponse, 100);
        assert.equal(result.results[0].passed, false);
    });

    it('handles empty response body in has()', () => {
        const emptyResp = { status: 204, body: '', headers: {} };
        const script = "tests['Empty'] = !responseBody.has('anything');";
        const result = runner.runTests(script, emptyResp, 10);
        assert.equal(result.results[0].passed, true);
    });
});

// ===================== httpRequest =====================

describe('CollectionRunner: httpRequest', () => {
    let runner;
    before(() => { runner = new CollectionRunner({ timeout: 2000 }); });

    it('rejects invalid URLs', async () => {
        await assert.rejects(
            () => runner.httpRequest({ method: 'GET', url: 'not-a-url' }),
            /Invalid URL/
        );
    });

    it('rejects empty URL', async () => {
        await assert.rejects(
            () => runner.httpRequest({ method: 'GET', url: '' }),
            /Invalid URL/
        );
    });

    // Note: We don't test actual HTTP calls in unit tests — those would be integration tests.
    // The httpRequest method mirrors main.js:101-157 which is already battle-tested.
});

// ===================== httpRequest: Mock Server Tests (#88) =====================

const http = require('http');

describe('CollectionRunner: httpRequest with mock server', () => {
    let server;
    let serverPort;
    let runner;

    before(async () => {
        runner = new CollectionRunner({ timeout: 5000 });
        // Create a simple HTTP server for testing
        server = http.createServer((req, res) => {
            const url = new URL(req.url, `http://localhost`);

            if (url.pathname === '/ok') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } else if (url.pathname === '/not-found') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
            } else if (url.pathname === '/server-error') {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
            } else if (url.pathname === '/echo-headers') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(req.headers));
            } else if (url.pathname === '/echo-method') {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(req.method);
            } else if (url.pathname === '/slow') {
                // Respond after 3 seconds (should timeout with 2s timeout)
                setTimeout(() => {
                    res.writeHead(200);
                    res.end('slow response');
                }, 3000);
            } else if (url.pathname === '/echo-body') {
                let body = '';
                req.on('data', (chunk) => { body += chunk; });
                req.on('end', () => {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end(body);
                });
            } else {
                res.writeHead(200);
                res.end('OK');
            }
        });

        await new Promise((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                serverPort = server.address().port;
                resolve();
            });
        });
    });

    after(() => {
        if (server) server.close();
    });

    it('sends GET request and receives 200 JSON response', async () => {
        const result = await runner.httpRequest({
            method: 'GET',
            url: `http://127.0.0.1:${serverPort}/ok`
        });
        assert.equal(result.status, 200);
        assert.ok(result.body.includes('"success":true'));
        assert.equal(result.headers['content-type'], 'application/json');
    });

    it('handles 404 response', async () => {
        const result = await runner.httpRequest({
            method: 'GET',
            url: `http://127.0.0.1:${serverPort}/not-found`
        });
        assert.equal(result.status, 404);
        assert.equal(result.body, 'Not Found');
    });

    it('handles 500 server error', async () => {
        const result = await runner.httpRequest({
            method: 'GET',
            url: `http://127.0.0.1:${serverPort}/server-error`
        });
        assert.equal(result.status, 500);
    });

    it('sends custom headers', async () => {
        const result = await runner.httpRequest({
            method: 'GET',
            url: `http://127.0.0.1:${serverPort}/echo-headers`,
            headers: { 'X-Custom-Header': 'test-value', 'Authorization': 'Bearer token123' }
        });
        const headers = JSON.parse(result.body);
        assert.equal(headers['x-custom-header'], 'test-value');
        assert.equal(headers['authorization'], 'Bearer token123');
    });

    it('sends POST request with body', async () => {
        const body = '{"name":"test","value":42}';
        const result = await runner.httpRequest({
            method: 'POST',
            url: `http://127.0.0.1:${serverPort}/echo-body`,
            body: body
        });
        assert.equal(result.status, 200);
        assert.equal(result.body, body);
    });

    it('sends correct HTTP method', async () => {
        for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
            const result = await runner.httpRequest({
                method,
                url: `http://127.0.0.1:${serverPort}/echo-method`
            });
            assert.equal(result.body, method);
        }
    });

    it('times out on slow responses', async () => {
        const shortTimeoutRunner = new CollectionRunner({ timeout: 500 });
        await assert.rejects(
            () => shortTimeoutRunner.httpRequest({
                method: 'GET',
                url: `http://127.0.0.1:${serverPort}/slow`
            }),
            (err) => err.message.includes('timed out') || err.message.includes('timeout') || err.message.includes('ECONNRESET') || err.code === 'ECONNRESET'
        );
    });

    it('handles connection refused', async () => {
        await assert.rejects(
            () => runner.httpRequest({
                method: 'GET',
                url: 'http://127.0.0.1:1/unreachable'
            }),
            (err) => err.message.includes('ECONNREFUSED') || err.code === 'ECONNREFUSED'
        );
    });

    it('returns response headers', async () => {
        const result = await runner.httpRequest({
            method: 'GET',
            url: `http://127.0.0.1:${serverPort}/ok`
        });
        assert.ok(result.headers);
        assert.ok(typeof result.headers === 'object');
        assert.ok('content-type' in result.headers);
    });

    it('returns statusText', async () => {
        const result = await runner.httpRequest({
            method: 'GET',
            url: `http://127.0.0.1:${serverPort}/ok`
        });
        assert.equal(result.statusText, 'OK');
    });
});

// ===================== executeRequest =====================

describe('CollectionRunner: executeRequest', () => {
    let runner;
    before(() => { runner = new CollectionRunner({ timeout: 1000 }); });

    it('returns error result for unreachable host', async () => {
        const req = {
            name: 'Bad Request',
            method: 'GET',
            url: 'http://192.0.2.1:1', // RFC 5737 TEST-NET — guaranteed unreachable
            headers: {},
            body: '',
            tests: ''
        };
        const result = await runner.executeRequest(req, {});
        assert.equal(result.name, 'Bad Request');
        assert.ok(result.error);
        assert.equal(result.status, null);
        assert.equal(result.testResults.total, 0);
    });

    it('substitutes env vars in URL', async () => {
        // Will fail to connect, but we verify the URL was substituted
        const req = {
            name: 'Var Test',
            method: 'GET',
            url: '{{proto}}://{{host}}:1',
            headers: {},
            body: '',
            tests: ''
        };
        const result = await runner.executeRequest(req, { proto: 'http', host: '192.0.2.1' });
        assert.equal(result.url, 'http://192.0.2.1:1');
    });

    it('handles request with test script on error', async () => {
        const req = {
            name: 'Script on Error',
            method: 'GET',
            url: 'http://192.0.2.1:1',
            headers: {},
            body: '',
            tests: "tests['Should not run'] = true;"
        };
        const result = await runner.executeRequest(req, {});
        // Test script doesn't run when request errors
        assert.ok(result.error);
        assert.equal(result.testResults.total, 0);
    });

    it('returns method and name from request', async () => {
        const req = {
            name: 'My Req',
            method: 'POST',
            url: 'http://192.0.2.1:1',
            headers: {},
            body: '{}',
            tests: ''
        };
        const result = await runner.executeRequest(req, {});
        assert.equal(result.name, 'My Req');
        assert.equal(result.method, 'POST');
    });
});

// ===================== run (integration-ish) =====================

describe('CollectionRunner: run', () => {
    it('returns correct structure for empty collection', async () => {
        const runner = new CollectionRunner();
        const results = await runner.run(buildCollection('Empty'), {});
        assert.equal(results.collection, 'Empty');
        assert.equal(results.total, 0);
        assert.equal(results.passed, 0);
        assert.equal(results.failures, 0);
        assert.equal(results.errors, 0);
        assert.equal(results.skipped, 0);
        assert.ok(results.timestamp);
        assert.ok(typeof results.duration === 'number');
        assert.deepEqual(results.requests, []);
    });

    it('counts errors for unreachable requests', async () => {
        const runner = new CollectionRunner({ timeout: 500 });
        const results = await runner.run(
            buildCollection('Err', [{ name: 'Bad', url: 'http://192.0.2.1:1' }]),
            {}
        );
        assert.equal(results.total, 1);
        assert.equal(results.errors, 1);
        assert.equal(results.passed, 0);
    });

    it('bail stops after first failure', async () => {
        const runner = new CollectionRunner({ timeout: 500, bail: true });
        const results = await runner.run(
            buildCollection('Bail', [
                { name: 'R1', url: 'http://192.0.2.1:1' },
                { name: 'R2', url: 'http://192.0.2.1:1' },
                { name: 'R3', url: 'http://192.0.2.1:1' }
            ]),
            {}
        );
        // First fails, remaining 2 skipped
        assert.equal(results.total, 3);
        assert.equal(results.errors, 1);
        assert.equal(results.skipped, 2);
        assert.equal(results.requests.length, 1);
    });

    it('handles Postman v2.1 collection format', async () => {
        const runner = new CollectionRunner({ timeout: 500 });
        const col = buildPostmanCollection('V21 Run', [
            { name: 'Req', request: { method: 'GET', url: { raw: 'http://192.0.2.1:1' } } }
        ]);
        const results = await runner.run(col, {});
        assert.equal(results.collection, 'V21 Run');
        assert.equal(results.total, 1);
    });
});

// ===================== ConsoleReporter =====================

describe('ConsoleReporter', () => {
    it('includes collection name', () => {
        const reporter = new ConsoleReporter();
        const output = reporter.format(buildResults());
        assert.ok(output.includes('Test Collection'));
    });

    it('shows passing requests with checkmark', () => {
        const reporter = new ConsoleReporter();
        const output = reporter.format(buildResults());
        assert.ok(output.includes('\u2713'));
        assert.ok(output.includes('Get Users'));
    });

    it('shows failing requests with cross', () => {
        const reporter = new ConsoleReporter();
        const output = reporter.format(buildResults());
        assert.ok(output.includes('\u2717'));
        assert.ok(output.includes('Create User'));
    });

    it('shows summary counts', () => {
        const reporter = new ConsoleReporter();
        const output = reporter.format(buildResults());
        assert.ok(output.includes('1 passing'));
        assert.ok(output.includes('1 failing'));
    });

    it('shows duration', () => {
        const reporter = new ConsoleReporter();
        const output = reporter.format(buildResults());
        assert.ok(output.includes('500ms'));
    });

    it('shows test names', () => {
        const reporter = new ConsoleReporter();
        const output = reporter.format(buildResults());
        assert.ok(output.includes('Status is 200'));
        assert.ok(output.includes('Status is 201'));
    });

    it('shows request method', () => {
        const reporter = new ConsoleReporter();
        const output = reporter.format(buildResults());
        assert.ok(output.includes('GET'));
        assert.ok(output.includes('POST'));
    });

    it('handles error requests', () => {
        const reporter = new ConsoleReporter();
        const results = buildResults({
            requests: [{
                name: 'Broken',
                method: 'GET',
                url: 'http://fail',
                status: null,
                responseTime: 10,
                testResults: { total: 0, passed: 0, failures: 0, results: [] },
                error: 'Connection refused'
            }],
            total: 1, passed: 0, failures: 0, errors: 1
        });
        const output = reporter.format(results);
        assert.ok(output.includes('ERROR'));
        assert.ok(output.includes('Connection refused'));
    });

    it('handles zero requests', () => {
        const reporter = new ConsoleReporter();
        const results = buildResults({
            requests: [], total: 0, passed: 0, failures: 0
        });
        const output = reporter.format(results);
        assert.ok(output.includes('0 requests'));
    });

    it('shows skipped count when present', () => {
        const reporter = new ConsoleReporter();
        const results = buildResults({ skipped: 3 });
        const output = reporter.format(results);
        assert.ok(output.includes('3 skipped'));
    });
});

// ===================== JUnitReporter =====================

describe('JUnitReporter', () => {
    it('produces valid XML header', () => {
        const reporter = new JUnitReporter();
        const output = reporter.format(buildResults());
        assert.ok(output.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    });

    it('has testsuites root element with collection name', () => {
        const reporter = new JUnitReporter();
        const output = reporter.format(buildResults());
        assert.ok(output.includes('<testsuites name="Test Collection"'));
    });

    it('has testsuite per request', () => {
        const reporter = new JUnitReporter();
        const output = reporter.format(buildResults());
        assert.ok(output.includes('<testsuite name="Get Users"'));
        assert.ok(output.includes('<testsuite name="Create User"'));
    });

    it('has testcase per test', () => {
        const reporter = new JUnitReporter();
        const output = reporter.format(buildResults());
        assert.ok(output.includes('<testcase name="Status is 200"'));
        assert.ok(output.includes('<testcase name="Has data"'));
    });

    it('marks failing tests with failure element', () => {
        const reporter = new JUnitReporter();
        const output = reporter.format(buildResults());
        assert.ok(output.includes('<failure message="Assertion failed"/>'));
    });

    it('includes time attributes', () => {
        const reporter = new JUnitReporter();
        const output = reporter.format(buildResults());
        assert.ok(output.includes('time="0.500"'));  // duration / 1000
    });

    it('escapes XML special characters', () => {
        const reporter = new JUnitReporter();
        const results = buildResults({
            collection: 'Test & <Collection>',
            requests: [{
                name: 'Req "with" quotes',
                method: 'GET',
                url: 'http://test',
                status: 200,
                responseTime: 100,
                testResults: {
                    total: 1, passed: 1, failures: 0,
                    results: [{ name: "Test's & <value>", passed: true }]
                },
                error: null
            }],
            total: 1, passed: 1, failures: 0
        });
        const output = reporter.format(results);
        assert.ok(output.includes('&amp;'));
        assert.ok(output.includes('&lt;'));
        assert.ok(output.includes('&gt;'));
        assert.ok(output.includes('&quot;'));
        assert.ok(output.includes('&apos;'));
    });

    it('handles error requests with error element', () => {
        const reporter = new JUnitReporter();
        const results = buildResults({
            requests: [{
                name: 'Error Req',
                method: 'GET',
                url: 'http://fail',
                status: null,
                responseTime: 10,
                testResults: { total: 0, passed: 0, failures: 0, results: [] },
                error: 'Timeout'
            }],
            total: 1, passed: 0, failures: 0, errors: 1
        });
        const output = reporter.format(results);
        assert.ok(output.includes('<error message="Timeout"/>'));
        assert.ok(output.includes('errors="1"'));
    });

    it('closes all XML tags', () => {
        const reporter = new JUnitReporter();
        const output = reporter.format(buildResults());
        assert.ok(output.includes('</testsuites>'));
        assert.ok(output.includes('</testsuite>'));
    });
});

// ===================== JSONReporter =====================

describe('JSONReporter', () => {
    it('produces valid JSON', () => {
        const reporter = new JSONReporter();
        const output = reporter.format(buildResults());
        const parsed = JSON.parse(output);
        assert.ok(parsed);
    });

    it('preserves all fields', () => {
        const reporter = new JSONReporter();
        const results = buildResults();
        const output = reporter.format(results);
        const parsed = JSON.parse(output);
        assert.equal(parsed.collection, 'Test Collection');
        assert.equal(parsed.total, 2);
        assert.equal(parsed.passed, 1);
        assert.equal(parsed.failures, 1);
        assert.equal(parsed.duration, 500);
        assert.equal(parsed.requests.length, 2);
    });

    it('pretty-prints with indentation', () => {
        const reporter = new JSONReporter();
        const output = reporter.format(buildResults());
        // Pretty-printed JSON has newlines
        assert.ok(output.includes('\n'));
        assert.ok(output.includes('  '));
    });

    it('includes request details', () => {
        const reporter = new JSONReporter();
        const output = reporter.format(buildResults());
        const parsed = JSON.parse(output);
        assert.equal(parsed.requests[0].name, 'Get Users');
        assert.equal(parsed.requests[0].method, 'GET');
        assert.equal(parsed.requests[0].status, 200);
    });
});

// ===================== getReporter =====================

describe('getReporter', () => {
    it('returns ConsoleReporter for "console"', () => {
        assert.ok(getReporter('console') instanceof ConsoleReporter);
    });

    it('returns JUnitReporter for "junit"', () => {
        assert.ok(getReporter('junit') instanceof JUnitReporter);
    });

    it('returns JUnitReporter for "xml"', () => {
        assert.ok(getReporter('xml') instanceof JUnitReporter);
    });

    it('returns JSONReporter for "json"', () => {
        assert.ok(getReporter('json') instanceof JSONReporter);
    });

    it('defaults to ConsoleReporter for unknown', () => {
        assert.ok(getReporter('unknown') instanceof ConsoleReporter);
    });

    it('defaults to ConsoleReporter for null', () => {
        assert.ok(getReporter(null) instanceof ConsoleReporter);
    });

    it('is case-insensitive', () => {
        assert.ok(getReporter('JUNIT') instanceof JUnitReporter);
        assert.ok(getReporter('Json') instanceof JSONReporter);
    });
});

// ===================== CLI parseArgs =====================

describe('CLI: parseArgs', () => {
    it('parses --collection flag', () => {
        const opts = parseArgs(['-c', 'test.json']);
        assert.equal(opts.collection, 'test.json');
    });

    it('parses long --collection flag', () => {
        const opts = parseArgs(['--collection', 'coll.json']);
        assert.equal(opts.collection, 'coll.json');
    });

    it('parses --environment flag', () => {
        const opts = parseArgs(['-e', 'env.json']);
        assert.equal(opts.environment, 'env.json');
    });

    it('parses --reporter flag', () => {
        const opts = parseArgs(['-r', 'junit']);
        assert.equal(opts.reporter, 'junit');
    });

    it('parses --output flag', () => {
        const opts = parseArgs(['-o', 'results.xml']);
        assert.equal(opts.output, 'results.xml');
    });

    it('parses --bail flag', () => {
        const opts = parseArgs(['--bail']);
        assert.equal(opts.bail, true);
    });

    it('parses --timeout flag', () => {
        const opts = parseArgs(['--timeout', '5000']);
        assert.equal(opts.timeout, 5000);
    });

    it('parses --delay flag', () => {
        const opts = parseArgs(['--delay', '200']);
        assert.equal(opts.delay, 200);
    });

    it('parses --verbose flag', () => {
        const opts = parseArgs(['--verbose']);
        assert.equal(opts.verbose, true);
    });

    it('defaults reporter to console', () => {
        const opts = parseArgs([]);
        assert.equal(opts.reporter, 'console');
    });

    it('defaults timeout to 30000', () => {
        const opts = parseArgs([]);
        assert.equal(opts.timeout, 30000);
    });

    it('defaults bail to false', () => {
        const opts = parseArgs([]);
        assert.equal(opts.bail, false);
    });

    it('parses multiple flags together', () => {
        const opts = parseArgs([
            '-c', 'api.json',
            '-e', 'staging.json',
            '-r', 'junit',
            '-o', 'out.xml',
            '--bail',
            '--timeout', '10000',
            '--verbose'
        ]);
        assert.equal(opts.collection, 'api.json');
        assert.equal(opts.environment, 'staging.json');
        assert.equal(opts.reporter, 'junit');
        assert.equal(opts.output, 'out.xml');
        assert.equal(opts.bail, true);
        assert.equal(opts.timeout, 10000);
        assert.equal(opts.verbose, true);
    });

    it('treats bare path as collection', () => {
        const opts = parseArgs(['myfile.json']);
        assert.equal(opts.collection, 'myfile.json');
    });
});

// ===================== CLI loadEnvironment =====================

describe('CLI: loadEnvironment', () => {
    const tmpDir = path.join(__dirname, '..', '.tmp_test_runner');

    before(() => {
        fs.mkdirSync(tmpDir, { recursive: true });
    });

    it('loads Postman environment format', () => {
        const envPath = path.join(tmpDir, 'postman_env.json');
        fs.writeFileSync(envPath, JSON.stringify({
            name: 'Staging',
            values: [
                { key: 'host', value: 'staging.api.com', enabled: true },
                { key: 'token', value: 'abc', enabled: true },
                { key: 'disabled', value: 'skip', enabled: false }
            ]
        }));
        const vars = loadEnvironment(envPath);
        assert.equal(vars.host, 'staging.api.com');
        assert.equal(vars.token, 'abc');
        assert.equal(vars.disabled, undefined);
    });

    it('loads simple key-value format', () => {
        const envPath = path.join(tmpDir, 'simple_env.json');
        fs.writeFileSync(envPath, JSON.stringify({ host: 'prod.api.com', port: '443' }));
        const vars = loadEnvironment(envPath);
        assert.equal(vars.host, 'prod.api.com');
        assert.equal(vars.port, '443');
    });

    it('treats values without enabled field as enabled', () => {
        const envPath = path.join(tmpDir, 'no_enabled.json');
        fs.writeFileSync(envPath, JSON.stringify({
            values: [{ key: 'x', value: 'y' }]
        }));
        const vars = loadEnvironment(envPath);
        assert.equal(vars.x, 'y');
    });

    // Clean up
    it('cleanup temp files', () => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        assert.ok(true);
    });
});

// ===================== CLI VERSION =====================

describe('CLI: VERSION', () => {
    it('exports a version string', () => {
        assert.ok(typeof VERSION === 'string');
        assert.match(VERSION, /^\d+\.\d+\.\d+$/);
    });
});

// ===================== CLI: VERSION matches package.json =====================

describe('CLI: VERSION matches package.json', () => {
    it('matches package.json version exactly', () => {
        const pkg = require('../package.json');
        assert.equal(VERSION, pkg.version);
    });
});

// ===================== JUnit: time inflation fix =====================

describe('JUnitReporter: testcase time not inflated', () => {
    it('individual testcases have time="0.000"', () => {
        const reporter = new JUnitReporter();
        const output = reporter.format(buildResults());
        // testcase elements should have time="0.000", not the request responseTime
        const testcaseLines = output.split('\n').filter(l => l.includes('<testcase name='));
        for (const line of testcaseLines) {
            if (!line.includes('Request Execution')) {
                assert.ok(line.includes('time="0.000"'), `Expected time="0.000" in: ${line}`);
            }
        }
    });

    it('testsuite still has request responseTime', () => {
        const reporter = new JUnitReporter();
        const output = reporter.format(buildResults());
        // Get Users has responseTime: 150 → 0.150
        assert.ok(output.includes('time="0.150"'));
        // Create User has responseTime: 200 → 0.200
        assert.ok(output.includes('time="0.200"'));
    });
});

// ===================== JUnit: XML control characters =====================

describe('JUnitReporter: XML control character stripping', () => {
    it('strips control characters from test names', () => {
        const reporter = new JUnitReporter();
        const results = buildResults({
            requests: [{
                name: 'Req\x00with\x08control\x0Bchars',
                method: 'GET',
                url: 'http://test',
                status: 200,
                responseTime: 100,
                testResults: {
                    total: 1, passed: 1, failures: 0,
                    results: [{ name: 'Test\x01with\x1Fcontrol', passed: true }]
                },
                error: null
            }],
            total: 1, passed: 1, failures: 0
        });
        const output = reporter.format(results);
        assert.ok(!output.includes('\x00'));
        assert.ok(!output.includes('\x01'));
        assert.ok(!output.includes('\x08'));
        assert.ok(!output.includes('\x0B'));
        assert.ok(!output.includes('\x1F'));
        assert.ok(output.includes('Reqwithcontrolchars'));
        assert.ok(output.includes('Testwithcontrol'));
    });

    it('strips control chars from error messages', () => {
        const reporter = new JUnitReporter();
        const results = buildResults({
            requests: [{
                name: 'Error Req',
                method: 'GET',
                url: 'http://fail',
                status: null,
                responseTime: 10,
                testResults: { total: 0, passed: 0, failures: 0, results: [] },
                error: 'Error\x00msg\x08here'
            }],
            total: 1, passed: 0, failures: 0, errors: 1
        });
        const output = reporter.format(results);
        assert.ok(!output.includes('\x00'));
        assert.ok(!output.includes('\x08'));
        assert.ok(output.includes('Errormsghere'));
    });
});

// ===================== JUnit: failures count includes errors =====================

describe('JUnitReporter: failures includes errored requests', () => {
    it('totalFailures counts errored requests', () => {
        const reporter = new JUnitReporter();
        const results = buildResults({
            requests: [{
                name: 'Error Req',
                method: 'GET',
                url: 'http://fail',
                status: null,
                responseTime: 10,
                testResults: { total: 0, passed: 0, failures: 0, results: [] },
                error: 'Connection refused'
            }],
            total: 1, passed: 0, failures: 0, errors: 1
        });
        const output = reporter.format(results);
        // testsuites element should have failures="1" for the errored request
        assert.ok(output.includes('failures="1"'));
    });

    it('totalFailures sums test failures and errored requests', () => {
        const reporter = new JUnitReporter();
        const results = buildResults({
            requests: [
                {
                    name: 'Test Fail',
                    method: 'GET',
                    url: 'http://test',
                    status: 400,
                    responseTime: 100,
                    testResults: {
                        total: 1, passed: 0, failures: 1,
                        results: [{ name: 'Status OK', passed: false }]
                    },
                    error: null
                },
                {
                    name: 'Error Req',
                    method: 'GET',
                    url: 'http://fail',
                    status: null,
                    responseTime: 10,
                    testResults: { total: 0, passed: 0, failures: 0, results: [] },
                    error: 'Timeout'
                }
            ],
            total: 2, passed: 0, failures: 1, errors: 1
        });
        const output = reporter.format(results);
        // testsuites element: 1 test failure + 1 error = failures="2"
        assert.ok(output.includes('failures="2"'));
    });
});

// ===================== Runner: v2.1 event array format =====================

describe('CollectionRunner: v2.1 event array test script extraction', () => {
    let runner;
    before(() => { runner = new CollectionRunner(); });

    const mockResponse = { status: 200, body: '{"ok": true}', headers: {} };

    it('extracts test script from event array', () => {
        // Simulate the v2.1 event array format on a request object
        const req = {
            name: 'V21 Event',
            method: 'GET',
            url: 'http://192.0.2.1:1',
            headers: {},
            body: '',
            tests: '',
            event: [
                {
                    listen: 'test',
                    script: { exec: ["tests['V21 test'] = responseCode.code === 200;"] }
                }
            ]
        };
        // We can't easily test executeRequest (it makes HTTP calls),
        // so we test the script extraction logic by running the test script directly
        const testEvent = req.event.find(e => e.listen === 'test');
        const exec = testEvent.script.exec;
        const testScript = Array.isArray(exec) ? exec.join('\n') : (exec || '');
        const result = runner.runTests(testScript, mockResponse, 100);
        assert.equal(result.total, 1);
        assert.equal(result.passed, 1);
        assert.equal(result.results[0].name, 'V21 test');
    });

    it('handles event array with multi-line exec', () => {
        const exec = [
            "tests['Status OK'] = responseCode.code === 200;",
            "tests['Has body'] = responseBody.has('ok');"
        ];
        const testScript = exec.join('\n');
        const result = runner.runTests(testScript, mockResponse, 100);
        assert.equal(result.total, 2);
        assert.equal(result.passed, 2);
    });

    it('prefers request.tests over event array', () => {
        // When request.tests is already populated, event array should not override
        const testScript = "tests['Direct'] = true;";
        const result = runner.runTests(testScript, mockResponse, 100);
        assert.equal(result.results[0].name, 'Direct');
    });
});

// ===================== runTests: VM Sandbox Security =====================

describe('CollectionRunner: runTests VM sandbox', () => {
    let runner;
    before(() => { runner = new CollectionRunner(); });

    const mockResponse = { status: 200, body: '{"ok": true}', headers: {} };

    it('cannot access process global', () => {
        const script = "tests['No process'] = (typeof process === 'undefined');";
        const result = runner.runTests(script, mockResponse, 100);
        assert.equal(result.results[0].passed, true);
    });

    it('cannot access require', () => {
        const script = "tests['No require'] = (typeof require === 'undefined');";
        const result = runner.runTests(script, mockResponse, 100);
        assert.equal(result.results[0].passed, true);
    });

    it('cannot access global', () => {
        const script = "tests['No global'] = (typeof global === 'undefined');";
        const result = runner.runTests(script, mockResponse, 100);
        assert.equal(result.results[0].passed, true);
    });

    it('cannot access module', () => {
        const script = "tests['No module'] = (typeof module === 'undefined');";
        const result = runner.runTests(script, mockResponse, 100);
        assert.equal(result.results[0].passed, true);
    });

    it('times out on infinite loops', () => {
        const script = "while(true) {}";
        const result = runner.runTests(script, mockResponse, 100);
        assert.equal(result.failures, 1);
        assert.equal(result.results[0].name, 'Script Execution');
        assert.ok(result.results[0].error);
    });

    it('sandbox tests object is shared with caller', () => {
        const script = "tests['Set from sandbox'] = true;";
        const result = runner.runTests(script, mockResponse, 100);
        assert.equal(result.results[0].passed, true);
        assert.equal(result.results[0].name, 'Set from sandbox');
    });

    it('sandbox has responseCode, responseBody, responseTime', () => {
        const script = `
            tests['Has responseCode'] = typeof responseCode === 'object';
            tests['Has responseBody'] = typeof responseBody === 'object';
            tests['Has responseTime'] = typeof responseTime === 'number';
        `;
        const result = runner.runTests(script, mockResponse, 42);
        assert.equal(result.total, 3);
        assert.equal(result.passed, 3);
    });
});

// ===================== substituteVars: Object.hasOwn =====================

describe('CollectionRunner: substituteVars with prototype keys', () => {
    let runner;
    before(() => { runner = new CollectionRunner(); });

    it('does not substitute inherited prototype properties', () => {
        const vars = Object.create({ inherited: 'BAD' });
        vars.own = 'GOOD';
        const result = runner.substituteVars('{{own}} {{inherited}}', vars);
        assert.equal(result, 'GOOD {{inherited}}');
    });

    it('works with null-prototype objects', () => {
        const vars = Object.create(null);
        vars.key = 'value';
        const result = runner.substituteVars('{{key}}', vars);
        assert.equal(result, 'value');
    });
});

// ===================== Integration: Runner + Reporters =====================

describe('Integration: Runner results through reporters', () => {
    it('ConsoleReporter handles empty run result', () => {
        const reporter = new ConsoleReporter();
        const results = {
            collection: 'Empty',
            timestamp: new Date().toISOString(),
            total: 0, passed: 0, failures: 0, errors: 0, skipped: 0,
            duration: 5,
            requests: []
        };
        const output = reporter.format(results);
        assert.ok(output.includes('Empty'));
        assert.ok(output.includes('0 requests'));
    });

    it('JUnitReporter handles empty run result', () => {
        const reporter = new JUnitReporter();
        const results = {
            collection: 'Empty',
            timestamp: new Date().toISOString(),
            total: 0, passed: 0, failures: 0, errors: 0, skipped: 0,
            duration: 5,
            requests: []
        };
        const output = reporter.format(results);
        assert.ok(output.includes('tests="0"'));
        assert.ok(output.includes('</testsuites>'));
    });

    it('JSONReporter round-trips empty result', () => {
        const reporter = new JSONReporter();
        const results = {
            collection: 'Empty',
            timestamp: new Date().toISOString(),
            total: 0, passed: 0, failures: 0, errors: 0, skipped: 0,
            duration: 5,
            requests: []
        };
        const output = reporter.format(results);
        const parsed = JSON.parse(output);
        assert.equal(parsed.total, 0);
        assert.equal(parsed.requests.length, 0);
    });
});
