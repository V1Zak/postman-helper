/**
 * Unit tests for Plugin System (Issue #17)
 * Tests: PluginAPI, PluginManager — registration, hooks, dispatch, enable/disable
 */
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

let PluginAPI, PluginManager;

/**
 * Extract PluginAPI and PluginManager from app.js source.
 * They sit between "// PluginAPI" and "// AppState class"
 */
function extractPluginClasses() {
    const appPath = path.join(__dirname, '..', 'app.js');
    const src = fs.readFileSync(appPath, 'utf-8');
    const lines = src.split('\n');

    let blockStart = -1;
    let blockEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^\/\/ PluginAPI/) && blockStart === -1) {
            blockStart = i;
        }
        if (blockStart > -1 && i > blockStart && lines[i].match(/^\/\/ AppState class/)) {
            blockEnd = i;
            break;
        }
    }

    if (blockStart === -1 || blockEnd === -1) {
        throw new Error(`Could not find PluginAPI/PluginManager in app.js (start=${blockStart}, end=${blockEnd})`);
    }

    const blockCode = lines.slice(blockStart, blockEnd).join('\n');
    const code = `${blockCode}\nmodule.exports = { PluginAPI, PluginManager };`;

    const Module = require('module');
    const m = new Module();
    m._compile(code, 'plugins_virtual.js');
    return m.exports;
}

before(() => {
    const classes = extractPluginClasses();
    PluginAPI = classes.PluginAPI;
    PluginManager = classes.PluginManager;
});

// ===================== PluginAPI: Constructor =====================

describe('PluginAPI: Constructor', () => {
    it('stores plugin name', () => {
        const api = new PluginAPI(null, 'test-plugin');
        assert.equal(api.pluginName, 'test-plugin');
    });

    it('stores app reference', () => {
        const mockApp = { state: {} };
        const api = new PluginAPI(mockApp, 'test');
        assert.equal(api._app, mockApp);
    });

    it('initializes empty storage', () => {
        const api = new PluginAPI(null, 'test');
        assert.ok(api._storage instanceof Map);
        assert.equal(api._storage.size, 0);
    });
});

// ===================== PluginAPI: State Access =====================

describe('PluginAPI: State Access', () => {
    it('getCurrentCollection returns state.currentCollection', () => {
        const mockApp = { state: { currentCollection: { name: 'My Col' } } };
        const api = new PluginAPI(mockApp, 'test');
        assert.deepEqual(api.getCurrentCollection(), { name: 'My Col' });
    });

    it('getCurrentCollection returns null when no app', () => {
        const api = new PluginAPI(null, 'test');
        assert.equal(api.getCurrentCollection(), null);
    });

    it('getCurrentRequest returns state.currentRequest', () => {
        const mockApp = { state: { currentRequest: { name: 'Req1' } } };
        const api = new PluginAPI(mockApp, 'test');
        assert.deepEqual(api.getCurrentRequest(), { name: 'Req1' });
    });

    it('getCurrentRequest returns null when no app', () => {
        const api = new PluginAPI(null, 'test');
        assert.equal(api.getCurrentRequest(), null);
    });

    it('getCollections returns copy of collections array', () => {
        const mockApp = { state: { collections: ['a', 'b'] } };
        const api = new PluginAPI(mockApp, 'test');
        const cols = api.getCollections();
        assert.deepEqual(cols, ['a', 'b']);
        // Verify it's a copy, not the original
        cols.push('c');
        assert.equal(mockApp.state.collections.length, 2);
    });

    it('getCollections returns empty array when no app', () => {
        const api = new PluginAPI(null, 'test');
        assert.deepEqual(api.getCollections(), []);
    });
});

// ===================== PluginAPI: Storage =====================

describe('PluginAPI: Storage', () => {
    it('setStorage and getStorage work', () => {
        const api = new PluginAPI(null, 'test');
        api.setStorage('key1', 'value1');
        assert.equal(api.getStorage('key1'), 'value1');
    });

    it('getStorage returns undefined for missing key', () => {
        const api = new PluginAPI(null, 'test');
        assert.equal(api.getStorage('missing'), undefined);
    });

    it('deleteStorage removes a key', () => {
        const api = new PluginAPI(null, 'test');
        api.setStorage('key', 'val');
        assert.equal(api.deleteStorage('key'), true);
        assert.equal(api.getStorage('key'), undefined);
    });

    it('deleteStorage returns false for missing key', () => {
        const api = new PluginAPI(null, 'test');
        assert.equal(api.deleteStorage('nope'), false);
    });

    it('getStorageData returns all storage as plain object', () => {
        const api = new PluginAPI(null, 'test');
        api.setStorage('a', 1);
        api.setStorage('b', 'two');
        const data = api.getStorageData();
        assert.deepEqual(data, { a: 1, b: 'two' });
    });

    it('loadStorageData populates storage from object', () => {
        const api = new PluginAPI(null, 'test');
        api.loadStorageData({ x: 10, y: 20 });
        assert.equal(api.getStorage('x'), 10);
        assert.equal(api.getStorage('y'), 20);
    });

    it('loadStorageData handles null/undefined gracefully', () => {
        const api = new PluginAPI(null, 'test');
        api.loadStorageData(null);
        api.loadStorageData(undefined);
        assert.equal(api._storage.size, 0);
    });

    it('setStorage overwrites existing key', () => {
        const api = new PluginAPI(null, 'test');
        api.setStorage('k', 'v1');
        api.setStorage('k', 'v2');
        assert.equal(api.getStorage('k'), 'v2');
    });
});

// ===================== PluginAPI: Notifications =====================

describe('PluginAPI: Notifications', () => {
    it('showToast calls app.showToast when available', () => {
        let called = false;
        const mockApp = { showToast: () => { called = true; } };
        const api = new PluginAPI(mockApp, 'test');
        api.showToast('hello');
        assert.ok(called);
    });

    it('showToast does not throw when app has no showToast', () => {
        const api = new PluginAPI({}, 'test');
        assert.doesNotThrow(() => api.showToast('hello'));
    });

    it('showToast does not throw when app is null', () => {
        const api = new PluginAPI(null, 'test');
        assert.doesNotThrow(() => api.showToast('hello'));
    });
});

// ===================== PluginAPI: Logging =====================

describe('PluginAPI: Logging', () => {
    it('log includes plugin name prefix', () => {
        const api = new PluginAPI(null, 'my-plugin');
        // Capture console.log
        const original = console.log;
        let captured = '';
        console.log = (msg) => { captured = msg; };
        api.log('test message');
        console.log = original;
        assert.ok(captured.includes('[plugin:my-plugin]'));
        assert.ok(captured.includes('test message'));
    });

    it('error includes plugin name prefix', () => {
        const api = new PluginAPI(null, 'my-plugin');
        const original = console.error;
        let captured = '';
        console.error = (msg) => { captured = msg; };
        api.error('error message');
        console.error = original;
        assert.ok(captured.includes('[plugin:my-plugin]'));
        assert.ok(captured.includes('error message'));
    });
});

// ===================== PluginManager: Constructor =====================

describe('PluginManager: Constructor', () => {
    it('initializes with empty plugins map', () => {
        const pm = new PluginManager(null);
        assert.ok(pm.plugins instanceof Map);
        assert.equal(pm.plugins.size, 0);
    });

    it('initializes with empty hooks map', () => {
        const pm = new PluginManager(null);
        assert.ok(pm.hooks instanceof Map);
        assert.equal(pm.hooks.size, 0);
    });

    it('stores app reference', () => {
        const mockApp = {};
        const pm = new PluginManager(mockApp);
        assert.equal(pm.app, mockApp);
    });
});

// ===================== PluginManager: Manifest Validation =====================

describe('PluginManager: validateManifest', () => {
    let pm;
    before(() => { pm = new PluginManager(null); });

    it('accepts valid manifest', () => {
        const result = pm.validateManifest({
            name: 'test', version: '1.0.0', main: 'main.js'
        });
        assert.equal(result.valid, true);
        assert.equal(result.errors.length, 0);
    });

    it('rejects null manifest', () => {
        const result = pm.validateManifest(null);
        assert.equal(result.valid, false);
    });

    it('rejects manifest missing name', () => {
        const result = pm.validateManifest({ version: '1.0.0', main: 'main.js' });
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('name')));
    });

    it('rejects manifest missing version', () => {
        const result = pm.validateManifest({ name: 'test', main: 'main.js' });
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('version')));
    });

    it('rejects manifest missing main', () => {
        const result = pm.validateManifest({ name: 'test', version: '1.0.0' });
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('main')));
    });

    it('accepts manifest with valid hooks', () => {
        const result = pm.validateManifest({
            name: 'test', version: '1.0.0', main: 'main.js',
            hooks: ['onAppReady', 'onBeforeRequestSend']
        });
        assert.equal(result.valid, true);
    });

    it('rejects manifest with unknown hooks', () => {
        const result = pm.validateManifest({
            name: 'test', version: '1.0.0', main: 'main.js',
            hooks: ['onAppReady', 'onNonExistentHook']
        });
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('Unknown hook')));
    });

    it('rejects manifest with non-array hooks', () => {
        const result = pm.validateManifest({
            name: 'test', version: '1.0.0', main: 'main.js',
            hooks: 'onAppReady'
        });
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('hooks must be an array')));
    });

    it('accepts manifest with optional description', () => {
        const result = pm.validateManifest({
            name: 'test', version: '1.0.0', main: 'main.js',
            description: 'A test plugin'
        });
        assert.equal(result.valid, true);
    });
});

// ===================== PluginManager: registerPlugin =====================

describe('PluginManager: registerPlugin', () => {
    let pm;
    beforeEach(() => { pm = new PluginManager(null); });

    it('registers a valid plugin', () => {
        const result = pm.registerPlugin(
            { name: 'test', version: '1.0.0', main: 'main.js' },
            { activate() {} }
        );
        assert.equal(result.success, true);
        assert.equal(pm.plugins.size, 1);
    });

    it('rejects duplicate plugin name', () => {
        pm.registerPlugin({ name: 'dup', version: '1.0.0', main: 'main.js' }, {});
        const result = pm.registerPlugin({ name: 'dup', version: '2.0.0', main: 'main.js' }, {});
        assert.equal(result.success, false);
        assert.ok(result.error.includes('already registered'));
    });

    it('rejects invalid manifest', () => {
        const result = pm.registerPlugin({ name: 'x' }, {});
        assert.equal(result.success, false);
        assert.ok(result.error.includes('version'));
    });

    it('registers hooks from manifest', () => {
        const handler = (data) => data;
        pm.registerPlugin(
            { name: 'test', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            { onAppReady: handler }
        );
        assert.equal(pm.hooks.get('onAppReady').length, 1);
        assert.equal(pm.hooks.get('onAppReady')[0].pluginName, 'test');
    });

    it('does not register hooks if handler is missing on module', () => {
        pm.registerPlugin(
            { name: 'test', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            {} // no onAppReady method
        );
        assert.equal(pm.hooks.get('onAppReady').length, 0);
    });

    it('creates PluginAPI for registered plugin', () => {
        pm.registerPlugin(
            { name: 'test', version: '1.0.0', main: 'main.js' }, {}
        );
        const api = pm.getPluginAPI('test');
        assert.ok(api instanceof PluginAPI);
        assert.equal(api.pluginName, 'test');
    });

    it('handles null pluginModule gracefully', () => {
        const result = pm.registerPlugin(
            { name: 'test', version: '1.0.0', main: 'main.js' }, null
        );
        assert.equal(result.success, true);
    });

    it('registers multiple plugins', () => {
        pm.registerPlugin({ name: 'a', version: '1.0.0', main: 'a.js' }, {});
        pm.registerPlugin({ name: 'b', version: '1.0.0', main: 'b.js' }, {});
        pm.registerPlugin({ name: 'c', version: '1.0.0', main: 'c.js' }, {});
        assert.equal(pm.plugins.size, 3);
    });
});

// ===================== PluginManager: activateAll =====================

describe('PluginManager: activateAll', () => {
    it('calls activate on all plugins', async () => {
        const pm = new PluginManager(null);
        let activated = [];
        pm.registerPlugin(
            { name: 'p1', version: '1.0.0', main: 'main.js' },
            { activate(api) { activated.push(api.pluginName); } }
        );
        pm.registerPlugin(
            { name: 'p2', version: '1.0.0', main: 'main.js' },
            { activate(api) { activated.push(api.pluginName); } }
        );
        await pm.activateAll();
        assert.deepEqual(activated, ['p1', 'p2']);
    });

    it('returns activation results', async () => {
        const pm = new PluginManager(null);
        pm.registerPlugin(
            { name: 'good', version: '1.0.0', main: 'main.js' },
            { activate() {} }
        );
        const results = await pm.activateAll();
        assert.equal(results.length, 1);
        assert.equal(results[0].name, 'good');
        assert.equal(results[0].activated, true);
    });

    it('disables plugin if activation fails', async () => {
        const pm = new PluginManager(null);
        pm.registerPlugin(
            { name: 'bad', version: '1.0.0', main: 'main.js' },
            { activate() { throw new Error('crash'); } }
        );
        const results = await pm.activateAll();
        assert.equal(results[0].activated, false);
        assert.ok(results[0].error.includes('crash'));
        assert.equal(pm.plugins.get('bad').enabled, false);
    });

    it('skips disabled plugins', async () => {
        const pm = new PluginManager(null);
        let activated = false;
        pm.registerPlugin(
            { name: 'disabled', version: '1.0.0', main: 'main.js' },
            { activate() { activated = true; } }
        );
        pm.disablePlugin('disabled');
        await pm.activateAll();
        assert.equal(activated, false);
    });

    it('handles plugins without activate method', async () => {
        const pm = new PluginManager(null);
        pm.registerPlugin(
            { name: 'no-activate', version: '1.0.0', main: 'main.js' }, {}
        );
        const results = await pm.activateAll();
        assert.equal(results[0].activated, true); // no error
    });
});

// ===================== PluginManager: deactivateAll =====================

describe('PluginManager: deactivateAll', () => {
    it('calls deactivate on all plugins', async () => {
        const pm = new PluginManager(null);
        let deactivated = [];
        pm.registerPlugin(
            { name: 'p1', version: '1.0.0', main: 'main.js' },
            { deactivate() { deactivated.push('p1'); } }
        );
        pm.registerPlugin(
            { name: 'p2', version: '1.0.0', main: 'main.js' },
            { deactivate() { deactivated.push('p2'); } }
        );
        await pm.deactivateAll();
        assert.deepEqual(deactivated, ['p1', 'p2']);
    });

    it('handles plugins without deactivate method', async () => {
        const pm = new PluginManager(null);
        pm.registerPlugin({ name: 'no-deact', version: '1.0.0', main: 'main.js' }, {});
        await assert.doesNotReject(() => pm.deactivateAll());
    });

    it('handles deactivation errors gracefully', async () => {
        const pm = new PluginManager(null);
        pm.registerPlugin(
            { name: 'bad', version: '1.0.0', main: 'main.js' },
            { deactivate() { throw new Error('fail'); } }
        );
        // Should not throw
        await assert.doesNotReject(() => pm.deactivateAll());
    });
});

// ===================== PluginManager: dispatchHook =====================

describe('PluginManager: dispatchHook', () => {
    it('calls registered handlers for a hook', async () => {
        const pm = new PluginManager(null);
        let called = false;
        pm.registerPlugin(
            { name: 'test', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            { onAppReady(data) { called = true; return data; } }
        );
        await pm.dispatchHook('onAppReady', {});
        assert.ok(called);
    });

    it('passes data to handler', async () => {
        const pm = new PluginManager(null);
        let received;
        pm.registerPlugin(
            { name: 'test', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            { onAppReady(data) { received = data; return data; } }
        );
        await pm.dispatchHook('onAppReady', { foo: 'bar' });
        assert.deepEqual(received, { foo: 'bar' });
    });

    it('allows transform hooks to modify data', async () => {
        const pm = new PluginManager(null);
        pm.registerPlugin(
            { name: 'transform', version: '1.0.0', main: 'main.js', hooks: ['onBeforeRequestSend'] },
            { onBeforeRequestSend(data) { return { ...data, modified: true }; } }
        );
        const result = await pm.dispatchHook('onBeforeRequestSend', { url: 'http://test' });
        assert.equal(result.modified, true);
        assert.equal(result.url, 'http://test');
    });

    it('chains multiple handlers', async () => {
        const pm = new PluginManager(null);
        pm.registerPlugin(
            { name: 'p1', version: '1.0.0', main: 'main.js', hooks: ['onBeforeRequestSend'] },
            { onBeforeRequestSend(data) { return { ...data, step1: true }; } }
        );
        pm.registerPlugin(
            { name: 'p2', version: '1.0.0', main: 'main.js', hooks: ['onBeforeRequestSend'] },
            { onBeforeRequestSend(data) { return { ...data, step2: true }; } }
        );
        const result = await pm.dispatchHook('onBeforeRequestSend', {});
        assert.equal(result.step1, true);
        assert.equal(result.step2, true);
    });

    it('handler returning undefined preserves previous data', async () => {
        const pm = new PluginManager(null);
        pm.registerPlugin(
            { name: 'noop', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            { onAppReady() { /* returns undefined */ } }
        );
        const result = await pm.dispatchHook('onAppReady', { keep: true });
        assert.equal(result.keep, true);
    });

    it('skips disabled plugin hooks', async () => {
        const pm = new PluginManager(null);
        let called = false;
        pm.registerPlugin(
            { name: 'disabled', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            { onAppReady() { called = true; } }
        );
        pm.disablePlugin('disabled');
        await pm.dispatchHook('onAppReady', {});
        assert.equal(called, false);
    });

    it('handler error does not break chain', async () => {
        const pm = new PluginManager(null);
        let p2Called = false;
        pm.registerPlugin(
            { name: 'bad', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            { onAppReady() { throw new Error('boom'); } }
        );
        pm.registerPlugin(
            { name: 'good', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            { onAppReady(data) { p2Called = true; return data; } }
        );
        await pm.dispatchHook('onAppReady', {});
        assert.ok(p2Called);
    });

    it('returns original data for unregistered hook', async () => {
        const pm = new PluginManager(null);
        const result = await pm.dispatchHook('onNonExistent', { value: 42 });
        assert.equal(result.value, 42);
    });

    it('provides api to handler as second argument', async () => {
        const pm = new PluginManager(null);
        let receivedApi;
        pm.registerPlugin(
            { name: 'apitest', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            { onAppReady(data, api) { receivedApi = api; return data; } }
        );
        await pm.dispatchHook('onAppReady', {});
        assert.ok(receivedApi instanceof PluginAPI);
        assert.equal(receivedApi.pluginName, 'apitest');
    });
});

// ===================== PluginManager: enable/disable =====================

describe('PluginManager: enable/disable', () => {
    it('disablePlugin sets enabled to false', () => {
        const pm = new PluginManager(null);
        pm.registerPlugin({ name: 'test', version: '1.0.0', main: 'main.js' }, {});
        assert.equal(pm.disablePlugin('test'), true);
        assert.equal(pm.plugins.get('test').enabled, false);
    });

    it('enablePlugin sets enabled to true', () => {
        const pm = new PluginManager(null);
        pm.registerPlugin({ name: 'test', version: '1.0.0', main: 'main.js' }, {});
        pm.disablePlugin('test');
        assert.equal(pm.enablePlugin('test'), true);
        assert.equal(pm.plugins.get('test').enabled, true);
    });

    it('disablePlugin returns false for unknown plugin', () => {
        const pm = new PluginManager(null);
        assert.equal(pm.disablePlugin('nope'), false);
    });

    it('enablePlugin returns false for unknown plugin', () => {
        const pm = new PluginManager(null);
        assert.equal(pm.enablePlugin('nope'), false);
    });
});

// ===================== PluginManager: removePlugin =====================

describe('PluginManager: removePlugin', () => {
    it('removes plugin from plugins map', () => {
        const pm = new PluginManager(null);
        pm.registerPlugin({ name: 'test', version: '1.0.0', main: 'main.js' }, {});
        assert.equal(pm.removePlugin('test'), true);
        assert.equal(pm.plugins.size, 0);
    });

    it('removes hook registrations for the plugin', () => {
        const pm = new PluginManager(null);
        pm.registerPlugin(
            { name: 'test', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            { onAppReady() {} }
        );
        pm.removePlugin('test');
        assert.equal(pm.hooks.get('onAppReady').length, 0);
    });

    it('returns false for unknown plugin', () => {
        const pm = new PluginManager(null);
        assert.equal(pm.removePlugin('nope'), false);
    });

    it('does not affect other plugins', () => {
        const pm = new PluginManager(null);
        pm.registerPlugin({ name: 'keep', version: '1.0.0', main: 'main.js' }, {});
        pm.registerPlugin({ name: 'remove', version: '1.0.0', main: 'main.js' }, {});
        pm.removePlugin('remove');
        assert.equal(pm.plugins.size, 1);
        assert.ok(pm.plugins.has('keep'));
    });
});

// ===================== PluginManager: getPluginList =====================

describe('PluginManager: getPluginList', () => {
    it('returns list of all plugins', () => {
        const pm = new PluginManager(null);
        pm.registerPlugin(
            { name: 'p1', version: '1.0.0', main: 'main.js', description: 'Plugin 1', hooks: ['onAppReady'] },
            { onAppReady() {} }
        );
        pm.registerPlugin(
            { name: 'p2', version: '2.0.0', main: 'main.js' }, {}
        );
        const list = pm.getPluginList();
        assert.equal(list.length, 2);
        assert.equal(list[0].name, 'p1');
        assert.equal(list[0].version, '1.0.0');
        assert.equal(list[0].description, 'Plugin 1');
        assert.equal(list[0].enabled, true);
        assert.deepEqual(list[0].hooks, ['onAppReady']);
        assert.equal(list[1].name, 'p2');
        assert.equal(list[1].description, '');
    });

    it('reflects enabled/disabled state', () => {
        const pm = new PluginManager(null);
        pm.registerPlugin({ name: 'test', version: '1.0.0', main: 'main.js' }, {});
        pm.disablePlugin('test');
        const list = pm.getPluginList();
        assert.equal(list[0].enabled, false);
    });

    it('returns empty list for no plugins', () => {
        const pm = new PluginManager(null);
        assert.deepEqual(pm.getPluginList(), []);
    });
});

// ===================== PluginManager: getPluginAPI =====================

describe('PluginManager: getPluginAPI', () => {
    it('returns API for registered plugin', () => {
        const pm = new PluginManager(null);
        pm.registerPlugin({ name: 'test', version: '1.0.0', main: 'main.js' }, {});
        const api = pm.getPluginAPI('test');
        assert.ok(api instanceof PluginAPI);
    });

    it('returns null for unknown plugin', () => {
        const pm = new PluginManager(null);
        assert.equal(pm.getPluginAPI('nope'), null);
    });
});

// ===================== PluginManager: VALID_HOOKS =====================

describe('PluginManager: VALID_HOOKS', () => {
    it('contains all expected hook names', () => {
        const expected = [
            'onAppReady', 'onBeforeRequestSend', 'onResponseReceive',
            'onRequestCreate', 'onRequestDelete',
            'onCollectionImport', 'onCollectionExport',
            'onBeforeTestRun', 'onTestComplete',
            'onTabSwitch', 'onTreeSelect'
        ];
        for (const hook of expected) {
            assert.ok(
                PluginManager.VALID_HOOKS.includes(hook),
                `Missing hook: ${hook}`
            );
        }
    });

    it('has 11 valid hooks', () => {
        assert.equal(PluginManager.VALID_HOOKS.length, 11);
    });
});

// ===================== Example Plugin Integration =====================

describe('Example Plugin: request-logger', () => {
    it('can load and register the example plugin', () => {
        const pm = new PluginManager(null);
        const manifest = require('../plugins/request-logger/manifest.json');
        const pluginModule = require('../plugins/request-logger/main.js');
        const result = pm.registerPlugin(manifest, pluginModule);
        assert.equal(result.success, true);
    });

    it('example plugin has valid manifest', () => {
        const pm = new PluginManager(null);
        const manifest = require('../plugins/request-logger/manifest.json');
        const validation = pm.validateManifest(manifest);
        assert.equal(validation.valid, true);
    });

    it('example plugin registers hooks correctly', () => {
        const pm = new PluginManager(null);
        const manifest = require('../plugins/request-logger/manifest.json');
        const pluginModule = require('../plugins/request-logger/main.js');
        pm.registerPlugin(manifest, pluginModule);

        assert.ok(pm.hooks.has('onBeforeRequestSend'));
        assert.ok(pm.hooks.has('onResponseReceive'));
        assert.equal(pm.hooks.get('onBeforeRequestSend').length, 1);
        assert.equal(pm.hooks.get('onResponseReceive').length, 1);
    });

    it('example plugin activate runs without error', async () => {
        const pm = new PluginManager(null);
        const manifest = require('../plugins/request-logger/manifest.json');
        const pluginModule = require('../plugins/request-logger/main.js');
        pm.registerPlugin(manifest, pluginModule);
        const results = await pm.activateAll();
        assert.equal(results[0].activated, true);
    });

    it('example plugin onBeforeRequestSend passes data through', async () => {
        const pm = new PluginManager(null);
        const manifest = require('../plugins/request-logger/manifest.json');
        const pluginModule = require('../plugins/request-logger/main.js');
        pm.registerPlugin(manifest, pluginModule);

        const data = { method: 'GET', url: 'http://test.com' };
        const result = await pm.dispatchHook('onBeforeRequestSend', data);
        assert.deepEqual(result, data);
    });

    it('example plugin onResponseReceive passes data through', async () => {
        const pm = new PluginManager(null);
        const manifest = require('../plugins/request-logger/manifest.json');
        const pluginModule = require('../plugins/request-logger/main.js');
        pm.registerPlugin(manifest, pluginModule);

        const data = { response: { status: 200 }, time: 150 };
        const result = await pm.dispatchHook('onResponseReceive', data);
        assert.deepEqual(result, data);
    });
});

// ===================== Integration: Multiple plugins =====================

describe('Integration: Multiple plugins with shared hooks', () => {
    it('multiple plugins on same hook execute in registration order', async () => {
        const pm = new PluginManager(null);
        const order = [];
        pm.registerPlugin(
            { name: 'first', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            { onAppReady() { order.push('first'); } }
        );
        pm.registerPlugin(
            { name: 'second', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            { onAppReady() { order.push('second'); } }
        );
        pm.registerPlugin(
            { name: 'third', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            { onAppReady() { order.push('third'); } }
        );
        await pm.dispatchHook('onAppReady', {});
        assert.deepEqual(order, ['first', 'second', 'third']);
    });

    it('disabling middle plugin skips it but runs others', async () => {
        const pm = new PluginManager(null);
        const order = [];
        pm.registerPlugin(
            { name: 'a', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            { onAppReady() { order.push('a'); } }
        );
        pm.registerPlugin(
            { name: 'b', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            { onAppReady() { order.push('b'); } }
        );
        pm.registerPlugin(
            { name: 'c', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            { onAppReady() { order.push('c'); } }
        );
        pm.disablePlugin('b');
        await pm.dispatchHook('onAppReady', {});
        assert.deepEqual(order, ['a', 'c']);
    });

    it('removing plugin removes its hooks', async () => {
        const pm = new PluginManager(null);
        let called = false;
        pm.registerPlugin(
            { name: 'removed', version: '1.0.0', main: 'main.js', hooks: ['onAppReady'] },
            { onAppReady() { called = true; } }
        );
        pm.removePlugin('removed');
        await pm.dispatchHook('onAppReady', {});
        assert.equal(called, false);
    });
});
