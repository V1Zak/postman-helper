/**
 * DOM/UI tests using jsdom
 * PRIORITY 3
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

let dom, window, document;

beforeEach(() => {
    const htmlPath = path.join(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    dom = new JSDOM(html, { url: 'http://localhost', pretendToBeVisual: true });
    window = dom.window;
    document = window.document;
});

describe('UI: HTML Structure', () => {
    it('has required tab elements', () => {
        const tabs = document.querySelectorAll('.tab');
        assert.ok(tabs.length >= 3, 'should have at least 3 tabs');
        const tabNames = Array.from(tabs).map(t => t.dataset.tab);
        assert.ok(tabNames.includes('request'));
        assert.ok(tabNames.includes('inheritance'));
        assert.ok(tabNames.includes('tests'));
    });

    it('has required tab panes', () => {
        assert.ok(document.getElementById('requestTab'));
        assert.ok(document.getElementById('inheritanceTab'));
        assert.ok(document.getElementById('testsTab'));
    });

    it('has sidebar with collectionTree', () => {
        assert.ok(document.getElementById('collectionTree'));
    });

    it('has status bar with statusInfo', () => {
        assert.ok(document.getElementById('statusInfo'));
    });

    it('has all header buttons', () => {
        assert.ok(document.getElementById('newRequestBtn'));
        assert.ok(document.getElementById('newFolderBtn'));
        assert.ok(document.getElementById('importBtn'));
        assert.ok(document.getElementById('exportBtn'));
        assert.ok(document.getElementById('settingsBtn'));
    });

    it('has inheritance UI elements', () => {
        assert.ok(document.getElementById('globalHeadersContainer'));
        assert.ok(document.getElementById('baseEndpointsContainer'));
        assert.ok(document.getElementById('bodyTemplatesContainer'));
        assert.ok(document.getElementById('testTemplatesContainer'));
        assert.ok(document.getElementById('addGlobalHeaderBtn'));
        assert.ok(document.getElementById('addBaseEndpointBtn'));
        assert.ok(document.getElementById('addBodyTemplateBtn'));
        assert.ok(document.getElementById('addTestTemplateBtn'));
        assert.ok(document.getElementById('newBaseEndpoint'));
    });
});

describe('UI: Tab Switching Logic', () => {
    it('request tab is initially visible', () => {
        const requestTab = document.getElementById('requestTab');
        // Check it's not display:none (it should be visible by default)
        assert.notEqual(requestTab.style.display, 'none');
    });

    it('inheritance tab is initially hidden', () => {
        const inheritanceTab = document.getElementById('inheritanceTab');
        assert.equal(inheritanceTab.style.display, 'none');
    });

    it('tests tab is initially hidden', () => {
        const testsTab = document.getElementById('testsTab');
        assert.equal(testsTab.style.display, 'none');
    });

    it('request tab has active class initially', () => {
        const requestTabBtn = document.querySelector('.tab[data-tab="request"]');
        assert.ok(requestTabBtn.classList.contains('active'));
    });
});

describe('UI: Collection Tree Default State', () => {
    it('shows empty state by default', () => {
        const tree = document.getElementById('collectionTree');
        const emptyState = tree.querySelector('.empty-state');
        assert.ok(emptyState, 'should show empty state');
        assert.ok(emptyState.textContent.includes('No collections'));
    });
});

describe('UI: Dialog CSS Styles', () => {
    it('has dialog-overlay styles defined', () => {
        // CSS is now in external styles.css (#123)
        const cssPath = path.join(__dirname, '..', 'styles.css');
        const css = fs.readFileSync(cssPath, 'utf-8');
        assert.ok(css.includes('.dialog-overlay'));
        assert.ok(css.includes('.dialog-box'));
        assert.ok(css.includes('.dialog-input'));
        assert.ok(css.includes('.dialog-buttons'));
    });
});

describe('UI: Inheritance Panel Structure', () => {
    it('has all four inheritance sections', () => {
        const sections = document.querySelectorAll('.inheritance-section');
        assert.ok(sections.length >= 4, `Expected 4 sections, got ${sections.length}`);
    });

    it('each section has a heading', () => {
        const headings = document.querySelectorAll('.inheritance-section h4');
        assert.ok(headings.length >= 4);
        const headingTexts = Array.from(headings).map(h => h.textContent);
        assert.ok(headingTexts.some(t => t.includes('Global Headers')));
        assert.ok(headingTexts.some(t => t.includes('Base Endpoints')));
        assert.ok(headingTexts.some(t => t.includes('Body Templates')));
        assert.ok(headingTexts.some(t => t.includes('Test Templates')));
    });
});
