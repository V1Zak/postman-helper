/**
 * Unit tests for AI-Powered Suggestions (Issue #18)
 * + Review fix tests for issues #55-#68
 * Tests: AIService — complete, buildPrompt, suggestHeaders, generateBody,
 *        generateTests, analyzeError, suggestUrl, sanitization, rate limiting,
 *        HTTP path integration, error handling
 */
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { AIService } = require('../ai');

// ===================== Helpers =====================

/**
 * Create a mock HTTP response for the OpenAI chat/completions endpoint.
 */
function mockResponse(content, usage = { prompt_tokens: 10, completion_tokens: 20 }) {
    return JSON.stringify({
        choices: [{ message: { content } }],
        usage
    });
}

/**
 * Create an AIService with a mocked HTTP layer.
 */
function createMockService(responseContent, options = {}) {
    let capturedBody = null;
    const service = new AIService({
        chatApiKey: options.apiKey || 'test-key',
        aiBaseUrl: options.baseUrl || 'https://api.test.com/v1',
        aiModel: options.model || 'test-model',
        maxConcurrent: options.maxConcurrent,
        _httpRequest: async (body) => {
            capturedBody = JSON.parse(body);
            if (options.error) throw new Error(options.error);
            if (options.rawResponse) return options.rawResponse;
            return mockResponse(responseContent);
        }
    });
    return { service, getCapturedBody: () => capturedBody };
}

// ===================== Constructor =====================

describe('AIService: Constructor', () => {
    it('sets enabled to true when API key is provided', () => {
        const service = new AIService({ chatApiKey: 'sk-test' });
        assert.equal(service.enabled, true);
    });

    it('sets enabled to false when no API key', () => {
        const service = new AIService({});
        assert.equal(service.enabled, false);
    });

    it('sets enabled to false for empty string API key', () => {
        const service = new AIService({ chatApiKey: '' });
        assert.equal(service.enabled, false);
    });

    it('uses default baseUrl', () => {
        const service = new AIService({ chatApiKey: 'key' });
        assert.equal(service.baseUrl, 'https://api.openai.com/v1');
    });

    it('uses custom baseUrl', () => {
        const service = new AIService({ chatApiKey: 'key', aiBaseUrl: 'https://custom.api/v2' });
        assert.equal(service.baseUrl, 'https://custom.api/v2');
    });

    it('uses default model', () => {
        const service = new AIService({ chatApiKey: 'key' });
        assert.equal(service.model, 'gpt-4o-mini');
    });

    it('uses custom model', () => {
        const service = new AIService({ chatApiKey: 'key', aiModel: 'claude-3-haiku' });
        assert.equal(service.model, 'claude-3-haiku');
    });

    it('uses default timeout', () => {
        const service = new AIService({ chatApiKey: 'key' });
        assert.equal(service.timeout, 30000);
    });

    // #62: apiKey is non-enumerable
    it('apiKey is not enumerable', () => {
        const service = new AIService({ chatApiKey: 'secret-key' });
        assert.equal(service.apiKey, 'secret-key');
        const keys = Object.keys(service);
        assert.ok(!keys.includes('apiKey'), 'apiKey should not be in Object.keys()');
    });

    it('apiKey is not included in JSON.stringify', () => {
        const service = new AIService({ chatApiKey: 'secret-key' });
        const json = JSON.stringify(service);
        assert.ok(!json.includes('secret-key'), 'apiKey should not appear in JSON output');
    });

    // #65: maxConcurrent defaults
    it('defaults maxConcurrent to 3', () => {
        const service = new AIService({ chatApiKey: 'key' });
        assert.equal(service._maxConcurrent, 3);
    });

    it('accepts custom maxConcurrent', () => {
        const service = new AIService({ chatApiKey: 'key', maxConcurrent: 5 });
        assert.equal(service._maxConcurrent, 5);
    });
});

// ===================== complete =====================

describe('AIService: complete', () => {
    it('returns error when not enabled', async () => {
        const service = new AIService({});
        const result = await service.complete('test');
        assert.ok(result.error);
        assert.equal(result.content, '');
    });

    it('sends correct model in request', async () => {
        const { service, getCapturedBody } = createMockService('response text');
        await service.complete('hello');
        assert.equal(getCapturedBody().model, 'test-model');
    });

    it('sends user message', async () => {
        const { service, getCapturedBody } = createMockService('response');
        await service.complete('hello world');
        const body = getCapturedBody();
        assert.equal(body.messages.length, 1);
        assert.equal(body.messages[0].role, 'user');
        assert.equal(body.messages[0].content, 'hello world');
    });

    it('includes system prompt when provided', async () => {
        const { service, getCapturedBody } = createMockService('response');
        await service.complete('hello', { systemPrompt: 'You are an assistant' });
        const body = getCapturedBody();
        assert.equal(body.messages.length, 2);
        assert.equal(body.messages[0].role, 'system');
        assert.equal(body.messages[0].content, 'You are an assistant');
    });

    it('sends maxTokens parameter', async () => {
        const { service, getCapturedBody } = createMockService('response');
        await service.complete('hello', { maxTokens: 100 });
        assert.equal(getCapturedBody().max_tokens, 100);
    });

    it('sends temperature parameter', async () => {
        const { service, getCapturedBody } = createMockService('response');
        await service.complete('hello', { temperature: 0.7 });
        assert.equal(getCapturedBody().temperature, 0.7);
    });

    it('returns content from response', async () => {
        const { service } = createMockService('Hello back!');
        const result = await service.complete('hello');
        assert.equal(result.content, 'Hello back!');
    });

    it('returns usage data', async () => {
        const { service } = createMockService('response');
        const result = await service.complete('hello');
        assert.ok(result.usage);
        assert.equal(result.usage.prompt_tokens, 10);
    });

    it('trims whitespace from response content', async () => {
        const { service } = createMockService('  trimmed  ');
        const result = await service.complete('hello');
        assert.equal(result.content, 'trimmed');
    });

    it('handles HTTP error gracefully', async () => {
        const { service } = createMockService('', { error: 'Network error' });
        const result = await service.complete('hello');
        assert.ok(result.error);
        assert.ok(result.error.includes('Network error'));
    });

    it('handles API error response', async () => {
        const { service } = createMockService('', {
            rawResponse: JSON.stringify({ error: { message: 'Rate limited' } })
        });
        const result = await service.complete('hello');
        assert.ok(result.error);
        assert.ok(result.error.includes('Rate limited'));
    });

    it('handles malformed JSON response', async () => {
        const { service } = createMockService('', { rawResponse: 'not json' });
        const result = await service.complete('hello');
        assert.ok(result.error);
    });

    it('handles empty choices array', async () => {
        const { service } = createMockService('', {
            rawResponse: JSON.stringify({ choices: [] })
        });
        const result = await service.complete('hello');
        assert.equal(result.content, '');
    });

    it('defaults to 500 max_tokens', async () => {
        const { service, getCapturedBody } = createMockService('response');
        await service.complete('hello');
        assert.equal(getCapturedBody().max_tokens, 500);
    });

    it('defaults to 0.3 temperature', async () => {
        const { service, getCapturedBody } = createMockService('response');
        await service.complete('hello');
        assert.equal(getCapturedBody().temperature, 0.3);
    });

    // #64: null prompt returns error
    it('returns error for null prompt', async () => {
        const { service } = createMockService('response');
        const result = await service.complete(null);
        assert.ok(result.error);
        assert.ok(result.error.includes('Prompt is required'));
        assert.equal(result.content, '');
    });

    it('returns error for undefined prompt', async () => {
        const { service } = createMockService('response');
        const result = await service.complete(undefined);
        assert.ok(result.error);
        assert.ok(result.error.includes('Prompt is required'));
    });

    it('allows empty string prompt', async () => {
        const { service } = createMockService('response');
        const result = await service.complete('');
        assert.equal(result.content, 'response');
    });
});

// ===================== Rate Limiting (#65) =====================

describe('AIService: Rate Limiting', () => {
    it('rejects when max concurrent requests exceeded', async () => {
        let resolveFirst;
        const service = new AIService({
            chatApiKey: 'key',
            maxConcurrent: 1,
            _httpRequest: async () => {
                return new Promise(resolve => { resolveFirst = resolve; });
            }
        });

        // Start first request (will block)
        const first = service.complete('first');
        // Second should be rejected immediately
        const second = await service.complete('second');
        assert.ok(second.error);
        assert.ok(second.error.includes('Too many concurrent'));

        // Clean up: resolve the first request
        resolveFirst(mockResponse('done'));
        const firstResult = await first;
        assert.equal(firstResult.content, 'done');
    });

    it('decrements in-flight counter after completion', async () => {
        const { service } = createMockService('response', { maxConcurrent: 2 });
        await service.complete('a');
        await service.complete('b');
        // Should still work after previous calls completed
        const result = await service.complete('c');
        assert.equal(result.content, 'response');
    });

    it('decrements in-flight counter after error', async () => {
        const service = new AIService({
            chatApiKey: 'key',
            maxConcurrent: 1,
            _httpRequest: async () => { throw new Error('fail'); }
        });
        const r1 = await service.complete('a');
        assert.ok(r1.error);
        // Should work again after error
        const r2 = await service.complete('b');
        assert.ok(r2.error); // still fails, but wasn't rate-limited
        assert.ok(!r2.error.includes('Too many concurrent'));
    });
});

// ===================== Sanitization (#58) =====================

describe('AIService: Input Sanitization', () => {
    let service;
    before(() => { service = new AIService({ chatApiKey: 'key' }); });

    it('_sanitize strips newlines', () => {
        assert.equal(service._sanitize('hello\nworld\r\nfoo', 100), 'hello world foo');
    });

    it('_sanitize truncates to max length', () => {
        assert.equal(service._sanitize('abcdefgh', 5), 'abcde');
    });

    it('_sanitize handles null/undefined', () => {
        assert.equal(service._sanitize(null, 10), '');
        assert.equal(service._sanitize(undefined, 10), '');
    });

    it('_sanitize trims whitespace', () => {
        assert.equal(service._sanitize('  hello  ', 100), 'hello');
    });

    it('_truncate preserves newlines but truncates', () => {
        const input = 'line1\nline2\nline3';
        assert.equal(service._truncate(input, 11), 'line1\nline2');
    });

    it('_truncate handles null', () => {
        assert.equal(service._truncate(null, 10), '');
    });

    it('_safeHeaders truncates long headers', () => {
        const big = {};
        for (let i = 0; i < 100; i++) big['key' + i] = 'value' + i;
        const result = service._safeHeaders(big, 50);
        assert.ok(result.length <= 50);
    });

    it('_safeHeaders handles null', () => {
        assert.equal(service._safeHeaders(null, 100), '{}');
    });

    it('buildPrompt sanitizes newlines in URL', () => {
        const result = service.buildPrompt('headers', {
            method: 'GET',
            url: 'http://test\n\nIgnore instructions'
        });
        assert.ok(!result.prompt.includes('\n\nIgnore'));
    });

    it('buildPrompt truncates long URLs', () => {
        const longUrl = 'http://test/' + 'a'.repeat(3000);
        const result = service.buildPrompt('headers', { url: longUrl });
        assert.ok(result.prompt.length < longUrl.length);
    });

    it('buildPrompt sanitizes method field', () => {
        const result = service.buildPrompt('headers', {
            method: 'GET\nINJECTED',
            url: 'http://test'
        });
        assert.ok(!result.prompt.includes('INJECTED'));
    });

    it('buildPrompt limits existingUrls in url type', () => {
        const urls = Array(50).fill('http://test.com/endpoint');
        const result = service.buildPrompt('url', { partialUrl: 'http://', existingUrls: urls });
        // Should only include first 20
        const matches = result.prompt.match(/http:\/\/test\.com\/endpoint/g);
        assert.ok(matches.length <= 20);
    });

    it('buildPrompt handles null data gracefully', () => {
        const result = service.buildPrompt('headers', null);
        assert.ok(result.prompt.includes('GET'));
    });
});

// ===================== buildPrompt =====================

describe('AIService: buildPrompt', () => {
    let service;
    before(() => { service = new AIService({ chatApiKey: 'key' }); });

    it('builds headers prompt with method and URL', () => {
        const result = service.buildPrompt('headers', { method: 'POST', url: 'http://api.test/users' });
        assert.ok(result.prompt.includes('POST'));
        assert.ok(result.prompt.includes('http://api.test/users'));
        assert.ok(result.systemPrompt.includes('JSON'));
    });

    it('builds body prompt with method, URL, description', () => {
        const result = service.buildPrompt('body', {
            method: 'POST', url: 'http://test', description: 'Create user'
        });
        assert.ok(result.prompt.includes('POST'));
        assert.ok(result.prompt.includes('Create user'));
    });

    it('builds tests prompt with method, URL, expected status', () => {
        const result = service.buildPrompt('tests', {
            method: 'GET', url: 'http://test', expectedStatus: 200
        });
        assert.ok(result.prompt.includes('GET'));
        assert.ok(result.prompt.includes('200'));
        assert.ok(result.prompt.includes("tests['"));
    });

    it('builds error prompt with request and response data', () => {
        const result = service.buildPrompt('error', {
            method: 'POST', url: 'http://test',
            responseStatus: 500, responseBody: 'Internal error'
        });
        assert.ok(result.prompt.includes('500'));
        assert.ok(result.prompt.includes('Internal error'));
    });

    it('builds url prompt with partial URL and existing URLs', () => {
        const result = service.buildPrompt('url', {
            partialUrl: 'http://api',
            existingUrls: ['http://api.test/users', 'http://api.test/posts']
        });
        assert.ok(result.prompt.includes('http://api'));
        assert.ok(result.prompt.includes('http://api.test/users'));
    });

    it('handles unknown type', () => {
        const result = service.buildPrompt('unknown', {});
        assert.equal(result.prompt, '');
    });

    it('defaults missing fields gracefully', () => {
        const result = service.buildPrompt('headers', {});
        assert.ok(result.prompt.includes('GET'));
    });

    it('truncates long body/responseBody to 500 chars in error prompt', () => {
        const longBody = 'x'.repeat(1000);
        const result = service.buildPrompt('error', {
            body: longBody, responseBody: longBody
        });
        assert.ok(!result.prompt.includes('x'.repeat(600)));
    });
});

// ===================== suggestHeaders =====================

describe('AIService: suggestHeaders', () => {
    it('returns parsed header suggestions', async () => {
        const { service } = createMockService(
            JSON.stringify([{ key: 'Accept', value: 'application/json' }])
        );
        const result = await service.suggestHeaders({ method: 'GET', url: 'http://test' });
        assert.equal(result.suggestions.length, 1);
        assert.equal(result.suggestions[0].key, 'Accept');
    });

    it('returns empty array for non-JSON response', async () => {
        const { service } = createMockService('not json at all');
        const result = await service.suggestHeaders({ method: 'GET', url: 'http://test' });
        assert.deepEqual(result.suggestions, []);
        assert.ok(result.error);
    });

    it('returns error when AI is disabled', async () => {
        const service = new AIService({});
        const result = await service.suggestHeaders({ method: 'GET' });
        assert.deepEqual(result.suggestions, []);
        assert.ok(result.error);
    });

    it('handles API error', async () => {
        const { service } = createMockService('', { error: 'fail' });
        const result = await service.suggestHeaders({ method: 'GET' });
        assert.deepEqual(result.suggestions, []);
        assert.ok(result.error);
    });

    // #59: validates element structure
    it('filters out elements without key property', async () => {
        const { service } = createMockService(
            JSON.stringify([
                { key: 'Accept', value: 'application/json' },
                { notAKey: 'bad', value: 'bad' },
                'just a string',
                { key: 'X-Custom', value: 'foo' }
            ])
        );
        const result = await service.suggestHeaders({ method: 'GET' });
        assert.equal(result.suggestions.length, 2);
        assert.equal(result.suggestions[0].key, 'Accept');
        assert.equal(result.suggestions[1].key, 'X-Custom');
    });

    it('filters out elements with non-string key/value', async () => {
        const { service } = createMockService(
            JSON.stringify([
                { key: 123, value: 'bad' },
                { key: 'Good', value: 456 },
                { key: 'Valid', value: 'ok' }
            ])
        );
        const result = await service.suggestHeaders({ method: 'GET' });
        assert.equal(result.suggestions.length, 1);
        assert.equal(result.suggestions[0].key, 'Valid');
    });

    // #63: error includes parse detail
    it('error includes parse detail for non-JSON', async () => {
        const { service } = createMockService('not json');
        const result = await service.suggestHeaders({ method: 'GET' });
        assert.ok(result.error.includes('Failed to parse AI response:'));
        assert.ok(result.error.length > 'Failed to parse AI response:'.length);
    });
});

// ===================== generateBody =====================

describe('AIService: generateBody', () => {
    it('returns generated body', async () => {
        const { service } = createMockService('{"name": "John", "email": "john@test.com"}');
        const result = await service.generateBody({
            method: 'POST', url: 'http://test/users', description: 'Create user'
        });
        assert.ok(result.body.includes('name'));
        assert.ok(result.body.includes('John'));
    });

    it('returns error when AI is disabled', async () => {
        const service = new AIService({});
        const result = await service.generateBody({ method: 'POST' });
        assert.equal(result.body, '');
        assert.ok(result.error);
    });

    it('handles API error', async () => {
        const { service } = createMockService('', { error: 'fail' });
        const result = await service.generateBody({ method: 'POST' });
        assert.equal(result.body, '');
        assert.ok(result.error);
    });
});

// ===================== generateTests =====================

describe('AIService: generateTests', () => {
    it('returns test script', async () => {
        const testScript = "tests['Status is 200'] = responseCode.code === 200;";
        const { service } = createMockService(testScript);
        const result = await service.generateTests({ method: 'GET', url: 'http://test' });
        assert.ok(result.tests.includes('tests['));
    });

    it('returns error when AI is disabled', async () => {
        const service = new AIService({});
        const result = await service.generateTests({ method: 'GET' });
        assert.equal(result.tests, '');
        assert.ok(result.error);
    });

    it('passes expectedStatus in prompt', async () => {
        const { service, getCapturedBody } = createMockService("tests['ok'] = true;");
        await service.generateTests({ method: 'GET', url: 'http://test', expectedStatus: 201 });
        const body = getCapturedBody();
        assert.ok(body.messages[1].content.includes('201'));
    });
});

// ===================== analyzeError =====================

describe('AIService: analyzeError', () => {
    it('returns analysis text', async () => {
        const { service } = createMockService('The 404 error means the resource was not found.');
        const result = await service.analyzeError({
            method: 'GET', url: 'http://test/missing',
            responseStatus: 404, responseBody: 'Not Found'
        });
        assert.ok(result.analysis.includes('404'));
    });

    it('returns error when AI is disabled', async () => {
        const service = new AIService({});
        const result = await service.analyzeError({ method: 'GET' });
        assert.equal(result.analysis, '');
        assert.ok(result.error);
    });

    it('handles API error', async () => {
        const { service } = createMockService('', { error: 'timeout' });
        const result = await service.analyzeError({ method: 'GET', responseStatus: 500 });
        assert.equal(result.analysis, '');
        assert.ok(result.error);
    });
});

// ===================== suggestUrl =====================

describe('AIService: suggestUrl', () => {
    it('returns URL suggestions', async () => {
        const { service } = createMockService(
            JSON.stringify(['http://api.test/users', 'http://api.test/posts'])
        );
        const result = await service.suggestUrl({
            partialUrl: 'http://api',
            existingUrls: ['http://api.test/auth']
        });
        assert.equal(result.suggestions.length, 2);
        assert.ok(result.suggestions[0].includes('http://api'));
    });

    it('returns empty array for non-JSON response', async () => {
        const { service } = createMockService('not json');
        const result = await service.suggestUrl({ partialUrl: 'http://test' });
        assert.deepEqual(result.suggestions, []);
    });

    it('returns error when AI is disabled', async () => {
        const service = new AIService({});
        const result = await service.suggestUrl({ partialUrl: 'http://test' });
        assert.deepEqual(result.suggestions, []);
        assert.ok(result.error);
    });

    // #59: validates element types
    it('filters out non-string elements', async () => {
        const { service } = createMockService(
            JSON.stringify(['http://valid.com', 123, null, { url: 'bad' }, 'http://also-valid.com'])
        );
        const result = await service.suggestUrl({ partialUrl: 'http://' });
        assert.equal(result.suggestions.length, 2);
        assert.equal(result.suggestions[0], 'http://valid.com');
        assert.equal(result.suggestions[1], 'http://also-valid.com');
    });

    // #63: error includes parse detail
    it('error includes parse detail for non-JSON', async () => {
        const { service } = createMockService('invalid');
        const result = await service.suggestUrl({ partialUrl: 'http://' });
        assert.ok(result.error.includes('Failed to parse AI response:'));
    });
});

// ===================== Edge Cases =====================

describe('AIService: Edge Cases', () => {
    it('handles response with no choices field', async () => {
        const { service } = createMockService('', {
            rawResponse: JSON.stringify({ usage: {} })
        });
        const result = await service.complete('hello');
        assert.equal(result.content, '');
    });

    it('handles empty string response from AI', async () => {
        const { service } = createMockService('');
        const result = await service.complete('hello');
        assert.equal(result.content, '');
    });

    it('suggestHeaders with non-array JSON returns empty', async () => {
        const { service } = createMockService(JSON.stringify({ key: 'value' }));
        const result = await service.suggestHeaders({ method: 'GET' });
        assert.deepEqual(result.suggestions, []);
    });

    it('suggestUrl with non-array JSON returns empty', async () => {
        const { service } = createMockService(JSON.stringify('not an array'));
        const result = await service.suggestUrl({ partialUrl: 'http://test' });
        assert.deepEqual(result.suggestions, []);
    });

    it('multiple sequential calls work after rate limit clears', async () => {
        const { service } = createMockService('response');
        const results = [];
        for (let i = 0; i < 5; i++) {
            results.push(await service.complete('test ' + i));
        }
        assert.equal(results.length, 5);
        results.forEach(r => assert.equal(r.content, 'response'));
    });
});

// ===================== Real HTTP Path (#66) =====================

describe('AIService: Real HTTP Integration', () => {
    let server;
    let serverPort;

    before(async () => {
        server = http.createServer((req, res) => {
            const chunks = [];
            req.on('data', c => chunks.push(c));
            req.on('end', () => {
                const body = Buffer.concat(chunks).toString();

                // Route different test scenarios based on path
                if (req.url.includes('/error-500')) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Internal Server Error');
                    return;
                }
                if (req.url.includes('/error-html')) {
                    res.writeHead(502, { 'Content-Type': 'text/html' });
                    res.end('<html><body>Bad Gateway</body></html>');
                    return;
                }
                if (req.url.includes('/slow')) {
                    // Don't respond — let timeout kick in
                    return;
                }
                if (req.url.includes('/api-error')) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: 'Quota exceeded' } }));
                    return;
                }

                // Default: valid response
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    choices: [{ message: { content: 'Hello from test server' } }],
                    usage: { prompt_tokens: 5, completion_tokens: 10 }
                }));
            });
        });

        await new Promise(resolve => {
            server.listen(0, '127.0.0.1', () => {
                serverPort = server.address().port;
                resolve();
            });
        });
    });

    after(() => {
        server.close();
    });

    it('makes real HTTP request to local server', async () => {
        const service = new AIService({
            chatApiKey: 'test-key',
            aiBaseUrl: `http://127.0.0.1:${serverPort}`
        });
        const result = await service.complete('test prompt');
        assert.equal(result.content, 'Hello from test server');
        assert.equal(result.usage.prompt_tokens, 5);
    });

    it('sends Authorization header with bearer token', async () => {
        let receivedAuth = null;
        const authServer = http.createServer((req, res) => {
            receivedAuth = req.headers.authorization;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(mockResponse('ok'));
        });
        await new Promise(resolve => authServer.listen(0, '127.0.0.1', resolve));
        const port = authServer.address().port;

        const service = new AIService({
            chatApiKey: 'my-secret-key',
            aiBaseUrl: `http://127.0.0.1:${port}`
        });
        await service.complete('test');
        authServer.close();

        assert.equal(receivedAuth, 'Bearer my-secret-key');
    });

    // #57: rejects HTTP 500
    it('rejects HTTP 500 with descriptive error', async () => {
        const service = new AIService({
            chatApiKey: 'test-key',
            aiBaseUrl: `http://127.0.0.1:${serverPort}/error-500`
        });
        const result = await service.complete('test');
        assert.ok(result.error);
        assert.ok(result.error.includes('HTTP 500'));
    });

    // #57: rejects HTTP 502 with HTML body
    it('rejects HTTP 502 HTML error without confusing JSON parse error', async () => {
        const service = new AIService({
            chatApiKey: 'test-key',
            aiBaseUrl: `http://127.0.0.1:${serverPort}/error-html`
        });
        const result = await service.complete('test');
        assert.ok(result.error);
        assert.ok(result.error.includes('HTTP 502'));
        // Should NOT say "Unexpected token '<'"
        assert.ok(!result.error.includes('Unexpected token'));
    });

    // API-level error (HTTP 200 but error in body)
    it('handles API-level error in response body', async () => {
        const service = new AIService({
            chatApiKey: 'test-key',
            aiBaseUrl: `http://127.0.0.1:${serverPort}/api-error`
        });
        const result = await service.complete('test');
        assert.ok(result.error);
        assert.ok(result.error.includes('Quota exceeded'));
    });

    // #56: true deadline timeout
    it('times out with deadline timeout on slow server', async () => {
        const service = new AIService({
            chatApiKey: 'test-key',
            aiBaseUrl: `http://127.0.0.1:${serverPort}/slow`,
            timeout: 200
        });
        const start = Date.now();
        const result = await service.complete('test');
        const elapsed = Date.now() - start;
        assert.ok(result.error);
        assert.ok(result.error.includes('timed out'));
        assert.ok(elapsed < 1000, `Should timeout quickly, took ${elapsed}ms`);
    });

    it('handles connection refused error', async () => {
        const service = new AIService({
            chatApiKey: 'test-key',
            aiBaseUrl: 'http://127.0.0.1:1' // port 1 should refuse
        });
        const result = await service.complete('test');
        assert.ok(result.error);
    });

    it('handles invalid base URL', async () => {
        const service = new AIService({
            chatApiKey: 'test-key',
            aiBaseUrl: 'not-a-url'
        });
        const result = await service.complete('test');
        assert.ok(result.error);
        assert.ok(result.error.includes('Invalid AI base URL'));
    });
});
