// Postman Helper — AI Service (provider-agnostic)
// Supports OpenAI, Anthropic, or any OpenAI-compatible API endpoint

const https = require('https');
const http = require('http');

// Input limits for prompt sanitization (#58)
const INPUT_LIMITS = {
    method: 10,
    url: 2000,
    description: 500,
    body: 500,
    responseBody: 500,
    headers: 2000,
    partialUrl: 500
};

class AIService {
    constructor(config = {}) {
        // Store API key as non-enumerable to prevent accidental serialization (#62)
        Object.defineProperty(this, 'apiKey', {
            value: config.chatApiKey || '',
            enumerable: false,
            writable: false,
            configurable: true
        });
        this.baseUrl = config.aiBaseUrl || 'https://api.openai.com/v1';
        this.model = config.aiModel || 'gpt-4o-mini';
        this.enabled = !!this.apiKey;
        this.timeout = config.timeout || 30000;
        this._maxConcurrent = config.maxConcurrent || 3;
        this._inFlight = 0;

        // Allow injecting a custom HTTP request function (for testing)
        this._httpRequest = config._httpRequest || null;
    }

    // ===================== Input sanitization (#58) =====================

    /**
     * Sanitize a single-line input: strip newlines, trim, truncate.
     */
    _sanitize(value, maxLen) {
        if (value == null) return '';
        const str = String(value).replace(/[\r\n]+/g, ' ').trim();
        return str.length > maxLen ? str.substring(0, maxLen) : str;
    }

    /**
     * Truncate a multi-line input (body, response) preserving newlines.
     */
    _truncate(value, maxLen) {
        if (value == null) return '';
        const str = String(value);
        return str.length > maxLen ? str.substring(0, maxLen) : str;
    }

    /**
     * Safely stringify headers, truncated to limit.
     */
    _safeHeaders(headers, maxLen) {
        try {
            const str = JSON.stringify(headers || {});
            return str.length > maxLen ? str.substring(0, maxLen) : str;
        } catch {
            return '{}';
        }
    }

    // ===================== Core API =====================

    /**
     * Send a chat completion request to the AI provider.
     * @param {string} prompt — user message
     * @param {object} options — { maxTokens, temperature, systemPrompt }
     * @returns {Promise<{ content: string, usage?: object, error?: string }>}
     */
    async complete(prompt, options = {}) {
        if (!this.enabled) {
            return { content: '', error: 'AI not configured. Set CHAT_API_KEY in .env' };
        }

        // Guard against null/undefined prompt (#64)
        if (prompt == null) {
            return { content: '', error: 'Prompt is required' };
        }

        // Concurrency guard (#65)
        if (this._inFlight >= this._maxConcurrent) {
            return { content: '', error: 'Too many concurrent AI requests' };
        }

        this._inFlight++;
        try {
            const { maxTokens = 500, temperature = 0.3, systemPrompt } = options;

            const messages = [];
            if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
            messages.push({ role: 'user', content: String(prompt) });

            const requestBody = JSON.stringify({
                model: this.model,
                messages,
                max_tokens: maxTokens,
                temperature
            });

            const responseData = await this._makeRequest(requestBody);
            const parsed = JSON.parse(responseData);

            if (parsed.error) {
                return { content: '', error: parsed.error.message || 'API error' };
            }

            const content = parsed.choices && parsed.choices[0] && parsed.choices[0].message
                ? parsed.choices[0].message.content
                : '';

            return { content: (content || '').trim(), usage: parsed.usage || null };
        } catch (err) {
            return { content: '', error: err.message };
        } finally {
            this._inFlight--;
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
            let settled = false;

            // True deadline timeout, not idle timeout (#56)
            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    req.destroy();
                    reject(new Error('AI request timed out'));
                }
            }, this.timeout);

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
                res.on('end', () => {
                    clearTimeout(timer);
                    if (settled) return;
                    settled = true;
                    const responseBody = Buffer.concat(chunks).toString('utf-8');
                    // Check HTTP status code (#57)
                    if (res.statusCode >= 400) {
                        reject(new Error(`AI API returned HTTP ${res.statusCode}: ${responseBody.substring(0, 200)}`));
                    } else {
                        resolve(responseBody);
                    }
                });
            });

            req.on('error', (err) => {
                clearTimeout(timer);
                if (settled) return;
                settled = true;
                reject(err);
            });

            req.write(body);
            req.end();
        });
    }

    // ===================== High-level suggestion methods =====================

    /**
     * Build the request payload for complete() — exposed for testing.
     * All user inputs are sanitized and truncated (#58).
     */
    buildPrompt(type, data = {}) {
        const d = data || {};
        switch (type) {
            case 'headers':
                return {
                    prompt: `Given this API request:\nMethod: ${this._sanitize(d.method, INPUT_LIMITS.method) || 'GET'}\nURL: ${this._sanitize(d.url, INPUT_LIMITS.url)}\nExisting headers: ${this._safeHeaders(d.headers, INPUT_LIMITS.headers)}\n\nSuggest additional HTTP headers that would be appropriate. Return ONLY a JSON array of {key, value} objects, no explanation.`,
                    systemPrompt: 'You are an API development assistant. Return only valid JSON.',
                    maxTokens: 300
                };
            case 'body':
                return {
                    prompt: `Generate a sample JSON request body for:\nMethod: ${this._sanitize(d.method, INPUT_LIMITS.method) || 'POST'}\nURL: ${this._sanitize(d.url, INPUT_LIMITS.url)}\nHeaders: ${this._safeHeaders(d.headers, INPUT_LIMITS.headers)}\nDescription: ${this._sanitize(d.description, INPUT_LIMITS.description) || 'No description provided'}\n\nReturn ONLY valid JSON, no explanation.`,
                    systemPrompt: 'You are an API development assistant. Return only valid JSON.',
                    maxTokens: 500
                };
            case 'tests':
                return {
                    prompt: `Generate Postman-style test scripts for:\nMethod: ${this._sanitize(d.method, INPUT_LIMITS.method) || 'GET'}\nURL: ${this._sanitize(d.url, INPUT_LIMITS.url)}\nExpected status: ${this._sanitize(String(d.expectedStatus || 200), 5)}\n\nUse the format: tests['Test Name'] = expression;\nInclude status code, response time, and content type checks.\nReturn ONLY the test script code, no explanation.`,
                    systemPrompt: 'You are an API testing expert. Return only JavaScript test code.',
                    maxTokens: 400
                };
            case 'error':
                return {
                    prompt: `Analyze this API error:\nRequest: ${this._sanitize(d.method, INPUT_LIMITS.method) || 'GET'} ${this._sanitize(d.url, INPUT_LIMITS.url)}\nHeaders: ${this._safeHeaders(d.headers, INPUT_LIMITS.headers)}\nBody: ${this._truncate(d.body || 'none', INPUT_LIMITS.body)}\nResponse Status: ${this._sanitize(String(d.responseStatus || 'unknown'), 10)}\nResponse Body: ${this._truncate(d.responseBody || '', INPUT_LIMITS.responseBody)}\n\nProvide a brief diagnosis and suggested fix.`,
                    systemPrompt: 'You are an API debugging expert. Be concise.',
                    maxTokens: 300
                };
            case 'url':
                return {
                    prompt: `I'm typing an API URL that starts with: "${this._sanitize(d.partialUrl, INPUT_LIMITS.partialUrl)}"\nExisting URLs in my collection:\n${(d.existingUrls || []).slice(0, 20).map(u => this._sanitize(u, INPUT_LIMITS.url)).join('\n')}\n\nSuggest 3-5 likely URL completions. Return ONLY a JSON array of strings.`,
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
            if (!Array.isArray(parsed)) return { suggestions: [] };
            // Validate element structure (#59)
            const validated = parsed.filter(item =>
                item && typeof item === 'object' && typeof item.key === 'string' && typeof item.value === 'string'
            );
            return { suggestions: validated };
        } catch (e) {
            // Include parse error detail (#63)
            return { suggestions: [], error: 'Failed to parse AI response: ' + e.message };
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
     * Test the connection to the AI provider with a minimal request.
     * @returns {Promise<{ success: boolean, model: string, error?: string }>}
     */
    async testConnection() {
        if (!this.enabled) {
            return { success: false, model: this.model, error: 'AI not configured — no API key set' };
        }
        try {
            const result = await this.complete('Reply with the single word OK.', {
                maxTokens: 10,
                temperature: 0
            });
            if (result.error) {
                return { success: false, model: this.model, error: result.error };
            }
            return { success: true, model: this.model };
        } catch (err) {
            return { success: false, model: this.model, error: err.message };
        }
    }

    /**
     * Reconfigure the service with new settings.
     * @param {object} newConfig — { chatApiKey, aiBaseUrl, aiModel }
     */
    reconfigure(newConfig) {
        if (!newConfig || typeof newConfig !== 'object') return;
        // Redefine apiKey (non-enumerable)
        Object.defineProperty(this, 'apiKey', {
            value: newConfig.chatApiKey || '',
            enumerable: false,
            writable: false,
            configurable: true
        });
        if (newConfig.aiBaseUrl) this.baseUrl = newConfig.aiBaseUrl;
        if (newConfig.aiModel) this.model = newConfig.aiModel;
        this.enabled = !!this.apiKey;
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
            if (!Array.isArray(parsed)) return { suggestions: [] };
            // Validate element types (#59)
            const validated = parsed.filter(item => typeof item === 'string');
            return { suggestions: validated };
        } catch (e) {
            // Include parse error detail (#63)
            return { suggestions: [], error: 'Failed to parse AI response: ' + e.message };
        }
    }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AIService };
}
