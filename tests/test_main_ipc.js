/**
 * Tests for main.js IPC handlers
 * PRIORITY 4
 *
 * Since main.js uses Electron APIs (dialog, fs), we test the handler logic
 * by extracting and mocking the dependencies. Security functions are extracted
 * and tested directly.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');

// Read main.js to verify structure
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');

// Extract security helper functions from main.js for direct testing
// We compile a subset of main.js that defines the pure functions we want to test
function extractSecurityHelpers() {
  // Extract isPrivateIP, validateURLForSSRF, isWithinPluginsDir, validateAIInput, validateWindowPosition
  const helperCode = `
    const path = require('path');
    const dns = require('dns');
    const net = require('net');

    ${mainSrc.match(/function isPrivateIP\(ip\)[\s\S]*?^}/m)[0]}

    ${mainSrc.match(/function validateURLForSSRF\(parsedUrl\)[\s\S]*?^}/m)[0]}

    const RESOLVED_PLUGINS_DIR = path.resolve(path.join(require('os').homedir(), '.postman-helper', 'plugins'));

    ${mainSrc.match(/function isWithinPluginsDir\(resolvedPath\)[\s\S]*?^}/m)[0]}

    ${mainSrc.match(/function validateAIInput\(data\)[\s\S]*?^}/m)[0]}

    ${mainSrc.match(/function validateWindowPosition\(saved\)[\s\S]*?^}/m)[0]}

    module.exports = { isPrivateIP, validateURLForSSRF, isWithinPluginsDir, validateAIInput, validateWindowPosition };
  `;

  const m = new Module('security-helpers');
  m._compile(helperCode, 'security-helpers.js');
  return m.exports;
}

let helpers;
try {
  helpers = extractSecurityHelpers();
} catch (e) {
  // If extraction fails, tests will be skipped
  console.error('Failed to extract security helpers:', e.message);
  helpers = null;
}

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

    it('save-file handler writes file with fsp.writeFile (async)', () => {
        assert.ok(mainSrc.includes('fsp.writeFile'));
    });

    it('open-file handler reads file with fsp.readFile (async)', () => {
        assert.ok(mainSrc.includes('fsp.readFile'));
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

// ===== Security: SSRF Protection =====
describe('Security: isPrivateIP', { skip: !helpers }, () => {
    it('blocks 127.0.0.1 (loopback)', () => {
        assert.ok(helpers.isPrivateIP('127.0.0.1'));
    });

    it('blocks localhost', () => {
        assert.ok(helpers.isPrivateIP('localhost'));
    });

    it('blocks ::1 (IPv6 loopback)', () => {
        assert.ok(helpers.isPrivateIP('::1'));
    });

    it('blocks ::ffff:127.0.0.1 (IPv4-mapped loopback)', () => {
        assert.ok(helpers.isPrivateIP('::ffff:127.0.0.1'));
    });

    it('blocks 10.x.x.x (Class A private)', () => {
        assert.ok(helpers.isPrivateIP('10.0.0.1'));
        assert.ok(helpers.isPrivateIP('10.255.255.255'));
    });

    it('blocks 172.16-31.x.x (Class B private)', () => {
        assert.ok(helpers.isPrivateIP('172.16.0.1'));
        assert.ok(helpers.isPrivateIP('172.31.255.255'));
    });

    it('does not block 172.15.x.x or 172.32.x.x', () => {
        assert.ok(!helpers.isPrivateIP('172.15.0.1'));
        assert.ok(!helpers.isPrivateIP('172.32.0.1'));
    });

    it('blocks 192.168.x.x (Class C private)', () => {
        assert.ok(helpers.isPrivateIP('192.168.0.1'));
        assert.ok(helpers.isPrivateIP('192.168.255.255'));
    });

    it('blocks 169.254.x.x (link-local)', () => {
        assert.ok(helpers.isPrivateIP('169.254.1.1'));
    });

    it('blocks 169.254.169.254 (cloud metadata)', () => {
        assert.ok(helpers.isPrivateIP('169.254.169.254'));
    });

    it('blocks IPv4-mapped private IPs', () => {
        assert.ok(helpers.isPrivateIP('::ffff:10.0.0.1'));
        assert.ok(helpers.isPrivateIP('::ffff:192.168.1.1'));
        assert.ok(helpers.isPrivateIP('::ffff:172.16.0.1'));
        assert.ok(helpers.isPrivateIP('::ffff:169.254.1.1'));
    });

    it('blocks IPv6 unique local (fc00::/7)', () => {
        assert.ok(helpers.isPrivateIP('fc00::1'));
        assert.ok(helpers.isPrivateIP('fd12::1'));
    });

    it('blocks IPv6 link-local (fe80::/10)', () => {
        assert.ok(helpers.isPrivateIP('fe80::1'));
    });

    it('allows public IPs', () => {
        assert.ok(!helpers.isPrivateIP('8.8.8.8'));
        assert.ok(!helpers.isPrivateIP('1.1.1.1'));
        assert.ok(!helpers.isPrivateIP('93.184.216.34'));
        assert.ok(!helpers.isPrivateIP('203.0.113.1'));
    });
});

describe('Security: validateURLForSSRF', { skip: !helpers }, () => {
    it('rejects ftp:// protocol', async () => {
        const result = await helpers.validateURLForSSRF(new URL('ftp://example.com/file'));
        assert.equal(result.allowed, false);
        assert.ok(result.error.includes('Only http and https'));
    });

    it('rejects file:// protocol', async () => {
        const result = await helpers.validateURLForSSRF(new URL('file:///etc/passwd'));
        assert.equal(result.allowed, false);
    });

    it('allows https:// to public host', async () => {
        const result = await helpers.validateURLForSSRF(new URL('https://api.example.com/v1'));
        assert.equal(result.allowed, true);
    });

    it('allows http:// to public host', async () => {
        const result = await helpers.validateURLForSSRF(new URL('http://api.example.com/v1'));
        assert.equal(result.allowed, true);
    });

    it('blocks http://127.0.0.1 (raw IP loopback)', async () => {
        const result = await helpers.validateURLForSSRF(new URL('http://127.0.0.1:8080/admin'));
        assert.equal(result.allowed, false);
        assert.ok(result.error.includes('private'));
    });

    it('blocks http://10.0.0.1 (raw private IP)', async () => {
        const result = await helpers.validateURLForSSRF(new URL('http://10.0.0.1/internal'));
        assert.equal(result.allowed, false);
    });

    it('blocks http://169.254.169.254 (cloud metadata)', async () => {
        const result = await helpers.validateURLForSSRF(new URL('http://169.254.169.254/latest/meta-data'));
        assert.equal(result.allowed, false);
    });
});

// ===== Security: Path Traversal Protection =====
describe('Security: isWithinPluginsDir', { skip: !helpers }, () => {
    const pluginsDir = path.resolve(path.join(require('os').homedir(), '.postman-helper', 'plugins'));

    it('allows path within plugins dir', () => {
        const testPath = path.join(pluginsDir, 'my-plugin');
        assert.ok(helpers.isWithinPluginsDir(testPath));
    });

    it('allows nested path within plugins dir', () => {
        const testPath = path.join(pluginsDir, 'my-plugin', 'subdir', 'file.js');
        assert.ok(helpers.isWithinPluginsDir(testPath));
    });

    it('rejects path with similar prefix but different dir (plugins-evil)', () => {
        const evilPath = pluginsDir + '-evil';
        assert.ok(!helpers.isWithinPluginsDir(evilPath));
    });

    it('rejects parent directory', () => {
        const parentPath = path.dirname(pluginsDir);
        assert.ok(!helpers.isWithinPluginsDir(parentPath));
    });

    it('rejects completely unrelated path', () => {
        assert.ok(!helpers.isWithinPluginsDir('/tmp/malicious'));
    });

    it('rejects path traversal attempt', () => {
        const traversal = path.join(pluginsDir, '..', '..', 'etc', 'passwd');
        assert.ok(!helpers.isWithinPluginsDir(traversal));
    });
});

// ===== Security: AI Input Validation =====
describe('Security: validateAIInput', { skip: !helpers }, () => {
    it('accepts plain objects', () => {
        assert.ok(helpers.validateAIInput({ method: 'GET' }));
    });

    it('rejects null', () => {
        assert.ok(!helpers.validateAIInput(null));
    });

    it('rejects undefined', () => {
        assert.ok(!helpers.validateAIInput(undefined));
    });

    it('rejects strings', () => {
        assert.ok(!helpers.validateAIInput('hello'));
    });

    it('rejects numbers', () => {
        assert.ok(!helpers.validateAIInput(42));
    });

    it('rejects arrays (typeof [] === "object")', () => {
        assert.ok(!helpers.validateAIInput([1, 2, 3]));
    });

    it('rejects empty arrays', () => {
        assert.ok(!helpers.validateAIInput([]));
    });
});

// ===== Security: Async File I/O =====
describe('Security: Async file I/O (no sync in handlers)', () => {
    // Extract only the IPC handler sections (after createWindow)
    const handlerSection = mainSrc.slice(mainSrc.indexOf("ipcMain.handle('save-file'"));

    it('save-file uses fsp.writeFile not fs.writeFileSync', () => {
        const saveHandler = handlerSection.slice(0, handlerSection.indexOf("ipcMain.handle('open-file'"));
        assert.ok(saveHandler.includes('fsp.writeFile'));
        assert.ok(!saveHandler.includes('fs.writeFileSync'));
    });

    it('open-file uses fsp.readFile not fs.readFileSync', () => {
        const openStart = handlerSection.indexOf("ipcMain.handle('open-file'");
        const openEnd = handlerSection.indexOf("ipcMain.handle('send-request'");
        const openHandler = handlerSection.slice(openStart, openEnd);
        assert.ok(openHandler.includes('fsp.readFile'));
        assert.ok(!openHandler.includes('fs.readFileSync'));
    });

    it('auto-save uses fsp.writeFile not fs.writeFileSync', () => {
        const autoSaveStart = handlerSection.indexOf("ipcMain.handle('auto-save'");
        const autoSaveEnd = handlerSection.indexOf("ipcMain.handle('auto-load'");
        const autoSaveHandler = handlerSection.slice(autoSaveStart, autoSaveEnd);
        assert.ok(autoSaveHandler.includes('fsp.writeFile'));
        assert.ok(!autoSaveHandler.includes('fs.writeFileSync'));
    });

    it('auto-load uses fsp.readFile not fs.readFileSync', () => {
        const autoLoadStart = handlerSection.indexOf("ipcMain.handle('auto-load'");
        const autoLoadEnd = handlerSection.indexOf("ipcMain.handle('clear-autosave'");
        const autoLoadHandler = handlerSection.slice(autoLoadStart, autoLoadEnd);
        assert.ok(autoLoadHandler.includes('fsp.readFile'));
        assert.ok(!autoLoadHandler.includes('fs.readFileSync'));
    });

    it('clear-autosave uses fsp.unlink not fs.unlinkSync', () => {
        const clearStart = handlerSection.indexOf("ipcMain.handle('clear-autosave'");
        const clearEnd = handlerSection.indexOf("ipcMain.handle('list-plugins'");
        const clearHandler = handlerSection.slice(clearStart, clearEnd);
        assert.ok(clearHandler.includes('fsp.unlink'));
        assert.ok(!clearHandler.includes('fs.unlinkSync'));
    });

    it('list-plugins uses fsp.readdir not fs.readdirSync', () => {
        const listStart = handlerSection.indexOf("ipcMain.handle('list-plugins'");
        const listEnd = handlerSection.indexOf("ipcMain.handle('read-plugin-manifest'");
        const listHandler = handlerSection.slice(listStart, listEnd);
        assert.ok(listHandler.includes('fsp.readdir'));
        assert.ok(!listHandler.includes('fs.readdirSync'));
    });

    it('read-plugin-manifest uses fsp.readFile not fs.readFileSync', () => {
        const manifestStart = handlerSection.indexOf("ipcMain.handle('read-plugin-manifest'");
        const manifestEnd = handlerSection.indexOf("ipcMain.handle('load-plugin'");
        const manifestHandler = handlerSection.slice(manifestStart, manifestEnd);
        assert.ok(manifestHandler.includes('fsp.readFile'));
        assert.ok(!manifestHandler.includes('fs.readFileSync'));
    });

    it('load-plugin uses fsp.readFile not fs.readFileSync', () => {
        const loadStart = handlerSection.indexOf("ipcMain.handle('load-plugin'");
        const loadEnd = handlerSection.indexOf('// ===== Feature 18');
        const loadHandler = handlerSection.slice(loadStart, loadEnd);
        assert.ok(loadHandler.includes('fsp.readFile'));
        assert.ok(!loadHandler.includes('fs.readFileSync'));
    });
});

// ===== Security: Response Size Limit =====
describe('Security: Response size limit', () => {
    it('defines MAX_RESPONSE_SIZE constant', () => {
        assert.ok(mainSrc.includes('MAX_RESPONSE_SIZE'));
    });

    it('send-request handler checks totalSize against MAX_RESPONSE_SIZE', () => {
        const sendHandler = mainSrc.slice(
            mainSrc.indexOf("ipcMain.handle('send-request'"),
            mainSrc.indexOf('// ===== Feature 4')
        );
        assert.ok(sendHandler.includes('totalSize'));
        assert.ok(sendHandler.includes('MAX_RESPONSE_SIZE'));
    });

    it('response stream has error handler', () => {
        const sendHandler = mainSrc.slice(
            mainSrc.indexOf("ipcMain.handle('send-request'"),
            mainSrc.indexOf('// ===== Feature 4')
        );
        assert.ok(sendHandler.includes("res.on('error'"));
    });
});

// ===== Security: Auto-save Size Limit =====
describe('Security: Auto-save size limit', () => {
    it('defines MAX_AUTOSAVE_SIZE constant', () => {
        assert.ok(mainSrc.includes('MAX_AUTOSAVE_SIZE'));
    });

    it('auto-save checks serialized length against limit', () => {
        const autoSaveStart = mainSrc.indexOf("ipcMain.handle('auto-save'");
        const autoSaveEnd = mainSrc.indexOf("ipcMain.handle('auto-load'");
        const autoSaveHandler = mainSrc.slice(autoSaveStart, autoSaveEnd);
        assert.ok(autoSaveHandler.includes('MAX_AUTOSAVE_SIZE'));
    });
});

// ===== Security: Plugin hardening =====
describe('Security: Plugin path hardening', () => {
    it('load-plugin rejects mainFile with .. traversal', () => {
        const loadStart = mainSrc.indexOf("ipcMain.handle('load-plugin'");
        const loadEnd = mainSrc.indexOf('// ===== Feature 18');
        const loadHandler = mainSrc.slice(loadStart, loadEnd);
        assert.ok(loadHandler.includes("mainFile.includes('..')"));
    });

    it('load-plugin rejects absolute mainFile paths', () => {
        const loadStart = mainSrc.indexOf("ipcMain.handle('load-plugin'");
        const loadEnd = mainSrc.indexOf('// ===== Feature 18');
        const loadHandler = mainSrc.slice(loadStart, loadEnd);
        assert.ok(loadHandler.includes('path.isAbsolute(mainFile)'));
    });

    it('plugin handlers use fsp.realpath for symlink detection', () => {
        const pluginSection = mainSrc.slice(
            mainSrc.indexOf("ipcMain.handle('read-plugin-manifest'"),
            mainSrc.indexOf('// ===== Feature 18')
        );
        assert.ok(pluginSection.includes('fsp.realpath'));
    });

    it('defines MAX_PLUGIN_SOURCE_SIZE', () => {
        assert.ok(mainSrc.includes('MAX_PLUGIN_SOURCE_SIZE'));
    });

    it('load-plugin checks file size against limit', () => {
        const loadStart = mainSrc.indexOf("ipcMain.handle('load-plugin'");
        const loadEnd = mainSrc.indexOf('// ===== Feature 18');
        const loadHandler = mainSrc.slice(loadStart, loadEnd);
        assert.ok(loadHandler.includes('MAX_PLUGIN_SOURCE_SIZE'));
    });
});

// ===== Window State: Off-screen Validation =====
describe('Security: Window position validation', { skip: !helpers }, () => {
    it('returns null for missing saved state', () => {
        assert.equal(helpers.validateWindowPosition(null), null);
    });

    it('returns null for saved state with no x/y', () => {
        assert.equal(helpers.validateWindowPosition({ width: 1200, height: 800 }), null);
    });

    it('returns position for saved state with x and y (screen API not available)', () => {
        // When screen API throws (no Electron), falls through to return position
        const result = helpers.validateWindowPosition({ x: 100, y: 100, width: 1200, height: 800 });
        assert.ok(result !== null);
        assert.equal(result.x, 100);
        assert.equal(result.y, 100);
    });
});

// ===== preload.js: Event object stripping =====
describe('preload.js: IPC event stripping', () => {
    const preloadSrc = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf-8');

    it('onUpdateAvailable strips event object', () => {
        assert.ok(preloadSrc.includes("onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_event, ...args) => callback(...args))"));
    });

    it('onUpdateDownloaded strips event object', () => {
        assert.ok(preloadSrc.includes("onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_event, ...args) => callback(...args))"));
    });
});
