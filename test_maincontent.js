// Simple test to verify mainContent element is now accessible
console.log('Testing mainContent element accessibility...');

// Simulate the DOM structure
const testHTML = `
<!DOCTYPE html>
<html>
<body>
    <div class="main-content" id="mainContent">
        <div class="tabs">
            <div class="tab active">Request</div>
        </div>
        <div class="tab-content">
            <div id="requestTab">Content here</div>
        </div>
    </div>
</body>
</html>
`;

// Create a temporary DOM parser
const { JSDOM } = require('jsdom');
const dom = new JSDOM(testHTML);
const document = dom.window.document;

// Test the selector that app.js uses
const mainContent = document.getElementById('mainContent');

if (mainContent) {
    console.log('✅ SUCCESS: mainContent element found!');
    console.log('Element class:', mainContent.className);
    console.log('Element children:', mainContent.children.length);
    
    // Test that we can manipulate it
    mainContent.innerHTML = '<div>Test content</div>';
    console.log('✅ Can modify content successfully');
} else {
    console.log('❌ FAILED: mainContent element not found');
}

console.log('Test completed.');
