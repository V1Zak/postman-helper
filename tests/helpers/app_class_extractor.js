/**
 * Extracts the model classes from app.js for Node.js testing.
 * Since app.js is designed for browser (references window, document),
 * we extract and eval the class definitions in an isolated scope.
 */
const fs = require('fs');
const path = require('path');

function extractAppClasses() {
    const appPath = path.join(__dirname, '..', '..', 'app.js');
    const src = fs.readFileSync(appPath, 'utf-8');
    const lines = src.split('\n');

    // All model classes are in one contiguous block:
    // from "function generateUUID()" (or "Request = class {") to "// Custom Dialog System"
    let blockStart = -1;
    let blockEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^function generateUUID\(\)/) && blockStart === -1) {
            blockStart = i;
        }
        if (lines[i].match(/^Request = class \{/) && blockStart === -1) {
            blockStart = i;
        }
        if (blockStart > -1 && lines[i].match(/^\/\/ Custom Dialog System/)) {
            blockEnd = i;
            break;
        }
    }

    if (blockStart === -1 || blockEnd === -1) {
        throw new Error(`Could not find class definitions in app.js (start=${blockStart}, end=${blockEnd})`);
    }

    const blockCode = lines.slice(blockStart, blockEnd).join('\n');

    const classCode = `
        let Request, Collection, Folder, InheritanceManager;
        ${blockCode}
        module.exports = { Request, Collection, Folder, InheritanceManager };
    `;

    const Module = require('module');
    const m = new Module();
    m._compile(classCode, 'app_classes_virtual.js');
    return m.exports;
}

/**
 * Extracts the AppState class from app.js.
 * Requires InheritanceManager from model classes, and DOM/localStorage globals.
 * The caller must set up global.document and global.localStorage before using.
 */
function extractAppState() {
    const appPath = path.join(__dirname, '..', '..', 'app.js');
    const src = fs.readFileSync(appPath, 'utf-8');
    const lines = src.split('\n');

    // AppState is between "// AppState class" and "// Main application class"
    let blockStart = -1;
    let blockEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^\/\/ AppState class/) && blockStart === -1) {
            blockStart = i + 1; // skip the comment line
        }
        if (blockStart > -1 && lines[i].match(/^\/\/ Main application class/)) {
            blockEnd = i;
            break;
        }
    }

    if (blockStart === -1 || blockEnd === -1) {
        throw new Error(`Could not find AppState in app.js (start=${blockStart}, end=${blockEnd})`);
    }

    const blockCode = lines.slice(blockStart, blockEnd).join('\n');

    // AppState references InheritanceManager, document, localStorage
    // These must be provided by the test environment (JSDOM, global mocks)
    const code = `
        const InheritanceManager = require('__inheritance_manager__');
        ${blockCode}
        module.exports = { AppState };
    `;

    // First extract InheritanceManager from model classes block
    const modelClasses = extractAppClasses();

    const Module = require('module');
    const m = new Module('appstate_virtual.js');
    // Provide InheritanceManager via a custom require
    const origResolve = Module._resolveFilename;
    Module._resolveFilename = function(request, parent) {
        if (request === '__inheritance_manager__') return request;
        return origResolve.call(this, request, parent);
    };
    const origLoad = Module._cache;
    require.cache['__inheritance_manager__'] = {
        id: '__inheritance_manager__',
        filename: '__inheritance_manager__',
        loaded: true,
        exports: modelClasses.InheritanceManager
    };

    m._compile(code, 'appstate_virtual.js');

    Module._resolveFilename = origResolve;
    delete require.cache['__inheritance_manager__'];

    return m.exports.AppState;
}

/**
 * Extracts the DialogSystem class from app.js.
 * It sits between "// Custom Dialog System" and "// Documentation Generator".
 * Requires DOM globals (document).
 */
function extractDialogSystem() {
    const appPath = path.join(__dirname, '..', '..', 'app.js');
    const src = fs.readFileSync(appPath, 'utf-8');
    const lines = src.split('\n');

    let blockStart = -1;
    let blockEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^\/\/ Custom Dialog System/) && blockStart === -1) {
            blockStart = i + 1;
        }
        if (blockStart > -1 && lines[i].match(/^\/\/ Documentation Generator/)) {
            blockEnd = i;
            break;
        }
    }

    if (blockStart === -1 || blockEnd === -1) {
        throw new Error(`Could not find DialogSystem in app.js (start=${blockStart}, end=${blockEnd})`);
    }

    const blockCode = lines.slice(blockStart, blockEnd).join('\n');
    const code = `${blockCode}\nmodule.exports = { DialogSystem };`;

    const Module = require('module');
    const m = new Module('dialog_system_virtual.js');
    m._compile(code, 'dialog_system_virtual.js');
    return m.exports.DialogSystem;
}

module.exports = { extractAppClasses, extractAppState, extractDialogSystem };
