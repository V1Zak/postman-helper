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
    // from "Request = class {" to "// Custom Dialog System"
    let blockStart = -1;
    let blockEnd = -1;
    for (let i = 0; i < lines.length; i++) {
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

module.exports = { extractAppClasses };
