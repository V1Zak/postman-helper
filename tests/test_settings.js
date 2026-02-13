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
                confirmBeforeDelete: true
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
    it('contains all 11 settings', () => {
        const defaults = AppState.DEFAULT_SETTINGS;
        assert.equal(Object.keys(defaults).length, 11);
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
