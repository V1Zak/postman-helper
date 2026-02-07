/**
 * Shared jsdom initialization for tests that need a DOM environment.
 * Loads index.html and provides window/document globals.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function createDOM() {
    const htmlPath = path.join(__dirname, '..', '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    const dom = new JSDOM(html, {
        url: 'http://localhost',
        pretendToBeVisual: true,
        runScripts: 'dangerously'
    });

    const { window } = dom;
    const { document } = window;

    // Stub electronAPI
    window.electronAPI = {
        saveFile: async (data) => ({ success: true, path: '/tmp/test.json' }),
        openFile: async (options) => ({ success: false })
    };

    // Stub alert/confirm
    window.alert = () => {};
    window.confirm = () => true;

    return { dom, window, document };
}

module.exports = { createDOM };
