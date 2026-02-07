/**
 * Extracts the fallback model classes from app.js for Node.js testing.
 * Since app.js is designed for browser (references window, document),
 * we extract and eval the class definitions in an isolated scope.
 */
const fs = require('fs');
const path = require('path');

function extractAppClasses() {
    const appPath = path.join(__dirname, '..', '..', 'app.js');
    const src = fs.readFileSync(appPath, 'utf-8');
    const lines = src.split('\n');

    // We need Request (from the conditional block) + Collection/Folder/InheritanceManager
    // from the unconditional block, plus the safety-net InheritanceManager.
    // Strategy: extract the Request class from the conditional block,
    // and everything from the unconditional Collection to "// Custom Dialog System".

    // Find the conditional Request class (inside the if block)
    let requestStart = -1;
    let requestEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^\s*Request = class \{/) && requestStart === -1) {
            requestStart = i;
        }
        if (requestStart > -1 && requestEnd === -1 && lines[i].match(/^\s*};$/)) {
            requestEnd = i + 1;
            break;
        }
    }

    // Find the unconditional Collection class (starts at column 0, not indented)
    // and everything up to "// Custom Dialog System"
    let collectionStart = -1;
    let blockEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Collection = class \{/) && collectionStart === -1) {
            collectionStart = i;
        }
        if (collectionStart > -1 && lines[i].match(/^\/\/ Custom Dialog System/)) {
            blockEnd = i;
            break;
        }
    }

    if (requestStart === -1 || collectionStart === -1 || blockEnd === -1) {
        throw new Error(`Could not find class definitions in app.js (req=${requestStart}, col=${collectionStart}, end=${blockEnd})`);
    }

    // Build evaluable snippet: Request class + unconditional block
    const requestCode = lines.slice(requestStart, requestEnd).join('\n');
    const blockCode = lines.slice(collectionStart, blockEnd).join('\n');

    const classCode = `
        let Request, Collection, Folder, InheritanceManager;
        ${requestCode}
        ${blockCode}
        module.exports = { Request, Collection, Folder, InheritanceManager };
    `;

    const Module = require('module');
    const m = new Module();
    m._compile(classCode, 'app_classes_virtual.js');
    return m.exports;
}

module.exports = { extractAppClasses };
