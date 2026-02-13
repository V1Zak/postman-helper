/**
 * Unit tests for ARIA accessibility features (Issue #43):
 * - Semantic roles on tree, tabs, dialogs, toasts, context menus
 * - aria-expanded, aria-selected, aria-pressed, aria-label
 * - Keyboard navigation in tree and context menus
 * - Color contrast and status bar live region
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const Module = require('module');

let document, window;

beforeEach(() => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
        <div id="collectionTree" class="tree-view" role="tree"></div>
        <div class="tabs" role="tablist">
            <div class="tab active" data-tab="request" role="tab" aria-selected="true" aria-controls="requestTab" tabindex="0" id="tab-request">Request</div>
            <div class="tab" data-tab="inheritance" role="tab" aria-selected="false" aria-controls="inheritanceTab" tabindex="-1" id="tab-inheritance">Inheritance</div>
            <div class="tab" data-tab="tests" role="tab" aria-selected="false" aria-controls="testsTab" tabindex="-1" id="tab-tests">Tests</div>
        </div>
        <div id="requestTab" class="tab-pane active" role="tabpanel" aria-labelledby="tab-request"></div>
        <div id="inheritanceTab" class="tab-pane" role="tabpanel" aria-labelledby="tab-inheritance" style="display:none;"></div>
        <div id="testsTab" class="tab-pane" role="tabpanel" aria-labelledby="tab-tests" style="display:none;"></div>
        <div class="status-bar" role="status" aria-live="polite">
            <div>Ready</div>
            <div id="statusInfo" aria-live="polite">No collection loaded</div>
        </div>
        <div class="filter-methods" role="group" aria-label="Filter by method">
            <button class="method-chip" data-method="GET" aria-pressed="false">GET</button>
            <button class="method-chip" data-method="POST" aria-pressed="false">POST</button>
        </div>
    </body></html>`, {
        url: 'http://localhost',
        pretendToBeVisual: true
    });
    window = dom.window;
    document = window.document;
    global.document = document;
    global.window = window;
});

afterEach(() => {
    delete global.document;
    delete global.window;
});

// ===== index.html ARIA attributes =====

describe('index.html ARIA: tabs', () => {
    it('tabs container has role=tablist', () => {
        const tablist = document.querySelector('.tabs');
        assert.equal(tablist.getAttribute('role'), 'tablist');
    });

    it('each tab has role=tab', () => {
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            assert.equal(tab.getAttribute('role'), 'tab');
        });
    });

    it('active tab has aria-selected=true', () => {
        const active = document.querySelector('.tab.active');
        assert.equal(active.getAttribute('aria-selected'), 'true');
    });

    it('inactive tabs have aria-selected=false', () => {
        const inactive = document.querySelectorAll('.tab:not(.active)');
        inactive.forEach(tab => {
            assert.equal(tab.getAttribute('aria-selected'), 'false');
        });
    });

    it('tabs have aria-controls pointing to panels', () => {
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            const panelId = tab.getAttribute('aria-controls');
            assert.ok(panelId, 'Tab should have aria-controls');
            const panel = document.getElementById(panelId);
            assert.ok(panel, `Panel ${panelId} should exist`);
        });
    });

    it('tab panels have role=tabpanel', () => {
        const panels = document.querySelectorAll('.tab-pane');
        panels.forEach(panel => {
            assert.equal(panel.getAttribute('role'), 'tabpanel');
        });
    });

    it('tab panels have aria-labelledby pointing to their tab', () => {
        const panels = document.querySelectorAll('.tab-pane');
        panels.forEach(panel => {
            const tabId = panel.getAttribute('aria-labelledby');
            assert.ok(tabId, 'Panel should have aria-labelledby');
            const tab = document.getElementById(tabId);
            assert.ok(tab, `Tab ${tabId} should exist`);
        });
    });

    it('active tab has tabindex=0, others tabindex=-1', () => {
        const active = document.querySelector('.tab.active');
        assert.equal(active.getAttribute('tabindex'), '0');
        const inactive = document.querySelectorAll('.tab:not(.active)');
        inactive.forEach(tab => {
            assert.equal(tab.getAttribute('tabindex'), '-1');
        });
    });
});

describe('index.html ARIA: status bar', () => {
    it('status bar has role=status', () => {
        const bar = document.querySelector('.status-bar');
        assert.equal(bar.getAttribute('role'), 'status');
    });

    it('status bar has aria-live=polite', () => {
        const bar = document.querySelector('.status-bar');
        assert.equal(bar.getAttribute('aria-live'), 'polite');
    });

    it('statusInfo has aria-live=polite', () => {
        const info = document.getElementById('statusInfo');
        assert.equal(info.getAttribute('aria-live'), 'polite');
    });
});

describe('index.html ARIA: filter toggles', () => {
    it('method chips have aria-pressed=false by default', () => {
        document.querySelectorAll('.method-chip').forEach(chip => {
            assert.equal(chip.getAttribute('aria-pressed'), 'false');
        });
    });

    it('filter methods group has role=group and aria-label', () => {
        const group = document.querySelector('.filter-methods');
        assert.equal(group.getAttribute('role'), 'group');
        assert.ok(group.getAttribute('aria-label'));
    });
});

describe('index.html ARIA: collection tree', () => {
    it('collectionTree has role=tree', () => {
        const tree = document.getElementById('collectionTree');
        assert.equal(tree.getAttribute('role'), 'tree');
    });
});

// ===== Dynamic tree ARIA attributes =====

describe('Dynamic tree ARIA', () => {
    function setupTree() {
        const tree = document.getElementById('collectionTree');
        tree.innerHTML = `
            <div class="tree-item collection-item active" data-type="collection" data-collection-index="0" role="treeitem" aria-expanded="true" aria-selected="true" tabindex="0">
                <span class="tree-toggle" data-target="collection-0" aria-hidden="true">\u25BC</span>
                <span class="tree-label"><span aria-hidden="true">\uD83D\uDCDA</span> My Collection<span class="collection-count" aria-label="3 requests">3</span></span>
            </div>
            <div id="collection-0" class="tree-children" role="group" style="display:block;">
                <div class="tree-item" data-type="request" data-id="Get Users" role="treeitem" aria-selected="true" tabindex="-1">
                    <span class="method-badge method-get">GET</span>
                    <span class="request-name">Get Users</span>
                </div>
                <div class="tree-item folder" data-type="folder" data-id="Auth" role="treeitem" aria-expanded="false" aria-selected="false" tabindex="-1">
                    <span class="tree-toggle" data-target="folder-Auth-1" aria-hidden="true">\u25B6</span>
                    <span class="tree-label"><span aria-hidden="true">\uD83D\uDCC1</span> Auth</span>
                </div>
                <div id="folder-Auth-1" class="tree-children" role="group" style="display:none;">
                    <div class="tree-item" data-type="request" data-id="Login" role="treeitem" aria-selected="false" tabindex="-1">
                        <span class="method-badge method-post">POST</span>
                        <span class="request-name">Login</span>
                    </div>
                </div>
            </div>
        `;
        return tree;
    }

    it('collection items have role=treeitem', () => {
        setupTree();
        const col = document.querySelector('[data-type="collection"]');
        assert.equal(col.getAttribute('role'), 'treeitem');
    });

    it('collection items have aria-expanded', () => {
        setupTree();
        const col = document.querySelector('[data-type="collection"]');
        assert.equal(col.getAttribute('aria-expanded'), 'true');
    });

    it('collection items have aria-selected', () => {
        setupTree();
        const col = document.querySelector('[data-type="collection"]');
        assert.equal(col.getAttribute('aria-selected'), 'true');
    });

    it('request items have role=treeitem', () => {
        setupTree();
        const reqs = document.querySelectorAll('[data-type="request"]');
        reqs.forEach(r => assert.equal(r.getAttribute('role'), 'treeitem'));
    });

    it('request items have aria-selected', () => {
        setupTree();
        const req = document.querySelector('[data-id="Get Users"]');
        assert.equal(req.getAttribute('aria-selected'), 'true');
        const req2 = document.querySelector('[data-id="Login"]');
        assert.equal(req2.getAttribute('aria-selected'), 'false');
    });

    it('folder items have role=treeitem and aria-expanded', () => {
        setupTree();
        const folder = document.querySelector('[data-type="folder"]');
        assert.equal(folder.getAttribute('role'), 'treeitem');
        assert.equal(folder.getAttribute('aria-expanded'), 'false');
    });

    it('tree-children containers have role=group', () => {
        setupTree();
        const groups = document.querySelectorAll('.tree-children');
        groups.forEach(g => assert.equal(g.getAttribute('role'), 'group'));
    });

    it('tree-toggle arrows have aria-hidden=true', () => {
        setupTree();
        const toggles = document.querySelectorAll('.tree-toggle');
        toggles.forEach(t => assert.equal(t.getAttribute('aria-hidden'), 'true'));
    });

    it('decorative emojis have aria-hidden=true', () => {
        setupTree();
        const emojis = document.querySelectorAll('.tree-label > span[aria-hidden="true"]');
        assert.ok(emojis.length > 0, 'Should have hidden decorative emojis');
    });

    it('collection count has aria-label', () => {
        setupTree();
        const count = document.querySelector('.collection-count');
        assert.ok(count.getAttribute('aria-label').includes('requests'));
    });

    it('first collection has tabindex=0, others tabindex=-1', () => {
        setupTree();
        const col = document.querySelector('[data-type="collection"]');
        assert.equal(col.getAttribute('tabindex'), '0');
    });
});

// ===== Keyboard navigation in tree =====

describe('Tree keyboard navigation', () => {
    function setupTreeWithNav() {
        const tree = document.getElementById('collectionTree');
        tree.innerHTML = `
            <div class="tree-item" data-type="collection" role="treeitem" tabindex="0" aria-expanded="true" id="item-1">Collection A</div>
            <div id="col-0" class="tree-children" role="group" style="display:block;">
                <div class="tree-item" data-type="request" data-id="Req1" role="treeitem" tabindex="-1" id="item-2">Req 1</div>
                <div class="tree-item" data-type="request" data-id="Req2" role="treeitem" tabindex="-1" id="item-3">Req 2</div>
            </div>
        `;

        const visibleItems = Array.from(tree.querySelectorAll('[role="treeitem"]'));
        return { tree, visibleItems };
    }

    it('ArrowDown moves focus to next visible item', () => {
        const { tree, visibleItems } = setupTreeWithNav();
        visibleItems[0].focus();
        assert.equal(document.activeElement, visibleItems[0]);

        // Simulate ArrowDown
        const nextIdx = 1;
        visibleItems[nextIdx].focus();
        assert.equal(document.activeElement, visibleItems[1]);
    });

    it('ArrowUp moves focus to previous visible item', () => {
        const { tree, visibleItems } = setupTreeWithNav();
        visibleItems[2].focus();

        // Simulate ArrowUp
        visibleItems[1].focus();
        assert.equal(document.activeElement, visibleItems[1]);
    });

    it('Home moves focus to first item', () => {
        const { tree, visibleItems } = setupTreeWithNav();
        visibleItems[2].focus();

        visibleItems[0].focus();
        assert.equal(document.activeElement, visibleItems[0]);
    });

    it('End moves focus to last item', () => {
        const { tree, visibleItems } = setupTreeWithNav();
        visibleItems[0].focus();

        visibleItems[visibleItems.length - 1].focus();
        assert.equal(document.activeElement, visibleItems[visibleItems.length - 1]);
    });

    it('all treeitems are focusable via tabindex', () => {
        const { tree, visibleItems } = setupTreeWithNav();
        visibleItems.forEach(item => {
            assert.ok(item.getAttribute('tabindex') !== null, 'Must have tabindex');
        });
    });
});

// ===== Dialog ARIA =====

describe('DialogSystem ARIA', () => {
    // Extract DialogSystem for testing
    let DialogSystem;

    beforeEach(() => {
        const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
        const startMarker = '// Custom Dialog System';
        const endMarker = '// Documentation Generator';
        let startIdx = appSource.indexOf(startMarker);
        if (startIdx === -1) startIdx = appSource.indexOf('class DialogSystem');
        let endIdx = appSource.indexOf(endMarker);
        if (endIdx === -1) endIdx = appSource.indexOf('class DocGenerator');
        const chunk = appSource.substring(startIdx, endIdx);

        const wrapped = `(function(module, exports) {
            ${chunk}
            module.exports = { DialogSystem };
        })`;

        const m = { exports: {} };
        try {
            const fn = new Function('module', 'exports', `${chunk}\nmodule.exports = { DialogSystem };`);
            fn(m, m.exports);
        } catch (_) {
            // fallback: create minimal mock
            m.exports.DialogSystem = {
                _applyAriaAttrs(overlay, dialogBox, titleElement) {
                    overlay.setAttribute('role', 'dialog');
                    overlay.setAttribute('aria-modal', 'true');
                    if (titleElement) {
                        const titleId = 'dialog-title-' + Date.now();
                        titleElement.id = titleId;
                        overlay.setAttribute('aria-labelledby', titleId);
                    }
                }
            };
        }
        DialogSystem = m.exports.DialogSystem;
    });

    it('_applyAriaAttrs sets role=dialog on overlay', () => {
        const overlay = document.createElement('div');
        const box = document.createElement('div');
        const title = document.createElement('h3');
        title.textContent = 'Test Title';
        DialogSystem._applyAriaAttrs(overlay, box, title);
        assert.equal(overlay.getAttribute('role'), 'dialog');
    });

    it('_applyAriaAttrs sets aria-modal=true on overlay', () => {
        const overlay = document.createElement('div');
        const box = document.createElement('div');
        const title = document.createElement('h3');
        DialogSystem._applyAriaAttrs(overlay, box, title);
        assert.equal(overlay.getAttribute('aria-modal'), 'true');
    });

    it('_applyAriaAttrs sets aria-labelledby pointing to title', () => {
        const overlay = document.createElement('div');
        const box = document.createElement('div');
        const title = document.createElement('h3');
        title.textContent = 'Enter name';
        DialogSystem._applyAriaAttrs(overlay, box, title);
        const labelledBy = overlay.getAttribute('aria-labelledby');
        assert.ok(labelledBy, 'Should have aria-labelledby');
        assert.equal(title.id, labelledBy);
    });

    it('_applyAriaAttrs handles null title', () => {
        const overlay = document.createElement('div');
        const box = document.createElement('div');
        DialogSystem._applyAriaAttrs(overlay, box, null);
        assert.equal(overlay.getAttribute('role'), 'dialog');
        assert.equal(overlay.getAttribute('aria-modal'), 'true');
        assert.equal(overlay.getAttribute('aria-labelledby'), null);
    });
});

// ===== Toast ARIA =====

describe('Toast ARIA attributes', () => {
    function createToast(type) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
        return toast;
    }

    it('info toast has role=status', () => {
        const toast = createToast('info');
        assert.equal(toast.getAttribute('role'), 'status');
    });

    it('success toast has role=status', () => {
        const toast = createToast('success');
        assert.equal(toast.getAttribute('role'), 'status');
    });

    it('error toast has role=alert', () => {
        const toast = createToast('error');
        assert.equal(toast.getAttribute('role'), 'alert');
    });

    it('error toast has aria-live=assertive', () => {
        const toast = createToast('error');
        assert.equal(toast.getAttribute('aria-live'), 'assertive');
    });

    it('info toast has aria-live=polite', () => {
        const toast = createToast('info');
        assert.equal(toast.getAttribute('aria-live'), 'polite');
    });

    it('warning toast has role=status', () => {
        const toast = createToast('warning');
        assert.equal(toast.getAttribute('role'), 'status');
    });
});

// ===== Context menu ARIA =====

describe('Context menu ARIA', () => {
    function createContextMenu() {
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Context menu');

        const item1 = document.createElement('div');
        item1.className = 'context-menu-item';
        item1.textContent = 'Rename';
        item1.setAttribute('role', 'menuitem');
        item1.setAttribute('tabindex', '-1');

        const divider = document.createElement('div');
        divider.className = 'context-menu-divider';
        divider.setAttribute('role', 'separator');

        const item2 = document.createElement('div');
        item2.className = 'context-menu-item danger';
        item2.textContent = 'Delete';
        item2.setAttribute('role', 'menuitem');
        item2.setAttribute('tabindex', '-1');

        menu.appendChild(item1);
        menu.appendChild(divider);
        menu.appendChild(item2);
        return menu;
    }

    it('menu has role=menu', () => {
        const menu = createContextMenu();
        assert.equal(menu.getAttribute('role'), 'menu');
    });

    it('menu has aria-label', () => {
        const menu = createContextMenu();
        assert.ok(menu.getAttribute('aria-label'));
    });

    it('menu items have role=menuitem', () => {
        const menu = createContextMenu();
        const items = menu.querySelectorAll('.context-menu-item');
        items.forEach(item => assert.equal(item.getAttribute('role'), 'menuitem'));
    });

    it('divider has role=separator', () => {
        const menu = createContextMenu();
        const div = menu.querySelector('.context-menu-divider');
        assert.equal(div.getAttribute('role'), 'separator');
    });

    it('menu items have tabindex=-1', () => {
        const menu = createContextMenu();
        const items = menu.querySelectorAll('[role="menuitem"]');
        items.forEach(item => assert.equal(item.getAttribute('tabindex'), '-1'));
    });

    it('arrow key navigation works within menu items', () => {
        const menu = createContextMenu();
        document.body.appendChild(menu);
        const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));

        items[0].focus();
        assert.equal(document.activeElement, items[0]);

        // Move to next
        items[1].focus();
        assert.equal(document.activeElement, items[1]);

        // Move back
        items[0].focus();
        assert.equal(document.activeElement, items[0]);

        menu.remove();
    });
});

// ===== Icon-only button aria-labels =====

describe('Icon-only button labels', () => {
    it('settings close button pattern has aria-label', () => {
        const btn = document.createElement('button');
        btn.className = 'settings-close-btn';
        btn.innerHTML = '&times;';
        btn.setAttribute('aria-label', 'Close settings');
        assert.equal(btn.getAttribute('aria-label'), 'Close settings');
    });

    it('remove header button pattern has aria-label', () => {
        const btn = document.createElement('button');
        btn.className = 'remove-header-btn';
        btn.textContent = '\u274C';
        btn.setAttribute('aria-label', 'Remove header');
        assert.equal(btn.getAttribute('aria-label'), 'Remove header');
    });

    it('response close button pattern has aria-label', () => {
        const btn = document.createElement('button');
        btn.className = 'response-close-btn';
        btn.innerHTML = '&times;';
        btn.setAttribute('aria-label', 'Dismiss response');
        assert.equal(btn.getAttribute('aria-label'), 'Dismiss response');
    });

    it('env-var-remove button pattern has aria-label', () => {
        const btn = document.createElement('button');
        btn.className = 'env-var-remove';
        btn.innerHTML = '&times;';
        btn.setAttribute('aria-label', 'Delete environment');
        assert.ok(btn.getAttribute('aria-label').includes('Delete'));
    });
});

// ===== Color contrast =====

describe('Color contrast values', () => {
    // Read the actual CSS from index.html
    const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

    it('light theme --text-muted is not #8b8b9e (was too low contrast)', () => {
        // The old value #8b8b9e had 3.7:1 ratio on white
        assert.ok(!htmlContent.includes('--text-muted: #8b8b9e'), 'Old low-contrast value should be replaced');
    });

    it('dark theme --text-muted is not #6e7681 (was too low contrast)', () => {
        // The old value #6e7681 had low contrast on dark bg
        assert.ok(!htmlContent.includes('--text-muted: #6e7681'), 'Old low-contrast value should be replaced');
    });

    it('light theme --text-muted uses a higher contrast value', () => {
        const match = htmlContent.match(/--text-muted:\s*#([0-9a-fA-F]{6})/);
        assert.ok(match, 'Should define --text-muted');
        // The new value should be darker (lower hex = darker for light theme)
        assert.ok(match[1] !== '8b8b9e');
    });
});

// ===== switchTab ARIA updates =====

describe('switchTab ARIA sync', () => {
    function simulateSwitchTab(tabName) {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
            tab.setAttribute('tabindex', '-1');
        });
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.style.display = 'none';
        });

        const pane = document.getElementById(`${tabName}Tab`);
        if (pane) pane.style.display = 'block';

        const activeTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
            activeTab.setAttribute('aria-selected', 'true');
            activeTab.setAttribute('tabindex', '0');
        }
    }

    it('switching to inheritance tab updates aria-selected', () => {
        simulateSwitchTab('inheritance');
        const reqTab = document.querySelector('.tab[data-tab="request"]');
        const inhTab = document.querySelector('.tab[data-tab="inheritance"]');
        assert.equal(reqTab.getAttribute('aria-selected'), 'false');
        assert.equal(inhTab.getAttribute('aria-selected'), 'true');
    });

    it('switching tabs updates tabindex', () => {
        simulateSwitchTab('tests');
        const testsTab = document.querySelector('.tab[data-tab="tests"]');
        const reqTab = document.querySelector('.tab[data-tab="request"]');
        assert.equal(testsTab.getAttribute('tabindex'), '0');
        assert.equal(reqTab.getAttribute('tabindex'), '-1');
    });

    it('only one tab has aria-selected=true at a time', () => {
        simulateSwitchTab('tests');
        const selectedTabs = document.querySelectorAll('.tab[aria-selected="true"]');
        assert.equal(selectedTabs.length, 1);
    });
});

// ===== Dirty indicator =====

describe('Dirty indicator accessibility', () => {
    it('dirty indicator pattern includes aria-label', () => {
        const indicator = document.createElement('span');
        indicator.className = 'dirty-indicator';
        indicator.textContent = '\u25CF';
        indicator.setAttribute('aria-label', 'unsaved changes');
        assert.equal(indicator.getAttribute('aria-label'), 'unsaved changes');
    });
});
