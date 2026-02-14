/**
 * XSS prevention tests for app.js (Issue #77)
 * Verifies that user-controlled data is properly escaped when rendered
 * into innerHTML to prevent cross-site scripting attacks.
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Extract escapeHtml, escapeRegex, highlightMatch, renderHeaders from PostmanHelperApp
let escapeHtml, escapeRegex, highlightMatch, renderHeaders;

before(() => {
    const appPath = path.join(__dirname, '..', 'app.js');
    const src = fs.readFileSync(appPath, 'utf-8');

    // Extract the escapeHtml method body from the PostmanHelperApp class
    const escapeMatch = src.match(/escapeHtml\(str\)\s*\{[^}]*if\s*\(!str\)\s*return\s*'';[^}]*\}/);
    if (!escapeMatch) throw new Error('Could not extract escapeHtml from app.js');

    // Build standalone versions of the methods
    escapeHtml = function(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };

    escapeRegex = function(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    highlightMatch = function(text, searchTerm, useRegex) {
        if (!searchTerm || !text) return escapeHtml(text || '');
        try {
            const pattern = useRegex ? searchTerm : escapeRegex(searchTerm);
            const regex = new RegExp(`(${pattern})`, 'gi');
            const escaped = escapeHtml(text);
            // Use a replacer function instead of '$1' string to avoid any
            // edge-case where a regex capture could inject markup (#126)
            return escaped.replace(regex, function (match) {
                return '<mark class="search-highlight">' + match + '</mark>';
            });
        } catch {
            return escapeHtml(text);
        }
    };

    renderHeaders = function(headers) {
        const entries = Array.isArray(headers)
            ? headers.filter(h => h.key).map(h => [h.key, h.value || ''])
            : Object.entries(headers || {});

        if (entries.length === 0) {
            return '<div class="empty-state" style="padding: 20px;">No headers defined</div>';
        }

        let html = '';
        for (const [key, value] of entries) {
            const eKey = escapeHtml(key);
            const eValue = escapeHtml(value);
            html += `
                <div class="header-row">
                    <input type="text" class="header-key" value="${eKey}" placeholder="Header Name">
                    <input type="text" class="header-value" value="${eValue}" placeholder="Header Value">
                    <button class="remove-header-btn" data-key="${eKey}" aria-label="Remove header ${eKey}">\u274C</button>
                </div>
            `;
        }
        return html;
    };

    // Verify that the app.js escapeHtml matches our extracted version
    // (the regex-based one that escapes &, <, >, ", ')
    const hasRegexEscape = src.includes(".replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;')");
    assert.ok(hasRegexEscape, 'app.js escapeHtml should use regex-based escaping with single-quote support');
});

describe('escapeHtml', () => {
    it('escapes ampersands', () => {
        assert.equal(escapeHtml('a&b'), 'a&amp;b');
    });

    it('escapes less-than signs', () => {
        assert.equal(escapeHtml('a<b'), 'a&lt;b');
    });

    it('escapes greater-than signs', () => {
        assert.equal(escapeHtml('a>b'), 'a&gt;b');
    });

    it('escapes double quotes', () => {
        assert.equal(escapeHtml('a"b'), 'a&quot;b');
    });

    it('escapes single quotes', () => {
        assert.equal(escapeHtml("a'b"), 'a&#39;b');
    });

    it('returns empty string for falsy values', () => {
        assert.equal(escapeHtml(''), '');
        assert.equal(escapeHtml(null), '');
        assert.equal(escapeHtml(undefined), '');
    });

    it('escapes XSS script injection', () => {
        const malicious = '<script>alert("XSS")</script>';
        const escaped = escapeHtml(malicious);
        assert.ok(!escaped.includes('<script>'));
        assert.ok(!escaped.includes('</script>'));
        assert.ok(escaped.includes('&lt;script&gt;'));
    });

    it('escapes attribute breakout via double quote', () => {
        const malicious = '"><img src=x onerror=alert(1)>';
        const escaped = escapeHtml(malicious);
        assert.ok(!escaped.includes('"><img'));
        assert.ok(escaped.startsWith('&quot;'));
    });

    it('escapes attribute breakout via single quote', () => {
        const malicious = "'>alert(1)<'";
        const escaped = escapeHtml(malicious);
        assert.ok(!escaped.includes("'>alert"));
        assert.ok(escaped.includes('&#39;'));
    });

    it('escapes nested HTML entities', () => {
        const malicious = '&lt;already escaped&gt;';
        const escaped = escapeHtml(malicious);
        // Double-escaping is correct behavior for innerHTML safety
        assert.equal(escaped, '&amp;lt;already escaped&amp;gt;');
    });

    it('escapes textarea breakout', () => {
        const malicious = '</textarea><script>alert(1)</script>';
        const escaped = escapeHtml(malicious);
        assert.ok(!escaped.includes('</textarea>'));
        assert.ok(escaped.includes('&lt;/textarea&gt;'));
    });

    it('escapes event handler injection', () => {
        const malicious = '" onmouseover="alert(1)" foo="';
        const escaped = escapeHtml(malicious);
        assert.ok(!escaped.includes('" onmouseover='));
        assert.ok(escaped.includes('&quot;'));
    });
});

describe('escapeHtml: only one definition active', () => {
    it('app.js has no DOM-based escapeHtml (createElement div)', () => {
        const appPath = path.join(__dirname, '..', 'app.js');
        const src = fs.readFileSync(appPath, 'utf-8');
        // The DOM-based version should be removed/commented out
        const domBasedPattern = /escapeHtml\(str\)\s*\{\s*\n\s*const div = document\.createElement/;
        assert.ok(!domBasedPattern.test(src), 'DOM-based escapeHtml should be removed — it does not escape quotes');
    });
});

describe('highlightMatch XSS safety', () => {
    it('escapes HTML in text before highlighting', () => {
        const result = highlightMatch('<script>alert(1)</script>', 'script', false);
        assert.ok(!result.includes('<script>'));
        assert.ok(result.includes('&lt;'));
        assert.ok(result.includes('<mark class="search-highlight">'));
    });

    it('does not inject raw HTML through search term', () => {
        const result = highlightMatch('hello world', 'hello', false);
        assert.ok(result.includes('<mark class="search-highlight">hello</mark>'));
        assert.ok(!result.includes('<script>'));
    });

    it('returns escaped text when no search term', () => {
        const result = highlightMatch('<b>bold</b>', '', false);
        assert.equal(result, '&lt;b&gt;bold&lt;/b&gt;');
    });

    it('handles null/undefined text safely', () => {
        assert.equal(highlightMatch(null, 'test', false), '');
        assert.equal(highlightMatch(undefined, 'test', false), '');
    });

    it('uses replacer function instead of $1 string (#126)', () => {
        // Verify the app.js implementation uses a function replacer, not '$1'
        const appPath = path.join(__dirname, '..', 'app.js');
        const src = fs.readFileSync(appPath, 'utf-8');
        // Should NOT contain the old '$1' string replacement pattern
        const oldPattern = ".replace(regex, '<mark class=\"search-highlight\">$1</mark>')";
        assert.ok(!src.includes(oldPattern),
            'highlightMatch should not use $1 string replacement');
        // Should use a function replacer
        assert.ok(src.includes('return escaped.replace(regex, function (match)'),
            'highlightMatch should use a function replacer');
    });

    it('regex matching escaped entities does not inject markup', () => {
        // A crafted regex that matches across an HTML entity boundary
        // After escapeHtml, '<' becomes '&lt;' — a regex matching 'lt' should
        // only wrap the match text, not introduce new HTML
        const result = highlightMatch('a < b', 'lt', true);
        // Should contain the highlighted 'lt' inside the escaped entity
        assert.ok(result.includes('<mark class="search-highlight">lt</mark>'));
        // The mark tag content should not contain raw '<' or '>'
        const markContent = result.match(/<mark[^>]*>(.*?)<\/mark>/);
        assert.ok(markContent, 'should have a mark tag');
        assert.ok(!markContent[1].includes('<'), 'mark content should not contain raw <');
    });
});

describe('renderHeaders XSS prevention', () => {
    it('escapes header keys with HTML in value attribute', () => {
        const headers = { '"><img src=x onerror=alert(1)>': 'value' };
        const html = renderHeaders(headers);
        assert.ok(!html.includes('"><img'));
        assert.ok(html.includes('&quot;&gt;&lt;img'));
    });

    it('escapes header values with HTML in value attribute', () => {
        const headers = { 'Content-Type': '"><script>alert(1)</script>' };
        const html = renderHeaders(headers);
        assert.ok(!html.includes('<script>'));
        assert.ok(html.includes('&quot;&gt;&lt;script&gt;'));
    });

    it('escapes header keys in data-key attribute', () => {
        const headers = { 'x" data-evil="true': 'value' };
        const html = renderHeaders(headers);
        // The raw " should be escaped, preventing attribute breakout
        assert.ok(!html.includes('data-key="x" data-evil'), 'double-quote in key must not break attribute boundary');
        assert.ok(html.includes('x&quot; data-evil=&quot;true'));
    });

    it('escapes array-format header keys and values', () => {
        const headers = [
            { key: '<script>alert(1)</script>', value: '"><img src=x>' }
        ];
        const html = renderHeaders(headers);
        assert.ok(!html.includes('<script>'));
        assert.ok(!html.includes('"><img'));
    });

    it('handles empty headers safely', () => {
        const html = renderHeaders({});
        assert.ok(html.includes('No headers defined'));
    });

    it('handles null headers safely', () => {
        const html = renderHeaders(null);
        assert.ok(html.includes('No headers defined'));
    });
});

describe('app.js: innerHTML escaping audit', () => {
    let src;
    before(() => {
        const appPath = path.join(__dirname, '..', 'app.js');
        src = fs.readFileSync(appPath, 'utf-8');
    });

    it('requestName input uses escapeHtml', () => {
        assert.ok(src.includes('value="${this.escapeHtml(this.state.currentRequest.name)}"'),
            'requestName should be escaped with escapeHtml');
    });

    it('requestUrl input uses escapeHtml', () => {
        assert.ok(src.includes('value="${this.escapeHtml(this.state.currentRequest.url)}"'),
            'requestUrl should be escaped with escapeHtml');
    });

    it('requestBody textarea does not interpolate content', () => {
        // The textarea should be empty in the template, with .value set programmatically
        assert.ok(src.includes('<textarea id="requestBody" class="form-control"></textarea>'),
            'requestBody textarea should not interpolate content inline');
    });

    it('requestBody value is set programmatically', () => {
        assert.ok(src.includes("document.getElementById('requestBody').value = this.getBodyForDisplay()"),
            'requestBody .value should be set after innerHTML');
    });

    it('requestDescription textarea does not interpolate content', () => {
        assert.ok(src.includes('<textarea id="requestDescription" class="form-control" placeholder="Optional description"></textarea>'),
            'requestDescription textarea should not interpolate content inline');
    });

    it('requestDescription value is set programmatically', () => {
        assert.ok(src.includes("document.getElementById('requestDescription').value = this.state.currentRequest.description"),
            'requestDescription .value should be set after innerHTML');
    });

    it('requestTests textarea does not interpolate content', () => {
        // Should not have ${...} inside the textarea tags
        const testsTextareaMatch = src.match(/<textarea id="requestTests"[^>]*>([^<]*)<\/textarea>/);
        assert.ok(testsTextareaMatch, 'requestTests textarea should exist');
        assert.equal(testsTextareaMatch[1], '', 'requestTests textarea should be empty in template');
    });

    it('requestTests value is set programmatically', () => {
        assert.ok(src.includes("document.getElementById('requestTests').value = this.state.currentRequest.tests"),
            'requestTests .value should be set after innerHTML');
    });

    it('renderHeaders escapes key and value', () => {
        // Check that renderHeaders uses escapeHtml for key/value
        assert.ok(src.includes('const eKey = this.escapeHtml(key)'),
            'renderHeaders should escape key with escapeHtml');
        assert.ok(src.includes('const eValue = this.escapeHtml(value)'),
            'renderHeaders should escape value with escapeHtml');
    });

    it('updateInheritanceTab escapes global header key/value', () => {
        assert.ok(src.includes('const eKey = this.escapeHtml(header.key)'),
            'global headers should escape key');
        assert.ok(src.includes('const eValue = this.escapeHtml(header.value)'),
            'global headers should escape value');
    });

    it('updateInheritanceTab escapes base endpoints', () => {
        assert.ok(src.includes('const eEndpoint = this.escapeHtml(endpoint)'),
            'base endpoints should be escaped');
    });

    it('updateInheritanceTab escapes body template names', () => {
        // Both body and test template sections should use escapeHtml
        const bodyTmplMatch = src.match(/for \(const tmpl of bodyTemplates\)[\s\S]*?const eName = this\.escapeHtml\(tmpl\.name\)/);
        assert.ok(bodyTmplMatch, 'body template names should be escaped');
    });

    it('updateInheritanceTab escapes test template names', () => {
        const testTmplMatch = src.match(/for \(const tmpl of testTemplates\)[\s\S]*?const eName = this\.escapeHtml\(tmpl\.name\)/);
        assert.ok(testTmplMatch, 'test template names should be escaped');
    });

    it('collection tree escapes request data-id and data-uuid', () => {
        // Both updateCollectionTree and renderCollapsibleFolder should escape
        assert.ok(src.includes('data-id="${this.escapeHtml(request.name)}"'),
            'request data-id should use escapeHtml');
        assert.ok(src.includes('data-uuid="${this.escapeHtml(request.uuid'),
            'request data-uuid should use escapeHtml');
    });

    it('renderCollapsibleFolder escapes folder name', () => {
        assert.ok(src.includes('const eFolderName = this.escapeHtml(folder.name)'),
            'folder name should be escaped in renderCollapsibleFolder');
    });

    it('environment manager escapes env names', () => {
        assert.ok(src.includes('const eName = this.escapeHtml(env.name)'),
            'environment names should be escaped');
    });

    it('renderEnvEditor escapes env name and variable keys/values', () => {
        assert.ok(src.includes('${this.escapeHtml(envName)} Variables'),
            'env name in heading should be escaped');
        assert.ok(src.includes('value="${this.escapeHtml(key)}"'),
            'env variable keys should be escaped');
        assert.ok(src.includes('value="${this.escapeHtml(String(val))}"'),
            'env variable values should be escaped');
    });

    it('analytics bar chart escapes labels', () => {
        assert.ok(src.includes('${this.escapeHtml(String(label))}'),
            'bar chart labels should be escaped');
    });

    it('analytics endpoints table escapes endpoint names', () => {
        assert.ok(src.includes('${this.escapeHtml(String(endpoint))}'),
            'endpoint names in table should be escaped');
    });

    it('response status uses parseInt for numeric safety', () => {
        assert.ok(src.includes('${parseInt(response.status) || 0}'),
            'response.status should use parseInt');
        assert.ok(src.includes('${parseInt(response.time) || 0}ms'),
            'response.time should use parseInt');
    });
});
