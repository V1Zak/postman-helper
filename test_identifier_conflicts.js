// Test script to check for identifier conflicts
const fs = require('fs');
const path = require('path');

console.log('=== Testing for Identifier Conflicts ===\n');

// Test 1: Check current app.js syntax
console.log('1. Testing app.js syntax...');
try {
    require('./app.js');
    console.log('✅ app.js syntax is valid');
} catch (e) {
    console.log('❌ app.js syntax error:', e.message);
}

// Test 2: Check models.js syntax
console.log('\n2. Testing models.js syntax...');
try {
    require('./models.js');
    console.log('✅ models.js syntax is valid');
} catch (e) {
    console.log('❌ models.js syntax error:', e.message);
}

// Test 3: Check for global identifier declarations
console.log('\n3. Checking for global identifier declarations...');
const appContent = fs.readFileSync('./app.js', 'utf8');
const modelsContent = fs.readFileSync('./models.js', 'utf8');

// Check for problematic patterns
const problematicPatterns = [
    /let\s+Collection\s*=/, // let Collection = ...
    /const\s+Collection\s*=/, // const Collection = ...
    /var\s+Collection\s*=/, // var Collection = ...
    /window\.Collection\s*=/, // window.Collection = ...
];

let foundIssues = false;

problematicPatterns.forEach((pattern, index) => {
    if (pattern.test(appContent)) {
        console.log(`❌ Found problematic pattern in app.js: ${pattern}`);
        foundIssues = true;
    }
    if (pattern.test(modelsContent)) {
        console.log(`❌ Found problematic pattern in models.js: ${pattern}`);
        foundIssues = true;
    }
});

if (!foundIssues) {
    console.log('✅ No obvious problematic declaration patterns found');
}

// Test 4: Check what models.js exports
console.log('\n4. Checking models.js exports...');
try {
    const models = require('./models.js');
    console.log('✅ models.js exports:', Object.keys(models));
} catch (e) {
    console.log('❌ Error loading models.js:', e.message);
}

// Test 5: Check for multiple declaration attempts
console.log('\n5. Checking for multiple declaration attempts...');
const declarationCount = (appContent.match(/let\s+(Request|Collection|Folder|InheritanceManager)/g) || []).length;
if (declarationCount > 0) {
    console.log(`❌ Found ${declarationCount} let declarations in app.js`);
} else {
    console.log('✅ No let declarations found in app.js');
}

// Test 6: Check if the issue is in the browser context
console.log('\n6. Checking for browser-specific issues...');
if (appContent.includes('window.models')) {
    console.log('⚠️  app.js references window.models - this could cause conflicts');
}
if (modelsContent.includes('window.models')) {
    console.log('⚠️  models.js exports to window.models - this could cause conflicts');
}

console.log('\n=== Test Complete ===');
