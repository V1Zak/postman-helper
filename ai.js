// Postman Helper — AI Service (provider-agnostic)
// Supports OpenAI, Anthropic, or any OpenAI-compatible API endpoint

const https = require('https');
const http = require('http');

class AIService {
    constructor(config = {}) {
        this.apiKey = config.chatApiKey || '';
        this.baseUrl = config.aiBaseUrl || 'https://api.openai.com/v1';
        this.model = config.aiModel || 'gpt-4o-mini';
        this.enabled = !!this.apiKey;
        this.timeout = config.timeout || 30000;

        // Allow injecting a custom HTTP request function (for testing)
        this._httpRequest = config._httpRequest || null;
    }

    /**
     * Send a chat completion request to the AI provider.
     * @param {string} prompt — user message
     * @param {object} options — { maxTokens, temperature, systemPrompt }
     * @returns {Promise<{ content: string, usage?: object }>}
     */
    async complete(prompt, options = {}) {
        if (!this.enabled) {
            return { content: '', error: 'AI not configured. Set CHAT_API_KEY in .env' };
        }

        const { maxTokens = 500, temperature = 0.3, systemPrompt } = options;

        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: prompt });

        const requestBody = JSON.stringify({
            model: this.model,
            messages,
            max_tokens: maxTokens,
            temperature
        });

        try {
            const responseData = await this._makeRequest(requestBody);
            const parsed = JSON.parse(responseData);

            if (parsed.error) {
                return { content: '', error: parsed.error.message || 'API error' };
            }

            const content = parsed.choices && parsed.choices[0] && parsed.choices[0].message
                ? parsed.choices[0].message.content
                : '';

            return { content: content.trim(), usage: parsed.usage || null };
        } catch (err) {
            return { content: '', error: err.message };
        }
    }

    /**
     * Low-level HTTP request. Can be overridden via _httpRequest for testing.
     */
    _makeRequest(body) {
        if (this._httpRequest) {
            return this._httpRequest(body);
        }

        return new Promise((resolve, reject) => {
            let parsedUrl;
            try {
                parsedUrl = new URL(this.baseUrl + '/chat/completions');
            } catch (e) {
                return reject(new Error(`Invalid AI base URL: ${this.baseUrl}`));
            }

            const httpModule = parsedUrl.protocol === 'https:' ? https : http;

            const req = httpModule.request({
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                path: parsedUrl.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Length': Buffer.byteLength(body)
                }
            }, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
            });

            req.setTimeout(this.timeout, () => {
                req.destroy();
                reject(new Error('AI request timed out'));
            });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }

    // ===================== High-level suggestion methods =====================

    /**
     * Build the request payload for complete() — exposed for testing.
     */
    buildPrompt(type, data) {
        switch (type) {
            case 'headers':
                return {
                    prompt: `Given this API request:\nMethod: ${data.method || 'GET'}\nURL: ${data.url || ''}\nExisting headers: ${JSON.stringify(data.headers || {})}\n\nSuggest additional HTTP headers that would be appropriate. Return ONLY a JSON array of {key, value} objects, no explanation.`,
                    systemPrompt: 'You are an API development assistant. Return only valid JSON.',
                    maxTokens: 300
                };
            case 'body':
                return {
                    prompt: `Generate a sample JSON request body for:\nMethod: ${data.method || 'POST'}\nURL: ${data.url || ''}\nHeaders: ${JSON.stringify(data.headers || {})}\nDescription: ${data.description || 'No description provided'}\n\nReturn ONLY valid JSON, no explanation.`,
                    systemPrompt: 'You are an API development assistant. Return only valid JSON.',
                    maxTokens: 500
                };
            case 'tests':
                return {
                    prompt: `Generate Postman-style test scripts for:\nMethod: ${data.method || 'GET'}\nURL: ${data.url || ''}\nExpected status: ${data.expectedStatus || 200}\n\nUse the format: tests['Test Name'] = expression;\nInclude status code, response time, and content type checks.\nReturn ONLY the test script code, no explanation.`,
                    systemPrompt: 'You are an API testing expert. Return only JavaScript test code.',
                    maxTokens: 400
                };
            case 'error':
                return {
                    prompt: `Analyze this API error:\nRequest: ${data.method || 'GET'} ${data.url || ''}\nHeaders: ${JSON.stringify(data.headers || {})}\nBody: ${(data.body || 'none').substring(0, 500)}\nResponse Status: ${data.responseStatus || 'unknown'}\nResponse Body: ${(data.responseBody || '').substring(0, 500)}\n\nProvide a brief diagnosis and suggested fix.`,
                    systemPrompt: 'You are an API debugging expert. Be concise.',
                    maxTokens: 300
                };
            case 'url':
                return {
                    prompt: `I'm typing an API URL that starts with: "${data.partialUrl || ''}"\nExisting URLs in my collection:\n${(data.existingUrls || []).join('\n')}\n\nSuggest 3-5 likely URL completions. Return ONLY a JSON array of strings.`,
                    systemPrompt: 'You are an API development assistant. Return only valid JSON.',
                    maxTokens: 200
                };
            default:
                return { prompt: '', systemPrompt: '', maxTokens: 500 };
        }
    }

    /**
     * Suggest additional HTTP headers for a request.
     */
    async suggestHeaders(data) {
        const { prompt, systemPrompt, maxTokens } = this.buildPrompt('headers', data);
        const result = await this.complete(prompt, { systemPrompt, maxTokens });
        if (result.error) return { suggestions: [], error: result.error };
        try {
            const parsed = JSON.parse(result.content);
            return { suggestions: Array.isArray(parsed) ? parsed : [] };
        } catch {
            return { suggestions: [], error: 'Failed to parse AI response' };
        }
    }

    /**
     * Generate a sample request body.
     */
    async generateBody(data) {
        const { prompt, systemPrompt, maxTokens } = this.buildPrompt('body', data);
        const result = await this.complete(prompt, { systemPrompt, maxTokens });
        if (result.error) return { body: '', error: result.error };
        return { body: result.content };
    }

    /**
     * Generate Postman-style test scripts.
     */
    async generateTests(data) {
        const { prompt, systemPrompt, maxTokens } = this.buildPrompt('tests', data);
        const result = await this.complete(prompt, { systemPrompt, maxTokens });
        if (result.error) return { tests: '', error: result.error };
        return { tests: result.content };
    }

    /**
     * Analyze an API error and suggest fixes.
     */
    async analyzeError(data) {
        const { prompt, systemPrompt, maxTokens } = this.buildPrompt('error', data);
        const result = await this.complete(prompt, { systemPrompt, maxTokens });
        if (result.error) return { analysis: '', error: result.error };
        return { analysis: result.content };
    }

    /**
     * Suggest URL completions based on partial input and collection context.
     */
    async suggestUrl(data) {
        const { prompt, systemPrompt, maxTokens } = this.buildPrompt('url', data);
        const result = await this.complete(prompt, { systemPrompt, maxTokens });
        if (result.error) return { suggestions: [], error: result.error };
        try {
            const parsed = JSON.parse(result.content);
            return { suggestions: Array.isArray(parsed) ? parsed : [] };
        } catch {
            return { suggestions: [], error: 'Failed to parse AI response' };
        }
    }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AIService };
}
