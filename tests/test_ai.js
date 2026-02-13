/**
 * Unit tests for AI-Powered Suggestions (Issue #18)
 * Tests: AIService — complete, buildPrompt, suggestHeaders, generateBody,
 *        generateTests, analyzeError, suggestUrl, error handling
 */
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

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
        // The prompt should contain at most 500 chars of the body
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

    it('complete with null prompt works', async () => {
        const { service } = createMockService('response');
        const result = await service.complete(null);
        assert.equal(result.content, 'response');
    });

    it('multiple concurrent calls work', async () => {
        const { service } = createMockService('response');
        const results = await Promise.all([
            service.complete('a'),
            service.complete('b'),
            service.complete('c')
        ]);
        assert.equal(results.length, 3);
        results.forEach(r => assert.equal(r.content, 'response'));
    });
});
