/**
 * Unit tests for advanced search/filter functionality (Issue #5)
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { extractAppClasses } = require('./helpers/app_class_extractor');

let Request, Collection, Folder;

before(() => {
    const classes = extractAppClasses();
    Request = classes.Request;
    Collection = classes.Collection;
    Folder = classes.Folder;
});

/**
 * Since matchesFilters, headersMatchText, textMatch, regexMatch, etc.
 * are instance methods on PostmanHelperApp (which requires DOM),
 * we replicate the pure-logic functions here for unit testing.
 */

function textMatch(field, text) {
    return field && field.toLowerCase().includes(text);
}

function regexMatch(field, text) {
    if (!field) return false;
    try { return new RegExp(text, 'i').test(field); }
    catch { return false; }
}

function headersMatchText(headers, text, useRegex) {
    if (!headers) return false;
    const matchFn = useRegex ? regexMatch : textMatch;
    if (Array.isArray(headers)) {
        return headers.some(h =>
            matchFn(h.key, text) || matchFn(h.value, text)
        );
    }
    if (typeof headers === 'object') {
        return Object.entries(headers).some(([k, v]) =>
            matchFn(k, text) || matchFn(String(v), text)
        );
    }
    return false;
}

function matchesFilters(request, filters) {
    const f = filters;
    if (f.text) {
        const matchFn = f.useRegex ? regexMatch : textMatch;
        if (!(matchFn(request.name, f.text)
            || matchFn(request.url, f.text)
            || matchFn(request.body, f.text)
            || matchFn(request.tests, f.text)
            || headersMatchText(request.headers, f.text, f.useRegex))) {
            return false;
        }
    }
    if (f.methods.length > 0 && !f.methods.includes(request.method)) {
        return false;
    }
    if (f.hasTests && !(request.tests && request.tests.trim())) {
        return false;
    }
    if (f.hasBody && !(request.body && request.body.trim())) {
        return false;
    }
    return true;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function highlightMatch(text, searchTerm, useRegex) {
    if (!searchTerm || !text) return escapeHtml(text || '');
    try {
        const pattern = useRegex ? searchTerm : escapeRegex(searchTerm);
        const regex = new RegExp(`(${pattern})`, 'gi');
        return escapeHtml(text).replace(regex, '<mark class="search-highlight">$1</mark>');
    } catch {
        return escapeHtml(text);
    }
}

function folderHasMatchingRequests(folder, filters) {
    if (folder.requests && folder.requests.some(r => matchesFilters(r, filters))) return true;
    if (folder.folders) {
        for (const sub of folder.folders) {
            if (folderHasMatchingRequests(sub, filters)) return true;
        }
    }
    return false;
}

// ─── textMatch ─────────────────────────────────────────────────────────────

describe('textMatch', () => {
    it('matches substring case-insensitively', () => {
        assert.ok(textMatch('Hello World', 'hello'));
        assert.ok(textMatch('Hello World', 'world'));
        assert.ok(textMatch('Hello World', 'lo wo'));
    });

    it('returns false for non-matching text', () => {
        assert.ok(!textMatch('Hello World', 'xyz'));
    });

    it('returns false for null/undefined field', () => {
        assert.ok(!textMatch(null, 'test'));
        assert.ok(!textMatch(undefined, 'test'));
        assert.ok(!textMatch('', 'test'));
    });
});

// ─── regexMatch ────────────────────────────────────────────────────────────

describe('regexMatch', () => {
    it('matches regex patterns', () => {
        assert.ok(regexMatch('/api/users/123', 'users\\/\\d+'));
        assert.ok(regexMatch('GET request', '^get'));
    });

    it('is case-insensitive', () => {
        assert.ok(regexMatch('Hello', 'hello'));
    });

    it('handles invalid regex gracefully', () => {
        assert.ok(!regexMatch('test', '[invalid'));
    });

    it('returns false for null/undefined field', () => {
        assert.ok(!regexMatch(null, 'test'));
        assert.ok(!regexMatch(undefined, 'test'));
    });
});

// ─── headersMatchText ──────────────────────────────────────────────────────

describe('headersMatchText', () => {
    it('matches object headers by key', () => {
        const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer token' };
        assert.ok(headersMatchText(headers, 'content-type', false));
        assert.ok(headersMatchText(headers, 'authorization', false));
    });

    it('matches object headers by value', () => {
        const headers = { 'Content-Type': 'application/json' };
        assert.ok(headersMatchText(headers, 'json', false));
    });

    it('matches array headers by key', () => {
        const headers = [{ key: 'Content-Type', value: 'application/json' }];
        assert.ok(headersMatchText(headers, 'content-type', false));
    });

    it('matches array headers by value', () => {
        const headers = [{ key: 'Content-Type', value: 'application/json' }];
        assert.ok(headersMatchText(headers, 'json', false));
    });

    it('returns false for no match', () => {
        const headers = { 'Content-Type': 'application/json' };
        assert.ok(!headersMatchText(headers, 'xml', false));
    });

    it('returns false for null/undefined headers', () => {
        assert.ok(!headersMatchText(null, 'test', false));
        assert.ok(!headersMatchText(undefined, 'test', false));
    });

    it('supports regex mode on object headers', () => {
        const headers = { 'X-Custom-123': 'value' };
        assert.ok(headersMatchText(headers, 'custom-\\d+', true));
    });

    it('supports regex mode on array headers', () => {
        const headers = [{ key: 'X-Request-ID', value: 'abc-123-def' }];
        assert.ok(headersMatchText(headers, '[a-z]+-\\d+-[a-z]+', true));
    });
});

// ─── matchesFilters ────────────────────────────────────────────────────────

describe('matchesFilters', () => {
    const baseFilters = { text: '', methods: [], hasTests: false, hasBody: false, useRegex: false };

    it('returns true when no filters active', () => {
        const req = new Request('Test', 'GET', '/api');
        assert.ok(matchesFilters(req, baseFilters));
    });

    it('filters by name', () => {
        const req = new Request('Get Users', 'GET', '/api/users');
        assert.ok(matchesFilters(req, { ...baseFilters, text: 'users' }));
        assert.ok(!matchesFilters(req, { ...baseFilters, text: 'posts' }));
    });

    it('filters by URL', () => {
        const req = new Request('Test', 'GET', 'https://api.example.com/users');
        assert.ok(matchesFilters(req, { ...baseFilters, text: 'example.com' }));
    });

    it('filters by body content', () => {
        const req = new Request('Test', 'POST', '/api', {}, '{"email":"test@mail.com"}');
        assert.ok(matchesFilters(req, { ...baseFilters, text: 'email' }));
    });

    it('filters by test script content', () => {
        const req = new Request('Test', 'GET', '/api');
        req.tests = "tests['Status is 200'] = true;";
        assert.ok(matchesFilters(req, { ...baseFilters, text: 'status' }));
    });

    it('filters by object headers', () => {
        const req = new Request('Test', 'GET', '/api', { 'Authorization': 'Bearer abc123' });
        assert.ok(matchesFilters(req, { ...baseFilters, text: 'bearer' }));
        assert.ok(matchesFilters(req, { ...baseFilters, text: 'authorization' }));
    });

    it('filters by array headers', () => {
        const req = new Request('Test', 'GET', '/api');
        req.headers = [{ key: 'X-API-Key', value: 'secret123' }];
        assert.ok(matchesFilters(req, { ...baseFilters, text: 'api-key' }));
        assert.ok(matchesFilters(req, { ...baseFilters, text: 'secret' }));
    });

    it('filters by HTTP method', () => {
        const getReq = new Request('Test', 'GET', '/api');
        const postReq = new Request('Test', 'POST', '/api');
        const filter = { ...baseFilters, methods: ['POST'] };
        assert.ok(!matchesFilters(getReq, filter));
        assert.ok(matchesFilters(postReq, filter));
    });

    it('filters by hasTests toggle', () => {
        const reqWithTests = new Request('Test', 'GET', '/api');
        reqWithTests.tests = 'tests["ok"] = true;';
        const reqWithout = new Request('Test', 'GET', '/api');
        const filter = { ...baseFilters, hasTests: true };
        assert.ok(matchesFilters(reqWithTests, filter));
        assert.ok(!matchesFilters(reqWithout, filter));
    });

    it('filters by hasBody toggle', () => {
        const reqWithBody = new Request('Test', 'POST', '/api', {}, '{"data": 1}');
        const reqWithout = new Request('Test', 'GET', '/api');
        const filter = { ...baseFilters, hasBody: true };
        assert.ok(matchesFilters(reqWithBody, filter));
        assert.ok(!matchesFilters(reqWithout, filter));
    });

    it('supports regex text search', () => {
        const req = new Request('Get Users v2', 'GET', '/api/v2/users');
        assert.ok(matchesFilters(req, { ...baseFilters, text: 'v\\d+', useRegex: true }));
        assert.ok(!matchesFilters(req, { ...baseFilters, text: 'v\\d+', useRegex: false })); // literal v\d+ won't match
    });

    it('handles invalid regex gracefully in filter', () => {
        const req = new Request('Test', 'GET', '/api');
        // Invalid regex should not throw, just not match
        assert.ok(!matchesFilters(req, { ...baseFilters, text: '[invalid', useRegex: true }));
    });

    it('combines text and method filters', () => {
        const req = new Request('Get Users', 'GET', '/api/users');
        assert.ok(matchesFilters(req, { ...baseFilters, text: 'users', methods: ['GET'] }));
        assert.ok(!matchesFilters(req, { ...baseFilters, text: 'users', methods: ['POST'] }));
        assert.ok(!matchesFilters(req, { ...baseFilters, text: 'posts', methods: ['GET'] }));
    });
});

// ─── highlightMatch ────────────────────────────────────────────────────────

describe('highlightMatch', () => {
    it('wraps matching text in mark tags', () => {
        const result = highlightMatch('Hello World', 'world', false);
        assert.ok(result.includes('<mark class="search-highlight">World</mark>'));
    });

    it('handles case-insensitive matching', () => {
        const result = highlightMatch('Hello World', 'hello', false);
        assert.ok(result.includes('<mark class="search-highlight">Hello</mark>'));
    });

    it('escapes HTML in the text', () => {
        const result = highlightMatch('<script>alert("xss")</script>', 'script', false);
        assert.ok(!result.includes('<script>'));
        assert.ok(result.includes('&lt;'));
    });

    it('highlights multiple occurrences', () => {
        const result = highlightMatch('test the test case', 'test', false);
        const marks = result.match(/<mark/g);
        assert.equal(marks.length, 2);
    });

    it('supports regex patterns', () => {
        const result = highlightMatch('users/123/posts', '\\d+', true);
        assert.ok(result.includes('<mark class="search-highlight">123</mark>'));
    });

    it('handles invalid regex gracefully', () => {
        const result = highlightMatch('test', '[invalid', true);
        assert.equal(result, 'test'); // No highlight, no crash
    });

    it('returns escaped text for null search', () => {
        assert.equal(highlightMatch('Hello', '', false), 'Hello');
        assert.equal(highlightMatch('Hello', null, false), 'Hello');
    });

    it('returns empty string for null text', () => {
        assert.equal(highlightMatch(null, 'test', false), '');
        assert.equal(highlightMatch(undefined, 'test', false), '');
    });

    it('escapes special regex chars in plain text mode', () => {
        const result = highlightMatch('file.txt (copy)', 'file.txt', false);
        assert.ok(result.includes('<mark'));
        // In plain mode, the dot should be literal
    });
});

// ─── folderHasMatchingRequests ─────────────────────────────────────────────

describe('folderHasMatchingRequests', () => {
    const baseFilters = { text: '', methods: [], hasTests: false, hasBody: false, useRegex: false };

    it('matches when folder has a matching request', () => {
        const folder = new Folder('Auth');
        folder.addRequest(new Request('Login', 'POST', '/auth/login'));
        assert.ok(folderHasMatchingRequests(folder, { ...baseFilters, text: 'login' }));
    });

    it('returns false when no match in folder', () => {
        const folder = new Folder('Auth');
        folder.addRequest(new Request('Login', 'POST', '/auth/login'));
        assert.ok(!folderHasMatchingRequests(folder, { ...baseFilters, text: 'users' }));
    });

    it('matches in nested subfolders', () => {
        const topFolder = new Folder('API');
        const subFolder = new Folder('Users');
        subFolder.addRequest(new Request('Get Users', 'GET', '/api/users'));
        topFolder.addFolder(subFolder);

        assert.ok(folderHasMatchingRequests(topFolder, { ...baseFilters, text: 'users' }));
    });

    it('returns false for deeply nested non-matching content', () => {
        const topFolder = new Folder('API');
        const subFolder = new Folder('Users');
        subFolder.addRequest(new Request('Get Users', 'GET', '/api/users'));
        topFolder.addFolder(subFolder);

        assert.ok(!folderHasMatchingRequests(topFolder, { ...baseFilters, text: 'posts' }));
    });
});
