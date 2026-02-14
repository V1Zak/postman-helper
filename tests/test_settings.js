/**
 * Unit tests for AppState settings: loadSettings, saveSettings, resetSettings,
 * DEFAULT_SETTINGS, SETTINGS_KEY, and new settings properties.
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Minimal localStorage mock
function createLocalStorage() {
    const store = {};
    return {
        getItem(k) { return store[k] !== undefined ? store[k] : null; },
        setItem(k, v) { store[k] = String(v); },
        removeItem(k) { delete store[k]; },
        _store: store
    };
}

let AppState, localStorage;

beforeEach(() => {
    localStorage = createLocalStorage();
    global.localStorage = localStorage;
    global.document = {
        getElementById() { return null; },
        querySelectorAll() { return []; },
        documentElement: { setAttribute() {} }
    };

    // Recreate a minimal AppState class matching the real one
    AppState = class {
        constructor() {
            this.collections = [];
            this.currentCollection = null;
            this.currentRequest = null;
            this.currentFolder = null;
            this.unsavedChanges = false;
            this.autoSave = false;
            this.darkMode = true;
            this.autoFormat = true;
            this.showLineNumbers = true;
            this.inheritGlobally = true;
            this.defaultMethod = 'GET';
            this.requestTimeout = 30;
            this.editorFontSize = 13;
            this.maxHistoryDepth = 20;
            this.toastDuration = 2000;
            this.confirmBeforeDelete = true;
            this.aiProvider = 'openai';
            this.aiApiKey = '';
            this.aiBaseUrl = '';
            this.aiModel = '';
            this.bodyViewMode = 'raw';
            this.filters = { text: '', methods: [], hasTests: false, hasBody: false, useRegex: false };
            this.environments = [];
            this.activeEnvironment = null;
            this._dirtyRequests = new Set();
            this._cleanSnapshots = new Map();
        }

        static get SETTINGS_KEY() { return 'postman-helper-settings'; }

        static get DEFAULT_SETTINGS() {
            return {
                autoSave: false,
                darkMode: true,
                autoFormat: true,
                showLineNumbers: true,
                inheritGlobally: true,
                defaultMethod: 'GET',
                requestTimeout: 30,
                editorFontSize: 13,
                maxHistoryDepth: 20,
                toastDuration: 2000,
                confirmBeforeDelete: true,
                aiProvider: 'openai',
                aiApiKey: '',
                aiBaseUrl: '',
                aiModel: ''
            };
        }

        static get AI_PROVIDERS() {
            return {
                openai: {
                    name: 'OpenAI',
                    baseUrl: 'https://api.openai.com/v1',
                    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
                    keyUrl: 'https://platform.openai.com/api-keys',
                    keyLabel: 'OpenAI Platform'
                },
                anthropic: {
                    name: 'Anthropic',
                    baseUrl: 'https://api.anthropic.com/v1',
                    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
                    keyUrl: 'https://console.anthropic.com/settings/keys',
                    keyLabel: 'Anthropic Console'
                },
                gemini: {
                    name: 'Google Gemini',
                    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
                    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'],
                    keyUrl: 'https://aistudio.google.com/apikey',
                    keyLabel: 'Google AI Studio'
                }
            };
        }

        loadSettings() {
            try {
                const raw = localStorage.getItem(AppState.SETTINGS_KEY);
                if (raw) {
                    const saved = JSON.parse(raw);
                    const defaults = AppState.DEFAULT_SETTINGS;
                    for (const key of Object.keys(defaults)) {
                        this[key] = saved[key] !== undefined ? saved[key] : defaults[key];
                    }
                }
            } catch (e) {
                console.error('Failed to load settings from localStorage:', e);
            }
        }

        saveSettings() {
            try {
                const settings = {};
                for (const key of Object.keys(AppState.DEFAULT_SETTINGS)) {
                    settings[key] = this[key];
                }
                localStorage.setItem(AppState.SETTINGS_KEY, JSON.stringify(settings));
            } catch (e) {
                console.error('Failed to save settings to localStorage:', e);
            }
        }

        resetSettings() {
            const defaults = AppState.DEFAULT_SETTINGS;
            for (const key of Object.keys(defaults)) {
                this[key] = defaults[key];
            }
            this.saveSettings();
        }

        updateStatusBar() {}
        markAsChanged() { this.unsavedChanges = true; this.updateStatusBar(); }
    };
});

afterEach(() => {
    delete global.localStorage;
    delete global.document;
});

describe('AppState: SETTINGS_KEY', () => {
    it('returns correct key', () => {
        assert.equal(AppState.SETTINGS_KEY, 'postman-helper-settings');
    });
});

describe('AppState: DEFAULT_SETTINGS', () => {
    it('contains all 15 settings', () => {
        const defaults = AppState.DEFAULT_SETTINGS;
        assert.equal(Object.keys(defaults).length, 15);
    });

    it('darkMode defaults to true', () => {
        assert.equal(AppState.DEFAULT_SETTINGS.darkMode, true);
    });

    it('defaultMethod defaults to GET', () => {
        assert.equal(AppState.DEFAULT_SETTINGS.defaultMethod, 'GET');
    });

    it('requestTimeout defaults to 30', () => {
        assert.equal(AppState.DEFAULT_SETTINGS.requestTimeout, 30);
    });

    it('editorFontSize defaults to 13', () => {
        assert.equal(AppState.DEFAULT_SETTINGS.editorFontSize, 13);
    });

    it('maxHistoryDepth defaults to 20', () => {
        assert.equal(AppState.DEFAULT_SETTINGS.maxHistoryDepth, 20);
    });

    it('toastDuration defaults to 2000', () => {
        assert.equal(AppState.DEFAULT_SETTINGS.toastDuration, 2000);
    });

    it('confirmBeforeDelete defaults to true', () => {
        assert.equal(AppState.DEFAULT_SETTINGS.confirmBeforeDelete, true);
    });
});

describe('AppState: constructor defaults', () => {
    it('sets darkMode to true (matching HTML data-theme=dark)', () => {
        const s = new AppState();
        assert.equal(s.darkMode, true);
    });

    it('sets new settings to default values', () => {
        const s = new AppState();
        assert.equal(s.defaultMethod, 'GET');
        assert.equal(s.requestTimeout, 30);
        assert.equal(s.editorFontSize, 13);
        assert.equal(s.maxHistoryDepth, 20);
        assert.equal(s.toastDuration, 2000);
        assert.equal(s.confirmBeforeDelete, true);
    });
});

describe('AppState: loadSettings', () => {
    it('loads saved settings from localStorage', () => {
        localStorage.setItem(AppState.SETTINGS_KEY, JSON.stringify({
            darkMode: false,
            defaultMethod: 'POST',
            requestTimeout: 60,
            editorFontSize: 16
        }));
        const s = new AppState();
        s.loadSettings();
        assert.equal(s.darkMode, false);
        assert.equal(s.defaultMethod, 'POST');
        assert.equal(s.requestTimeout, 60);
        assert.equal(s.editorFontSize, 16);
    });

    it('uses defaults for missing keys', () => {
        localStorage.setItem(AppState.SETTINGS_KEY, JSON.stringify({ darkMode: false }));
        const s = new AppState();
        s.loadSettings();
        assert.equal(s.darkMode, false);
        assert.equal(s.requestTimeout, 30); // default
        assert.equal(s.confirmBeforeDelete, true); // default
    });

    it('does nothing if no saved settings', () => {
        const s = new AppState();
        s.loadSettings();
        assert.equal(s.darkMode, true); // stays at constructor default
    });

    it('handles corrupted JSON gracefully', () => {
        localStorage.setItem(AppState.SETTINGS_KEY, 'not-json');
        const s = new AppState();
        // Should not throw
        s.loadSettings();
        assert.equal(s.darkMode, true); // stays at constructor default
    });
});

describe('AppState: saveSettings', () => {
    it('saves all settings to localStorage', () => {
        const s = new AppState();
        s.defaultMethod = 'PUT';
        s.requestTimeout = 45;
        s.saveSettings();

        const saved = JSON.parse(localStorage.getItem(AppState.SETTINGS_KEY));
        assert.equal(saved.defaultMethod, 'PUT');
        assert.equal(saved.requestTimeout, 45);
        assert.equal(saved.darkMode, true);
    });

    it('saved settings contain all default keys', () => {
        const s = new AppState();
        s.saveSettings();
        const saved = JSON.parse(localStorage.getItem(AppState.SETTINGS_KEY));
        for (const key of Object.keys(AppState.DEFAULT_SETTINGS)) {
            assert.ok(key in saved, `Missing key: ${key}`);
        }
    });
});

describe('AppState: resetSettings', () => {
    it('restores all settings to defaults', () => {
        const s = new AppState();
        s.darkMode = false;
        s.defaultMethod = 'DELETE';
        s.requestTimeout = 99;
        s.editorFontSize = 20;
        s.confirmBeforeDelete = false;

        s.resetSettings();

        assert.equal(s.darkMode, true);
        assert.equal(s.defaultMethod, 'GET');
        assert.equal(s.requestTimeout, 30);
        assert.equal(s.editorFontSize, 13);
        assert.equal(s.confirmBeforeDelete, true);
    });

    it('persists reset to localStorage', () => {
        const s = new AppState();
        s.defaultMethod = 'PATCH';
        s.saveSettings();
        s.resetSettings();

        const saved = JSON.parse(localStorage.getItem(AppState.SETTINGS_KEY));
        assert.equal(saved.defaultMethod, 'GET');
    });
});

describe('AppState: round-trip save/load', () => {
    it('save then load preserves all settings', () => {
        const s1 = new AppState();
        s1.darkMode = false;
        s1.autoFormat = false;
        s1.defaultMethod = 'PATCH';
        s1.requestTimeout = 120;
        s1.editorFontSize = 18;
        s1.maxHistoryDepth = 50;
        s1.toastDuration = 5000;
        s1.confirmBeforeDelete = false;
        s1.saveSettings();

        const s2 = new AppState();
        s2.loadSettings();
        assert.equal(s2.darkMode, false);
        assert.equal(s2.autoFormat, false);
        assert.equal(s2.defaultMethod, 'PATCH');
        assert.equal(s2.requestTimeout, 120);
        assert.equal(s2.editorFontSize, 18);
        assert.equal(s2.maxHistoryDepth, 50);
        assert.equal(s2.toastDuration, 5000);
        assert.equal(s2.confirmBeforeDelete, false);
    });
});

// ===================== AI Provider Settings =====================

describe('AppState: AI_PROVIDERS', () => {
    it('has openai, anthropic, gemini providers', () => {
        const providers = AppState.AI_PROVIDERS;
        assert.ok(providers.openai);
        assert.ok(providers.anthropic);
        assert.ok(providers.gemini);
    });

    it('each provider has name, baseUrl, models, keyUrl, keyLabel', () => {
        const providers = AppState.AI_PROVIDERS;
        for (const key of Object.keys(providers)) {
            const p = providers[key];
            assert.ok(p.name, `${key} missing name`);
            assert.ok(p.baseUrl, `${key} missing baseUrl`);
            assert.ok(Array.isArray(p.models), `${key} models not an array`);
            assert.ok(p.models.length > 0, `${key} has no models`);
            assert.ok(p.keyUrl, `${key} missing keyUrl`);
            assert.ok(p.keyLabel, `${key} missing keyLabel`);
        }
    });

    it('openai baseUrl is correct', () => {
        assert.equal(AppState.AI_PROVIDERS.openai.baseUrl, 'https://api.openai.com/v1');
    });

    it('anthropic baseUrl is correct', () => {
        assert.equal(AppState.AI_PROVIDERS.anthropic.baseUrl, 'https://api.anthropic.com/v1');
    });

    it('gemini baseUrl is correct', () => {
        assert.equal(AppState.AI_PROVIDERS.gemini.baseUrl, 'https://generativelanguage.googleapis.com/v1beta');
    });

    it('openai models include gpt-4o', () => {
        assert.ok(AppState.AI_PROVIDERS.openai.models.includes('gpt-4o'));
    });

    it('anthropic models include claude-sonnet-4-20250514', () => {
        assert.ok(AppState.AI_PROVIDERS.anthropic.models.includes('claude-sonnet-4-20250514'));
    });

    it('gemini models include gemini-2.0-flash', () => {
        assert.ok(AppState.AI_PROVIDERS.gemini.models.includes('gemini-2.0-flash'));
    });

    it('provider keyUrls are valid URLs', () => {
        const providers = AppState.AI_PROVIDERS;
        for (const key of Object.keys(providers)) {
            assert.doesNotThrow(() => new URL(providers[key].keyUrl), `${key} keyUrl is invalid`);
        }
    });
});

describe('AppState: AI settings defaults', () => {
    it('aiProvider defaults to openai', () => {
        assert.equal(AppState.DEFAULT_SETTINGS.aiProvider, 'openai');
    });

    it('aiApiKey defaults to empty string', () => {
        assert.equal(AppState.DEFAULT_SETTINGS.aiApiKey, '');
    });

    it('aiBaseUrl defaults to empty string', () => {
        assert.equal(AppState.DEFAULT_SETTINGS.aiBaseUrl, '');
    });

    it('aiModel defaults to empty string', () => {
        assert.equal(AppState.DEFAULT_SETTINGS.aiModel, '');
    });

    it('constructor sets AI defaults', () => {
        const s = new AppState();
        assert.equal(s.aiProvider, 'openai');
        assert.equal(s.aiApiKey, '');
        assert.equal(s.aiBaseUrl, '');
        assert.equal(s.aiModel, '');
    });
});

describe('AppState: AI settings save/load round-trip', () => {
    it('saves and loads AI provider settings', () => {
        const s1 = new AppState();
        s1.aiProvider = 'anthropic';
        s1.aiApiKey = 'sk-ant-test123';
        s1.aiBaseUrl = 'https://api.anthropic.com/v1';
        s1.aiModel = 'claude-sonnet-4-20250514';
        s1.saveSettings();

        const s2 = new AppState();
        s2.loadSettings();
        assert.equal(s2.aiProvider, 'anthropic');
        assert.equal(s2.aiApiKey, 'sk-ant-test123');
        assert.equal(s2.aiBaseUrl, 'https://api.anthropic.com/v1');
        assert.equal(s2.aiModel, 'claude-sonnet-4-20250514');
    });

    it('reset clears AI settings to defaults', () => {
        const s = new AppState();
        s.aiProvider = 'gemini';
        s.aiApiKey = 'gemini-key';
        s.aiBaseUrl = 'https://custom.url/v1';
        s.aiModel = 'gemini-2.0-flash';
        s.saveSettings();
        s.resetSettings();

        assert.equal(s.aiProvider, 'openai');
        assert.equal(s.aiApiKey, '');
        assert.equal(s.aiBaseUrl, '');
        assert.equal(s.aiModel, '');
    });

    it('AI settings included in saved data', () => {
        const s = new AppState();
        s.aiProvider = 'openai';
        s.aiApiKey = 'sk-test';
        s.saveSettings();

        const saved = JSON.parse(localStorage.getItem(AppState.SETTINGS_KEY));
        assert.ok('aiProvider' in saved);
        assert.ok('aiApiKey' in saved);
        assert.ok('aiBaseUrl' in saved);
        assert.ok('aiModel' in saved);
    });

    it('loads AI settings with defaults for missing keys (backward compat)', () => {
        // Simulate old saved settings without AI keys
        localStorage.setItem(AppState.SETTINGS_KEY, JSON.stringify({
            darkMode: false,
            autoSave: true
        }));
        const s = new AppState();
        s.loadSettings();
        assert.equal(s.darkMode, false);
        assert.equal(s.autoSave, true);
        // AI settings should fall back to defaults
        assert.equal(s.aiProvider, 'openai');
        assert.equal(s.aiApiKey, '');
        assert.equal(s.aiBaseUrl, '');
        assert.equal(s.aiModel, '');
    });
});
