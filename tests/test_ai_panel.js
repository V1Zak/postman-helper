/**
 * Unit tests for AIPanel — AI assistant slide-up panel with quick actions and chat
 * Tests: init, toggle, open/close, clearChat, message rendering, quick actions, context, escaping,
 *        collection context, analytics context, action parsing, action execution
 */
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let AIPanel, Request, Collection, Folder;

/**
 * Extract AIPanel from app.js source, along with the model classes it depends on.
 * Model classes: between "function generateUUID()" and "// Custom Dialog System"
 * AIPanel: between "// AIPanel" and "// Autosave sanitisation"
 */
function extractAIPanel() {
    const appPath = path.join(__dirname, '..', 'app.js');
    const src = fs.readFileSync(appPath, 'utf-8');
    const lines = src.split('\n');

    // Extract model classes (Request, Collection, Folder) first
    let modelsStart = -1, modelsEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^function generateUUID\(\)/) && modelsStart === -1) modelsStart = i;
        if (lines[i].match(/^Request = class \{/) && modelsStart === -1) modelsStart = i;
        if (modelsStart > -1 && lines[i].match(/^\/\/ Custom Dialog System/)) { modelsEnd = i; break; }
    }

    // Extract AIPanel block
    let blockStart = -1, blockEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^\/\/ AIPanel/) && blockStart === -1) blockStart = i;
        if (blockStart > -1 && i > blockStart && lines[i].match(/^\/\/ Autosave sanitisation/)) { blockEnd = i; break; }
    }

    if (blockStart === -1 || blockEnd === -1) {
        throw new Error(`Could not find AIPanel in app.js (start=${blockStart}, end=${blockEnd})`);
    }

    const modelsCode = (modelsStart > -1 && modelsEnd > -1) ? lines.slice(modelsStart, modelsEnd).join('\n') : '';
    const panelCode = lines.slice(blockStart, blockEnd).join('\n');
    const code = modelsCode + '\n' + panelCode + '\nmodule.exports = { AIPanel, Request, Collection, Folder };';

    const Module = require('module');
    const m = new Module('ai_panel_virtual.js');
    m._compile(code, 'ai_panel_virtual.js');
    return m.exports;
}

before(() => {
    const exported = extractAIPanel();
    AIPanel = exported.AIPanel;
    Request = exported.Request;
    Collection = exported.Collection;
    Folder = exported.Folder;
});

// --- Helper: set up a minimal DOM with AI panel elements ---
function setupDOM() {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
        <button id="aiAssistantFab" class="ai-fab"></button>
        <div id="aiPanel" class="ai-panel" style="display:none;">
            <div class="ai-panel-header">
                <div class="ai-panel-title">AI Assistant</div>
                <div class="ai-panel-actions">
                    <button id="aiPanelClearBtn">Clear</button>
                    <button id="aiPanelCloseBtn">&times;</button>
                </div>
            </div>
            <div id="aiQuickActions" class="ai-quick-actions">
                <button class="ai-action-btn" data-action="headers"><span class="ai-action-icon">H</span> Suggest Headers</button>
                <button class="ai-action-btn" data-action="body"><span class="ai-action-icon">{}</span> Generate Body</button>
                <button class="ai-action-btn" data-action="tests"><span class="ai-action-icon">T</span> Generate Tests</button>
                <button class="ai-action-btn" data-action="url"><span class="ai-action-icon">/</span> Complete URL</button>
                <button class="ai-action-btn ai-action-error" data-action="error" style="display:none;"><span class="ai-action-icon">!</span> Analyze Response</button>
            </div>
            <div id="aiMessages" class="ai-messages">
                <div class="ai-welcome-msg"><p>Welcome</p></div>
            </div>
            <div class="ai-input-area">
                <textarea id="aiChatInput" class="ai-chat-input"></textarea>
                <button id="aiSendBtn" class="ai-send-btn">Send</button>
            </div>
            <div id="aiNotConfigured" class="ai-not-configured" style="display:none;">
                <p>AI not configured</p>
                <button id="aiOpenSettingsBtn">Open Settings</button>
            </div>
        </div>
        <input type="text" id="requestUrl" value="https://api.example.com/users">
        <textarea id="requestBody"></textarea>
    </body></html>`, {
        url: 'http://localhost',
        pretendToBeVisual: true
    });
    global.document = dom.window.document;
    global.window = dom.window;
    global.navigator = dom.window.navigator;
    global.Event = dom.window.Event;
    // NOTE: Do NOT override global.setTimeout with JSDOM's — causes infinite recursion
    return dom;
}

function createMockApp(overrides) {
    const defaults = {
        state: {
            currentRequest: {
                name: 'Get Users',
                method: 'GET',
                url: 'https://api.example.com/users',
                headers: { 'Content-Type': 'application/json' },
                body: '',
                description: 'Fetch all users',
                tests: ''
            },
            currentCollection: {
                requests: [
                    { url: 'https://api.example.com/users' },
                    { url: 'https://api.example.com/posts' }
                ]
            }
        },
        showToast: function() {},
        showSettings: function() {},
        switchTab: function() {},
        addRequestHeader: function() {}
    };
    return Object.assign({}, defaults, overrides || {});
}

// =============================================================
describe('AIPanel — Extraction', () => {
    it('AIPanel class is extracted', () => {
        assert.ok(AIPanel);
        assert.strictEqual(typeof AIPanel, 'function');
    });
});

describe('AIPanel — Constructor', () => {
    it('creates with default state', () => {
        const panel = new AIPanel({});
        assert.strictEqual(panel.isOpen, false);
        assert.strictEqual(panel.isEnabled, false);
        assert.deepStrictEqual(panel.messages, []);
        assert.strictEqual(panel._lastResponse, null);
        assert.strictEqual(panel._busy, false);
    });
});

describe('AIPanel — init', () => {
    beforeEach(() => setupDOM());

    it('binds to DOM elements', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        assert.ok(panel.fab);
        assert.ok(panel.panel);
        assert.ok(panel.messagesEl);
        assert.ok(panel.inputEl);
        assert.ok(panel.sendBtn);
        assert.ok(panel.closeBtn);
        assert.ok(panel.clearBtn);
        assert.ok(panel.quickActions);
        assert.ok(panel.notConfigured);
    });

    it('handles missing DOM elements gracefully', () => {
        // Remove the main elements
        document.getElementById('aiAssistantFab').remove();
        document.getElementById('aiPanel').remove();
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init(); // Should not throw
        assert.strictEqual(panel.fab, null);
    });
});

describe('AIPanel — toggle / open / close', () => {
    beforeEach(() => setupDOM());

    it('open shows the panel', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        panel.open();
        assert.strictEqual(panel.isOpen, true);
        assert.strictEqual(panel.panel.style.display, 'flex');
        assert.ok(panel.fab.classList.contains('open'));
    });

    it('close hides the panel', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        panel.open();
        panel.close();
        assert.strictEqual(panel.isOpen, false);
        assert.strictEqual(panel.panel.style.display, 'none');
        assert.ok(!panel.fab.classList.contains('open'));
    });

    it('toggle flips open/close', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        panel.toggle();
        assert.strictEqual(panel.isOpen, true);
        panel.toggle();
        assert.strictEqual(panel.isOpen, false);
    });
});

describe('AIPanel — clearChat', () => {
    beforeEach(() => setupDOM());

    it('clears messages and resets message area', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        panel._addMessage('user', 'Hello');
        panel._addMessage('assistant', 'Hi');
        assert.strictEqual(panel.messages.length, 2);

        panel.clearChat();
        assert.strictEqual(panel.messages.length, 0);
        assert.ok(panel.messagesEl.innerHTML.includes('ai-welcome-msg'));
    });
});

describe('AIPanel — _addMessage', () => {
    beforeEach(() => setupDOM());

    it('adds user message with correct structure', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        panel._addMessage('user', 'test question');
        assert.strictEqual(panel.messages.length, 1);
        assert.strictEqual(panel.messages[0].role, 'user');
        const msgEl = panel.messagesEl.querySelector('.ai-msg.user');
        assert.ok(msgEl);
        assert.ok(msgEl.querySelector('.ai-msg-label').textContent === 'You');
    });

    it('adds assistant message with correct structure', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        panel._addMessage('assistant', 'test answer');
        const msgEl = panel.messagesEl.querySelector('.ai-msg.assistant');
        assert.ok(msgEl);
        assert.ok(msgEl.querySelector('.ai-msg-label').textContent === 'AI');
    });

    it('removes welcome message on first message', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        assert.ok(panel.messagesEl.querySelector('.ai-welcome-msg'));
        panel._addMessage('user', 'hello');
        assert.strictEqual(panel.messagesEl.querySelector('.ai-welcome-msg'), null);
    });

    it('renders action buttons for assistant messages', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        let clicked = false;
        panel._addMessage('assistant', 'result', [
            { label: 'Copy', handler: () => { clicked = true; } }
        ]);
        const actionBtn = panel.messagesEl.querySelector('.ai-msg-action-btn');
        assert.ok(actionBtn);
        assert.strictEqual(actionBtn.textContent, 'Copy');
        actionBtn.click();
        assert.strictEqual(clicked, true);
    });
});

describe('AIPanel — _renderContent', () => {
    it('escapes HTML in content', () => {
        const panel = new AIPanel({});
        const result = panel._renderContent('<script>alert("xss")</script>');
        assert.ok(!result.includes('<script>'));
        assert.ok(result.includes('&lt;script&gt;'));
    });

    it('renders code blocks', () => {
        const panel = new AIPanel({});
        const result = panel._renderContent('Here:\n```json\n{"a":1}\n```');
        assert.ok(result.includes('<pre>'));
        assert.ok(result.includes('{&quot;a&quot;:1}'));
    });

    it('renders inline code', () => {
        const panel = new AIPanel({});
        const result = panel._renderContent('Use `npm install`');
        assert.ok(result.includes('<code>npm install</code>'));
    });

    it('renders bold text', () => {
        const panel = new AIPanel({});
        const result = panel._renderContent('This is **bold** text');
        assert.ok(result.includes('<strong>bold</strong>'));
    });

    it('converts newlines to br', () => {
        const panel = new AIPanel({});
        const result = panel._renderContent('line1\nline2');
        assert.ok(result.includes('<br>'));
    });
});

describe('AIPanel — _escapeHtml', () => {
    it('escapes all HTML entities', () => {
        const panel = new AIPanel({});
        const result = panel._escapeHtml('<div class="test">&\'end</div>');
        assert.ok(result.includes('&lt;'));
        assert.ok(result.includes('&gt;'));
        assert.ok(result.includes('&amp;'));
        assert.ok(result.includes('&quot;'));
        assert.ok(result.includes('&#039;'));
    });

    it('handles null/empty', () => {
        const panel = new AIPanel({});
        assert.strictEqual(panel._escapeHtml(null), '');
        assert.strictEqual(panel._escapeHtml(''), '');
    });
});

describe('AIPanel — _getRequestContext', () => {
    it('returns request data when available', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        const ctx = panel._getRequestContext();
        assert.strictEqual(ctx.method, 'GET');
        assert.strictEqual(ctx.url, 'https://api.example.com/users');
        assert.strictEqual(ctx.name, 'Get Users');
    });

    it('returns null when no request selected', () => {
        const app = createMockApp({ state: { currentRequest: null } });
        const panel = new AIPanel(app);
        assert.strictEqual(panel._getRequestContext(), null);
    });

    it('returns null when no app', () => {
        const panel = new AIPanel(null);
        assert.strictEqual(panel._getRequestContext(), null);
    });
});

describe('AIPanel — _getExistingUrls', () => {
    it('returns URLs from current collection', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        const urls = panel._getExistingUrls();
        assert.deepStrictEqual(urls, [
            'https://api.example.com/users',
            'https://api.example.com/posts'
        ]);
    });

    it('returns empty array when no collection', () => {
        const app = createMockApp({ state: { currentCollection: null } });
        const panel = new AIPanel(app);
        assert.deepStrictEqual(panel._getExistingUrls(), []);
    });
});

describe('AIPanel — setLastResponse', () => {
    beforeEach(() => setupDOM());

    it('stores the response', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        const resp = { status: 200, body: '{}', success: true };
        panel.setLastResponse(resp);
        assert.strictEqual(panel._lastResponse, resp);
    });

    it('shows error action button when response exists', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        const errorBtn = panel.quickActions.querySelector('[data-action="error"]');
        assert.strictEqual(errorBtn.style.display, 'none');

        panel.setLastResponse({ status: 500, body: 'error' });
        assert.strictEqual(errorBtn.style.display, 'inline-flex');
    });

    it('hides error action when response is null', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        panel.setLastResponse({ status: 200 });
        panel.setLastResponse(null);
        const errorBtn = panel.quickActions.querySelector('[data-action="error"]');
        // null response hides the button
        assert.strictEqual(errorBtn.style.display, 'none');
    });
});

describe('AIPanel — _showLoading / _removeLoading', () => {
    beforeEach(() => setupDOM());

    it('shows and removes loading indicator', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        const loader = panel._showLoading();
        assert.ok(loader);
        assert.ok(panel.messagesEl.querySelector('.ai-loading'));

        panel._removeLoading(loader);
        assert.strictEqual(panel.messagesEl.querySelector('.ai-loading'), null);
    });
});

describe('AIPanel — _setActionLoading', () => {
    beforeEach(() => setupDOM());

    it('adds and removes loading class', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        const btn = panel.quickActions.querySelector('[data-action="headers"]');
        panel._setActionLoading(btn, true);
        assert.ok(btn.classList.contains('loading'));
        assert.ok(btn.textContent.includes('Loading...'));

        panel._setActionLoading(btn, false);
        assert.ok(!btn.classList.contains('loading'));
    });
});

describe('AIPanel — _applyBody', () => {
    beforeEach(() => setupDOM());

    it('sets body textarea value', () => {
        const toastCalls = [];
        const app = createMockApp({ showToast: function(msg, dur, type) { toastCalls.push({ msg, type }); } });
        const panel = new AIPanel(app);
        panel.init();
        panel._applyBody('{"name":"test"}');
        assert.strictEqual(document.getElementById('requestBody').value, '{"name":"test"}');
        assert.strictEqual(toastCalls.length, 1);
        assert.strictEqual(toastCalls[0].type, 'success');
    });
});

describe('AIPanel — _applyUrl', () => {
    beforeEach(() => setupDOM());

    it('sets URL input value', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        panel._applyUrl('https://api.new.com/v2/items');
        assert.strictEqual(document.getElementById('requestUrl').value, 'https://api.new.com/v2/items');
    });
});

describe('AIPanel — _applyHeaders', () => {
    it('calls addRequestHeader for each suggestion', () => {
        const added = [];
        const app = createMockApp({
            addRequestHeader: function(k, v) { added.push({ key: k, value: v }); },
            showToast: function() {}
        });
        const panel = new AIPanel(app);
        panel._applyHeaders([
            { key: 'Authorization', value: 'Bearer xxx' },
            { key: 'Accept', value: 'application/json' }
        ]);
        assert.strictEqual(added.length, 2);
        assert.strictEqual(added[0].key, 'Authorization');
        assert.strictEqual(added[1].key, 'Accept');
    });

    it('handles empty suggestions gracefully', () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel._applyHeaders([]); // Should not throw
        panel._applyHeaders(null); // Should not throw
    });
});

describe('AIPanel — _applyTests', () => {
    it('sets tests on current request and switches tab', () => {
        let switchedTo = null;
        const app = createMockApp({
            switchTab: function(tab) { switchedTo = tab; },
            showToast: function() {}
        });
        const panel = new AIPanel(app);
        panel._applyTests("tests['ok'] = true;");
        assert.strictEqual(app.state.currentRequest.tests, "tests['ok'] = true;");
        assert.strictEqual(switchedTo, 'tests');
    });
});

describe('AIPanel — quick action: no request selected', () => {
    beforeEach(() => setupDOM());

    it('shows message when no request is selected', async () => {
        const app = createMockApp({ state: { currentRequest: null, currentCollection: null } });
        const panel = new AIPanel(app);
        panel.init();
        const btn = panel.quickActions.querySelector('[data-action="headers"]');
        await panel.runQuickAction('headers', btn);
        assert.ok(panel.messages.some(m => m.content.includes('select a request')));
    });
});

describe('AIPanel — quick action: error with no response', () => {
    beforeEach(() => setupDOM());

    it('shows message when no response available', async () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        panel._lastResponse = null;
        const btn = panel.quickActions.querySelector('[data-action="error"]');
        await panel.runQuickAction('error', btn);
        assert.ok(panel.messages.some(m => m.content.includes('No response to analyze')));
    });
});

describe('AIPanel — _checkEnabled', () => {
    beforeEach(() => setupDOM());

    it('shows not-configured overlay when AI is disabled', async () => {
        global.window.electronAPI = { aiIsEnabled: async () => ({ enabled: false }) };
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        await panel.checkEnabled();
        assert.strictEqual(panel.isEnabled, false);
        assert.strictEqual(panel.notConfigured.style.display, 'flex');
    });

    it('hides not-configured overlay when AI is enabled', async () => {
        global.window.electronAPI = { aiIsEnabled: async () => ({ enabled: true }) };
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        await panel.checkEnabled();
        assert.strictEqual(panel.isEnabled, true);
        assert.strictEqual(panel.notConfigured.style.display, 'none');
    });

    it('handles missing electronAPI gracefully', async () => {
        delete global.window.electronAPI;
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        await panel.checkEnabled();
        assert.strictEqual(panel.isEnabled, false);
    });
});

describe('AIPanel — sendMessage', () => {
    beforeEach(() => setupDOM());

    it('does nothing when input is empty', async () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        panel.inputEl.value = '';
        await panel.sendMessage();
        assert.strictEqual(panel.messages.length, 0);
    });

    it('adds user message and assistant response from chat API', async () => {
        global.window.electronAPI = {
            aiIsEnabled: async () => ({ enabled: true }),
            aiChat: async (data) => ({ content: 'AI says hello', usage: null })
        };
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        panel.inputEl.value = 'What headers should I use?';
        await panel.sendMessage();
        assert.strictEqual(panel.messages.length, 2);
        assert.strictEqual(panel.messages[0].role, 'user');
        assert.strictEqual(panel.messages[1].role, 'assistant');
        assert.ok(panel.messages[1].content.includes('AI says hello'));
        // Input should be cleared
        assert.strictEqual(panel.inputEl.value, '');
    });

    it('handles chat API error', async () => {
        global.window.electronAPI = {
            aiIsEnabled: async () => ({ enabled: true }),
            aiChat: async () => ({ content: '', error: 'Rate limit exceeded' })
        };
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        panel.inputEl.value = 'test';
        await panel.sendMessage();
        assert.strictEqual(panel.messages.length, 2);
        assert.ok(panel.messages[1].content.includes('Rate limit exceeded'));
    });

    it('handles chat API exception', async () => {
        global.window.electronAPI = {
            aiIsEnabled: async () => ({ enabled: true }),
            aiChat: async () => { throw new Error('Network failure'); }
        };
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        panel.inputEl.value = 'test';
        await panel.sendMessage();
        assert.ok(panel.messages[1].content.includes('Network failure'));
    });

    it('prevents concurrent sends', async () => {
        let callCount = 0;
        global.window.electronAPI = {
            aiIsEnabled: async () => ({ enabled: true }),
            aiChat: async () => {
                callCount++;
                await new Promise(r => setTimeout(r, 50));
                return { content: 'ok' };
            }
        };
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        panel.inputEl.value = 'first';
        const p1 = panel.sendMessage();
        panel.inputEl.value = 'second';
        const p2 = panel.sendMessage(); // should be blocked
        await Promise.all([p1, p2]);
        assert.strictEqual(callCount, 1);
    });
});

describe('AIPanel — runQuickAction: headers', () => {
    beforeEach(() => setupDOM());

    it('calls aiSuggestHeaders and displays results', async () => {
        global.window.electronAPI = {
            aiIsEnabled: async () => ({ enabled: true }),
            aiSuggestHeaders: async () => ({
                suggestions: [
                    { key: 'Authorization', value: 'Bearer token' },
                    { key: 'Accept', value: 'application/json' }
                ]
            })
        };
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        const btn = panel.quickActions.querySelector('[data-action="headers"]');
        await panel.runQuickAction('headers', btn);
        // Should have user msg + assistant msg
        assert.ok(panel.messages.length >= 2);
        assert.ok(panel.messages.some(m => m.content.includes('Authorization')));
    });

    it('handles empty suggestions', async () => {
        global.window.electronAPI = {
            aiIsEnabled: async () => ({ enabled: true }),
            aiSuggestHeaders: async () => ({ suggestions: [] })
        };
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        const btn = panel.quickActions.querySelector('[data-action="headers"]');
        await panel.runQuickAction('headers', btn);
        assert.ok(panel.messages.some(m => m.content.includes('No header suggestions')));
    });
});

describe('AIPanel — runQuickAction: body', () => {
    beforeEach(() => setupDOM());

    it('calls aiGenerateBody and displays result', async () => {
        global.window.electronAPI = {
            aiIsEnabled: async () => ({ enabled: true }),
            aiGenerateBody: async () => ({ body: '{"name":"John","email":"john@example.com"}' })
        };
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        const btn = panel.quickActions.querySelector('[data-action="body"]');
        await panel.runQuickAction('body', btn);
        assert.ok(panel.messages.some(m => m.content.includes('John')));
    });
});

describe('AIPanel — runQuickAction: tests', () => {
    beforeEach(() => setupDOM());

    it('calls aiGenerateTests and displays result', async () => {
        global.window.electronAPI = {
            aiIsEnabled: async () => ({ enabled: true }),
            aiGenerateTests: async () => ({ tests: "tests['Status is 200'] = responseCode.code === 200;" })
        };
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        const btn = panel.quickActions.querySelector('[data-action="tests"]');
        await panel.runQuickAction('tests', btn);
        assert.ok(panel.messages.some(m => m.content.includes('Status is 200')));
    });
});

describe('AIPanel — runQuickAction: url', () => {
    beforeEach(() => setupDOM());

    it('calls aiSuggestUrl and displays results', async () => {
        global.window.electronAPI = {
            aiIsEnabled: async () => ({ enabled: true }),
            aiSuggestUrl: async () => ({
                suggestions: ['https://api.example.com/users/1', 'https://api.example.com/users?page=2']
            })
        };
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        const btn = panel.quickActions.querySelector('[data-action="url"]');
        await panel.runQuickAction('url', btn);
        assert.ok(panel.messages.some(m => m.content.includes('users/1')));
    });
});

describe('AIPanel — runQuickAction: error', () => {
    beforeEach(() => setupDOM());

    it('calls aiAnalyzeError with response context', async () => {
        let receivedData = null;
        global.window.electronAPI = {
            aiIsEnabled: async () => ({ enabled: true }),
            aiAnalyzeError: async (data) => {
                receivedData = data;
                return { analysis: 'The 404 indicates the resource was not found. Check the URL path.' };
            }
        };
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        panel._lastResponse = { status: 404, body: '{"error":"not found"}', success: false };
        const btn = panel.quickActions.querySelector('[data-action="error"]');
        await panel.runQuickAction('error', btn);
        assert.ok(receivedData);
        assert.strictEqual(receivedData.responseStatus, 404);
        assert.ok(panel.messages.some(m => m.content.includes('resource was not found')));
    });
});

describe('AIPanel — unknown action', () => {
    beforeEach(() => setupDOM());

    it('shows unknown action message', async () => {
        const app = createMockApp();
        const panel = new AIPanel(app);
        panel.init();
        const btn = document.createElement('button');
        btn.innerHTML = '<span class="ai-action-icon">?</span> Unknown';
        await panel.runQuickAction('nonexistent', btn);
        assert.ok(panel.messages.some(m => m.content.includes('Unknown action')));
    });
});

// ===================================================================
// New tests for collection context, analytics context, action parsing/execution
// ===================================================================

function createRichMockApp() {
    const col1 = new Collection('Users API', 'User management');
    const req1 = new Request('Get Users', 'GET', 'https://api.example.com/users', {'Accept': 'application/json'}, '', 'Get all users');
    const req2 = new Request('Create User', 'POST', 'https://api.example.com/users', {'Content-Type': 'application/json'}, '{"name":"John"}', 'Create a new user');
    const folder1 = new Folder('Auth');
    const req3 = new Request('Login', 'POST', 'https://api.example.com/auth/login', {}, '{"user":"admin","pass":"123"}', '');
    folder1.addRequest(req3);
    col1.addRequest(req1);
    col1.addRequest(req2);
    col1.addFolder(folder1);

    const col2 = new Collection('Products API');
    const req4 = new Request('List Products', 'GET', 'https://api.example.com/products');
    col2.addRequest(req4);

    const analytics = {
        stats: {
            requestsSent: 42,
            requestsCreated: 10,
            requestsDeleted: 2,
            collectionsCreated: 3,
            collectionsImported: 1,
            collectionsExported: 2,
            methodBreakdown: { GET: 25, POST: 15, PUT: 2 },
            statusCodeBreakdown: { '200': 30, '201': 8, '404': 4 },
            responseTimes: [100, 200, 150, 300]
        },
        track: function() {},
        getAverageResponseTime: function() { return 188; },
        getSuccessRate: function() { return 90; },
        getTopEndpoints: function() { return [['/users', 20], ['/products', 10]]; },
        getRecentActivity: function() { return []; }
    };

    return {
        state: {
            collections: [col1, col2],
            currentCollection: col1,
            currentRequest: req1,
            currentFolder: null,
            markAsChanged: function() {},
            setCurrentRequest: function(r) { this.currentRequest = r; },
            setCurrentFolder: function(f) { this.currentFolder = f; },
            addCollection: function(c) { this.collections.push(c); if (!this.currentCollection) this.currentCollection = c; },
            removeCollection: function(c) { const idx = this.collections.indexOf(c); if (idx > -1) this.collections.splice(idx, 1); },
            updateStatusBar: function() {}
        },
        analytics: analytics,
        showToast: function() {},
        showSettings: function() {},
        switchTab: function() {},
        addRequestHeader: function() {},
        updateCollectionTree: function() {},
        updateTabContent: function() {}
    };
}

describe('AIPanel — _buildCollectionContext', () => {
    it('serializes all collections with request counts', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const ctx = panel._buildCollectionContext();
        assert.ok(ctx.includes('COLLECTIONS (2 total)'));
        assert.ok(ctx.includes('"Users API"'));
        assert.ok(ctx.includes('"Products API"'));
        assert.ok(ctx.includes('[ACTIVE]'));
        assert.ok(ctx.includes('3 requests')); // Users API has 3 (2 root + 1 in folder)
        assert.ok(ctx.includes('GET https://api.example.com/users'));
        assert.ok(ctx.includes('[Folder] "Auth"'));
        assert.ok(ctx.includes('POST https://api.example.com/auth/login'));
    });

    it('marks selected request', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const ctx = panel._buildCollectionContext();
        assert.ok(ctx.includes('[SELECTED]'));
        // The selected request should be "Get Users"
        assert.ok(ctx.includes('"Get Users" [SELECTED]'));
    });

    it('returns empty message when no collections', () => {
        const app = createRichMockApp();
        app.state.collections = [];
        const panel = new AIPanel(app);
        assert.strictEqual(panel._buildCollectionContext(), 'No collections loaded.');
    });

    it('returns no-state message when no app', () => {
        const panel = new AIPanel(null);
        assert.strictEqual(panel._buildCollectionContext(), 'No app state available.');
    });
});

describe('AIPanel — _buildAnalyticsContext', () => {
    it('serializes analytics stats', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const ctx = panel._buildAnalyticsContext();
        assert.ok(ctx.includes('ANALYTICS:'));
        assert.ok(ctx.includes('Requests sent: 42'));
        assert.ok(ctx.includes('Avg response time: 188ms'));
        assert.ok(ctx.includes('Success rate (2xx): 90%'));
        assert.ok(ctx.includes('GET:25'));
        assert.ok(ctx.includes('200:30'));
        assert.ok(ctx.includes('/users (20x)'));
    });

    it('handles no analytics', () => {
        const app = createRichMockApp();
        app.analytics = null;
        const panel = new AIPanel(app);
        assert.strictEqual(panel._buildAnalyticsContext(), 'No analytics available.');
    });
});

describe('AIPanel — _getSelectedRequestDetail', () => {
    it('returns full details of selected request', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const detail = panel._getSelectedRequestDetail();
        assert.ok(detail.includes('SELECTED REQUEST DETAIL:'));
        assert.ok(detail.includes('Name: Get Users'));
        assert.ok(detail.includes('Method: GET'));
        assert.ok(detail.includes('URL: https://api.example.com/users'));
        assert.ok(detail.includes('Description: Get all users'));
    });

    it('returns empty when no request selected', () => {
        const app = createRichMockApp();
        app.state.currentRequest = null;
        const panel = new AIPanel(app);
        assert.strictEqual(panel._getSelectedRequestDetail(), '');
    });
});

describe('AIPanel — _buildSystemPrompt', () => {
    it('includes collection context, analytics, and action schema', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const prompt = panel._buildSystemPrompt();
        assert.ok(prompt.includes('COLLECTIONS'));
        assert.ok(prompt.includes('ANALYTICS'));
        assert.ok(prompt.includes('SELECTED REQUEST DETAIL'));
        assert.ok(prompt.includes('ACTIONS:'));
        assert.ok(prompt.includes('add_request'));
        assert.ok(prompt.includes('modify_request'));
        assert.ok(prompt.includes('delete_request'));
    });
});

describe('AIPanel — _countRequestsDeep', () => {
    it('counts root and nested requests', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const col = app.state.collections[0]; // Users API
        assert.strictEqual(panel._countRequestsDeep(col), 3); // 2 root + 1 in Auth folder
    });

    it('counts deeply nested requests', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const col = app.state.collections[0];
        const sub = new Folder('Sub');
        sub.addRequest(new Request('Deep', 'GET', '/deep'));
        col.folders[0].addFolder(sub);
        assert.strictEqual(panel._countRequestsDeep(col), 4);
    });
});

describe('AIPanel — _parseActions', () => {
    it('extracts valid action blocks', () => {
        const panel = new AIPanel({});
        const text = 'I will create a request.\n```action\n{"type":"add_request","name":"Test","method":"GET","url":"/test"}\n```\nDone!';
        const result = panel._parseActions(text);
        assert.strictEqual(result.actions.length, 1);
        assert.strictEqual(result.actions[0].type, 'add_request');
        assert.strictEqual(result.actions[0].name, 'Test');
        assert.ok(!result.displayText.includes('```action'));
        assert.ok(result.displayText.includes('Done!'));
    });

    it('extracts multiple actions', () => {
        const panel = new AIPanel({});
        const text = '```action\n{"type":"add_request","name":"A","method":"GET","url":"/a"}\n```\n```action\n{"type":"add_folder","name":"F"}\n```';
        const result = panel._parseActions(text);
        assert.strictEqual(result.actions.length, 2);
    });

    it('ignores invalid JSON', () => {
        const panel = new AIPanel({});
        const text = '```action\nnot json\n```';
        const result = panel._parseActions(text);
        assert.strictEqual(result.actions.length, 0);
        assert.ok(result.displayText.includes('not json'));
    });

    it('ignores unknown action types', () => {
        const panel = new AIPanel({});
        const text = '```action\n{"type":"hack_system","cmd":"rm -rf /"}\n```';
        const result = panel._parseActions(text);
        assert.strictEqual(result.actions.length, 0);
    });

    it('handles empty text', () => {
        const panel = new AIPanel({});
        const result = panel._parseActions('');
        assert.strictEqual(result.actions.length, 0);
        assert.strictEqual(result.displayText, '');
    });

    it('handles null text', () => {
        const panel = new AIPanel({});
        const result = panel._parseActions(null);
        assert.strictEqual(result.actions.length, 0);
    });
});

describe('AIPanel — ACTION_TYPES', () => {
    it('lists all supported action types', () => {
        const types = AIPanel.ACTION_TYPES;
        assert.ok(types.includes('add_request'));
        assert.ok(types.includes('modify_request'));
        assert.ok(types.includes('delete_request'));
        assert.ok(types.includes('duplicate_request'));
        assert.ok(types.includes('add_folder'));
        assert.ok(types.includes('delete_folder'));
        assert.ok(types.includes('add_collection'));
        assert.ok(types.includes('rename_collection'));
        assert.ok(types.includes('set_headers'));
        assert.ok(types.includes('set_body'));
        assert.ok(types.includes('set_tests'));
    });
});

describe('AIPanel — _execAddRequest', () => {
    it('adds request to current collection', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const before = app.state.currentCollection.requests.length;
        const msg = panel._execAddRequest({ type: 'add_request', name: 'New Endpoint', method: 'PUT', url: '/api/items' });
        assert.strictEqual(app.state.currentCollection.requests.length, before + 1);
        assert.ok(msg.includes('New Endpoint'));
        const added = app.state.currentCollection.requests[app.state.currentCollection.requests.length - 1];
        assert.strictEqual(added.method, 'PUT');
        assert.strictEqual(added.url, '/api/items');
    });

    it('adds request to named collection', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const before = app.state.collections[1].requests.length;
        panel._execAddRequest({ type: 'add_request', collection: 'Products API', name: 'Get Product', method: 'GET', url: '/products/1' });
        assert.strictEqual(app.state.collections[1].requests.length, before + 1);
    });

    it('adds request to folder', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const authFolder = app.state.collections[0].folders[0]; // Auth folder
        const before = authFolder.requests.length;
        panel._execAddRequest({ type: 'add_request', name: 'Logout', method: 'POST', url: '/auth/logout', folder: 'Auth' });
        assert.strictEqual(authFolder.requests.length, before + 1);
    });

    it('returns error when collection not found', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const msg = panel._execAddRequest({ type: 'add_request', collection: 'Nonexistent', name: 'X' });
        assert.ok(msg.includes('not found'));
    });
});

describe('AIPanel — _execModifyRequest', () => {
    it('modifies request by name', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const msg = panel._execModifyRequest({ type: 'modify_request', uuid_or_name: 'Create User', method: 'PATCH', url: '/users/1' });
        const req = app.state.collections[0].requests.find(r => r.name === 'Create User');
        assert.strictEqual(req.method, 'PATCH');
        assert.strictEqual(req.url, '/users/1');
        assert.ok(msg.includes('Modified'));
    });

    it('modifies current request when no uuid given', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        panel._execModifyRequest({ type: 'modify_request', body: '{"updated":true}' });
        assert.strictEqual(app.state.currentRequest.body, '{"updated":true}');
    });

    it('returns error for unknown request', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const msg = panel._execModifyRequest({ type: 'modify_request', uuid_or_name: 'NOPE' });
        assert.ok(msg.includes('not found'));
    });
});

describe('AIPanel — _execDeleteRequest', () => {
    it('deletes request by name', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const before = app.state.collections[0].requests.length;
        const msg = panel._execDeleteRequest({ type: 'delete_request', uuid_or_name: 'Create User' });
        assert.strictEqual(app.state.collections[0].requests.length, before - 1);
        assert.ok(msg.includes('Deleted'));
    });

    it('deletes request from nested folder', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const msg = panel._execDeleteRequest({ type: 'delete_request', uuid_or_name: 'Login' });
        assert.strictEqual(app.state.collections[0].folders[0].requests.length, 0);
        assert.ok(msg.includes('Deleted'));
    });

    it('clears currentRequest if it was deleted', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        panel._execDeleteRequest({ type: 'delete_request', uuid_or_name: 'Get Users' });
        assert.strictEqual(app.state.currentRequest, null);
    });

    it('returns error for unknown request', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const msg = panel._execDeleteRequest({ type: 'delete_request', uuid_or_name: 'NOPE' });
        assert.ok(msg.includes('not found'));
    });
});

describe('AIPanel — _execDuplicateRequest', () => {
    it('duplicates request with custom name', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const before = app.state.currentCollection.requests.length;
        const msg = panel._execDuplicateRequest({ type: 'duplicate_request', uuid_or_name: 'Get Users', new_name: 'Get Users v2' });
        assert.strictEqual(app.state.currentCollection.requests.length, before + 1);
        const dup = app.state.currentCollection.requests[app.state.currentCollection.requests.length - 1];
        assert.strictEqual(dup.name, 'Get Users v2');
        assert.strictEqual(dup.method, 'GET');
        assert.ok(msg.includes('Duplicated'));
    });

    it('uses default name when not specified', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        panel._execDuplicateRequest({ type: 'duplicate_request', uuid_or_name: 'Get Users' });
        const dup = app.state.currentCollection.requests[app.state.currentCollection.requests.length - 1];
        assert.strictEqual(dup.name, 'Get Users (copy)');
    });
});

describe('AIPanel — _execAddFolder', () => {
    it('adds folder to current collection', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const before = app.state.currentCollection.folders.length;
        const msg = panel._execAddFolder({ type: 'add_folder', name: 'Admin' });
        assert.strictEqual(app.state.currentCollection.folders.length, before + 1);
        assert.ok(msg.includes('Admin'));
    });

    it('adds subfolder', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const authFolder = app.state.currentCollection.folders[0];
        const before = authFolder.folders.length;
        panel._execAddFolder({ type: 'add_folder', name: 'OAuth', parent_folder: 'Auth' });
        assert.strictEqual(authFolder.folders.length, before + 1);
    });
});

describe('AIPanel — _execDeleteFolder', () => {
    it('deletes folder by name', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const msg = panel._execDeleteFolder({ type: 'delete_folder', uuid_or_name: 'Auth' });
        assert.strictEqual(app.state.currentCollection.folders.length, 0);
        assert.ok(msg.includes('Deleted'));
    });

    it('returns error for unknown folder', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const msg = panel._execDeleteFolder({ type: 'delete_folder', uuid_or_name: 'NOPE' });
        assert.ok(msg.includes('not found'));
    });
});

describe('AIPanel — _execAddCollection', () => {
    it('adds a new collection', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const before = app.state.collections.length;
        const msg = panel._execAddCollection({ type: 'add_collection', name: 'New API', description: 'Test' });
        assert.strictEqual(app.state.collections.length, before + 1);
        assert.ok(msg.includes('New API'));
    });
});

describe('AIPanel — _execRenameCollection', () => {
    it('renames collection by name', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const msg = panel._execRenameCollection({ type: 'rename_collection', name: 'Users API', new_name: 'Users Service' });
        assert.strictEqual(app.state.collections[0].name, 'Users Service');
        assert.ok(msg.includes('Renamed'));
    });

    it('returns error for unknown collection', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const msg = panel._execRenameCollection({ type: 'rename_collection', name: 'NOPE', new_name: 'X' });
        assert.ok(msg.includes('not found'));
    });
});

describe('AIPanel — _execSetHeaders', () => {
    it('sets headers on current request', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        panel._execSetHeaders({ type: 'set_headers', headers: { 'Authorization': 'Bearer xxx', 'X-Custom': 'yes' } });
        assert.strictEqual(app.state.currentRequest.headers['Authorization'], 'Bearer xxx');
        assert.strictEqual(app.state.currentRequest.headers['X-Custom'], 'yes');
    });

    it('sets headers on named request', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        panel._execSetHeaders({ type: 'set_headers', uuid_or_name: 'Login', headers: { 'Auth': 'token' } });
        const login = app.state.collections[0].folders[0].requests[0];
        assert.strictEqual(login.headers['Auth'], 'token');
    });
});

describe('AIPanel — _execSetBody', () => {
    it('sets body on current request', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        panel._execSetBody({ type: 'set_body', body: '{"new":"body"}' });
        assert.strictEqual(app.state.currentRequest.body, '{"new":"body"}');
    });
});

describe('AIPanel — _execSetTests', () => {
    it('sets tests on current request', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        panel._execSetTests({ type: 'set_tests', tests: "tests['ok'] = true;" });
        assert.strictEqual(app.state.currentRequest.tests, "tests['ok'] = true;");
    });
});

describe('AIPanel — _executeAction dispatch', () => {
    it('dispatches to correct executor', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const msg = panel._executeAction({ type: 'add_collection', name: 'Dispatch Test' });
        assert.ok(msg.includes('Dispatch Test'));
    });

    it('handles unknown type', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const msg = panel._executeAction({ type: 'unknown_type' });
        assert.ok(msg.includes('Unknown action type'));
    });

    it('handles null action', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const msg = panel._executeAction(null);
        assert.ok(msg.includes('Invalid'));
    });

    it('handles no app state', () => {
        const panel = new AIPanel({});
        const msg = panel._executeAction({ type: 'add_request', name: 'X' });
        assert.ok(msg.includes('No app state'));
    });
});

describe('AIPanel — sendMessage with actions', () => {
    beforeEach(() => setupDOM());

    it('parses and executes actions from AI response', async () => {
        const app = createRichMockApp();
        global.window.electronAPI = {
            aiIsEnabled: async () => ({ enabled: true }),
            aiChat: async () => ({
                content: 'I will add a new request.\n```action\n{"type":"add_request","name":"Health Check","method":"GET","url":"/health"}\n```\nDone!'
            })
        };
        const panel = new AIPanel(app);
        panel.init();
        panel.inputEl.value = 'Add a health check endpoint';
        const reqsBefore = app.state.currentCollection.requests.length;
        await panel.sendMessage();
        assert.strictEqual(app.state.currentCollection.requests.length, reqsBefore + 1);
        const added = app.state.currentCollection.requests[app.state.currentCollection.requests.length - 1];
        assert.strictEqual(added.name, 'Health Check');
        // Check that action execution is reported in the message
        assert.ok(panel.messages.some(m => m.content.includes('Actions executed')));
    });

    it('sends system prompt with collection context', async () => {
        let receivedData = null;
        const app = createRichMockApp();
        global.window.electronAPI = {
            aiIsEnabled: async () => ({ enabled: true }),
            aiChat: async (data) => { receivedData = data; return { content: 'ok' }; }
        };
        const panel = new AIPanel(app);
        panel.init();
        panel.inputEl.value = 'How many requests do I have?';
        await panel.sendMessage();
        assert.ok(receivedData);
        assert.ok(receivedData.systemPrompt);
        assert.ok(receivedData.systemPrompt.includes('COLLECTIONS'));
        assert.ok(receivedData.systemPrompt.includes('Users API'));
        assert.ok(receivedData.systemPrompt.includes('ANALYTICS'));
        assert.ok(receivedData.maxTokens >= 1200);
    });
});

describe('AIPanel — _findRequestAnywhere', () => {
    it('finds by name across collections', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const found = panel._findRequestAnywhere('List Products');
        assert.ok(found);
        assert.strictEqual(found.name, 'List Products');
    });

    it('finds in nested folders', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const found = panel._findRequestAnywhere('Login');
        assert.ok(found);
        assert.strictEqual(found.name, 'Login');
    });

    it('returns null for nonexistent', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        assert.strictEqual(panel._findRequestAnywhere('NOPE'), null);
    });
});

describe('AIPanel — _findFolderAnywhere', () => {
    it('finds folder by name', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        const found = panel._findFolderAnywhere('Auth');
        assert.ok(found);
        assert.strictEqual(found.name, 'Auth');
    });

    it('returns null for nonexistent', () => {
        const app = createRichMockApp();
        const panel = new AIPanel(app);
        assert.strictEqual(panel._findFolderAnywhere('NOPE'), null);
    });
});
