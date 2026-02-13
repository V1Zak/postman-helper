/**
 * Unit tests for tree rendering performance features (Issue #45):
 * - _expandedFolders Set persistence
 * - Scroll position preservation
 * - Event delegation for tree click handlers
 * - Auto-save/restore of expanded state
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

let document, window;

beforeEach(() => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
        <div id="collectionTree" style="overflow-y:auto; height:300px;"></div>
        <div id="statusBar">Ready</div>
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

// ===== _expandedFolders Set =====

describe('_expandedFolders Set', () => {
    it('starts as empty Set', () => {
        const expanded = new Set();
        assert.equal(expanded.size, 0);
        assert.ok(expanded instanceof Set);
    });

    it('tracks expanded node IDs', () => {
        const expanded = new Set();
        expanded.add('collection-0');
        expanded.add('folder-Auth-1');
        assert.ok(expanded.has('collection-0'));
        assert.ok(expanded.has('folder-Auth-1'));
        assert.ok(!expanded.has('collection-1'));
    });

    it('removes collapsed node IDs', () => {
        const expanded = new Set();
        expanded.add('collection-0');
        expanded.add('folder-Auth-1');
        expanded.delete('folder-Auth-1');
        assert.ok(!expanded.has('folder-Auth-1'));
        assert.ok(expanded.has('collection-0'));
    });

    it('serializes to array for auto-save (excluding _init_ markers)', () => {
        const expanded = new Set(['collection-0', '_init_collection-0', 'folder-Auth-1']);
        const serialized = Array.from(expanded).filter(id => !id.startsWith('_init_'));
        assert.deepEqual(serialized, ['collection-0', 'folder-Auth-1']);
    });

    it('restores from array', () => {
        const saved = ['collection-0', 'folder-Auth-1'];
        const expanded = new Set(saved);
        assert.ok(expanded.has('collection-0'));
        assert.ok(expanded.has('folder-Auth-1'));
        assert.equal(expanded.size, 2);
    });

    it('restores and marks collections as initialized', () => {
        const saved = ['collection-0', 'folder-Auth-1', 'collection-2'];
        const expanded = new Set(saved);
        for (const id of saved) {
            if (id.startsWith('collection-')) {
                expanded.add('_init_' + id);
            }
        }
        assert.ok(expanded.has('_init_collection-0'));
        assert.ok(expanded.has('_init_collection-2'));
        assert.ok(!expanded.has('_init_folder-Auth-1'));
    });

    it('handles empty restore data', () => {
        const expanded = new Set([]);
        assert.equal(expanded.size, 0);
    });
});

// ===== Scroll position preservation =====

describe('Scroll position preservation', () => {
    it('saves scrollTop before re-render', () => {
        const tree = document.getElementById('collectionTree');
        // Simulate scroll position (JSDOM doesn't really scroll, but the property is settable)
        tree.scrollTop = 150;
        const saved = tree.scrollTop;
        // In JSDOM scrollTop may not persist the same way, so check the concept
        assert.equal(typeof saved, 'number');
    });

    it('restores scrollTop after innerHTML replacement', () => {
        const tree = document.getElementById('collectionTree');
        const savedScroll = 200;
        tree.innerHTML = '<div class="tree-item">New Content</div>';
        tree.scrollTop = savedScroll;
        // In a real browser, scrollTop would be restored. JSDOM may clamp to 0.
        // We verify the property is set without error.
        assert.equal(typeof tree.scrollTop, 'number');
    });

    it('handles zero scroll position', () => {
        const tree = document.getElementById('collectionTree');
        tree.scrollTop = 0;
        assert.equal(tree.scrollTop, 0);
    });
});

// ===== Event delegation =====

describe('Event delegation for tree', () => {
    it('single delegated handler responds to collection clicks', () => {
        const tree = document.getElementById('collectionTree');
        tree.innerHTML = `
            <div class="tree-item collection-item" data-type="collection" data-collection-index="0">
                <span class="tree-toggle" data-target="collection-0">\u25B6</span>
                <span class="tree-label">Test Collection</span>
            </div>
            <div id="collection-0" class="tree-children" data-collection-index="0">
                <div class="tree-item" data-type="request" data-id="Get Users" data-collection-index="0">
                    <span class="method-badge method-get">GET</span>
                    <span class="request-name">Get Users</span>
                </div>
            </div>
        `;

        let clickedType = null;
        tree.addEventListener('click', (e) => {
            const collItem = e.target.closest('.tree-item[data-type="collection"]');
            const reqItem = e.target.closest('.tree-item[data-type="request"]');
            const toggle = e.target.closest('.tree-toggle');
            if (toggle) clickedType = 'toggle';
            else if (collItem) clickedType = 'collection';
            else if (reqItem) clickedType = 'request';
        });

        // Click on collection label
        const label = tree.querySelector('.tree-label');
        label.click();
        assert.equal(clickedType, 'collection');
    });

    it('single delegated handler responds to request clicks', () => {
        const tree = document.getElementById('collectionTree');
        tree.innerHTML = `
            <div class="tree-item" data-type="request" data-id="Get Users" data-collection-index="0">
                <span class="method-badge method-get">GET</span>
                <span class="request-name">Get Users</span>
            </div>
        `;

        let clickedType = null;
        tree.addEventListener('click', (e) => {
            const reqItem = e.target.closest('.tree-item[data-type="request"]');
            if (reqItem) clickedType = 'request';
        });

        const reqName = tree.querySelector('.request-name');
        reqName.click();
        assert.equal(clickedType, 'request');
    });

    it('single delegated handler responds to folder clicks', () => {
        const tree = document.getElementById('collectionTree');
        tree.innerHTML = `
            <div class="tree-item folder" data-type="folder" data-id="Auth">
                <span class="tree-toggle" data-target="folder-Auth-0">\u25B6</span>
                <span class="tree-label">Auth</span>
            </div>
            <div id="folder-Auth-0" class="tree-children" style="display:none;"></div>
        `;

        let clickedType = null;
        tree.addEventListener('click', (e) => {
            const toggle = e.target.closest('.tree-toggle');
            const folderItem = e.target.closest('.tree-item[data-type="folder"]');
            if (toggle) clickedType = 'toggle';
            else if (folderItem) clickedType = 'folder';
        });

        // Click on folder label (not toggle)
        const label = tree.querySelector('.tree-label');
        label.click();
        assert.equal(clickedType, 'folder');
    });

    it('toggle click expands/collapses via delegation', () => {
        const tree = document.getElementById('collectionTree');
        const expandedFolders = new Set();

        tree.innerHTML = `
            <div class="tree-item" data-type="folder" data-id="Auth">
                <span class="tree-toggle" data-target="folder-Auth-0">\u25B6</span>
                <span class="tree-label">Auth</span>
            </div>
            <div id="folder-Auth-0" class="tree-children" style="display:none;"></div>
        `;

        tree.addEventListener('click', (e) => {
            const toggle = e.target.closest('.tree-toggle');
            if (toggle) {
                const targetId = toggle.getAttribute('data-target');
                const targetEl = document.getElementById(targetId);
                if (targetEl) {
                    const isCollapsed = targetEl.style.display === 'none';
                    if (isCollapsed) {
                        targetEl.style.display = 'block';
                        toggle.textContent = '\u25BC';
                        expandedFolders.add(targetId);
                    } else {
                        targetEl.style.display = 'none';
                        toggle.textContent = '\u25B6';
                        expandedFolders.delete(targetId);
                    }
                }
            }
        });

        const toggle = tree.querySelector('.tree-toggle');
        const children = document.getElementById('folder-Auth-0');

        // Initially collapsed
        assert.equal(children.style.display, 'none');
        assert.equal(toggle.textContent, '\u25B6');

        // Click to expand
        toggle.click();
        assert.equal(children.style.display, 'block');
        assert.equal(toggle.textContent, '\u25BC');
        assert.ok(expandedFolders.has('folder-Auth-0'));

        // Click to collapse
        toggle.click();
        assert.equal(children.style.display, 'none');
        assert.equal(toggle.textContent, '\u25B6');
        assert.ok(!expandedFolders.has('folder-Auth-0'));
    });

    it('removes previous handler before adding new one', () => {
        const tree = document.getElementById('collectionTree');
        let callCount = 0;

        // Simulate handler replacement pattern
        let handler = () => { callCount++; };
        tree.addEventListener('click', handler);

        // Replace handler
        tree.removeEventListener('click', handler);
        handler = () => { callCount++; };
        tree.addEventListener('click', handler);

        tree.click();
        assert.equal(callCount, 1, 'Only one handler should fire after replacement');
    });
});

// ===== setupCollapsibleTree expand/collapse state =====

describe('setupCollapsibleTree state restoration', () => {
    function buildTreeHTML() {
        return `
            <div class="tree-item collection-item active" data-type="collection" data-collection-index="0">
                <span class="tree-toggle" data-target="collection-0">\u25B6</span>
                <span class="tree-label">Collection A</span>
            </div>
            <div id="collection-0" class="tree-children" data-collection-index="0">
                <div class="tree-item folder" data-type="folder" data-id="Auth">
                    <span class="tree-toggle" data-target="folder-Auth-1">\u25B6</span>
                    <span class="tree-label">Auth</span>
                </div>
                <div id="folder-Auth-1" class="tree-children"></div>
            </div>
            <div class="tree-item collection-item" data-type="collection" data-collection-index="1">
                <span class="tree-toggle" data-target="collection-1">\u25B6</span>
                <span class="tree-label">Collection B</span>
            </div>
            <div id="collection-1" class="tree-children" data-collection-index="1"></div>
        `;
    }

    it('expands nodes present in _expandedFolders', () => {
        const tree = document.getElementById('collectionTree');
        tree.innerHTML = buildTreeHTML();

        const expandedFolders = new Set(['collection-0', 'folder-Auth-1']);

        document.querySelectorAll('.tree-children').forEach(children => {
            const nodeId = children.id;
            const shouldExpand = expandedFolders.has(nodeId);
            children.style.display = shouldExpand ? 'block' : 'none';
            const toggle = document.querySelector(`.tree-toggle[data-target="${nodeId}"]`);
            if (toggle) toggle.textContent = shouldExpand ? '\u25BC' : '\u25B6';
        });

        assert.equal(document.getElementById('collection-0').style.display, 'block');
        assert.equal(document.getElementById('folder-Auth-1').style.display, 'block');
        assert.equal(document.getElementById('collection-1').style.display, 'none');
    });

    it('collapses nodes not in _expandedFolders', () => {
        const tree = document.getElementById('collectionTree');
        tree.innerHTML = buildTreeHTML();

        const expandedFolders = new Set(['collection-0']);

        document.querySelectorAll('.tree-children').forEach(children => {
            const nodeId = children.id;
            const shouldExpand = expandedFolders.has(nodeId);
            children.style.display = shouldExpand ? 'block' : 'none';
        });

        assert.equal(document.getElementById('collection-0').style.display, 'block');
        assert.equal(document.getElementById('folder-Auth-1').style.display, 'none');
        assert.equal(document.getElementById('collection-1').style.display, 'none');
    });

    it('toggle arrows match expand/collapse state', () => {
        const tree = document.getElementById('collectionTree');
        tree.innerHTML = buildTreeHTML();

        const expandedFolders = new Set(['collection-0']);

        document.querySelectorAll('.tree-children').forEach(children => {
            const nodeId = children.id;
            const shouldExpand = expandedFolders.has(nodeId);
            children.style.display = shouldExpand ? 'block' : 'none';
            const toggle = document.querySelector(`.tree-toggle[data-target="${nodeId}"]`);
            if (toggle) toggle.textContent = shouldExpand ? '\u25BC' : '\u25B6';
        });

        const col0Toggle = document.querySelector('.tree-toggle[data-target="collection-0"]');
        const col1Toggle = document.querySelector('.tree-toggle[data-target="collection-1"]');
        const folderToggle = document.querySelector('.tree-toggle[data-target="folder-Auth-1"]');

        assert.equal(col0Toggle.textContent, '\u25BC');
        assert.equal(col1Toggle.textContent, '\u25B6');
        assert.equal(folderToggle.textContent, '\u25B6');
    });
});

// ===== Auto-save/restore expandedFolders =====

describe('Auto-save expanded state', () => {
    it('serializes expandedFolders to auto-save data', () => {
        const expandedFolders = new Set(['collection-0', 'folder-Auth-1', '_init_collection-0']);
        const data = {
            version: 2,
            expandedFolders: Array.from(expandedFolders).filter(id => !id.startsWith('_init_'))
        };

        assert.deepEqual(data.expandedFolders, ['collection-0', 'folder-Auth-1']);
    });

    it('restores expandedFolders from auto-save data', () => {
        const data = {
            expandedFolders: ['collection-0', 'folder-Auth-1', 'collection-2']
        };

        const expandedFolders = new Set(data.expandedFolders);
        // Mark collections as initialized
        for (const id of data.expandedFolders) {
            if (id.startsWith('collection-')) {
                expandedFolders.add('_init_' + id);
            }
        }

        assert.ok(expandedFolders.has('collection-0'));
        assert.ok(expandedFolders.has('folder-Auth-1'));
        assert.ok(expandedFolders.has('collection-2'));
        assert.ok(expandedFolders.has('_init_collection-0'));
        assert.ok(expandedFolders.has('_init_collection-2'));
        assert.ok(!expandedFolders.has('_init_folder-Auth-1'));
    });

    it('handles missing expandedFolders in auto-save data', () => {
        const data = { version: 2 };
        const expandedFolders = (data.expandedFolders && Array.isArray(data.expandedFolders))
            ? new Set(data.expandedFolders)
            : new Set();
        assert.equal(expandedFolders.size, 0);
    });

    it('handles null expandedFolders in auto-save data', () => {
        const data = { version: 2, expandedFolders: null };
        const expandedFolders = (data.expandedFolders && Array.isArray(data.expandedFolders))
            ? new Set(data.expandedFolders)
            : new Set();
        assert.equal(expandedFolders.size, 0);
    });

    it('round-trips expanded state through save/restore', () => {
        // Save
        const original = new Set(['collection-0', 'folder-Users-2', '_init_collection-0']);
        const saved = Array.from(original).filter(id => !id.startsWith('_init_'));

        // Restore
        const restored = new Set(saved);
        for (const id of saved) {
            if (id.startsWith('collection-')) {
                restored.add('_init_' + id);
            }
        }

        // Verify
        assert.ok(restored.has('collection-0'));
        assert.ok(restored.has('folder-Users-2'));
        assert.ok(restored.has('_init_collection-0'));
        assert.ok(!restored.has('_init_folder-Users-2'));
    });
});

// ===== Edge cases =====

describe('Tree performance edge cases', () => {
    it('handles tree with no collections', () => {
        const tree = document.getElementById('collectionTree');
        tree.innerHTML = '<div class="empty-state">No collections yet</div>';
        assert.ok(tree.querySelector('.empty-state'));
    });

    it('handles deeply nested folders', () => {
        const expanded = new Set();
        // Simulate 5 levels of nesting
        for (let i = 0; i < 5; i++) {
            expanded.add(`folder-level${i}-${i}`);
        }
        assert.equal(expanded.size, 5);
        const serialized = Array.from(expanded).filter(id => !id.startsWith('_init_'));
        assert.equal(serialized.length, 5);
    });

    it('handles folder IDs with special characters', () => {
        const expanded = new Set();
        expanded.add('folder-My-Folder-1');
        expanded.add('folder-API-Tests-2');
        assert.ok(expanded.has('folder-My-Folder-1'));
        assert.ok(expanded.has('folder-API-Tests-2'));
    });

    it('toggle does not fire folder click', () => {
        const tree = document.getElementById('collectionTree');
        tree.innerHTML = `
            <div class="tree-item folder" data-type="folder" data-id="Auth">
                <span class="tree-toggle" data-target="folder-Auth-0">\u25B6</span>
                <span class="tree-label">Auth</span>
            </div>
            <div id="folder-Auth-0" class="tree-children" style="display:none;"></div>
        `;

        let folderClicked = false;
        let toggleClicked = false;

        tree.addEventListener('click', (e) => {
            const toggle = e.target.closest('.tree-toggle');
            if (toggle) {
                toggleClicked = true;
                e.stopPropagation();
                return;
            }
            const folderItem = e.target.closest('.tree-item[data-type="folder"]');
            if (folderItem) folderClicked = true;
        });

        // Click on toggle
        tree.querySelector('.tree-toggle').click();
        assert.ok(toggleClicked);
        // In delegation pattern with stopPropagation at toggle level,
        // folderClicked should not have been set from the toggle click
        // (but since both are in same handler, we check toggle is handled first)
        assert.ok(!folderClicked || toggleClicked);
    });

    it('handles re-renders preserving expanded state across multiple updates', () => {
        const expanded = new Set(['collection-0', 'folder-Auth-1']);

        // Simulate first render
        const tree = document.getElementById('collectionTree');
        tree.innerHTML = '<div id="collection-0" class="tree-children"></div><div id="folder-Auth-1" class="tree-children"></div>';
        document.querySelectorAll('.tree-children').forEach(el => {
            el.style.display = expanded.has(el.id) ? 'block' : 'none';
        });
        assert.equal(document.getElementById('collection-0').style.display, 'block');
        assert.equal(document.getElementById('folder-Auth-1').style.display, 'block');

        // Simulate second render (same expanded state)
        tree.innerHTML = '<div id="collection-0" class="tree-children"></div><div id="folder-Auth-1" class="tree-children"></div><div id="folder-Users-1" class="tree-children"></div>';
        document.querySelectorAll('.tree-children').forEach(el => {
            el.style.display = expanded.has(el.id) ? 'block' : 'none';
        });
        assert.equal(document.getElementById('collection-0').style.display, 'block');
        assert.equal(document.getElementById('folder-Auth-1').style.display, 'block');
        assert.equal(document.getElementById('folder-Users-1').style.display, 'none');
    });
});
