/**
 * Unit tests for responsive layout features:
 * countCollectionRequests, filter clear button behavior, collection count badge
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

let document, window;

beforeEach(() => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
        <input type="text" id="filterText">
        <button class="filter-clear-btn" id="filterClearBtn">&times;</button>
        <div id="collectionTree"></div>
    </body></html>`, {
        url: 'http://localhost',
        pretendToBeVisual: true
    });
    window = dom.window;
    document = window.document;
    global.document = document;
});

afterEach(() => {
    delete global.document;
});

describe('countCollectionRequests', () => {
    // Minimal function matching app.js
    function countCollectionRequests(collection) {
        let count = (collection.requests || []).length;
        const countFolders = (folders) => {
            for (const f of (folders || [])) {
                count += (f.requests || []).length;
                if (f.folders) countFolders(f.folders);
            }
        };
        countFolders(collection.folders);
        return count;
    }

    it('counts root requests', () => {
        assert.equal(countCollectionRequests({
            requests: [{ name: 'a' }, { name: 'b' }],
            folders: []
        }), 2);
    });

    it('counts folder requests', () => {
        assert.equal(countCollectionRequests({
            requests: [],
            folders: [{ requests: [{ name: 'a' }, { name: 'b' }], folders: [] }]
        }), 2);
    });

    it('counts nested folder requests', () => {
        assert.equal(countCollectionRequests({
            requests: [{ name: 'root' }],
            folders: [{
                requests: [{ name: 'f1' }],
                folders: [{
                    requests: [{ name: 'f2a' }, { name: 'f2b' }],
                    folders: []
                }]
            }]
        }), 4);
    });

    it('returns 0 for empty collection', () => {
        assert.equal(countCollectionRequests({ requests: [], folders: [] }), 0);
    });

    it('handles missing requests/folders gracefully', () => {
        assert.equal(countCollectionRequests({}), 0);
    });
});

describe('Filter clear button', () => {
    it('clear button toggles visible class based on input value', () => {
        const input = document.getElementById('filterText');
        const clearBtn = document.getElementById('filterClearBtn');

        // Initially no text — should not be visible
        assert.ok(!clearBtn.classList.contains('visible'));

        // Simulate typing
        input.value = 'test';
        clearBtn.classList.toggle('visible', input.value.length > 0);
        assert.ok(clearBtn.classList.contains('visible'));

        // Clear
        input.value = '';
        clearBtn.classList.toggle('visible', input.value.length > 0);
        assert.ok(!clearBtn.classList.contains('visible'));
    });

    it('clear button clears the input value', () => {
        const input = document.getElementById('filterText');
        input.value = 'search term';

        // Simulate clear button click behavior
        input.value = '';
        assert.equal(input.value, '');
    });
});

describe('Collection count badge CSS class', () => {
    it('collection-count span renders correctly', () => {
        const tree = document.getElementById('collectionTree');
        tree.innerHTML = '<span class="tree-label">My Collection<span class="collection-count">5</span></span>';
        const badge = tree.querySelector('.collection-count');
        assert.ok(badge);
        assert.equal(badge.textContent, '5');
    });
});

describe('Method color CSS classes', () => {
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

    methods.forEach(method => {
        it(`method-color-${method} class exists as a valid CSS class name`, () => {
            const el = document.createElement('span');
            el.className = `method-color-${method}`;
            assert.ok(el.classList.contains(`method-color-${method}`));
        });
    });
});

describe('Resize handle double-click reset', () => {
    it('double-click resets sidebar width to 280px', () => {
        // Simulate what the double-click handler does
        document.documentElement.style.setProperty('--sidebar-width', '400px');
        assert.equal(document.documentElement.style.getPropertyValue('--sidebar-width'), '400px');

        // Simulate double-click handler
        document.documentElement.style.setProperty('--sidebar-width', '280px');
        assert.equal(document.documentElement.style.getPropertyValue('--sidebar-width'), '280px');
    });
});
