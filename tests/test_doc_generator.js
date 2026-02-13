/**
 * Unit tests for DocGenerator class (Issue #6)
 * Extracts DocGenerator from app.js and tests Markdown/HTML generation.
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { extractAppClasses } = require('./helpers/app_class_extractor');

let Request, Collection, Folder, DocGenerator;

/**
 * Extract DocGenerator from app.js source.
 * It sits between "// Documentation Generator" and "// AppState class"
 */
function extractDocGenerator() {
    const appPath = path.join(__dirname, '..', 'app.js');
    const src = fs.readFileSync(appPath, 'utf-8');
    const lines = src.split('\n');

    let blockStart = -1;
    let blockEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^\/\/ Documentation Generator/) && blockStart === -1) {
            blockStart = i + 1; // Start from the class line
        }
        if (blockStart > -1 && lines[i].match(/^\/\/ AppState class/)) {
            blockEnd = i;
            break;
        }
    }

    if (blockStart === -1 || blockEnd === -1) {
        throw new Error(`Could not find DocGenerator in app.js (start=${blockStart}, end=${blockEnd})`);
    }

    const blockCode = lines.slice(blockStart, blockEnd).join('\n');
    const code = `${blockCode}\nmodule.exports = { DocGenerator };`;

    const Module = require('module');
    const m = new Module();
    m._compile(code, 'doc_generator_virtual.js');
    return m.exports.DocGenerator;
}

before(() => {
    const classes = extractAppClasses();
    Request = classes.Request;
    Collection = classes.Collection;
    Folder = classes.Folder;
    DocGenerator = extractDocGenerator();
});

// Helper to create a sample collection
function createSampleCollection() {
    const col = new Collection('Sample API');
    col.description = 'A sample REST API collection';

    const getUsers = new Request('Get Users', 'GET', 'https://api.example.com/users',
        { 'Content-Type': 'application/json', 'Authorization': 'Bearer {{token}}' },
        '', 'Fetch all users');
    getUsers.tests = "tests['Status is 200'] = responseCode.code === 200;";

    const createUser = new Request('Create User', 'POST', 'https://api.example.com/users',
        { 'Content-Type': 'application/json' },
        '{\n  "name": "John",\n  "email": "john@example.com"\n}',
        'Create a new user');

    col.addRequest(getUsers);
    col.addRequest(createUser);

    const authFolder = new Folder('Authentication');
    const loginReq = new Request('Login', 'POST', 'https://api.example.com/auth/login',
        { 'Content-Type': 'application/json' },
        '{"email":"admin@example.com","password":"secret"}',
        'Authenticate user');
    loginReq.tests = "tests['Has token'] = responseBody.has('token');";
    authFolder.addRequest(loginReq);

    col.addFolder(authFolder);

    return col;
}

// ─── normalizeHeaders ──────────────────────────────────────────────────────

describe('DocGenerator.normalizeHeaders', () => {
    it('converts object headers to array of {key, value}', () => {
        const result = DocGenerator.normalizeHeaders({ 'Content-Type': 'application/json', 'Accept': 'text/html' });
        assert.equal(result.length, 2);
        assert.equal(result[0].key, 'Content-Type');
        assert.equal(result[0].value, 'application/json');
    });

    it('converts array headers preserving key/value', () => {
        const result = DocGenerator.normalizeHeaders([{ key: 'X-Custom', value: 'test' }]);
        assert.equal(result.length, 1);
        assert.equal(result[0].key, 'X-Custom');
    });

    it('filters out array headers without key', () => {
        const result = DocGenerator.normalizeHeaders([{ value: 'orphan' }, { key: 'Valid', value: 'yes' }]);
        assert.equal(result.length, 1);
        assert.equal(result[0].key, 'Valid');
    });

    it('returns empty array for null/undefined', () => {
        assert.deepEqual(DocGenerator.normalizeHeaders(null), []);
        assert.deepEqual(DocGenerator.normalizeHeaders(undefined), []);
    });

    it('returns empty array for empty object', () => {
        assert.deepEqual(DocGenerator.normalizeHeaders({}), []);
    });
});

// ─── htmlEscape ────────────────────────────────────────────────────────────

describe('DocGenerator.htmlEscape', () => {
    it('escapes HTML entities', () => {
        assert.equal(DocGenerator.htmlEscape('<script>"alert"</script>'), '&lt;script&gt;&quot;alert&quot;&lt;/script&gt;');
    });

    it('returns empty string for null/undefined', () => {
        assert.equal(DocGenerator.htmlEscape(null), '');
        assert.equal(DocGenerator.htmlEscape(undefined), '');
    });
});

// ─── slugify ───────────────────────────────────────────────────────────────

describe('DocGenerator.slugify', () => {
    it('converts to lowercase with dashes', () => {
        assert.equal(DocGenerator.slugify('Get Users'), 'get-users');
    });

    it('removes special characters', () => {
        assert.equal(DocGenerator.slugify('Login (v2)'), 'login-v2');
    });

    it('trims leading/trailing dashes', () => {
        assert.equal(DocGenerator.slugify('  Hello  '), 'hello');
    });

    it('handles empty string', () => {
        assert.equal(DocGenerator.slugify(''), '');
    });
});

// ─── requestToMarkdown ─────────────────────────────────────────────────────

describe('DocGenerator.requestToMarkdown', () => {
    it('includes method, name, and URL', () => {
        const req = new Request('Get Users', 'GET', 'https://api.example.com/users');
        const md = DocGenerator.requestToMarkdown(req);
        assert.ok(md.includes('### GET Get Users'));
        assert.ok(md.includes('`GET`'));
        assert.ok(md.includes('`https://api.example.com/users`'));
    });

    it('includes description when present', () => {
        const req = new Request('Test', 'GET', '/api', {}, '', 'A test request');
        const md = DocGenerator.requestToMarkdown(req);
        assert.ok(md.includes('A test request'));
    });

    it('includes headers table for object headers', () => {
        const req = new Request('Test', 'GET', '/api', { 'Content-Type': 'application/json' });
        const md = DocGenerator.requestToMarkdown(req);
        assert.ok(md.includes('#### Headers'));
        assert.ok(md.includes('| Content-Type | application/json |'));
    });

    it('includes headers table for array headers', () => {
        const req = new Request('Test', 'GET', '/api');
        req.headers = [{ key: 'Accept', value: 'text/html' }];
        const md = DocGenerator.requestToMarkdown(req);
        assert.ok(md.includes('| Accept | text/html |'));
    });

    it('includes body as JSON code block', () => {
        const req = new Request('Test', 'POST', '/api', {}, '{"name":"John"}');
        const md = DocGenerator.requestToMarkdown(req);
        assert.ok(md.includes('#### Body'));
        assert.ok(md.includes('```json'));
        assert.ok(md.includes('{"name":"John"}'));
    });

    it('includes test scripts as JS code block', () => {
        const req = new Request('Test', 'GET', '/api');
        req.tests = "tests['ok'] = true;";
        const md = DocGenerator.requestToMarkdown(req);
        assert.ok(md.includes('#### Tests'));
        assert.ok(md.includes('```javascript'));
        assert.ok(md.includes("tests['ok'] = true;"));
    });

    it('skips empty sections', () => {
        const req = new Request('Simple', 'GET', '/api');
        const md = DocGenerator.requestToMarkdown(req);
        assert.ok(!md.includes('#### Headers'));
        assert.ok(!md.includes('#### Body'));
        assert.ok(!md.includes('#### Tests'));
    });
});

// ─── generateTOC ───────────────────────────────────────────────────────────

describe('DocGenerator.generateTOC', () => {
    it('lists all root requests', () => {
        const col = createSampleCollection();
        const toc = DocGenerator.generateTOC(col);
        assert.ok(toc.includes('**Get Users**'));
        assert.ok(toc.includes('**Create User**'));
    });

    it('lists folders with trailing slash', () => {
        const col = createSampleCollection();
        const toc = DocGenerator.generateTOC(col);
        assert.ok(toc.includes('**Authentication/**'));
    });

    it('lists requests inside folders', () => {
        const col = createSampleCollection();
        const toc = DocGenerator.generateTOC(col);
        assert.ok(toc.includes('**Login**'));
    });

    it('handles empty collection', () => {
        const col = new Collection('Empty');
        const toc = DocGenerator.generateTOC(col);
        assert.equal(toc, '');
    });
});

// ─── generateMarkdown ──────────────────────────────────────────────────────

describe('DocGenerator.generateMarkdown', () => {
    it('starts with collection name as h1', () => {
        const col = createSampleCollection();
        const md = DocGenerator.generateMarkdown(col);
        assert.ok(md.startsWith('# Sample API\n'));
    });

    it('includes collection description', () => {
        const col = createSampleCollection();
        const md = DocGenerator.generateMarkdown(col);
        assert.ok(md.includes('A sample REST API collection'));
    });

    it('includes table of contents section', () => {
        const col = createSampleCollection();
        const md = DocGenerator.generateMarkdown(col);
        assert.ok(md.includes('## Table of Contents'));
    });

    it('includes all root requests', () => {
        const col = createSampleCollection();
        const md = DocGenerator.generateMarkdown(col);
        assert.ok(md.includes('### GET Get Users'));
        assert.ok(md.includes('### POST Create User'));
    });

    it('includes folder sections', () => {
        const col = createSampleCollection();
        const md = DocGenerator.generateMarkdown(col);
        assert.ok(md.includes('## Authentication'));
        assert.ok(md.includes('### POST Login'));
    });

    it('handles empty collection', () => {
        const col = new Collection('Empty');
        const md = DocGenerator.generateMarkdown(col);
        assert.ok(md.includes('# Empty'));
        assert.ok(md.includes('## Table of Contents'));
    });

    it('handles collection with only folders', () => {
        const col = new Collection('Folders Only');
        const folder = new Folder('Auth');
        folder.addRequest(new Request('Login', 'POST', '/login'));
        col.addFolder(folder);
        const md = DocGenerator.generateMarkdown(col);
        assert.ok(!md.includes('## Requests'));
        assert.ok(md.includes('## Auth'));
    });
});

// ─── generateHTML ──────────────────────────────────────────────────────────

describe('DocGenerator.generateHTML', () => {
    it('produces valid HTML document', () => {
        const col = createSampleCollection();
        const html = DocGenerator.generateHTML(col);
        assert.ok(html.includes('<!DOCTYPE html>'));
        assert.ok(html.includes('<html'));
        assert.ok(html.includes('</html>'));
        assert.ok(html.includes('<head>'));
        assert.ok(html.includes('<body>'));
    });

    it('includes collection name in title', () => {
        const col = createSampleCollection();
        const html = DocGenerator.generateHTML(col);
        assert.ok(html.includes('<title>Sample API - API Documentation</title>'));
    });

    it('includes embedded CSS styles', () => {
        const col = createSampleCollection();
        const html = DocGenerator.generateHTML(col);
        assert.ok(html.includes('<style>'));
        assert.ok(html.includes('.method-badge'));
        assert.ok(html.includes('.method-get'));
    });

    it('includes method badges with correct classes', () => {
        const col = createSampleCollection();
        const html = DocGenerator.generateHTML(col);
        assert.ok(html.includes('method-get'));
        assert.ok(html.includes('method-post'));
    });

    it('includes Table of Contents with links', () => {
        const col = createSampleCollection();
        const html = DocGenerator.generateHTML(col);
        assert.ok(html.includes('Table of Contents'));
        assert.ok(html.includes('href="#get-users"'));
        assert.ok(html.includes('href="#login"'));
    });

    it('includes request details', () => {
        const col = createSampleCollection();
        const html = DocGenerator.generateHTML(col);
        assert.ok(html.includes('https://api.example.com/users'));
        assert.ok(html.includes('Content-Type'));
    });

    it('escapes HTML entities in content', () => {
        const col = new Collection('Test <Collection>');
        const req = new Request('Get <Data>', 'GET', '/api?a=1&b=2');
        col.addRequest(req);
        const html = DocGenerator.generateHTML(col);
        assert.ok(html.includes('Test &lt;Collection&gt;'));
        assert.ok(html.includes('&amp;b=2'));
    });

    it('includes headers table', () => {
        const col = createSampleCollection();
        const html = DocGenerator.generateHTML(col);
        assert.ok(html.includes('<table>'));
        assert.ok(html.includes('<th>Key</th>'));
        assert.ok(html.includes('Authorization'));
    });

    it('includes body in pre/code blocks', () => {
        const col = createSampleCollection();
        const html = DocGenerator.generateHTML(col);
        assert.ok(html.includes('<pre><code>'));
        assert.ok(html.includes('john@example.com'));
    });

    it('handles empty collection', () => {
        const col = new Collection('Empty');
        const html = DocGenerator.generateHTML(col);
        assert.ok(html.includes('<!DOCTYPE html>'));
        assert.ok(html.includes('Empty'));
    });
});

// ─── Nested folders ────────────────────────────────────────────────────────

describe('DocGenerator with nested folders', () => {
    it('renders deeply nested folder structure in markdown', () => {
        const col = new Collection('Nested');
        const topFolder = new Folder('API');
        const subFolder = new Folder('v2');
        subFolder.addRequest(new Request('Health Check', 'GET', '/api/v2/health'));
        topFolder.addFolder(subFolder);
        col.addFolder(topFolder);

        const md = DocGenerator.generateMarkdown(col);
        assert.ok(md.includes('## API'));
        assert.ok(md.includes('### v2'));
        assert.ok(md.includes('Health Check'));
    });

    it('renders deeply nested folder structure in HTML', () => {
        const col = new Collection('Nested');
        const topFolder = new Folder('API');
        const subFolder = new Folder('v2');
        subFolder.addRequest(new Request('Health Check', 'GET', '/api/v2/health'));
        topFolder.addFolder(subFolder);
        col.addFolder(topFolder);

        const html = DocGenerator.generateHTML(col);
        assert.ok(html.includes('<h2>API</h2>'));
        assert.ok(html.includes('<h3>v2</h3>'));
        assert.ok(html.includes('Health Check'));
    });

    it('TOC includes nested folder requests', () => {
        const col = new Collection('Nested');
        const topFolder = new Folder('API');
        const subFolder = new Folder('v2');
        subFolder.addRequest(new Request('Ping', 'GET', '/ping'));
        topFolder.addFolder(subFolder);
        col.addFolder(topFolder);

        const toc = DocGenerator.generateTOC(col);
        assert.ok(toc.includes('**API/**'));
        assert.ok(toc.includes('**v2/**'));
        assert.ok(toc.includes('**Ping**'));
    });
});
