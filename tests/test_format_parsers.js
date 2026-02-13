/**
 * Unit tests for FormatParser — multi-format import/export (Issue #19)
 * Tests: detectFormat, parseOpenAPI3, parseSwagger2, parseHAR, parseCurl,
 *        toCurl, _tokenize, importParsedInto
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { extractAppClasses } = require('./helpers/app_class_extractor');

let Request, Collection, Folder, FormatParser;

/**
 * Extract FormatParser from app.js source.
 * It sits between the DiffUtil module.exports guard and "// AppState class".
 * We must also inject the app's Request and Folder class definitions so that
 * importParsedInto can instantiate them (otherwise Node's built-in fetch Request
 * class shadows the app's Request class).
 */
function extractFormatParser() {
    const appPath = path.join(__dirname, '..', 'app.js');
    const src = fs.readFileSync(appPath, 'utf-8');
    const lines = src.split('\n');

    // 1. Extract model classes (Request through InheritanceManager) from top of app.js
    //    These are needed by importParsedInto
    let modelsStart = -1;
    let modelsEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^\/\/ Custom Dialog System/) || lines[i].match(/^class DialogSystem/)) {
            modelsEnd = i;
            break;
        }
    }
    // Models start after the first line of actual class code
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Request\s*=\s*class/) || lines[i].match(/^class Request\b/)) {
            modelsStart = i;
            break;
        }
    }

    // 2. Extract FormatParser block
    let blockStart = -1;
    let blockEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^\/\/ FormatParser/) && blockStart === -1) {
            blockStart = i;
        }
        if (blockStart > -1 && i > blockStart && lines[i].match(/^\/\/ AppState class/)) {
            blockEnd = i;
            break;
        }
    }

    if (blockStart === -1 || blockEnd === -1) {
        throw new Error(`Could not find FormatParser in app.js (start=${blockStart}, end=${blockEnd})`);
    }

    // Combine: model classes + FormatParser class
    const modelsCode = (modelsStart >= 0 && modelsEnd > modelsStart)
        ? lines.slice(modelsStart, modelsEnd).join('\n')
        : '';
    const parserCode = lines.slice(blockStart, blockEnd).join('\n');
    const code = `${modelsCode}\n${parserCode}\nmodule.exports = { FormatParser, Request, Folder };`;

    const Module = require('module');
    const m = new Module();
    m._compile(code, 'format_parser_virtual.js');
    return m.exports;
}

before(() => {
    const classes = extractAppClasses();
    Collection = classes.Collection;

    // Extract FormatParser with its own Request/Folder from the combined code block.
    // This avoids conflicts with Node.js built-in Request class.
    const parserExports = extractFormatParser();
    FormatParser = parserExports.FormatParser;
    Request = parserExports.Request;
    Folder = parserExports.Folder;
});

// ===================== detectFormat =====================

describe('FormatParser.detectFormat', () => {
    it('returns "unknown" for null/undefined/empty input', () => {
        assert.equal(FormatParser.detectFormat(null), 'unknown');
        assert.equal(FormatParser.detectFormat(undefined), 'unknown');
        assert.equal(FormatParser.detectFormat(''), 'unknown');
        assert.equal(FormatParser.detectFormat(123), 'unknown');
    });

    it('detects cURL commands starting with "curl "', () => {
        assert.equal(FormatParser.detectFormat('curl https://api.example.com'), 'curl');
        assert.equal(FormatParser.detectFormat('curl -X POST https://api.example.com'), 'curl');
    });

    it('detects cURL commands starting with "curl.exe "', () => {
        assert.equal(FormatParser.detectFormat('curl.exe https://api.example.com'), 'curl');
    });

    it('detects OpenAPI 3.x from JSON', () => {
        const spec = JSON.stringify({ openapi: '3.0.1', info: { title: 'Test' }, paths: {} });
        assert.equal(FormatParser.detectFormat(spec), 'openapi-3');
    });

    it('detects OpenAPI 3.1 from JSON', () => {
        const spec = JSON.stringify({ openapi: '3.1.0', info: { title: 'Test' }, paths: {} });
        assert.equal(FormatParser.detectFormat(spec), 'openapi-3');
    });

    it('detects Swagger 2.0 from JSON', () => {
        const spec = JSON.stringify({ swagger: '2.0', info: { title: 'Test' }, paths: {} });
        assert.equal(FormatParser.detectFormat(spec), 'swagger-2');
    });

    it('detects HAR format from JSON', () => {
        const har = JSON.stringify({ log: { version: '1.2', entries: [] } });
        assert.equal(FormatParser.detectFormat(har), 'har');
    });

    it('detects Postman v2.1 with schema URL', () => {
        const postman = JSON.stringify({
            info: { name: 'Test', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
            item: []
        });
        assert.equal(FormatParser.detectFormat(postman), 'postman-v2.1');
    });

    it('detects Postman format with info but no schema', () => {
        const postman = JSON.stringify({ info: { name: 'Test' }, item: [] });
        assert.equal(FormatParser.detectFormat(postman), 'postman-v2.1');
    });

    it('detects Insomnia export format', () => {
        const insomnia = JSON.stringify({ _type: 'export', resources: [] });
        assert.equal(FormatParser.detectFormat(insomnia), 'insomnia');
    });

    it('detects simple format with requests array', () => {
        const simple = JSON.stringify({ name: 'Test', requests: [] });
        assert.equal(FormatParser.detectFormat(simple), 'simple');
    });

    it('detects simple format with name only', () => {
        const simple = JSON.stringify({ name: 'Test' });
        assert.equal(FormatParser.detectFormat(simple), 'simple');
    });

    it('returns "unknown" for unrecognized JSON', () => {
        const unknown = JSON.stringify({ foo: 'bar', baz: 123 });
        assert.equal(FormatParser.detectFormat(unknown), 'unknown');
    });

    it('detects OpenAPI 3.x from YAML-like text', () => {
        assert.equal(FormatParser.detectFormat('openapi: "3.0.0"\ninfo:\n  title: Test'), 'openapi-3');
        assert.equal(FormatParser.detectFormat("openapi: '3.1.0'\npaths: {}"), 'openapi-3');
    });

    it('detects Swagger 2.0 from YAML-like text', () => {
        assert.equal(FormatParser.detectFormat('swagger: "2.0"\ninfo:\n  title: Test'), 'swagger-2');
    });

    it('detects cURL in non-JSON multi-line text', () => {
        const curl = 'curl -X POST \\\n  -H "Content-Type: application/json" \\\n  https://api.example.com';
        assert.equal(FormatParser.detectFormat(curl), 'curl');
    });

    it('returns "unknown" for random non-JSON text', () => {
        assert.equal(FormatParser.detectFormat('hello world'), 'unknown');
        assert.equal(FormatParser.detectFormat('not a format'), 'unknown');
    });
});

// ===================== parseOpenAPI3 =====================

describe('FormatParser.parseOpenAPI3', () => {
    it('extracts name and description from info', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'My API', description: 'A test API' },
            paths: {}
        };
        const result = FormatParser.parseOpenAPI3(spec);
        assert.equal(result.name, 'My API');
        assert.equal(result.description, 'A test API');
    });

    it('defaults name to "OpenAPI Import" if no title', () => {
        const result = FormatParser.parseOpenAPI3({ openapi: '3.0.0', paths: {} });
        assert.equal(result.name, 'OpenAPI Import');
    });

    it('extracts GET request from paths', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test' },
            servers: [{ url: 'https://api.example.com' }],
            paths: {
                '/users': {
                    get: { summary: 'List Users', description: 'Get all users' }
                }
            }
        };
        const result = FormatParser.parseOpenAPI3(spec);
        assert.equal(result.requests.length, 1);
        assert.equal(result.requests[0].name, 'List Users');
        assert.equal(result.requests[0].method, 'GET');
        assert.equal(result.requests[0].url, 'https://api.example.com/users');
        assert.equal(result.requests[0].description, 'Get all users');
    });

    it('extracts multiple methods from same path', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test' },
            paths: {
                '/users': {
                    get: { summary: 'List Users' },
                    post: { summary: 'Create User' }
                }
            }
        };
        const result = FormatParser.parseOpenAPI3(spec);
        assert.equal(result.requests.length, 2);
        assert.equal(result.requests[0].method, 'GET');
        assert.equal(result.requests[1].method, 'POST');
    });

    it('uses operationId when summary is missing', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test' },
            paths: {
                '/pets': { get: { operationId: 'getPets' } }
            }
        };
        const result = FormatParser.parseOpenAPI3(spec);
        assert.equal(result.requests[0].name, 'getPets');
    });

    it('falls back to METHOD /path when no summary or operationId', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test' },
            paths: {
                '/pets': { delete: {} }
            }
        };
        const result = FormatParser.parseOpenAPI3(spec);
        assert.equal(result.requests[0].name, 'DELETE /pets');
    });

    it('extracts header parameters', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test' },
            paths: {
                '/api': {
                    get: {
                        summary: 'Test',
                        parameters: [
                            { name: 'X-Api-Key', in: 'header', example: 'abc123' },
                            { name: 'id', in: 'query' } // should be ignored
                        ]
                    }
                }
            }
        };
        const result = FormatParser.parseOpenAPI3(spec);
        assert.equal(result.requests[0].headers['X-Api-Key'], 'abc123');
        assert.equal(Object.keys(result.requests[0].headers).length, 1);
    });

    it('extracts path-level parameters', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test' },
            paths: {
                '/api': {
                    parameters: [{ name: 'X-Trace-Id', in: 'header', example: 'trace-1' }],
                    get: { summary: 'Test' }
                }
            }
        };
        const result = FormatParser.parseOpenAPI3(spec);
        assert.equal(result.requests[0].headers['X-Trace-Id'], 'trace-1');
    });

    it('extracts requestBody with JSON example', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test' },
            paths: {
                '/users': {
                    post: {
                        summary: 'Create User',
                        requestBody: {
                            content: {
                                'application/json': {
                                    example: { name: 'John', email: 'john@example.com' }
                                }
                            }
                        }
                    }
                }
            }
        };
        const result = FormatParser.parseOpenAPI3(spec);
        const body = JSON.parse(result.requests[0].body);
        assert.equal(body.name, 'John');
        assert.equal(result.requests[0].headers['Content-Type'], 'application/json');
    });

    it('extracts requestBody with schema example', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test' },
            paths: {
                '/users': {
                    post: {
                        summary: 'Create User',
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: { example: { name: 'Jane' } }
                                }
                            }
                        }
                    }
                }
            }
        };
        const result = FormatParser.parseOpenAPI3(spec);
        const body = JSON.parse(result.requests[0].body);
        assert.equal(body.name, 'Jane');
    });

    it('groups requests by tags into folders', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test' },
            tags: [{ name: 'Users', description: 'User operations' }],
            paths: {
                '/users': {
                    get: { summary: 'List Users', tags: ['Users'] },
                    post: { summary: 'Create User', tags: ['Users'] }
                },
                '/health': {
                    get: { summary: 'Health Check' }
                }
            }
        };
        const result = FormatParser.parseOpenAPI3(spec);
        assert.equal(result.folders.length, 1);
        assert.equal(result.folders[0].name, 'Users');
        assert.equal(result.folders[0].requests.length, 2);
        assert.equal(result.requests.length, 1); // untagged goes to root
        assert.equal(result.requests[0].name, 'Health Check');
    });

    it('uses tag description for folder', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test' },
            tags: [{ name: 'Auth', description: 'Authentication endpoints' }],
            paths: {
                '/login': { post: { summary: 'Login', tags: ['Auth'] } }
            }
        };
        const result = FormatParser.parseOpenAPI3(spec);
        assert.equal(result.folders[0].description, 'Authentication endpoints');
    });

    it('handles empty paths', () => {
        const spec = { openapi: '3.0.0', info: { title: 'Empty' }, paths: {} };
        const result = FormatParser.parseOpenAPI3(spec);
        assert.equal(result.requests.length, 0);
        assert.equal(result.folders.length, 0);
    });

    it('handles missing paths', () => {
        const spec = { openapi: '3.0.0', info: { title: 'None' } };
        const result = FormatParser.parseOpenAPI3(spec);
        assert.equal(result.requests.length, 0);
    });

    it('uses first server as base URL', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test' },
            servers: [
                { url: 'https://prod.example.com/v1' },
                { url: 'https://staging.example.com/v1' }
            ],
            paths: { '/items': { get: { summary: 'Get Items' } } }
        };
        const result = FormatParser.parseOpenAPI3(spec);
        assert.equal(result.requests[0].url, 'https://prod.example.com/v1/items');
    });

    it('handles missing servers gracefully', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test' },
            paths: { '/items': { get: { summary: 'Get Items' } } }
        };
        const result = FormatParser.parseOpenAPI3(spec);
        assert.equal(result.requests[0].url, '/items');
    });
});

// ===================== parseSwagger2 =====================

describe('FormatParser.parseSwagger2', () => {
    it('extracts name and description from info', () => {
        const spec = {
            swagger: '2.0',
            info: { title: 'Pet Store', description: 'A pet store API' },
            paths: {}
        };
        const result = FormatParser.parseSwagger2(spec);
        assert.equal(result.name, 'Pet Store');
        assert.equal(result.description, 'A pet store API');
    });

    it('defaults name to "Swagger Import"', () => {
        const result = FormatParser.parseSwagger2({ swagger: '2.0', paths: {} });
        assert.equal(result.name, 'Swagger Import');
    });

    it('builds base URL from scheme, host, and basePath', () => {
        const spec = {
            swagger: '2.0',
            info: { title: 'Test' },
            schemes: ['https'],
            host: 'api.example.com',
            basePath: '/v2',
            paths: {
                '/pets': { get: { summary: 'List Pets' } }
            }
        };
        const result = FormatParser.parseSwagger2(spec);
        assert.equal(result.requests[0].url, 'https://api.example.com/v2/pets');
    });

    it('defaults scheme to https and host to localhost', () => {
        const spec = {
            swagger: '2.0',
            info: { title: 'Test' },
            paths: {
                '/test': { get: { summary: 'Test' } }
            }
        };
        const result = FormatParser.parseSwagger2(spec);
        assert.ok(result.requests[0].url.startsWith('https://localhost'));
    });

    it('extracts header parameters', () => {
        const spec = {
            swagger: '2.0',
            info: { title: 'Test' },
            paths: {
                '/api': {
                    get: {
                        summary: 'Test',
                        parameters: [
                            { name: 'Authorization', in: 'header', default: 'Bearer token' }
                        ]
                    }
                }
            }
        };
        const result = FormatParser.parseSwagger2(spec);
        assert.equal(result.requests[0].headers['Authorization'], 'Bearer token');
    });

    it('extracts body parameter with schema example', () => {
        const spec = {
            swagger: '2.0',
            info: { title: 'Test' },
            paths: {
                '/users': {
                    post: {
                        summary: 'Create',
                        parameters: [
                            { name: 'body', in: 'body', schema: { example: { name: 'Test' } } }
                        ],
                        consumes: ['application/json']
                    }
                }
            }
        };
        const result = FormatParser.parseSwagger2(spec);
        const body = JSON.parse(result.requests[0].body);
        assert.equal(body.name, 'Test');
        assert.equal(result.requests[0].headers['Content-Type'], 'application/json');
    });

    it('uses global consumes for Content-Type', () => {
        const spec = {
            swagger: '2.0',
            info: { title: 'Test' },
            consumes: ['application/json'],
            paths: {
                '/data': { post: { summary: 'Post Data' } }
            }
        };
        const result = FormatParser.parseSwagger2(spec);
        assert.equal(result.requests[0].headers['Content-Type'], 'application/json');
    });

    it('groups requests by tags into folders', () => {
        const spec = {
            swagger: '2.0',
            info: { title: 'Test' },
            paths: {
                '/pets': {
                    get: { summary: 'List Pets', tags: ['Pets'] }
                },
                '/health': {
                    get: { summary: 'Health' }
                }
            }
        };
        const result = FormatParser.parseSwagger2(spec);
        assert.equal(result.folders.length, 1);
        assert.equal(result.folders[0].name, 'Pets');
        assert.equal(result.requests.length, 1);
    });

    it('handles empty paths', () => {
        const result = FormatParser.parseSwagger2({ swagger: '2.0', info: { title: 'E' }, paths: {} });
        assert.equal(result.requests.length, 0);
        assert.equal(result.folders.length, 0);
    });

    it('extracts path-level parameters', () => {
        const spec = {
            swagger: '2.0',
            info: { title: 'Test' },
            paths: {
                '/api': {
                    parameters: [{ name: 'X-Request-Id', in: 'header', default: 'req-1' }],
                    get: { summary: 'Test' }
                }
            }
        };
        const result = FormatParser.parseSwagger2(spec);
        assert.equal(result.requests[0].headers['X-Request-Id'], 'req-1');
    });
});

// ===================== parseHAR =====================

describe('FormatParser.parseHAR', () => {
    it('parses basic HAR with entries', () => {
        const har = {
            log: {
                version: '1.2',
                entries: [
                    {
                        request: {
                            method: 'GET',
                            url: 'https://api.example.com/users',
                            headers: [
                                { name: 'Accept', value: 'application/json' }
                            ]
                        }
                    }
                ]
            }
        };
        const result = FormatParser.parseHAR(har);
        assert.equal(result.requests.length, 1);
        assert.equal(result.requests[0].method, 'GET');
        assert.equal(result.requests[0].url, 'https://api.example.com/users');
        assert.equal(result.requests[0].headers['Accept'], 'application/json');
    });

    it('generates name from method and pathname', () => {
        const har = {
            log: {
                entries: [
                    { request: { method: 'POST', url: 'https://api.example.com/items?page=1', headers: [] } }
                ]
            }
        };
        const result = FormatParser.parseHAR(har);
        assert.equal(result.requests[0].name, 'POST /items');
    });

    it('filters out pseudo-headers (starting with :)', () => {
        const har = {
            log: {
                entries: [
                    {
                        request: {
                            method: 'GET',
                            url: 'https://example.com/',
                            headers: [
                                { name: ':authority', value: 'example.com' },
                                { name: ':method', value: 'GET' },
                                { name: 'Accept', value: '*/*' }
                            ]
                        }
                    }
                ]
            }
        };
        const result = FormatParser.parseHAR(har);
        assert.equal(Object.keys(result.requests[0].headers).length, 1);
        assert.equal(result.requests[0].headers['Accept'], '*/*');
    });

    it('filters out cookie headers', () => {
        const har = {
            log: {
                entries: [
                    {
                        request: {
                            method: 'GET',
                            url: 'https://example.com/',
                            headers: [
                                { name: 'Cookie', value: 'session=abc' },
                                { name: 'Content-Type', value: 'text/html' }
                            ]
                        }
                    }
                ]
            }
        };
        const result = FormatParser.parseHAR(har);
        assert.equal(result.requests[0].headers['Cookie'], undefined);
        assert.equal(result.requests[0].headers['Content-Type'], 'text/html');
    });

    it('extracts postData body', () => {
        const har = {
            log: {
                entries: [
                    {
                        request: {
                            method: 'POST',
                            url: 'https://example.com/api',
                            headers: [],
                            postData: { text: '{"key":"value"}', mimeType: 'application/json' }
                        }
                    }
                ]
            }
        };
        const result = FormatParser.parseHAR(har);
        assert.equal(result.requests[0].body, '{"key":"value"}');
    });

    it('handles empty entries', () => {
        const har = { log: { entries: [] } };
        const result = FormatParser.parseHAR(har);
        assert.equal(result.requests.length, 0);
        assert.equal(result.folders.length, 0);
    });

    it('handles missing log gracefully', () => {
        const result = FormatParser.parseHAR({});
        assert.equal(result.requests.length, 0);
    });

    it('returns descriptive collection name', () => {
        const har = {
            log: { entries: [{ request: { method: 'GET', url: 'http://a.com/', headers: [] } }] }
        };
        const result = FormatParser.parseHAR(har);
        assert.ok(result.name.includes('1 request'));
    });

    it('handles multiple entries', () => {
        const har = {
            log: {
                entries: [
                    { request: { method: 'GET', url: 'http://a.com/1', headers: [] } },
                    { request: { method: 'POST', url: 'http://a.com/2', headers: [] } },
                    { request: { method: 'PUT', url: 'http://a.com/3', headers: [] } }
                ]
            }
        };
        const result = FormatParser.parseHAR(har);
        assert.equal(result.requests.length, 3);
        assert.ok(result.name.includes('3 requests'));
    });
});

// ===================== _tokenize =====================

describe('FormatParser._tokenize', () => {
    it('splits simple tokens by spaces', () => {
        const tokens = FormatParser._tokenize('curl -X GET http://example.com');
        assert.deepEqual(tokens, ['curl', '-X', 'GET', 'http://example.com']);
    });

    it('handles single-quoted strings', () => {
        const tokens = FormatParser._tokenize("curl -H 'Content-Type: application/json'");
        assert.deepEqual(tokens, ['curl', '-H', 'Content-Type: application/json']);
    });

    it('handles double-quoted strings', () => {
        const tokens = FormatParser._tokenize('curl -H "Authorization: Bearer token123"');
        assert.deepEqual(tokens, ['curl', '-H', 'Authorization: Bearer token123']);
    });

    it('handles backslash escapes outside quotes', () => {
        const tokens = FormatParser._tokenize('curl http://example.com/path\\ with\\ spaces');
        assert.deepEqual(tokens, ['curl', 'http://example.com/path with spaces']);
    });

    it('handles backslash escapes inside double quotes', () => {
        const tokens = FormatParser._tokenize('curl -d "hello \\"world\\""');
        assert.deepEqual(tokens, ['curl', '-d', 'hello "world"']);
    });

    it('handles tabs as delimiters', () => {
        const tokens = FormatParser._tokenize("curl\t-X\tPOST");
        assert.deepEqual(tokens, ['curl', '-X', 'POST']);
    });

    it('handles multiple consecutive spaces', () => {
        const tokens = FormatParser._tokenize('curl   -X   GET');
        assert.deepEqual(tokens, ['curl', '-X', 'GET']);
    });

    it('returns empty array for empty string', () => {
        assert.deepEqual(FormatParser._tokenize(''), []);
    });

    it('preserves spaces inside single quotes', () => {
        const tokens = FormatParser._tokenize("curl -d 'hello world foo bar'");
        assert.deepEqual(tokens, ['curl', '-d', 'hello world foo bar']);
    });
});

// ===================== parseCurl =====================

describe('FormatParser.parseCurl', () => {
    it('parses simple GET request', () => {
        const result = FormatParser.parseCurl('curl https://api.example.com/users');
        assert.equal(result.requests.length, 1);
        assert.equal(result.requests[0].method, 'GET');
        assert.equal(result.requests[0].url, 'https://api.example.com/users');
    });

    it('parses explicit method with -X', () => {
        const result = FormatParser.parseCurl('curl -X DELETE https://api.example.com/users/1');
        assert.equal(result.requests[0].method, 'DELETE');
        assert.equal(result.requests[0].url, 'https://api.example.com/users/1');
    });

    it('parses --request flag', () => {
        const result = FormatParser.parseCurl('curl --request PUT https://api.example.com/users/1');
        assert.equal(result.requests[0].method, 'PUT');
    });

    it('parses headers with -H', () => {
        const result = FormatParser.parseCurl(
            "curl -H 'Content-Type: application/json' -H 'Authorization: Bearer abc' https://api.example.com"
        );
        assert.equal(result.requests[0].headers['Content-Type'], 'application/json');
        assert.equal(result.requests[0].headers['Authorization'], 'Bearer abc');
    });

    it('parses body with -d', () => {
        const result = FormatParser.parseCurl(
            `curl -X POST -d '{"name":"test"}' https://api.example.com/users`
        );
        assert.equal(result.requests[0].method, 'POST');
        assert.equal(result.requests[0].body, '{"name":"test"}');
    });

    it('defaults to POST when -d is used without explicit method', () => {
        const result = FormatParser.parseCurl(
            `curl -d '{"key":"val"}' https://api.example.com/data`
        );
        assert.equal(result.requests[0].method, 'POST');
    });

    it('parses --data-raw flag', () => {
        const result = FormatParser.parseCurl(
            `curl --data-raw '{"x":1}' https://api.example.com/`
        );
        assert.equal(result.requests[0].body, '{"x":1}');
    });

    it('parses multiline cURL with backslash continuations', () => {
        const curl = `curl -X POST \\\n  -H 'Content-Type: application/json' \\\n  -d '{"name":"test"}' \\\n  https://api.example.com/users`;
        const result = FormatParser.parseCurl(curl);
        assert.equal(result.requests[0].method, 'POST');
        assert.equal(result.requests[0].headers['Content-Type'], 'application/json');
        assert.equal(result.requests[0].body, '{"name":"test"}');
        assert.equal(result.requests[0].url, 'https://api.example.com/users');
    });

    it('skips known flags without arguments', () => {
        const result = FormatParser.parseCurl(
            'curl --compressed -s -k -L https://api.example.com/'
        );
        assert.equal(result.requests[0].url, 'https://api.example.com/');
    });

    it('skips -u and --output flags with their arguments', () => {
        const result = FormatParser.parseCurl(
            'curl -u user:pass -o output.json https://api.example.com/'
        );
        assert.equal(result.requests[0].url, 'https://api.example.com/');
    });

    it('generates descriptive request name', () => {
        const result = FormatParser.parseCurl('curl -X POST https://api.example.com/users');
        assert.equal(result.requests[0].name, 'POST /users');
    });

    it('handles null/undefined/empty input', () => {
        assert.equal(FormatParser.parseCurl(null).requests.length, 0);
        assert.equal(FormatParser.parseCurl(undefined).requests.length, 0);
        assert.equal(FormatParser.parseCurl('').requests.length, 0);
    });

    it('returns collection name "cURL Import"', () => {
        const result = FormatParser.parseCurl('curl https://example.com');
        assert.equal(result.name, 'cURL Import');
    });

    it('adds description "Imported from cURL"', () => {
        const result = FormatParser.parseCurl('curl https://example.com');
        assert.equal(result.requests[0].description, 'Imported from cURL');
    });

    it('parses curl.exe prefix', () => {
        const result = FormatParser.parseCurl('curl.exe https://api.example.com/test');
        assert.equal(result.requests.length, 1);
        assert.equal(result.requests[0].url, 'https://api.example.com/test');
    });
});

// ===================== toCurl =====================

describe('FormatParser.toCurl', () => {
    it('generates basic GET cURL command', () => {
        const curl = FormatParser.toCurl({ method: 'GET', url: 'https://api.example.com/users' });
        assert.ok(curl.includes('curl -X GET'));
        assert.ok(curl.includes('https://api.example.com/users'));
    });

    it('includes headers as -H flags', () => {
        const curl = FormatParser.toCurl({
            method: 'GET',
            url: 'https://example.com',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer abc' }
        });
        assert.ok(curl.includes("-H 'Content-Type: application/json'"));
        assert.ok(curl.includes("-H 'Authorization: Bearer abc'"));
    });

    it('handles array-style headers', () => {
        const curl = FormatParser.toCurl({
            method: 'GET',
            url: 'https://example.com',
            headers: [
                { key: 'Accept', value: 'text/html' },
                { key: 'X-Custom', value: 'val' }
            ]
        });
        assert.ok(curl.includes("-H 'Accept: text/html'"));
        assert.ok(curl.includes("-H 'X-Custom: val'"));
    });

    it('includes body as -d flag', () => {
        const curl = FormatParser.toCurl({
            method: 'POST',
            url: 'https://example.com',
            body: '{"name":"test"}'
        });
        assert.ok(curl.includes("-d '{\"name\":\"test\"}'"));
    });

    it('escapes single quotes in body', () => {
        const curl = FormatParser.toCurl({
            method: 'POST',
            url: 'https://example.com',
            body: "it's a test"
        });
        assert.ok(curl.includes("-d 'it'\\''s a test'"));
    });

    it('escapes single quotes in header values', () => {
        const curl = FormatParser.toCurl({
            method: 'GET',
            url: 'https://example.com',
            headers: { 'X-Custom': "it's quoted" }
        });
        assert.ok(curl.includes("-H 'X-Custom: it'\\''s quoted'"));
    });

    it('escapes single quotes in URL', () => {
        const curl = FormatParser.toCurl({
            method: 'GET',
            url: "https://example.com/search?q=it's"
        });
        assert.ok(curl.includes("'https://example.com/search?q=it'\\''s'"));
    });

    it('prepends baseUrl when provided', () => {
        const curl = FormatParser.toCurl(
            { method: 'GET', url: '/users' },
            'https://api.example.com'
        );
        assert.ok(curl.includes('https://api.example.com/users'));
    });

    it('defaults method to GET', () => {
        const curl = FormatParser.toCurl({ url: 'https://example.com' });
        assert.ok(curl.includes('curl -X GET'));
    });

    it('handles empty headers and body', () => {
        const curl = FormatParser.toCurl({ method: 'GET', url: 'https://example.com', headers: {}, body: '' });
        assert.ok(!curl.includes('-H'));
        assert.ok(!curl.includes('-d'));
    });

    it('skips array headers without key', () => {
        const curl = FormatParser.toCurl({
            method: 'GET',
            url: 'https://example.com',
            headers: [{ value: 'no-key' }, { key: 'Valid', value: 'yes' }]
        });
        assert.ok(!curl.includes('no-key'));
        assert.ok(curl.includes("-H 'Valid: yes'"));
    });
});

// ===================== importParsedInto =====================

describe('FormatParser.importParsedInto', () => {
    it('sets collection name from parsed data', () => {
        const col = new Collection('Original');
        FormatParser.importParsedInto(col, { name: 'New Name', requests: [], folders: [] });
        assert.equal(col.name, 'New Name');
    });

    it('keeps original name if parsed has no name', () => {
        const col = new Collection('Original');
        FormatParser.importParsedInto(col, { requests: [], folders: [] });
        assert.equal(col.name, 'Original');
    });

    it('adds requests to collection', () => {
        const col = new Collection('Test');
        FormatParser.importParsedInto(col, {
            name: 'Test',
            requests: [
                { name: 'Get Users', method: 'GET', url: '/users', headers: {}, body: '' },
                { name: 'Create User', method: 'POST', url: '/users', headers: { 'Content-Type': 'application/json' }, body: '{}' }
            ],
            folders: []
        });
        assert.equal(col.requests.length, 2);
        assert.equal(col.requests[0].name, 'Get Users');
        assert.equal(col.requests[1].method, 'POST');
    });

    it('creates Request instances (not plain objects)', () => {
        const col = new Collection('Test');
        FormatParser.importParsedInto(col, {
            name: 'Test',
            requests: [{ name: 'R1', method: 'GET', url: '/r1' }],
            folders: []
        });
        assert.ok(col.requests[0] instanceof Request);
    });

    it('preserves tests property on requests', () => {
        const col = new Collection('Test');
        FormatParser.importParsedInto(col, {
            name: 'Test',
            requests: [
                { name: 'R1', method: 'GET', url: '/r1', tests: 'pm.test("ok", () => {})' }
            ],
            folders: []
        });
        assert.equal(col.requests[0].tests, 'pm.test("ok", () => {})');
    });

    it('creates folders with requests', () => {
        const col = new Collection('Test');
        FormatParser.importParsedInto(col, {
            name: 'Test',
            requests: [],
            folders: [
                {
                    name: 'Users',
                    requests: [
                        { name: 'List', method: 'GET', url: '/users' }
                    ]
                }
            ]
        });
        assert.equal(col.folders.length, 1);
        assert.equal(col.folders[0].name, 'Users');
        assert.equal(col.folders[0].requests.length, 1);
    });

    it('creates Folder instances (not plain objects)', () => {
        const col = new Collection('Test');
        FormatParser.importParsedInto(col, {
            name: 'Test',
            requests: [],
            folders: [{ name: 'F1', requests: [] }]
        });
        assert.ok(col.folders[0] instanceof Folder);
    });

    it('handles empty parsed data gracefully', () => {
        const col = new Collection('Test');
        FormatParser.importParsedInto(col, { name: 'Test' });
        assert.equal(col.requests.length, 0);
        assert.equal(col.folders.length, 0);
    });

    it('sets description on collection', () => {
        const col = new Collection('Test');
        FormatParser.importParsedInto(col, { name: 'Test', description: 'A cool API', requests: [], folders: [] });
        assert.equal(col.description, 'A cool API');
    });
});

// ===================== Round-trip: parseCurl -> toCurl =====================

describe('FormatParser round-trip: cURL parse -> export', () => {
    it('preserves method and URL through round-trip', () => {
        const original = 'curl -X POST https://api.example.com/users';
        const parsed = FormatParser.parseCurl(original);
        const req = parsed.requests[0];
        const exported = FormatParser.toCurl(req);
        assert.ok(exported.includes('-X POST'));
        assert.ok(exported.includes('https://api.example.com/users'));
    });

    it('preserves headers through round-trip', () => {
        const original = "curl -H 'Content-Type: application/json' -H 'Accept: */*' https://example.com";
        const parsed = FormatParser.parseCurl(original);
        const req = parsed.requests[0];
        const exported = FormatParser.toCurl(req);
        assert.ok(exported.includes('Content-Type: application/json'));
        assert.ok(exported.includes('Accept: */*'));
    });

    it('preserves body through round-trip', () => {
        const original = `curl -X POST -d '{"name":"test"}' https://example.com`;
        const parsed = FormatParser.parseCurl(original);
        const req = parsed.requests[0];
        const exported = FormatParser.toCurl(req);
        assert.ok(exported.includes('{"name":"test"}'));
    });
});

// ===================== Integration: OpenAPI -> importParsedInto =====================

describe('FormatParser integration: OpenAPI -> importParsedInto', () => {
    it('imports OpenAPI spec into Collection with correct structure', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'User API', description: 'User management' },
            servers: [{ url: 'https://api.example.com/v1' }],
            tags: [{ name: 'Users', description: 'User operations' }],
            paths: {
                '/users': {
                    get: { summary: 'List Users', tags: ['Users'] },
                    post: {
                        summary: 'Create User',
                        tags: ['Users'],
                        requestBody: {
                            content: { 'application/json': { example: { name: 'John' } } }
                        }
                    }
                },
                '/health': {
                    get: { summary: 'Health Check' }
                }
            }
        };

        const col = new Collection('Temp');
        const parsed = FormatParser.parseOpenAPI3(spec);
        FormatParser.importParsedInto(col, parsed);

        assert.equal(col.name, 'User API');
        assert.equal(col.description, 'User management');
        assert.equal(col.requests.length, 1); // Health Check (untagged)
        assert.equal(col.folders.length, 1); // Users
        assert.equal(col.folders[0].name, 'Users');
        assert.equal(col.folders[0].requests.length, 2);
        assert.equal(col.folders[0].requests[0].name, 'List Users');
        assert.equal(col.folders[0].requests[1].name, 'Create User');
        assert.ok(col.folders[0].requests[0] instanceof Request);
    });
});
