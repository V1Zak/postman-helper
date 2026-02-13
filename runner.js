// Postman Helper — Collection Runner (headless, no Electron)
// Executes collection requests with test evaluation for CI/CD pipelines

const http = require('http');
const https = require('https');
const { Collection, PostmanRequest, Folder } = require('./models');

class CollectionRunner {
    constructor(options = {}) {
        this.timeout = options.timeout || 30000;
        this.bail = options.bail || false;
        this.verbose = options.verbose || false;
        this.delayBetweenRequests = options.delay || 0;
    }

    /**
     * Run all requests in a collection and return aggregated results.
     * @param {object} collectionData — raw JSON (simple or Postman v2.1)
     * @param {object} envVars — key/value pairs for {{var}} substitution
     * @returns {Promise<object>} results
     */
    async run(collectionData, envVars = {}) {
        const collection = new Collection('CLI Run');
        collection.importFromJSON(collectionData);

        const results = {
            collection: collection.name,
            timestamp: new Date().toISOString(),
            total: 0,
            passed: 0,
            failures: 0,
            errors: 0,
            skipped: 0,
            duration: 0,
            requests: []
        };

        const allRequests = this.flattenRequests(collection);
        const startTime = Date.now();

        for (const req of allRequests) {
            results.total++;

            const result = await this.executeRequest(req, envVars);
            results.requests.push(result);

            if (result.error) {
                results.errors++;
            } else if (result.testResults.failures > 0) {
                results.failures++;
            } else {
                results.passed++;
            }

            if (this.bail && (result.error || result.testResults.failures > 0)) {
                // Mark remaining requests as skipped
                const remaining = allRequests.length - results.total;
                results.skipped += remaining;
                results.total += remaining;
                break;
            }

            if (this.delayBetweenRequests > 0) {
                await new Promise(r => setTimeout(r, this.delayBetweenRequests));
            }
        }

        results.duration = Date.now() - startTime;
        return results;
    }

    /**
     * Recursively collect all requests from root + nested folders.
     */
    flattenRequests(collection) {
        const requests = [...(collection.requests || [])];

        const walkFolders = (folders) => {
            if (!folders || !Array.isArray(folders)) return;
            for (const folder of folders) {
                if (folder.requests) {
                    requests.push(...folder.requests);
                }
                if (folder.folders) {
                    walkFolders(folder.folders);
                }
            }
        };

        walkFolders(collection.folders || []);
        return requests;
    }

    /**
     * Execute a single request and evaluate its test script.
     */
    async executeRequest(request, envVars) {
        const url = this.substituteVars(request.url || '', envVars);
        const headers = this.resolveHeaders(request.headers, envVars);
        const body = request.body ? this.substituteVars(request.body, envVars) : null;
        const method = (request.method || 'GET').toUpperCase();

        const startTime = Date.now();
        try {
            const response = await this.httpRequest({ method, url, headers, body });
            const responseTime = Date.now() - startTime;

            // Get test script — may be on request.tests or request.events.test
            const testScript = request.tests || (request.events && request.events.test) || '';
            const testResults = this.runTests(testScript, response, responseTime);

            return {
                name: request.name || 'Unnamed',
                method,
                url,
                status: response.status,
                responseTime,
                testResults,
                error: null
            };
        } catch (err) {
            return {
                name: request.name || 'Unnamed',
                method,
                url,
                status: null,
                responseTime: Date.now() - startTime,
                testResults: { total: 0, passed: 0, failures: 0, results: [] },
                error: err.message
            };
        }
    }

    /**
     * Send an HTTP request using Node's http/https modules.
     * Mirrors the logic from main.js:101-157.
     */
    httpRequest(options) {
        return new Promise((resolve, reject) => {
            let parsedUrl;
            try {
                parsedUrl = new URL(options.url);
            } catch (e) {
                return reject(new Error(`Invalid URL: ${options.url}`));
            }

            const httpModule = parsedUrl.protocol === 'https:' ? https : http;

            const reqOptions = {
                method: options.method || 'GET',
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                headers: options.headers || {},
                timeout: this.timeout
            };

            const req = httpModule.request(reqOptions, (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    const bodyStr = Buffer.concat(chunks).toString('utf-8');
                    const responseHeaders = {};
                    for (const [key, value] of Object.entries(res.headers)) {
                        responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
                    }
                    resolve({
                        status: res.statusCode,
                        statusText: res.statusMessage,
                        headers: responseHeaders,
                        body: bodyStr
                    });
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Request timed out after ${this.timeout}ms`));
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (options.body && options.method !== 'GET' && options.method !== 'HEAD') {
                req.write(options.body);
            }
            req.end();
        });
    }

    /**
     * Evaluate a Postman-style test script against a response.
     * test scripts set `tests['name'] = boolean`.
     */
    runTests(testScript, response, responseTime) {
        if (!testScript || !testScript.trim()) {
            return { total: 0, passed: 0, failures: 0, results: [] };
        }

        const tests = {};
        const responseCode = { code: response.status };
        const responseBody = {
            has: (str) => (response.body || '').includes(str),
            json: () => {
                try { return JSON.parse(response.body); } catch { return null; }
            }
        };

        try {
            const fn = new Function(
                'tests', 'responseCode', 'responseBody', 'responseTime',
                testScript
            );
            fn(tests, responseCode, responseBody, responseTime);
        } catch (err) {
            return {
                total: 1,
                passed: 0,
                failures: 1,
                results: [{ name: 'Script Execution', passed: false, error: err.message }]
            };
        }

        const results = Object.entries(tests).map(([name, passed]) => ({
            name,
            passed: !!passed
        }));

        return {
            total: results.length,
            passed: results.filter(r => r.passed).length,
            failures: results.filter(r => !r.passed).length,
            results
        };
    }

    /**
     * Replace {{key}} patterns in a string with values from vars.
     * Unresolved placeholders are left intact.
     */
    substituteVars(str, vars) {
        if (!str || typeof str !== 'string') return str || '';
        return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return vars.hasOwnProperty(key) ? vars[key] : match;
        });
    }

    /**
     * Normalise headers to a plain { key: value } object, substituting vars.
     * Handles both { key: value } objects and [{ key, value }] arrays.
     */
    resolveHeaders(headers, envVars) {
        const resolved = {};
        if (!headers) return resolved;

        if (Array.isArray(headers)) {
            for (const h of headers) {
                if (h.key) {
                    resolved[this.substituteVars(h.key, envVars)] =
                        this.substituteVars(h.value || '', envVars);
                }
            }
        } else if (typeof headers === 'object') {
            for (const [key, value] of Object.entries(headers)) {
                resolved[this.substituteVars(key, envVars)] =
                    this.substituteVars(value || '', envVars);
            }
        }

        return resolved;
    }
}

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CollectionRunner };
}
