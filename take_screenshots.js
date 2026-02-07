// Temporary script to take screenshots of the app
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const screenshotDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir);

async function takeScreenshots() {
    const win = new BrowserWindow({
        width: 1200,
        height: 750,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Stub IPC handlers so the app doesn't crash
    ipcMain.handle('save-file', async () => ({ success: false }));
    ipcMain.handle('open-file', async () => ({ success: false }));

    await win.loadFile('index.html');
    await delay(2000);

    // 1. Main screen (empty state)
    await capture(win, '01-main-screen.png');

    // Build sample data using the real app instance (stored on window.__app)
    await win.webContents.executeJavaScript(`
        (function() {
            const app = window.__app;
            const coll = new Collection('Sample API Collection');
            const r1 = new Request('Get Users', 'GET', 'https://api.example.com/v1/users');
            r1.headers = {'Authorization': 'Bearer token123', 'Accept': 'application/json'};
            r1.tests = 'pm.test("Status code is 200", function () {\\n    pm.response.to.have.status(200);\\n});';
            const r2 = new Request('Create User', 'POST', 'https://api.example.com/v1/users');
            r2.body = '{\\n  "name": "John Doe",\\n  "email": "john@example.com"\\n}';
            r2.headers = {'Content-Type': 'application/json', 'Authorization': 'Bearer token123'};
            const r3 = new Request('Update User', 'PUT', 'https://api.example.com/v1/users/1');
            r3.body = '{"name":"Jane Doe","email":"jane@example.com"}';
            r3.headers = {'Content-Type': 'application/json'};
            const r4 = new Request('Delete User', 'DELETE', 'https://api.example.com/v1/users/1');
            r4.headers = {'Authorization': 'Bearer token123'};
            const folder = new Folder('Authentication');
            const r5 = new Request('Login', 'POST', 'https://api.example.com/v1/auth/login');
            r5.body = '{"username":"admin","password":"secret"}';
            r5.tests = 'pm.test("Login successful", function () {\\n    pm.response.to.have.status(200);\\n});';
            const r6 = new Request('Refresh Token', 'PATCH', 'https://api.example.com/v1/auth/refresh');
            folder.addRequest(r5);
            folder.addRequest(r6);
            coll.addRequest(r1);
            coll.addRequest(r2);
            coll.addRequest(r3);
            coll.addRequest(r4);
            coll.addFolder(folder);

            window.__sampleRequests = {r1, r2, r3, r4, r5, r6};

            app.state.setCurrentCollection(coll);
            app.state.setCurrentRequest(r2);
            app.updateCollectionTree();
            app.switchTab('request');
        })();
    `);
    await delay(1000);

    // 2. Collection tree + request editor
    await capture(win, '02-request-editor.png');

    // 3. Show body with formatted JSON via Beautify
    await win.webContents.executeJavaScript(`
        (function() {
            const beautifyBtn = document.querySelector('.body-toggle-btn[data-mode="beautify"]');
            if (beautifyBtn) beautifyBtn.click();
        })();
    `);
    await delay(500);
    await capture(win, '03-body-beautify.png');

    // 4. Switch to Tests tab
    await win.webContents.executeJavaScript(`
        (function() {
            const app = window.__app;
            app.state.setCurrentRequest(window.__sampleRequests.r1);
            app.switchTab('tests');
        })();
    `);
    await delay(1000);
    await capture(win, '04-tests-tab.png');

    // 5. Show filtering - activate POST filter
    await win.webContents.executeJavaScript(`
        (function() {
            const app = window.__app;
            app.switchTab('request');
            const postChip = document.querySelector('.method-chip[data-method="POST"]');
            if (postChip) postChip.click();
        })();
    `);
    await delay(1000);
    await capture(win, '05-filtering.png');

    // 6. Clear filter, show inheritance tab
    await win.webContents.executeJavaScript(`
        (function() {
            const app = window.__app;
            const clearBtn = document.getElementById('filterClearBtn');
            if (clearBtn) clearBtn.click();
            app.state.inheritanceManager.addGlobalHeader('Authorization', 'Bearer {{token}}');
            app.state.inheritanceManager.addGlobalHeader('Content-Type', 'application/json');
            app.state.inheritanceManager.addBaseEndpoint('https://api.example.com/v1');
            app.state.inheritanceManager.addBaseEndpoint('https://staging.example.com/v1');
            app.switchTab('inheritance');
        })();
    `);
    await delay(1000);
    await capture(win, '06-inheritance.png');

    console.log('All screenshots taken!');
    app.quit();
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function capture(win, filename) {
    const image = await win.webContents.capturePage();
    const pngBuffer = image.toPNG();
    fs.writeFileSync(path.join(screenshotDir, filename), pngBuffer);
    console.log(`Saved ${filename} (${Math.round(pngBuffer.length/1024)}KB)`);
}

app.whenReady().then(takeScreenshots);
