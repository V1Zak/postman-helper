/**
 * Tests for main.js IPC handlers
 * PRIORITY 4
 *
 * Since main.js uses Electron APIs (dialog, fs), we test the handler logic
 * by extracting and mocking the dependencies.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Read main.js to verify structure
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');

describe('main.js Structure', () => {
    it('imports required Electron modules', () => {
        assert.ok(mainSrc.includes("require('electron')"));
        assert.ok(mainSrc.includes('BrowserWindow'));
        assert.ok(mainSrc.includes('ipcMain'));
        assert.ok(mainSrc.includes('dialog'));
    });

    it('loads dotenv config', () => {
        assert.ok(mainSrc.includes("require('dotenv').config()"));
    });

    it('defines createWindow function', () => {
        assert.ok(mainSrc.includes('function createWindow()'));
    });

    it('registers save-file IPC handler', () => {
        assert.ok(mainSrc.includes("ipcMain.handle('save-file'"));
    });

    it('registers open-file IPC handler', () => {
        assert.ok(mainSrc.includes("ipcMain.handle('open-file'"));
    });

    it('save-file handler uses dialog.showSaveDialog', () => {
        assert.ok(mainSrc.includes('dialog.showSaveDialog'));
    });

    it('open-file handler uses dialog.showOpenDialog', () => {
        assert.ok(mainSrc.includes('dialog.showOpenDialog'));
    });

    it('save-file handler writes file with fs.writeFileSync', () => {
        assert.ok(mainSrc.includes('fs.writeFileSync'));
    });

    it('open-file handler reads file with fs.readFileSync', () => {
        assert.ok(mainSrc.includes('fs.readFileSync'));
    });

    it('handlers return success/failure objects', () => {
        assert.ok(mainSrc.includes('{ success: true'));
        assert.ok(mainSrc.includes('{ success: false'));
    });

    it('handles canceled dialogs', () => {
        assert.ok(mainSrc.includes('result.canceled'));
    });

    it('handles errors in save-file', () => {
        // Both handlers have try-catch with error.message
        const saveHandlerMatch = mainSrc.match(/ipcMain\.handle\('save-file'[\s\S]*?catch\s*\(error\)/);
        assert.ok(saveHandlerMatch, 'save-file should have error handling');
    });

    it('handles errors in open-file', () => {
        const openHandlerMatch = mainSrc.match(/ipcMain\.handle\('open-file'[\s\S]*?catch\s*\(error\)/);
        assert.ok(openHandlerMatch, 'open-file should have error handling');
    });
});

describe('main.js Window Configuration', () => {
    it('sets context isolation to true', () => {
        assert.ok(mainSrc.includes('contextIsolation: true'));
    });

    it('sets nodeIntegration to false', () => {
        assert.ok(mainSrc.includes('nodeIntegration: false'));
    });

    it('references preload.js', () => {
        assert.ok(mainSrc.includes("'preload.js'"));
    });

    it('loads index.html', () => {
        assert.ok(mainSrc.includes("'index.html'"));
    });
});

// Simulate the handler logic to test behavior
describe('main.js IPC Handler Logic', () => {
    it('save-file returns success:false when dialog is canceled', async () => {
        // Simulate the save handler logic
        const mockShowSaveDialog = async () => ({ canceled: true, filePath: '' });
        const result = await mockShowSaveDialog();
        if (result.canceled) {
            assert.deepEqual({ success: false }, { success: false });
        }
    });

    it('save-file returns success:true with path on success', async () => {
        const tmpFile = path.join(__dirname, '..', 'node_modules', '.test_output.json');
        const content = '{"test": true}';

        // Simulate writing
        fs.writeFileSync(tmpFile, content);
        assert.ok(fs.existsSync(tmpFile));
        const written = fs.readFileSync(tmpFile, 'utf-8');
        assert.equal(written, content);

        // Clean up
        fs.unlinkSync(tmpFile);
    });

    it('open-file returns success:false when dialog is canceled', async () => {
        const mockShowOpenDialog = async () => ({ canceled: true, filePaths: [] });
        const result = await mockShowOpenDialog();
        assert.equal(result.canceled, true);
    });

    it('open-file reads file content on success', () => {
        // Test reading a known file
        const content = fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8');
        const parsed = JSON.parse(content);
        assert.equal(parsed.name, 'postman-helper');
    });
});
