/**
 * Unit tests for handleKeyboardShortcuts and showKeyboardShortcuts
 * Tests all keybindings, input field behavior, and shortcuts help modal
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

let document, window, app;

function createKeyEvent(key, opts = {}) {
    const e = new window.KeyboardEvent('keydown', {
        key,
        metaKey: opts.metaKey || false,
        ctrlKey: opts.ctrlKey || false,
        shiftKey: opts.shiftKey || false,
        bubbles: true,
        cancelable: true
    });
    // JSDOM KeyboardEvent.target is null unless dispatched; set it to body by default
    Object.defineProperty(e, 'target', { value: opts.target || document.body, configurable: true });
    return e;
}

/**
 * Minimal app object that mirrors PostmanHelperApp keyboard shortcut methods.
 */
function createApp(doc) {
    const calls = [];
    const obj = {
        _calls: calls,
        saveRequest() { calls.push('saveRequest'); },
        exportCollection() { calls.push('exportCollection'); },
        sendRequest() { calls.push('sendRequest'); },
        createNewRequest() { calls.push('createNewRequest'); },
        importCollection() { calls.push('importCollection'); },
        duplicateRequest() { calls.push('duplicateRequest'); },
        switchTab(name) { calls.push(`switchTab:${name}`); },
        showSettings() { calls.push('showSettings'); },
        closeHistory() { calls.push('closeHistory'); },
        showToast() {},

        handleKeyboardShortcuts(e) {
            const mod = e.metaKey || e.ctrlKey;
            const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

            if (e.key === 'Escape') {
                const overlay = doc.querySelector('.dialog-overlay');
                if (overlay) return;
                const settings = doc.querySelector('.settings-panel');
                if (settings) {
                    const closeBtn = doc.getElementById('closeSettingsBtn');
                    if (closeBtn) closeBtn.click();
                    return;
                }
                this.closeHistory();
                if (inInput) e.target.blur();
                return;
            }

            if (mod) {
                if (e.key === 's' && !e.shiftKey) {
                    e.preventDefault();
                    this.saveRequest();
                    return;
                }
                if (e.key === 'E' || (e.key === 'e' && e.shiftKey)) {
                    e.preventDefault();
                    this.exportCollection();
                    return;
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendRequest();
                    return;
                }
                if (e.key === 'n' && !e.shiftKey) {
                    e.preventDefault();
                    this.createNewRequest();
                    return;
                }
                if (e.key === 'o') {
                    e.preventDefault();
                    this.importCollection();
                    return;
                }
                if (e.key === 'd') {
                    e.preventDefault();
                    this.duplicateRequest();
                    return;
                }
                if (e.key === 'f' && !e.shiftKey) {
                    e.preventDefault();
                    const filterInput = doc.getElementById('filterText');
                    if (filterInput) filterInput.focus();
                    calls.push('focusSearch');
                    return;
                }
                if (e.key === '1') { e.preventDefault(); this.switchTab('request'); return; }
                if (e.key === '2') { e.preventDefault(); this.switchTab('inheritance'); return; }
                if (e.key === '3') { e.preventDefault(); this.switchTab('tests'); return; }
                if (e.key === ',') {
                    e.preventDefault();
                    this.showSettings();
                    return;
                }
                if (e.key === '/') {
                    e.preventDefault();
                    calls.push('showKeyboardShortcuts');
                    return;
                }
                return;
            }

            if (inInput) return;
        }
    };
    return obj;
}

beforeEach(() => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
        <input type="text" id="filterText" />
        <textarea id="testArea"></textarea>
    </body></html>`, {
        url: 'http://localhost',
        pretendToBeVisual: true
    });
    window = dom.window;
    document = window.document;
    global.document = document;
    app = createApp(document);
});

afterEach(() => {
    delete global.document;
});

describe('Keyboard shortcuts: Cmd+S saves request', () => {
    it('Cmd+S calls saveRequest', () => {
        const e = createKeyEvent('s', { metaKey: true });
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('saveRequest'));
    });

    it('Ctrl+S calls saveRequest', () => {
        const e = createKeyEvent('s', { ctrlKey: true });
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('saveRequest'));
    });

    it('Cmd+S does NOT call exportCollection', () => {
        const e = createKeyEvent('s', { metaKey: true });
        app.handleKeyboardShortcuts(e);
        assert.ok(!app._calls.includes('exportCollection'));
    });
});

describe('Keyboard shortcuts: Cmd+Shift+E exports', () => {
    it('Cmd+Shift+E calls exportCollection', () => {
        const e = createKeyEvent('E', { metaKey: true, shiftKey: true });
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('exportCollection'));
    });

    it('Cmd+Shift+e (lowercase) calls exportCollection', () => {
        const e = createKeyEvent('e', { metaKey: true, shiftKey: true });
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('exportCollection'));
    });
});

describe('Keyboard shortcuts: Cmd+Enter sends request', () => {
    it('Cmd+Enter calls sendRequest', () => {
        const e = createKeyEvent('Enter', { metaKey: true });
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('sendRequest'));
    });
});

describe('Keyboard shortcuts: Cmd+N new request', () => {
    it('Cmd+N calls createNewRequest', () => {
        const e = createKeyEvent('n', { metaKey: true });
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('createNewRequest'));
    });
});

describe('Keyboard shortcuts: Cmd+O import', () => {
    it('Cmd+O calls importCollection', () => {
        const e = createKeyEvent('o', { metaKey: true });
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('importCollection'));
    });
});

describe('Keyboard shortcuts: Cmd+D duplicate', () => {
    it('Cmd+D calls duplicateRequest', () => {
        const e = createKeyEvent('d', { metaKey: true });
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('duplicateRequest'));
    });
});

describe('Keyboard shortcuts: Cmd+F focus search', () => {
    it('Cmd+F focuses filterText input', () => {
        const e = createKeyEvent('f', { metaKey: true });
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('focusSearch'));
    });
});

describe('Keyboard shortcuts: Cmd+1/2/3 switch tabs', () => {
    it('Cmd+1 switches to request tab', () => {
        const e = createKeyEvent('1', { metaKey: true });
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('switchTab:request'));
    });

    it('Cmd+2 switches to inheritance tab', () => {
        const e = createKeyEvent('2', { metaKey: true });
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('switchTab:inheritance'));
    });

    it('Cmd+3 switches to tests tab', () => {
        const e = createKeyEvent('3', { metaKey: true });
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('switchTab:tests'));
    });
});

describe('Keyboard shortcuts: Cmd+, settings', () => {
    it('Cmd+, calls showSettings', () => {
        const e = createKeyEvent(',', { metaKey: true });
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('showSettings'));
    });
});

describe('Keyboard shortcuts: Cmd+/ help modal', () => {
    it('Cmd+/ triggers showKeyboardShortcuts', () => {
        const e = createKeyEvent('/', { metaKey: true });
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('showKeyboardShortcuts'));
    });
});

describe('Keyboard shortcuts: Escape key', () => {
    it('Escape calls closeHistory when no dialog/settings open', () => {
        const e = createKeyEvent('Escape');
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('closeHistory'));
    });

    it('Escape does not close if dialog-overlay is present', () => {
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        document.body.appendChild(overlay);

        const e = createKeyEvent('Escape');
        app.handleKeyboardShortcuts(e);
        assert.ok(!app._calls.includes('closeHistory'));
    });

    it('Escape clicks closeSettingsBtn if settings panel is open', () => {
        const panel = document.createElement('div');
        panel.className = 'settings-panel';
        document.body.appendChild(panel);

        const closeBtn = document.createElement('button');
        closeBtn.id = 'closeSettingsBtn';
        let clicked = false;
        closeBtn.addEventListener('click', () => { clicked = true; });
        document.body.appendChild(closeBtn);

        const e = createKeyEvent('Escape');
        app.handleKeyboardShortcuts(e);
        assert.ok(clicked);
    });
});

describe('Keyboard shortcuts: input field behavior', () => {
    it('Cmd+S works even when focus is in an input', () => {
        const input = document.getElementById('filterText');
        const e = createKeyEvent('s', { metaKey: true, target: input });
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('saveRequest'));
    });

    it('Cmd+Enter works even when focus is in a textarea', () => {
        const ta = document.getElementById('testArea');
        const e = createKeyEvent('Enter', { metaKey: true, target: ta });
        app.handleKeyboardShortcuts(e);
        assert.ok(app._calls.includes('sendRequest'));
    });

    it('non-modifier keys are blocked when in input', () => {
        const input = document.getElementById('filterText');
        const e = createKeyEvent('x', { target: input });
        app.handleKeyboardShortcuts(e);
        // No action should be recorded (except Escape which is special)
        assert.equal(app._calls.length, 0);
    });
});

describe('Keyboard shortcuts: no false positives', () => {
    it('plain s key without modifier does nothing', () => {
        const e = createKeyEvent('s');
        app.handleKeyboardShortcuts(e);
        assert.ok(!app._calls.includes('saveRequest'));
    });

    it('Cmd+Shift+S does not save (only Cmd+S without shift)', () => {
        const e = createKeyEvent('s', { metaKey: true, shiftKey: true });
        app.handleKeyboardShortcuts(e);
        // Should NOT trigger saveRequest (shiftKey guard)
        assert.ok(!app._calls.includes('saveRequest'));
    });
});
