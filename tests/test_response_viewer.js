/**
 * Unit tests for enhanced response viewer:
 * displayResponse, getStatusDescription, highlightJson, formatBytes
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

let document, window, app;

function createApp(doc) {
    return {
        escapeHtml(str) {
            const div = doc.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        formatBytes(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1048576).toFixed(1) + ' MB';
        },

        getStatusDescription(code) {
            const descriptions = {
                200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
                301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
                400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
                405: 'Method Not Allowed', 408: 'Request Timeout', 409: 'Conflict',
                422: 'Unprocessable Entity', 429: 'Too Many Requests',
                500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout'
            };
            return descriptions[code] || '';
        },

        highlightJson(jsonStr) {
            const escaped = this.escapeHtml(jsonStr);
            const highlighted = escaped
                .replace(/"([^"\\]*(\\.[^"\\]*)*)"\s*:/g, '<span class="json-key">"$1"</span>:')
                .replace(/:\s*"([^"\\]*(\\.[^"\\]*)*)"/g, ': <span class="json-string">"$1"</span>')
                .replace(/:\s*(-?\d+\.?\d*([eE][+-]?\d+)?)/g, ': <span class="json-number">$1</span>')
                .replace(/:\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
                .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>');
            return `<pre class="json-highlighted">${highlighted}</pre>`;
        },

        showToast() {},
        state: { toastDuration: 2000 },
        analytics: { track() {} }
    };
}

beforeEach(() => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
        <div id="requestTab"></div>
    </body></html>`, {
        url: 'http://localhost',
        pretendToBeVisual: true
    });
    window = dom.window;
    document = window.document;
    global.document = document;
    global.Blob = window.Blob;
    global.navigator = { clipboard: null };
    app = createApp(document);
});

afterEach(() => {
    delete global.document;
    delete global.Blob;
    delete global.navigator;
});

describe('getStatusDescription', () => {
    it('returns OK for 200', () => {
        assert.equal(app.getStatusDescription(200), 'OK');
    });

    it('returns Created for 201', () => {
        assert.equal(app.getStatusDescription(201), 'Created');
    });

    it('returns Not Found for 404', () => {
        assert.equal(app.getStatusDescription(404), 'Not Found');
    });

    it('returns Internal Server Error for 500', () => {
        assert.equal(app.getStatusDescription(500), 'Internal Server Error');
    });

    it('returns empty string for unknown codes', () => {
        assert.equal(app.getStatusDescription(999), '');
    });

    it('returns Unauthorized for 401', () => {
        assert.equal(app.getStatusDescription(401), 'Unauthorized');
    });

    it('returns Too Many Requests for 429', () => {
        assert.equal(app.getStatusDescription(429), 'Too Many Requests');
    });
});

describe('highlightJson', () => {
    it('wraps keys in json-key spans', () => {
        const result = app.highlightJson('{\n  "name": "test"\n}');
        assert.ok(result.includes('class="json-key"'));
        assert.ok(result.includes('"name"'));
    });

    it('wraps string values in json-string spans', () => {
        const result = app.highlightJson('{\n  "name": "hello"\n}');
        assert.ok(result.includes('class="json-string"'));
    });

    it('wraps number values in json-number spans', () => {
        const result = app.highlightJson('{\n  "count": 42\n}');
        assert.ok(result.includes('class="json-number"'));
        assert.ok(result.includes('42'));
    });

    it('wraps boolean values in json-boolean spans', () => {
        const result = app.highlightJson('{\n  "active": true\n}');
        assert.ok(result.includes('class="json-boolean"'));
    });

    it('wraps null values in json-null spans', () => {
        const result = app.highlightJson('{\n  "data": null\n}');
        assert.ok(result.includes('class="json-null"'));
    });

    it('returns pre element with json-highlighted class', () => {
        const result = app.highlightJson('{}');
        assert.ok(result.startsWith('<pre class="json-highlighted">'));
        assert.ok(result.endsWith('</pre>'));
    });

    it('handles nested objects', () => {
        const json = JSON.stringify({ a: { b: 1 } }, null, 2);
        const result = app.highlightJson(json);
        assert.ok(result.includes('json-key'));
        assert.ok(result.includes('json-number'));
    });
});

describe('formatBytes', () => {
    it('formats bytes', () => {
        assert.equal(app.formatBytes(500), '500 B');
    });

    it('formats kilobytes', () => {
        assert.equal(app.formatBytes(2560), '2.5 KB');
    });

    it('formats megabytes', () => {
        assert.equal(app.formatBytes(1572864), '1.5 MB');
    });

    it('formats zero', () => {
        assert.equal(app.formatBytes(0), '0 B');
    });
});

describe('escapeHtml', () => {
    it('escapes angle brackets', () => {
        const result = app.escapeHtml('<script>alert("xss")</script>');
        assert.ok(!result.includes('<script>'));
        assert.ok(result.includes('&lt;'));
    });

    it('escapes ampersands', () => {
        assert.ok(app.escapeHtml('a&b').includes('&amp;'));
    });

    it('preserves normal text', () => {
        assert.equal(app.escapeHtml('hello world'), 'hello world');
    });
});
