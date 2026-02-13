/**
 * Unit tests for environment import/export (Issue #12)
 * Tests the environment data transformation logic without Electron APIs.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ─── Helper: Postman environment format ────────────────────────────────────────

function createPostmanEnv(name, vars) {
    return {
        name,
        values: Object.entries(vars).map(([key, value]) => ({
            key, value: String(value), type: 'default', enabled: true
        })),
        _postman_variable_scope: 'environment'
    };
}

function createMultiEnvBundle(envs) {
    return {
        _type: 'postman_helper_environments',
        _version: 1,
        environments: envs.map(e => ({
            name: e.name,
            values: Object.entries(e.variables).map(([key, value]) => ({
                key, value: String(value), type: 'default', enabled: true
            }))
        }))
    };
}

// Internal format helper
function createInternalEnv(name, vars) {
    return { name, variables: { ...vars } };
}

// ─── Export Format Tests ───────────────────────────────────────────────────────

describe('Environment Export: Single Env Format', () => {
    it('converts internal format to Postman env format', () => {
        const env = createInternalEnv('Production', { API_URL: 'https://api.prod.com', API_KEY: 'key123' });
        const postmanEnv = {
            name: env.name,
            values: Object.entries(env.variables).map(([key, value]) => ({
                key, value: String(value), type: 'default', enabled: true
            })),
            _postman_variable_scope: 'environment',
            _postman_exported_at: new Date().toISOString(),
            _postman_exported_using: 'PostmanHelper/1.98'
        };

        assert.equal(postmanEnv.name, 'Production');
        assert.equal(postmanEnv.values.length, 2);
        assert.equal(postmanEnv.values[0].key, 'API_URL');
        assert.equal(postmanEnv.values[0].value, 'https://api.prod.com');
        assert.equal(postmanEnv.values[0].enabled, true);
        assert.equal(postmanEnv._postman_variable_scope, 'environment');
        assert.ok(postmanEnv._postman_exported_using);
    });

    it('handles empty variables', () => {
        const env = createInternalEnv('Empty', {});
        const values = Object.entries(env.variables).map(([key, value]) => ({
            key, value: String(value), type: 'default', enabled: true
        }));
        assert.deepEqual(values, []);
    });

    it('converts numeric values to strings', () => {
        const env = createInternalEnv('Numeric', { port: 3000, timeout: 5000 });
        const values = Object.entries(env.variables).map(([key, value]) => ({
            key, value: String(value), type: 'default', enabled: true
        }));
        assert.equal(values[0].value, '3000');
        assert.equal(values[1].value, '5000');
    });
});

describe('Environment Export: Multi-Env Bundle Format', () => {
    it('creates valid bundle with type and version', () => {
        const envs = [
            createInternalEnv('Dev', { url: 'http://localhost' }),
            createInternalEnv('Prod', { url: 'https://api.com' })
        ];
        const bundle = createMultiEnvBundle(envs);

        assert.equal(bundle._type, 'postman_helper_environments');
        assert.equal(bundle._version, 1);
        assert.equal(bundle.environments.length, 2);
        assert.equal(bundle.environments[0].name, 'Dev');
        assert.equal(bundle.environments[1].name, 'Prod');
    });

    it('handles empty environments array', () => {
        const bundle = createMultiEnvBundle([]);
        assert.equal(bundle.environments.length, 0);
    });
});

// ─── Import Format Tests ───────────────────────────────────────────────────────

describe('Environment Import: Single Postman Format', () => {
    it('parses Postman env with values array', () => {
        const postman = createPostmanEnv('Staging', { BASE_URL: 'https://staging.api.com', TOKEN: 'abc' });
        const variables = {};
        for (const v of postman.values) {
            if (v.key && v.enabled !== false) {
                variables[v.key] = v.value || '';
            }
        }

        assert.equal(Object.keys(variables).length, 2);
        assert.equal(variables.BASE_URL, 'https://staging.api.com');
        assert.equal(variables.TOKEN, 'abc');
    });

    it('skips disabled variables', () => {
        const postman = {
            name: 'Test',
            values: [
                { key: 'active', value: 'yes', enabled: true },
                { key: 'disabled', value: 'no', enabled: false },
                { key: 'default', value: 'ok' } // no enabled field → treated as enabled
            ]
        };
        const variables = {};
        for (const v of postman.values) {
            if (v.key && v.enabled !== false) {
                variables[v.key] = v.value || '';
            }
        }

        assert.equal(Object.keys(variables).length, 2);
        assert.ok('active' in variables);
        assert.ok(!('disabled' in variables));
        assert.ok('default' in variables);
    });

    it('handles missing values (defaults to empty string)', () => {
        const postman = { name: 'NoVal', values: [{ key: 'empty' }] };
        const variables = {};
        for (const v of postman.values) {
            if (v.key && v.enabled !== false) {
                variables[v.key] = v.value || '';
            }
        }
        assert.equal(variables.empty, '');
    });

    it('skips entries without key', () => {
        const postman = { name: 'NoKey', values: [{ value: 'orphan' }, { key: 'valid', value: 'yes' }] };
        const variables = {};
        for (const v of postman.values) {
            if (v.key && v.enabled !== false) {
                variables[v.key] = v.value || '';
            }
        }
        assert.equal(Object.keys(variables).length, 1);
        assert.equal(variables.valid, 'yes');
    });
});

describe('Environment Import: Multi-Env Bundle', () => {
    it('parses bundle with multiple environments', () => {
        const bundle = createMultiEnvBundle([
            createInternalEnv('Dev', { url: 'http://localhost:3000' }),
            createInternalEnv('Prod', { url: 'https://api.prod.com' })
        ]);

        assert.equal(bundle._type, 'postman_helper_environments');
        assert.equal(bundle.environments.length, 2);

        // Simulate import
        const imported = [];
        for (const envData of bundle.environments) {
            const variables = {};
            if (envData.values) {
                envData.values.forEach(v => {
                    if (v.key && v.enabled !== false) { variables[v.key] = v.value || ''; }
                });
            }
            imported.push({ name: envData.name, variables });
        }

        assert.equal(imported.length, 2);
        assert.equal(imported[0].name, 'Dev');
        assert.equal(imported[0].variables.url, 'http://localhost:3000');
        assert.equal(imported[1].name, 'Prod');
    });
});

// ─── Conflict Resolution Tests ─────────────────────────────────────────────────

describe('Environment Conflict Resolution: Merge', () => {
    it('merge adds new vars without overwriting existing', () => {
        const existing = createInternalEnv('Production', { API_URL: 'https://api.com', API_KEY: 'old_key' });
        const newVars = { API_KEY: 'new_key', NEW_VAR: 'new_value' };

        // Simulate merge logic
        Object.entries(newVars).forEach(([key, value]) => {
            if (!(key in existing.variables)) {
                existing.variables[key] = value;
            }
        });

        assert.equal(existing.variables.API_URL, 'https://api.com');
        assert.equal(existing.variables.API_KEY, 'old_key'); // NOT overwritten
        assert.equal(existing.variables.NEW_VAR, 'new_value'); // Added
    });

    it('merge with no overlapping keys adds all', () => {
        const existing = createInternalEnv('Test', { A: '1' });
        const newVars = { B: '2', C: '3' };

        Object.entries(newVars).forEach(([key, value]) => {
            if (!(key in existing.variables)) {
                existing.variables[key] = value;
            }
        });

        assert.equal(Object.keys(existing.variables).length, 3);
        assert.equal(existing.variables.B, '2');
        assert.equal(existing.variables.C, '3');
    });

    it('merge with all overlapping keys changes nothing', () => {
        const existing = createInternalEnv('Test', { A: 'old_a', B: 'old_b' });
        const newVars = { A: 'new_a', B: 'new_b' };

        Object.entries(newVars).forEach(([key, value]) => {
            if (!(key in existing.variables)) {
                existing.variables[key] = value;
            }
        });

        assert.equal(existing.variables.A, 'old_a');
        assert.equal(existing.variables.B, 'old_b');
    });
});

describe('Environment Conflict Resolution: Rename', () => {
    it('generates unique name with counter suffix', () => {
        const environments = [
            createInternalEnv('Production', { A: '1' }),
            createInternalEnv('Production (2)', { B: '2' })
        ];
        const name = 'Production';
        let counter = 2;
        let newName = `${name} (${counter})`;
        while (environments.some(e => e.name === newName)) {
            counter++;
            newName = `${name} (${counter})`;
        }
        assert.equal(newName, 'Production (3)');
    });

    it('starts counter at 2 for first conflict', () => {
        const environments = [createInternalEnv('Dev', {})];
        const name = 'Dev';
        let counter = 2;
        let newName = `${name} (${counter})`;
        while (environments.some(e => e.name === newName)) {
            counter++;
            newName = `${name} (${counter})`;
        }
        assert.equal(newName, 'Dev (2)');
    });
});

// ─── Multi-Env Import with Auto-Merge ──────────────────────────────────────────

describe('Multi-Env Import with Auto-Merge', () => {
    it('imports new environments into state', () => {
        const state = { environments: [] };
        const envArray = [
            { name: 'Dev', values: [{ key: 'url', value: 'http://localhost', enabled: true }] },
            { name: 'Prod', values: [{ key: 'url', value: 'https://prod.com', enabled: true }] }
        ];

        for (const envData of envArray) {
            const variables = {};
            envData.values.forEach(v => {
                if (v.key && v.enabled !== false) { variables[v.key] = v.value || ''; }
            });
            const existing = state.environments.find(e => e.name === envData.name);
            if (!existing) {
                state.environments.push({ name: envData.name, variables });
            }
        }

        assert.equal(state.environments.length, 2);
    });

    it('auto-merges on conflict during bulk import', () => {
        const state = {
            environments: [createInternalEnv('Dev', { existing: 'old' })]
        };
        const envArray = [
            { name: 'Dev', values: [{ key: 'existing', value: 'new' }, { key: 'added', value: 'fresh' }] }
        ];

        for (const envData of envArray) {
            const variables = {};
            envData.values.forEach(v => {
                if (v.key && v.enabled !== false) { variables[v.key] = v.value || ''; }
            });
            const existing = state.environments.find(e => e.name === envData.name);
            if (existing) {
                Object.entries(variables).forEach(([key, value]) => {
                    if (!(key in existing.variables)) { existing.variables[key] = value; }
                });
            } else {
                state.environments.push({ name: envData.name, variables });
            }
        }

        assert.equal(state.environments.length, 1); // Not duplicated
        assert.equal(state.environments[0].variables.existing, 'old'); // Not overwritten
        assert.equal(state.environments[0].variables.added, 'fresh'); // Added
    });

    it('handles bundle with internal format (variables object)', () => {
        const state = { environments: [] };
        const envArray = [
            { name: 'Custom', variables: { key1: 'val1', key2: 'val2' } }
        ];

        for (const envData of envArray) {
            const variables = {};
            if (envData.values) {
                envData.values.forEach(v => {
                    if (v.key && v.enabled !== false) { variables[v.key] = v.value || ''; }
                });
            } else if (envData.variables) {
                Object.assign(variables, envData.variables);
            }
            state.environments.push({ name: envData.name, variables });
        }

        assert.equal(state.environments.length, 1);
        assert.equal(state.environments[0].variables.key1, 'val1');
    });
});

// ─── Round-Trip Tests ──────────────────────────────────────────────────────────

describe('Environment Round-Trip', () => {
    it('single env: internal → export → import preserves data', () => {
        const original = createInternalEnv('Test', { url: 'https://api.com', token: 'abc123' });

        // Export to Postman format
        const exported = {
            name: original.name,
            values: Object.entries(original.variables).map(([key, value]) => ({
                key, value: String(value), type: 'default', enabled: true
            })),
            _postman_variable_scope: 'environment'
        };

        // Import back
        const reimported = {};
        for (const v of exported.values) {
            if (v.key && v.enabled !== false) {
                reimported[v.key] = v.value || '';
            }
        }

        assert.equal(exported.name, 'Test');
        assert.deepEqual(reimported, original.variables);
    });

    it('multi-env: internal → exportAll → importAll preserves data', () => {
        const originals = [
            createInternalEnv('Dev', { url: 'http://localhost', debug: 'true' }),
            createInternalEnv('Prod', { url: 'https://api.com', debug: 'false' })
        ];

        // Export
        const bundle = createMultiEnvBundle(originals);

        // Import
        const reimported = [];
        for (const envData of bundle.environments) {
            const variables = {};
            envData.values.forEach(v => {
                if (v.key && v.enabled !== false) { variables[v.key] = v.value || ''; }
            });
            reimported.push({ name: envData.name, variables });
        }

        assert.equal(reimported.length, 2);
        assert.deepEqual(reimported[0].variables, originals[0].variables);
        assert.deepEqual(reimported[1].variables, originals[1].variables);
    });
});

// ─── Variable Substitution Tests ───────────────────────────────────────────────

describe('Variable Substitution', () => {
    function substituteVariables(text, variables) {
        if (!text) return text;
        return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
            return variables[varName] !== undefined ? variables[varName] : match;
        });
    }

    it('replaces {{varName}} with variable value', () => {
        const vars = { userId: '123', token: 'abc' };
        assert.equal(substituteVariables('https://api.com/users/{{userId}}', vars), 'https://api.com/users/123');
    });

    it('replaces multiple variables', () => {
        const vars = { host: 'api.com', version: 'v2' };
        assert.equal(substituteVariables('https://{{host}}/{{version}}/users', vars), 'https://api.com/v2/users');
    });

    it('leaves unresolved variables unchanged', () => {
        const vars = { host: 'api.com' };
        assert.equal(substituteVariables('https://{{host}}/{{missing}}', vars), 'https://api.com/{{missing}}');
    });

    it('returns text unchanged when no variables present', () => {
        assert.equal(substituteVariables('https://api.com/users', {}), 'https://api.com/users');
    });

    it('handles null/undefined text', () => {
        assert.equal(substituteVariables(null, {}), null);
        assert.equal(substituteVariables(undefined, {}), undefined);
    });

    it('works with imported environment variables', () => {
        // Simulate full cycle: create env, export, import, substitute
        const original = createInternalEnv('Test', { baseUrl: 'https://api.example.com', apiKey: 'key123' });
        const exported = createPostmanEnv(original.name, original.variables);

        const imported = {};
        for (const v of exported.values) {
            if (v.key && v.enabled !== false) { imported[v.key] = v.value || ''; }
        }

        const result = substituteVariables('{{baseUrl}}/data?key={{apiKey}}', imported);
        assert.equal(result, 'https://api.example.com/data?key=key123');
    });
});

// ─── Edge Cases ────────────────────────────────────────────────────────────────

describe('Environment Edge Cases', () => {
    it('handles environment with special characters in values', () => {
        const env = createInternalEnv('Special', {
            url: 'https://api.com/path?a=1&b=2',
            token: 'abc+def/ghi=',
            json: '{"key":"value"}'
        });
        const exported = createPostmanEnv(env.name, env.variables);
        const reimported = {};
        for (const v of exported.values) {
            if (v.key) reimported[v.key] = v.value || '';
        }
        assert.deepEqual(reimported, env.variables);
    });

    it('handles environment with empty string values', () => {
        const env = createInternalEnv('Empty Values', { blank: '', alsoBlank: '' });
        const exported = createPostmanEnv(env.name, env.variables);
        assert.equal(exported.values[0].value, '');
        assert.equal(exported.values[1].value, '');
    });

    it('handles environment with many variables', () => {
        const vars = {};
        for (let i = 0; i < 100; i++) {
            vars[`var_${i}`] = `value_${i}`;
        }
        const env = createInternalEnv('Big', vars);
        const exported = createPostmanEnv(env.name, env.variables);
        assert.equal(exported.values.length, 100);

        const reimported = {};
        for (const v of exported.values) {
            reimported[v.key] = v.value;
        }
        assert.deepEqual(reimported, vars);
    });

    it('validates invalid format (missing values array)', () => {
        const invalid = { name: 'Bad', notValues: [] };
        const isValid = invalid.values && Array.isArray(invalid.values);
        assert.ok(!isValid);
    });

    it('validates valid format (has values array)', () => {
        const valid = createPostmanEnv('Good', { a: '1' });
        const isValid = valid.values && Array.isArray(valid.values);
        assert.equal(isValid, true);
    });

    it('detects multi-env bundle format', () => {
        const bundle = createMultiEnvBundle([createInternalEnv('A', {})]);
        assert.equal(bundle._type, 'postman_helper_environments');
        assert.ok(bundle.environments);
    });

    it('does not detect single env as multi-env bundle', () => {
        const single = createPostmanEnv('Test', { a: '1' });
        const isBundle = single._type === 'postman_helper_environments' && single.environments;
        assert.equal(!!isBundle, false);
    });
});
