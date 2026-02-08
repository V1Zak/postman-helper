// Postman Helper Application
// Main application logic and UI interactions

// Import models using CommonJS syntax

// Built-in model classes — always defined, then overridden by window.models if available
let Request, Collection, Folder, InheritanceManager;

Request = class {
    constructor(name, method, url, headers = {}, body = '', description = '', events = {}) {
        this.name = name || 'New Request';
        this.method = method || 'GET';
        this.url = url || '';
        this.headers = headers || [];
        this.body = body || '';
        this.description = description || '';
        this.events = events || { prerequest: '', test: '' };
    }
};

Collection = class {
    constructor(name, description) {
        this.name = name || 'New Collection';
        this.description = description || '';
        this.requests = [];
        this.folders = [];
    }
    addRequest(req) { this.requests.push(req); }
    addFolder(folder) { this.folders.push(folder); }

    importFromJSON(data) {
        try {
            let dataObj = data;
            if (typeof data === 'string') {
                dataObj = JSON.parse(data);
            }

            // Handle Postman Collection v2.1 format
            if (dataObj.info) {
                this.name = dataObj.info.name || this.name;
                this.description = dataObj.info.description || this.description;
                if (dataObj.item) {
                    this.processPostmanItems(dataObj.item);
                }
                return this;
            }

            // Simple format - direct property copying
            if (dataObj.name) this.name = dataObj.name;
            if (dataObj.description) this.description = dataObj.description;

            // Import requests if they exist
            if (dataObj.requests && Array.isArray(dataObj.requests)) {
                this.requests = dataObj.requests.map(req => {
                    const request = new Request(
                        req.name || 'Unnamed Request',
                        req.method || 'GET',
                        req.url || '',
                        req.headers || [],
                        req.body || '',
                        req.description || '',
                        req.events || {}
                    );
                    return request;
                });
            }

            // Import folders if they exist
            if (dataObj.folders && Array.isArray(dataObj.folders)) {
                this.folders = dataObj.folders.map(folderData => {
                    const folder = new Folder(folderData.name || 'Unnamed Folder');
                    if (folderData.requests) {
                        folder.requests = folderData.requests.map(req => {
                            return new Request(
                                req.name || 'Unnamed Request',
                                req.method || 'GET',
                                req.url || '',
                                req.headers || [],
                                req.body || '',
                                req.description || '',
                                req.events || {}
                            );
                        });
                    }
                    return folder;
                });
            }

            return this;
        } catch (error) {
            console.error('Error in importFromJSON:', error);
            throw error;
        }
    }

    processPostmanItems(items) {
        if (!items || !Array.isArray(items)) return;

        items.forEach(item => {
            if (item.request) {
                const req = this.createRequestFromPostmanItem(item);
                this.requests.push(req);
            } else if (item.name && item.item) {
                const folder = this.createFolderFromPostmanItem(item);
                this.folders.push(folder);
            }
        });
    }

    createRequestFromPostmanItem(item) {
        const urlRaw = (item.request.url && item.request.url.raw) ? item.request.url.raw : (item.request.url || '/');
        const bodyStr = item.request.body ? (typeof item.request.body === 'string' ? item.request.body : (item.request.body.raw || JSON.stringify(item.request.body, null, 2))) : '';
        // Convert Postman header array [{key, value, type}] to internal object {key: value}
        const headers = {};
        if (item.request.header && Array.isArray(item.request.header)) {
            item.request.header.forEach(h => {
                if (h.key) headers[h.key] = h.value || '';
            });
        }
        const req = new Request(
            item.name || 'Unnamed Request',
            (item.request.method || 'GET').toUpperCase(),
            urlRaw,
            headers,
            bodyStr
        );
        req.description = item.request.description || '';
        // Import test scripts from events
        if (item.event && Array.isArray(item.event)) {
            const testEvent = item.event.find(e => e.listen === 'test');
            if (testEvent && testEvent.script && testEvent.script.exec) {
                req.tests = Array.isArray(testEvent.script.exec) ? testEvent.script.exec.join('\n') : testEvent.script.exec;
            }
        }
        return req;
    }

    createFolderFromPostmanItem(item) {
        const folder = new Folder(item.name || 'Unnamed Folder');

        if (item.item) {
            item.item.forEach(subItem => {
                if (subItem.request) {
                    folder.requests.push(this.createRequestFromPostmanItem(subItem));
                } else if (subItem.name && subItem.item) {
                    folder.folders.push(this.createFolderFromPostmanItem(subItem));
                }
            });
        }

        return folder;
    }

    exportToJSON() {
        return {
            name: this.name,
            description: this.description,
            requests: this.requests.map(req => ({
                name: req.name,
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: req.body,
                description: req.description,
                events: req.events
            })),
            folders: this.folders.map(folder => ({
                name: folder.name,
                requests: folder.requests.map(req => ({
                    name: req.name,
                    method: req.method,
                    url: req.url,
                    headers: req.headers,
                    body: req.body,
                    description: req.description,
                    events: req.events
                }))
            }))
        };
    }

    toPostmanJSON() {
        const requestToPostmanItem = (req) => {
            const item = {
                name: req.name,
                request: {
                    method: req.method || 'GET',
                    header: [],
                    url: {
                        raw: req.url || '',
                        protocol: '',
                        host: [],
                        path: []
                    }
                },
                response: []
            };
            // Convert headers object to Postman header array
            if (req.headers && typeof req.headers === 'object') {
                for (const [key, value] of Object.entries(req.headers)) {
                    item.request.header.push({ key, value, type: 'text' });
                }
            }
            // Add body if present
            if (req.body) {
                item.request.body = {
                    mode: 'raw',
                    raw: req.body,
                    options: { raw: { language: 'json' } }
                };
            }
            // Add description
            if (req.description) {
                item.request.description = req.description;
            }
            // Add test scripts as events
            const events = [];
            if (req.tests) {
                events.push({
                    listen: 'test',
                    script: {
                        type: 'text/javascript',
                        exec: req.tests.split('\n')
                    }
                });
            }
            if (req.events && req.events.prerequest) {
                events.push({
                    listen: 'prerequest',
                    script: {
                        type: 'text/javascript',
                        exec: req.events.prerequest.split('\n')
                    }
                });
            }
            if (events.length > 0) {
                item.event = events;
            }
            return item;
        };

        const folderToPostmanItem = (folder) => {
            const item = {
                name: folder.name,
                item: []
            };
            if (folder.requests) {
                folder.requests.forEach(req => {
                    item.item.push(requestToPostmanItem(req));
                });
            }
            if (folder.folders) {
                folder.folders.forEach(sub => {
                    item.item.push(folderToPostmanItem(sub));
                });
            }
            return item;
        };

        const postmanCollection = {
            info: {
                name: this.name,
                description: this.description || '',
                schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
            },
            item: []
        };

        // Add root-level requests
        this.requests.forEach(req => {
            postmanCollection.item.push(requestToPostmanItem(req));
        });

        // Add folders
        this.folders.forEach(folder => {
            postmanCollection.item.push(folderToPostmanItem(folder));
        });

        return postmanCollection;
    }
};

Folder = class {
    constructor(name) {
        this.name = name || 'New Folder';
        this.requests = [];
        this.folders = [];
    }
    addRequest(req) { this.requests.push(req); }
    addFolder(folder) { this.folders.push(folder); }
};

InheritanceManager = class {
        constructor() {
            this.globalHeaders = [];
            this.baseEndpoints = [];
            this.bodyTemplates = [];
            this.testTemplates = [];
            this.rules = [];
        }
        getGlobalHeaders() { return this.globalHeaders; }
        getBaseEndpoints() { return this.baseEndpoints; }
        getBodyTemplates() { return this.bodyTemplates; }
        getTestTemplates() { return this.testTemplates; }
        processRequest(req) { return {...req}; }
        setGlobalHeaders(h) { this.globalHeaders = h; }
        addBaseEndpoint(e) { this.baseEndpoints.push(e); }
        addGlobalHeader(key, value) {
            this.globalHeaders.push({ key, value });
        }
        addBodyTemplate(name, content) {
            this.bodyTemplates.push({ name, content });
        }
        addTestTemplate(name, content) {
            this.testTemplates.push({ name, content });
        }
        removeGlobalHeader(key) {
            this.globalHeaders = this.globalHeaders.filter(h => h.key !== key);
        }
        removeBaseEndpoint(endpoint) {
            this.baseEndpoints = this.baseEndpoints.filter(e => e !== endpoint);
        }
        removeBodyTemplate(name) {
            this.bodyTemplates = this.bodyTemplates.filter(t => t.name !== name);
        }
        removeTestTemplate(name) {
            this.testTemplates = this.testTemplates.filter(t => t.name !== name);
        }
        addRule(target, source, properties) {
            this.rules.push({ target, source, properties });
        }
        getRules() { return this.rules; }
        toJSON() {
            return {
                globalHeaders: this.globalHeaders,
                baseEndpoints: this.baseEndpoints,
                bodyTemplates: this.bodyTemplates,
                testTemplates: this.testTemplates,
                rules: this.rules
            };
        }
        static fromJSON(data) {
            const mgr = new InheritanceManager();
            mgr.globalHeaders = data.globalHeaders || [];
            mgr.baseEndpoints = data.baseEndpoints || [];
            mgr.bodyTemplates = data.bodyTemplates || [];
            mgr.testTemplates = data.testTemplates || [];
            mgr.rules = data.rules || [];
            return mgr;
        }
    };

// Try to load models from window.models if available (from preload.js)
try {
    if (window.models) {
        Request = window.models.PostmanRequest || Request;
        Collection = window.models.Collection || Collection;
        Folder = window.models.Folder || Folder;
        InheritanceManager = window.models.InheritanceManager || InheritanceManager;
    }
} catch (error) {
    console.log('Using built-in model classes (window.models not available):', error.message);
}

// Custom Dialog System - Replacement for prompt() and confirm()
class DialogSystem {
    static showPrompt(title, defaultValue = '', callback) {
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';

        const dialogBox = document.createElement('div');
        dialogBox.className = 'dialog-box';

        const titleElement = document.createElement('h3');
        titleElement.textContent = title;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'dialog-input';
        input.value = defaultValue;

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'dialog-buttons';

        const okButton = document.createElement('button');
        okButton.textContent = 'OK';
        okButton.className = 'dialog-btn primary';

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'dialog-btn secondary';

        okButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
            callback(input.value);
        });

        cancelButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
            callback(null);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                document.body.removeChild(overlay);
                callback(input.value);
            } else if (e.key === 'Escape') {
                document.body.removeChild(overlay);
                callback(null);
            }
        });

        buttonContainer.appendChild(okButton);
        buttonContainer.appendChild(cancelButton);

        dialogBox.appendChild(titleElement);
        dialogBox.appendChild(input);
        dialogBox.appendChild(buttonContainer);
        overlay.appendChild(dialogBox);
        document.body.appendChild(overlay);

        input.focus();
        input.select();
    }

    static showConfirm(message, callback) {
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';

        const dialogBox = document.createElement('div');
        dialogBox.className = 'dialog-box';

        const messageElement = document.createElement('p');
        messageElement.textContent = message;
        messageElement.style.margin = '20px 0';
        messageElement.style.fontSize = '16px';

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'dialog-buttons';

        const okButton = document.createElement('button');
        okButton.textContent = 'OK';
        okButton.className = 'dialog-btn primary';

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'dialog-btn secondary';

        okButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
            callback(true);
        });

        cancelButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
            callback(false);
        });

        buttonContainer.appendChild(okButton);
        buttonContainer.appendChild(cancelButton);

        dialogBox.appendChild(messageElement);
        dialogBox.appendChild(buttonContainer);
        overlay.appendChild(dialogBox);
        document.body.appendChild(overlay);
    }
}

// AppState class - manages application state
class AppState {
    constructor() {
        this.collections = [];
        this.currentCollection = null;
        this.currentRequest = null;
        this.currentFolder = null;
        this.unsavedChanges = false;
        
        // Settings with default values
        this.autoSave = false;
        this.darkMode = false;
        this.autoFormat = true;
        this.showLineNumbers = true;
        this.inheritGlobally = true;
        this.bodyViewMode = 'raw';
        this.filters = { text: '', methods: [], hasTests: false, hasBody: false };
        this.environments = [];
        this.activeEnvironment = null;
        // Initialize inheritance manager with proper fallback
        if (typeof InheritanceManager === 'function') {
            this.inheritanceManager = new InheritanceManager();
        } else {
            console.warn('InheritanceManager class not available, using object fallback');
            this.inheritanceManager = {
                globalHeaders: [],
                baseEndpoints: [],
                bodyTemplates: [],
                testTemplates: [],
                rules: [],
                getGlobalHeaders: function() { return this.globalHeaders; },
                getBaseEndpoints: function() { return this.baseEndpoints; },
                getBodyTemplates: function() { return this.bodyTemplates; },
                getTestTemplates: function() { return this.testTemplates; },
                processRequest: function(req) { return Object.assign({}, req); },
                setGlobalHeaders: function(h) { this.globalHeaders = h; },
                addBaseEndpoint: function(e) { this.baseEndpoints.push(e); },
                addGlobalHeader: function(key, value) { this.globalHeaders.push({ key, value }); },
                addBodyTemplate: function(name, content) { this.bodyTemplates.push({ name, content }); },
                addTestTemplate: function(name, content) { this.testTemplates.push({ name, content }); },
                removeGlobalHeader: function(key) { this.globalHeaders = this.globalHeaders.filter(function(h) { return h.key !== key; }); },
                removeBaseEndpoint: function(endpoint) { this.baseEndpoints = this.baseEndpoints.filter(function(e) { return e !== endpoint; }); },
                removeBodyTemplate: function(name) { this.bodyTemplates = this.bodyTemplates.filter(function(t) { return t.name !== name; }); },
                removeTestTemplate: function(name) { this.testTemplates = this.testTemplates.filter(function(t) { return t.name !== name; }); },
                addRule: function(target, source, properties) { this.rules.push({ target, source, properties }); },
                getRules: function() { return this.rules; }
            };
        }
    }
    setCurrentCollection(collection) {
        this.currentCollection = collection;
        if (collection && !this.collections.includes(collection)) {
            this.collections.push(collection);
        }
        this.unsavedChanges = false;
    }

    addCollection(collection) {
        this.collections.push(collection);
        if (!this.currentCollection) {
            this.currentCollection = collection;
        }
    }

    removeCollection(collection) {
        const idx = this.collections.indexOf(collection);
        if (idx !== -1) this.collections.splice(idx, 1);
        if (this.currentCollection === collection) {
            this.currentCollection = this.collections[0] || null;
            this.currentRequest = null;
            this.currentFolder = null;
        }
    }

    setCurrentRequest(request) {
        this.currentRequest = request;
    }

    setCurrentFolder(folder) {
        this.currentFolder = folder;
    }

    markAsChanged() {
        this.unsavedChanges = true;
        this.updateStatusBar();
        if (this._onChanged) this._onChanged();
    }

    updateStatusBar() {
        const statusInfo = document.getElementById('statusInfo');
        if (this.currentCollection) {
            const changeIndicator = this.unsavedChanges ? '• ' : '';
            const colCount = this.collections.length > 1 ? ` (${this.collections.length} collections)` : '';
            statusInfo.textContent = `${changeIndicator}${this.currentCollection.name} | ${this.currentCollection.requests.length} requests, ${this.currentCollection.folders.length} folders${colCount}`;
        } else {
            statusInfo.textContent = 'No collection loaded';
        }
    }
}

// Main application class
class PostmanHelperApp {
    constructor() {
        this.state = new AppState();
        this._autoSaveTimer = null;
        this.state._onChanged = () => this.triggerAutoSave();
        this.initUI();
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.setupContextMenus();
        this.loadAutoSave();
        // this.initChangeTracking(); // TODO: Implement change tracking feature
        // this.loadSampleData(); // Disabled due to model loading issues
    }

    initUI() {
        // Apply default dark theme
        this.applyTheme('dark');

        // Initialize tab functionality
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Set up resizable sidebar
        this.setupSidebarResize();

        // Update status bar
        this.state.updateStatusBar();
    }

    setupSidebarResize() {
        const handle = document.getElementById('resizeHandle');
        const sidebar = document.querySelector('.sidebar');
        if (!handle || !sidebar) return;

        // Restore saved width
        const savedWidth = localStorage.getItem('sidebarWidth');
        if (savedWidth) {
            document.documentElement.style.setProperty('--sidebar-width', savedWidth + 'px');
        }

        let isResizing = false;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            handle.classList.add('dragging');
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const newWidth = Math.min(500, Math.max(200, e.clientX));
            document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
        });

        document.addEventListener('mouseup', () => {
            if (!isResizing) return;
            isResizing = false;
            handle.classList.remove('dragging');
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            const computedWidth = parseInt(getComputedStyle(sidebar).width, 10);
            localStorage.setItem('sidebarWidth', computedWidth);
        });
    }

    setupEventListeners() {
        // Header buttons
        document.getElementById('newRequestBtn').addEventListener('click', () => this.createNewRequest());
        document.getElementById('newFolderBtn').addEventListener('click', () => this.createNewFolder());
        document.getElementById('importBtn').addEventListener('click', () => this.importCollection());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportCollection());
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettings());

        // Inheritance buttons
        document.getElementById('addGlobalHeaderBtn').addEventListener('click', () => this.addGlobalHeader());
        document.getElementById('addBaseEndpointBtn').addEventListener('click', () => this.addBaseEndpoint());
        document.getElementById('addBodyTemplateBtn').addEventListener('click', () => this.addBodyTemplate());
        document.getElementById('addTestTemplateBtn').addEventListener('click', () => this.addTestTemplate());

        // Copy from Request buttons
        const copyHeadersBtn = document.getElementById('copyHeadersFromRequestBtn');
        if (copyHeadersBtn) copyHeadersBtn.addEventListener('click', () => this.copyHeadersFromRequest());
        const copyBodyBtn = document.getElementById('copyBodyFromRequestBtn');
        if (copyBodyBtn) copyBodyBtn.addEventListener('click', () => this.copyBodyFromRequest());
        const copyTestsBtn = document.getElementById('copyTestsFromRequestBtn');
        if (copyTestsBtn) copyTestsBtn.addEventListener('click', () => this.copyTestsFromRequest());

        // Reset All Inheritance button
        const resetAllBtn = document.getElementById('resetAllInheritanceBtn');
        if (resetAllBtn) resetAllBtn.addEventListener('click', () => this.resetAllInheritance());

        // Auth preset buttons
        const bearerBtn = document.getElementById('addBearerTokenBtn');
        if (bearerBtn) bearerBtn.addEventListener('click', () => this.addBearerTokenPreset());
        const apiKeyBtn = document.getElementById('addApiKeyBtn');
        if (apiKeyBtn) apiKeyBtn.addEventListener('click', () => this.addApiKeyPreset());
        const basicAuthBtn = document.getElementById('addBasicAuthBtn');
        if (basicAuthBtn) basicAuthBtn.addEventListener('click', () => this.addBasicAuthPreset());

        // Environment controls
        document.getElementById('manageEnvBtn').addEventListener('click', () => this.showEnvironmentManager());
        document.getElementById('envSelector').addEventListener('change', (e) => {
            this.state.activeEnvironment = e.target.value || null;
            this.updateUrlPreview();
            this.triggerAutoSave();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

        // Filter controls
        this.setupFilterListeners();
    }

    setupFilterListeners() {
        const filterText = document.getElementById('filterText');
        if (filterText) {
            filterText.addEventListener('input', () => {
                this.state.filters.text = filterText.value.toLowerCase();
                this.updateCollectionTree();
            });
        }

        document.querySelectorAll('.method-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const method = chip.dataset.method;
                const idx = this.state.filters.methods.indexOf(method);
                if (idx === -1) {
                    this.state.filters.methods.push(method);
                    chip.classList.add('active');
                } else {
                    this.state.filters.methods.splice(idx, 1);
                    chip.classList.remove('active');
                }
                this.updateCollectionTree();
            });
        });

        const hasTestsBtn = document.getElementById('filterHasTests');
        if (hasTestsBtn) {
            hasTestsBtn.addEventListener('click', () => {
                this.state.filters.hasTests = !this.state.filters.hasTests;
                hasTestsBtn.classList.toggle('active', this.state.filters.hasTests);
                this.updateCollectionTree();
            });
        }

        const hasBodyBtn = document.getElementById('filterHasBody');
        if (hasBodyBtn) {
            hasBodyBtn.addEventListener('click', () => {
                this.state.filters.hasBody = !this.state.filters.hasBody;
                hasBodyBtn.classList.toggle('active', this.state.filters.hasBody);
                this.updateCollectionTree();
            });
        }

        const clearBtn = document.getElementById('filterClearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.state.filters = { text: '', methods: [], hasTests: false, hasBody: false };
                const filterTextInput = document.getElementById('filterText');
                if (filterTextInput) filterTextInput.value = '';
                document.querySelectorAll('.method-chip').forEach(c => c.classList.remove('active'));
                const ht = document.getElementById('filterHasTests');
                const hb = document.getElementById('filterHasBody');
                if (ht) ht.classList.remove('active');
                if (hb) hb.classList.remove('active');
                this.updateCollectionTree();
            });
        }
    }

    handleKeyboardShortcuts(e) {
        // Check if we're in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        // Command/Ctrl + N - New Request
        if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
            e.preventDefault();
            this.createNewRequest();
        }

        // Command/Ctrl + O - Import
        if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
            e.preventDefault();
            this.importCollection();
        }

        // Command/Ctrl + S - Export
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            this.exportCollection();
        }
    }

    switchTab(tabName) {
        // Hide all tab panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.style.display = 'none';
        });

        // Remove active class from all tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Show selected tab pane
        const tabPane = document.getElementById(`${tabName}Tab`);
        if (tabPane) {
            tabPane.style.display = 'block';
        }

        // Add active class to selected tab
        const activeTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        // Update tab content based on current state
        this.updateTabContent(tabName);
    }

    updateTabContent(tabName) {
        switch (tabName) {
            case 'request':
                this.updateRequestTab();
                break;
            case 'inheritance':
                this.updateInheritanceTab();
                break;
            case 'tests':
                this.updateTestsTab();
                break;
        }
    }

    updateRequestTab() {
        const requestTab = document.getElementById('requestTab');
        
        if (!this.state.currentRequest) {
            requestTab.innerHTML = `
                <div class="empty-state">
                    <div>Select or create a request to get started</div>
                    <div style="margin-top: 10px; font-size: 13px;">
                        <button id="createRequestFromEmpty" class="secondary">Create New Request</button>
                    </div>
                </div>
            `;
            
            document.getElementById('createRequestFromEmpty').addEventListener('click', () => this.createNewRequest());
            return;
        }

        requestTab.innerHTML = `
            <div class="form-group">
                <label for="requestName">Request Name</label>
                <input type="text" id="requestName" class="form-control" value="${this.state.currentRequest.name}">
            </div>

            <div class="form-group">
                <label>URL</label>
                <div class="url-send-row">
                    <select id="requestMethod" class="form-control">
                        <option value="GET" ${this.state.currentRequest.method === 'GET' ? 'selected' : ''}>GET</option>
                        <option value="POST" ${this.state.currentRequest.method === 'POST' ? 'selected' : ''}>POST</option>
                        <option value="PUT" ${this.state.currentRequest.method === 'PUT' ? 'selected' : ''}>PUT</option>
                        <option value="DELETE" ${this.state.currentRequest.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                        <option value="PATCH" ${this.state.currentRequest.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
                        <option value="HEAD" ${this.state.currentRequest.method === 'HEAD' ? 'selected' : ''}>HEAD</option>
                        <option value="OPTIONS" ${this.state.currentRequest.method === 'OPTIONS' ? 'selected' : ''}>OPTIONS</option>
                    </select>
                    <input type="text" id="requestUrl" class="form-control" value="${this.state.currentRequest.url}" placeholder="https://api.example.com/endpoint">
                    <button id="sendRequestBtn" class="send-btn">Send</button>
                </div>
                <div id="urlPreview" class="url-preview" style="display:none;"></div>
            </div>

            <div class="form-group">
                <label>Headers</label>
                <div id="requestHeadersContainer" class="headers-container">
                    ${this.renderHeaders(this.state.currentRequest.headers)}
                </div>
                <button id="addRequestHeaderBtn" class="add-header-btn">+ Add Header</button>
            </div>

            <div class="form-group">
                <label for="requestBody">Body</label>
                <div class="body-toggle-bar">
                    <button class="body-toggle-btn ${this.state.bodyViewMode === 'raw' ? 'active' : ''}" data-mode="raw">Raw</button>
                    <button class="body-toggle-btn ${this.state.bodyViewMode === 'formatted' ? 'active' : ''}" data-mode="formatted">Formatted</button>
                    <button class="body-toggle-btn beautify-btn" data-mode="beautify">Beautify</button>
                </div>
                <textarea id="requestBody" class="form-control">${this.getBodyForDisplay()}</textarea>
                <div id="bodyFormatError" class="body-format-error" style="display:none;"></div>
            </div>

            <div class="form-group">
                <label for="requestDescription">Description</label>
                <textarea id="requestDescription" class="form-control" placeholder="Optional description">${this.state.currentRequest.description || ''}</textarea>
            </div>

            <div class="btn-group">
                <button id="saveRequestBtn">Save Request</button>
                <button id="deleteRequestBtn" class="secondary">Delete Request</button>
                <button id="duplicateRequestBtn" class="secondary">Duplicate</button>
            </div>
        `;

        // Set up event listeners for the request form
        document.getElementById('saveRequestBtn').addEventListener('click', () => this.saveRequest());
        document.getElementById('deleteRequestBtn').addEventListener('click', () => this.deleteRequest());
        document.getElementById('duplicateRequestBtn').addEventListener('click', () => this.duplicateRequest());
        document.getElementById('addRequestHeaderBtn').addEventListener('click', () => this.addRequestHeader());

        // Set up Send button
        const sendBtn = document.getElementById('sendRequestBtn');
        if (sendBtn) sendBtn.addEventListener('click', () => this.sendRequest());

        // Set up URL preview for environment variables
        const urlInput = document.getElementById('requestUrl');
        if (urlInput) {
            urlInput.addEventListener('input', () => this.updateUrlPreview());
            this.updateUrlPreview();
        }

        // Set up body toggle
        this.setupBodyToggle();

        // Set up change listeners for auto-save indication
        const inputs = requestTab.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('change', () => this.state.markAsChanged());
            input.addEventListener('input', () => this.state.markAsChanged());
        });
    }

    getBodyForDisplay() {
        const body = this.state.currentRequest ? (this.state.currentRequest.body || '') : '';
        if (this.state.bodyViewMode === 'formatted' && body.trim()) {
            try {
                return JSON.stringify(this.tryParseJSON(body), null, 2);
            } catch (e) {
                // Invalid JSON — fall back to raw
                return body;
            }
        }
        return body;
    }

    tryParseJSON(raw) {
        // Try strict JSON first
        try {
            return JSON.parse(raw);
        } catch (strictError) {
            // Lenient cleanup: strip comments, trailing commas, single quotes
            try {
                let cleaned = raw;
                // Remove single-line comments
                cleaned = cleaned.replace(/\/\/.*$/gm, '');
                // Remove multi-line comments
                cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
                // Remove trailing commas before } or ]
                cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
                // Replace single-quoted strings with double-quoted
                // Match single-quoted strings (handling escaped single quotes inside)
                cleaned = cleaned.replace(/'((?:[^'\\]|\\.)*)'/g, (match, content) => {
                    // Escape any unescaped double quotes inside, unescape single quotes
                    const fixed = content.replace(/\\'/g, "'").replace(/"/g, '\\"');
                    return `"${fixed}"`;
                });
                return JSON.parse(cleaned);
            } catch (lenientError) {
                // Throw error with position info from the original strict error
                throw strictError;
            }
        }
    }

    setupBodyToggle() {
        const requestTab = document.getElementById('requestTab');
        if (!requestTab) return;
        const rawBtn = requestTab.querySelector('.body-toggle-btn[data-mode="raw"]');
        const fmtBtn = requestTab.querySelector('.body-toggle-btn[data-mode="formatted"]');
        const beautifyBtn = requestTab.querySelector('.body-toggle-btn[data-mode="beautify"]');
        const textarea = document.getElementById('requestBody');
        const errorDiv = document.getElementById('bodyFormatError');
        if (!rawBtn || !fmtBtn || !beautifyBtn || !textarea || !errorDiv) return;

        const updateActiveState = () => {
            rawBtn.classList.toggle('active', this.state.bodyViewMode === 'raw');
            fmtBtn.classList.toggle('active', this.state.bodyViewMode === 'formatted');
        };

        fmtBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (this.state.bodyViewMode === 'formatted') return;
            const raw = textarea.value;
            if (!raw.trim()) {
                errorDiv.textContent = 'Body is empty — nothing to format';
                errorDiv.style.display = 'block';
                return;
            }
            try {
                const formatted = JSON.stringify(this.tryParseJSON(raw), null, 2);
                textarea.value = formatted;
                errorDiv.style.display = 'none';
                this.state.bodyViewMode = 'formatted';
                updateActiveState();
            } catch (e) {
                errorDiv.textContent = 'Invalid JSON — cannot format: ' + e.message;
                errorDiv.style.display = 'block';
            }
        });

        rawBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (this.state.bodyViewMode === 'raw') return;
            this.state.bodyViewMode = 'raw';
            errorDiv.style.display = 'none';
            updateActiveState();
        });

        // Beautify: always attempt to pretty-print regardless of current mode
        beautifyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const raw = textarea.value;
            if (!raw.trim()) {
                errorDiv.textContent = 'Body is empty — nothing to beautify';
                errorDiv.style.display = 'block';
                return;
            }
            try {
                const formatted = JSON.stringify(this.tryParseJSON(raw), null, 2);
                textarea.value = formatted;
                errorDiv.style.display = 'none';
                this.state.bodyViewMode = 'formatted';
                updateActiveState();
                this.state.markAsChanged();
            } catch (e) {
                errorDiv.textContent = 'Invalid JSON — cannot beautify: ' + e.message;
                errorDiv.style.display = 'block';
            }
        });
    }

    renderHeaders(headers) {
        if (Object.keys(headers).length === 0) {
            return '<div class="empty-state" style="padding: 20px;">No headers defined</div>';
        }

        let html = '';
        for (const [key, value] of Object.entries(headers)) {
            html += `
                <div class="header-row">
                    <input type="text" class="header-key" value="${key}" placeholder="Header Name">
                    <input type="text" class="header-value" value="${value}" placeholder="Header Value">
                    <button class="remove-header-btn" data-key="${key}">❌</button>
                </div>
            `;
        }
        return html;
    }

    updateInheritanceTab() {
        // Update global headers
        const globalHeadersContainer = document.getElementById('globalHeadersContainer');
        const headers = this.state.inheritanceManager.getGlobalHeaders();
        if (headers.length === 0) {
            globalHeadersContainer.innerHTML = '<div class="empty-state" style="padding: 20px;">No global headers defined</div>';
        } else {
            let headersHtml = '';
            for (const header of headers) {
                headersHtml += `
                    <div class="header-row">
                        <input type="text" class="global-header-key" value="${header.key}" placeholder="Header Name">
                        <input type="text" class="global-header-value" value="${header.value}" placeholder="Header Value">
                        <button class="remove-global-header-btn" data-key="${header.key}">❌</button>
                    </div>
                `;
            }
            globalHeadersContainer.innerHTML = headersHtml;
        }

        // Update base endpoints
        const baseEndpointsContainer = document.getElementById('baseEndpointsContainer');
        const endpoints = this.state.inheritanceManager.getBaseEndpoints();
        if (endpoints.length === 0) {
            baseEndpointsContainer.innerHTML = '<div class="empty-state" style="padding: 20px;">No base endpoints defined</div>';
        } else {
            let endpointsHtml = '';
            for (const endpoint of endpoints) {
                endpointsHtml += `
                    <div style="margin-bottom: 8px; display: flex; align-items: center;">
                        <span style="flex: 1; word-break: break-all;">${endpoint}</span>
                        <button class="remove-base-endpoint-btn" data-endpoint="${endpoint}" style="margin-left: 10px;">❌</button>
                    </div>
                `;
            }
            baseEndpointsContainer.innerHTML = endpointsHtml;
        }

        // Update body templates
        const bodyTemplatesContainer = document.getElementById('bodyTemplatesContainer');
        const bodyTemplates = this.state.inheritanceManager.getBodyTemplates();
        if (bodyTemplates.length === 0) {
            bodyTemplatesContainer.innerHTML = '<div class="empty-state" style="padding: 20px;">No body templates defined</div>';
        } else {
            let bodyHtml = '';
            for (const tmpl of bodyTemplates) {
                const preview = tmpl.content.length > 80 ? tmpl.content.substring(0, 80) + '...' : tmpl.content;
                bodyHtml += `
                    <div class="template-card">
                        <div class="template-card-header">
                            <strong>${tmpl.name}</strong>
                            <div class="template-actions">
                                <button class="template-action-btn apply-body-tmpl-btn" data-name="${tmpl.name}">Apply</button>
                                <button class="template-action-btn apply-body-tmpl-all-btn" data-name="${tmpl.name}">Apply to All</button>
                                <button class="template-action-btn create-req-from-tmpl-btn" data-name="${tmpl.name}">+ Request</button>
                                <button class="template-action-btn remove-body-tmpl-btn" data-name="${tmpl.name}">❌</button>
                            </div>
                        </div>
                        <div class="template-preview">${preview}</div>
                    </div>
                `;
            }
            bodyTemplatesContainer.innerHTML = bodyHtml;
        }

        // Update test templates
        const testTemplatesContainer = document.getElementById('testTemplatesContainer');
        const testTemplates = this.state.inheritanceManager.getTestTemplates();
        if (testTemplates.length === 0) {
            testTemplatesContainer.innerHTML = '<div class="empty-state" style="padding: 20px;">No test templates defined</div>';
        } else {
            let testHtml = '';
            for (const tmpl of testTemplates) {
                const preview = tmpl.content.length > 80 ? tmpl.content.substring(0, 80) + '...' : tmpl.content;
                testHtml += `
                    <div class="template-card">
                        <div class="template-card-header">
                            <strong>${tmpl.name}</strong>
                            <div class="template-actions">
                                <button class="template-action-btn apply-test-tmpl-btn" data-name="${tmpl.name}">Apply</button>
                                <button class="template-action-btn apply-test-tmpl-all-btn" data-name="${tmpl.name}">Apply to All</button>
                                <button class="template-action-btn remove-test-tmpl-btn" data-name="${tmpl.name}">❌</button>
                            </div>
                        </div>
                        <div class="template-preview">${preview}</div>
                    </div>
                `;
            }
            testTemplatesContainer.innerHTML = testHtml;
        }

        // Set up event listeners for inheritance management
        document.querySelectorAll('.remove-global-header-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const key = e.target.dataset.key;
                this.state.inheritanceManager.removeGlobalHeader(key);
                this.state.markAsChanged();
                this.updateInheritanceTab();
            });
        });

        // Listen for inline edits on global header key/value inputs
        const headerRows = globalHeadersContainer.querySelectorAll('.header-row');
        headerRows.forEach((row, index) => {
            const keyInput = row.querySelector('.global-header-key');
            const valueInput = row.querySelector('.global-header-value');
            if (keyInput) {
                keyInput.addEventListener('change', () => {
                    this.state.inheritanceManager.globalHeaders[index].key = keyInput.value;
                    this.state.markAsChanged();
                });
            }
            if (valueInput) {
                valueInput.addEventListener('change', () => {
                    this.state.inheritanceManager.globalHeaders[index].value = valueInput.value;
                    this.state.markAsChanged();
                });
            }
        });

        document.querySelectorAll('.remove-base-endpoint-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const endpoint = e.target.dataset.endpoint;
                this.state.inheritanceManager.removeBaseEndpoint(endpoint);
                this.state.markAsChanged();
                this.updateInheritanceTab();
            });
        });

        document.querySelectorAll('.remove-body-tmpl-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.state.inheritanceManager.removeBodyTemplate(btn.dataset.name);
                this.state.markAsChanged();
                this.updateInheritanceTab();
            });
        });

        document.querySelectorAll('.remove-test-tmpl-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.state.inheritanceManager.removeTestTemplate(btn.dataset.name);
                this.state.markAsChanged();
                this.updateInheritanceTab();
            });
        });

        document.querySelectorAll('.apply-body-tmpl-btn').forEach(btn => {
            btn.addEventListener('click', () => this.applyBodyTemplateToRequest(btn.dataset.name));
        });

        document.querySelectorAll('.apply-body-tmpl-all-btn').forEach(btn => {
            btn.addEventListener('click', () => this.applyBodyTemplateToAll(btn.dataset.name));
        });

        document.querySelectorAll('.apply-test-tmpl-btn').forEach(btn => {
            btn.addEventListener('click', () => this.applyTestTemplateToRequest(btn.dataset.name));
        });

        document.querySelectorAll('.apply-test-tmpl-all-btn').forEach(btn => {
            btn.addEventListener('click', () => this.applyTestTemplateToAll(btn.dataset.name));
        });

        document.querySelectorAll('.create-req-from-tmpl-btn').forEach(btn => {
            btn.addEventListener('click', () => this.createRequestFromTemplate(btn.dataset.name));
        });
    }

    updateTestsTab() {
        const testsTab = document.getElementById('testsTab');

        if (!this.state.currentRequest) {
            testsTab.innerHTML = '<div class="empty-state">Select a request to view and edit tests</div>';
            return;
        }

        testsTab.innerHTML = `
            <div class="form-group">
                <label for="requestTests">Test Scripts</label>
                <div class="snippet-bar">
                    <button class="snippet-btn" data-snippet="status">Status Code</button>
                    <button class="snippet-btn" data-snippet="time">Response Time</button>
                    <button class="snippet-btn" data-snippet="json">JSON Body</button>
                    <button class="snippet-btn" data-snippet="contains">Response Contains</button>
                    <button class="snippet-btn" data-snippet="header">Header Check</button>
                    <button class="snippet-btn" data-snippet="env">Env Variable</button>
                    <button class="snippet-btn" data-snippet="collvar">Collection Var</button>
                </div>
                <div style="position:relative;">
                    <textarea id="requestTests" class="form-control" style="min-height:200px;" placeholder="// Write your Postman test scripts here&#10;// Type pm. for autocomplete suggestions">${this.state.currentRequest.tests || ''}</textarea>
                </div>
            </div>

            <div class="btn-group">
                <button id="saveTestsBtn">Save Tests</button>
                <button id="clearTestsBtn" class="secondary">Clear</button>
            </div>
        `;

        document.getElementById('saveTestsBtn').addEventListener('click', () => this.saveTests());
        document.getElementById('clearTestsBtn').addEventListener('click', () => {
            document.getElementById('requestTests').value = '';
            this.state.markAsChanged();
        });

        const textarea = document.getElementById('requestTests');
        textarea.addEventListener('input', () => this.state.markAsChanged());

        // Set up snippet buttons
        this.setupSnippetButtons(textarea);

        // Set up autocomplete
        this.setupTestAutocomplete(textarea);
    }

    // --- Test Snippet & Autocomplete ---

    insertAtCursor(textarea, text) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = textarea.value.substring(0, start);
        const after = textarea.value.substring(end);
        textarea.value = before + text + after;
        const newPos = start + text.length;
        textarea.selectionStart = textarea.selectionEnd = newPos;
        textarea.focus();
    }

    setupSnippetButtons(textarea) {
        const snippets = {
            status: 'pm.test("Status code is 200", function () {\n    pm.response.to.have.status(200);\n});\n',
            time: 'pm.test("Response time is less than 500ms", function () {\n    pm.expect(pm.response.responseTime).to.be.below(500);\n});\n',
            json: 'pm.test("Response is JSON", function () {\n    pm.response.to.be.json;\n});\n',
            contains: 'pm.test("Response contains key", function () {\n    var jsonData = pm.response.json();\n    pm.expect(jsonData.key).to.eql("value");\n});\n',
            header: 'pm.test("Content-Type header is present", function () {\n    pm.response.to.have.header("Content-Type");\n});\n',
            env: 'pm.environment.set("myVar", pm.response.json().token);\nconsole.log(pm.environment.get("myVar"));\n',
            collvar: 'pm.collectionVariables.set("myVar", "value");\nconsole.log(pm.collectionVariables.get("myVar"));\n'
        };

        document.querySelectorAll('.snippet-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.snippet;
                if (snippets[key]) {
                    this.insertAtCursor(textarea, snippets[key]);
                    this.state.markAsChanged();
                }
            });
        });
    }

    setupTestAutocomplete(textarea) {
        const dictionary = [
            { label: 'pm.test(name, fn)', insertText: 'pm.test("", function () {\n    \n});', desc: 'Define a test' },
            { label: 'pm.expect(value)', insertText: 'pm.expect()', desc: 'Assertion' },
            { label: 'pm.response.code', insertText: 'pm.response.code', desc: 'HTTP status code' },
            { label: 'pm.response.status', insertText: 'pm.response.status', desc: 'Status text' },
            { label: 'pm.response.responseTime', insertText: 'pm.response.responseTime', desc: 'Response time (ms)' },
            { label: 'pm.response.headers', insertText: 'pm.response.headers', desc: 'Response headers' },
            { label: 'pm.response.text()', insertText: 'pm.response.text()', desc: 'Response as text' },
            { label: 'pm.response.json()', insertText: 'pm.response.json()', desc: 'Parse JSON response' },
            { label: 'pm.response.to.have.status(code)', insertText: 'pm.response.to.have.status(200)', desc: 'Assert status' },
            { label: 'pm.response.to.have.header(name)', insertText: 'pm.response.to.have.header("")', desc: 'Assert header' },
            { label: 'pm.response.to.have.body(text)', insertText: 'pm.response.to.have.body("")', desc: 'Assert body text' },
            { label: 'pm.response.to.have.jsonBody(path)', insertText: 'pm.response.to.have.jsonBody("")', desc: 'Assert JSON path' },
            { label: 'pm.response.to.be.json', insertText: 'pm.response.to.be.json', desc: 'Assert JSON format' },
            { label: 'pm.response.to.be.ok', insertText: 'pm.response.to.be.ok', desc: 'Assert 2xx status' },
            { label: 'pm.response.to.be.success', insertText: 'pm.response.to.be.success', desc: 'Assert success' },
            { label: 'pm.response.to.be.info', insertText: 'pm.response.to.be.info', desc: 'Assert 1xx' },
            { label: 'pm.response.to.be.redirection', insertText: 'pm.response.to.be.redirection', desc: 'Assert 3xx' },
            { label: 'pm.response.to.be.clientError', insertText: 'pm.response.to.be.clientError', desc: 'Assert 4xx' },
            { label: 'pm.response.to.be.serverError', insertText: 'pm.response.to.be.serverError', desc: 'Assert 5xx' },
            { label: 'pm.environment.get(key)', insertText: 'pm.environment.get("")', desc: 'Get env variable' },
            { label: 'pm.environment.set(key, value)', insertText: 'pm.environment.set("", "")', desc: 'Set env variable' },
            { label: 'pm.environment.unset(key)', insertText: 'pm.environment.unset("")', desc: 'Remove env variable' },
            { label: 'pm.variables.get(key)', insertText: 'pm.variables.get("")', desc: 'Get variable' },
            { label: 'pm.variables.set(key, value)', insertText: 'pm.variables.set("", "")', desc: 'Set variable' },
            { label: 'pm.collectionVariables.get(key)', insertText: 'pm.collectionVariables.get("")', desc: 'Get collection var' },
            { label: 'pm.collectionVariables.set(key, value)', insertText: 'pm.collectionVariables.set("", "")', desc: 'Set collection var' },
            { label: 'pm.globals.get(key)', insertText: 'pm.globals.get("")', desc: 'Get global var' },
            { label: 'pm.globals.set(key, value)', insertText: 'pm.globals.set("", "")', desc: 'Set global var' },
            { label: 'pm.request.url', insertText: 'pm.request.url', desc: 'Request URL' },
            { label: 'pm.request.headers', insertText: 'pm.request.headers', desc: 'Request headers' },
            { label: 'pm.request.body', insertText: 'pm.request.body', desc: 'Request body' },
            { label: 'pm.request.method', insertText: 'pm.request.method', desc: 'HTTP method' },
            { label: 'pm.info.requestName', insertText: 'pm.info.requestName', desc: 'Current request name' },
            { label: 'pm.info.iteration', insertText: 'pm.info.iteration', desc: 'Current iteration' },
            { label: 'pm.info.iterationCount', insertText: 'pm.info.iterationCount', desc: 'Total iterations' }
        ];

        let dropdown = null;
        let selectedIdx = -1;

        const getWordAtCursor = () => {
            const pos = textarea.selectionStart;
            const text = textarea.value.substring(0, pos);
            const match = text.match(/(pm\.[a-zA-Z.]*)$/);
            return match ? match[1] : null;
        };

        const showDropdown = (items, prefix) => {
            hideDropdown();
            if (items.length === 0) return;

            dropdown = document.createElement('div');
            dropdown.className = 'autocomplete-dropdown';
            selectedIdx = 0;

            items.forEach((item, i) => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item' + (i === 0 ? ' selected' : '');
                div.innerHTML = `<span>${item.label}</span><span class="ac-desc">${item.desc}</span>`;
                div.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    selectItem(item, prefix);
                });
                dropdown.appendChild(div);
            });

            // Position above the textarea (avoids being clipped at bottom)
            const rect = textarea.getBoundingClientRect();
            dropdown.style.position = 'fixed';
            dropdown.style.left = rect.left + 'px';
            dropdown.style.width = Math.min(rect.width, 450) + 'px';
            // Try below first, fall back to above if not enough space
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow > 210) {
                dropdown.style.top = (rect.bottom + 2) + 'px';
            } else {
                dropdown.style.bottom = (window.innerHeight - rect.top + 2) + 'px';
            }
            document.body.appendChild(dropdown);
        };

        const hideDropdown = () => {
            if (dropdown) {
                dropdown.remove();
                dropdown = null;
                selectedIdx = -1;
            }
        };

        const selectItem = (item, prefix) => {
            const pos = textarea.selectionStart;
            const before = textarea.value.substring(0, pos - prefix.length);
            const after = textarea.value.substring(pos);
            textarea.value = before + item.insertText + after;
            const newPos = before.length + item.insertText.length;
            textarea.selectionStart = textarea.selectionEnd = newPos;
            textarea.focus();
            hideDropdown();
            this.state.markAsChanged();
        };

        // Use input event — fires reliably on every content change
        textarea.addEventListener('input', () => {
            const prefix = getWordAtCursor();
            if (prefix && prefix.length >= 3) {
                const lower = prefix.toLowerCase();
                const matches = dictionary.filter(d => d.label.toLowerCase().startsWith(lower) || d.insertText.toLowerCase().startsWith(lower));
                showDropdown(matches, prefix);
            } else {
                hideDropdown();
            }
        });

        textarea.addEventListener('keydown', (e) => {
            if (!dropdown) return;
            const items = dropdown.querySelectorAll('.autocomplete-item');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
                items.forEach((el, i) => el.classList.toggle('selected', i === selectedIdx));
                items[selectedIdx].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIdx = Math.max(selectedIdx - 1, 0);
                items.forEach((el, i) => el.classList.toggle('selected', i === selectedIdx));
                items[selectedIdx].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter' && selectedIdx >= 0) {
                e.preventDefault();
                const prefix = getWordAtCursor();
                if (prefix) {
                    const lower = prefix.toLowerCase();
                    const matches = dictionary.filter(d => d.label.toLowerCase().startsWith(lower) || d.insertText.toLowerCase().startsWith(lower));
                    if (matches[selectedIdx]) {
                        selectItem(matches[selectedIdx], prefix);
                    }
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                hideDropdown();
            }
        });

        textarea.addEventListener('blur', () => {
            setTimeout(hideDropdown, 200);
        });
    }

    // Collection Management
    createNewCollection() {
        DialogSystem.showPrompt('Enter collection name:', 'New Collection', (name) => {
            if (name) {
                const col = new Collection(name);
                this.state.addCollection(col);
                this.state.currentCollection = col;
                this.state.currentRequest = null;
                this.state.currentFolder = null;
                this.updateCollectionTree();
                this.state.markAsChanged();
            }
        });
    }

    createNewRequest() {
        if (!this.state.currentCollection) {
            DialogSystem.showConfirm('No collection loaded. Create a new collection first?', (createCollection) => {
                if (createCollection) {
                    this.createNewCollection();
                }
            });
            return;
        }

        DialogSystem.showPrompt('Enter request name:', 'New Request', (name) => {
            if (name) {
                const request = new Request(name, 'GET', '/');
                this.state.currentCollection.addRequest(request);
                this.state.setCurrentRequest(request);
                this.updateCollectionTree();
                this.switchTab('request');
                this.state.markAsChanged();
            }
        });
    }

    createNewFolder() {
        if (!this.state.currentCollection) {
            DialogSystem.showConfirm('No collection loaded. Create a new collection first?', (createCollection) => {
                if (createCollection) {
                    this.createNewCollection();
                }
            });
            return;
        }

        DialogSystem.showPrompt('Enter folder name:', 'New Folder', (name) => {
            if (name) {
                const folder = new Folder(name);
                this.state.currentCollection.addFolder(folder);
                this.state.setCurrentFolder(folder);
                this.updateCollectionTree();
                this.state.markAsChanged();
            }
        });
    }

    updateCollectionTree() {
        const collectionTree = document.getElementById('collectionTree');

        if (this.state.collections.length === 0) {
            collectionTree.innerHTML = '<div class="empty-state">No collections yet</div>';
            return;
        }

        let html = '';
        const filtering = this.hasFiltersActive();

        for (let index = 0; index < this.state.collections.length; index++) {
            const collection = this.state.collections[index];
            const isActive = collection === this.state.currentCollection;
            const activeClass = isActive ? ' active' : '';
            const colId = `collection-${index}`;

            html += `
                <div class="tree-item collection-item${activeClass}" data-type="collection" data-collection-index="${index}" data-collapsible="true">
                    <span class="tree-toggle" data-target="${colId}">▶</span>
                    <span class="tree-label">${isActive ? '📚' : '📁'} ${collection.name}</span>
                </div>
                <div id="${colId}" class="tree-children" data-drop-target="collection" data-collection-index="${index}">
            `;

            // Add requests at root level (filtered)
            if (collection.requests && collection.requests.length > 0) {
                const visibleRequests = filtering
                    ? collection.requests.filter(r => this.matchesFilters(r))
                    : collection.requests;
                if (visibleRequests.length > 0) {
                    html += '<div class="tree-section">Root Requests:</div>';
                    for (const request of visibleRequests) {
                        const reqActive = this.state.currentRequest === request ? 'active' : '';
                        html += `<div class="tree-item ${reqActive}" data-type="request" data-id="${request.name}" data-collection-index="${index}" draggable="true"><span class="method-badge method-${(request.method || 'GET').toLowerCase()}">${(request.method || 'GET')}</span><span class="request-name">${request.name}</span></div>`;
                    }
                }
            }

            // Add folders with collapsible functionality (filtered)
            if (collection.folders && collection.folders.length > 0) {
                const visibleFolders = filtering
                    ? collection.folders.filter(f => this.folderHasMatchingRequests(f))
                    : collection.folders;
                if (visibleFolders.length > 0) {
                    html += '<div class="tree-section">Folders:</div>';
                    for (const folder of visibleFolders) {
                        html += this.renderCollapsibleFolder(folder, 1);
                    }
                }
            }

            // Show no-results message when filtering
            if (filtering) {
                const hasRootHits = collection.requests && collection.requests.some(r => this.matchesFilters(r));
                const hasFolderHits = collection.folders && collection.folders.some(f => this.folderHasMatchingRequests(f));
                if (!hasRootHits && !hasFolderHits) {
                    html += '<div class="no-results-msg">No matching requests</div>';
                }
            }

            html += '</div>'; // Close collection children
        }

        collectionTree.innerHTML = html;

        // Set up collapsible functionality
        this.setupCollapsibleTree();

        // Set up click handlers for requests, folders, and collections
        this.setupTreeClickHandlers();

        // Set up drag and drop for the new tree elements
        this.setupDragAndDrop();
    }

    renderCollapsibleFolder(folder, depth = 0) {
        const folderId = `folder-${folder.name.replace(/\s+/g, '-')}-${depth}`;
        const activeClass = this.state.currentFolder === folder ? 'active' : '';

        let html = `
            <div class="tree-item folder ${activeClass}" data-type="folder" data-id="${folder.name}" data-drop-target="folder" draggable="true" style="padding-left: ${12 + depth * 15}px">
                <span class="tree-toggle" data-target="${folderId}">▶</span>
                <span class="tree-label">📁 ${folder.name}</span>
            </div>
            <div id="${folderId}" class="tree-children" data-drop-target="folder" data-id="${folder.name}" style="padding-left: ${24 + depth * 15}px">
        `;

        // Add folder contents (filtered)
        const filtering = this.hasFiltersActive();
        if (folder.requests && folder.requests.length > 0) {
            const visibleRequests = filtering
                ? folder.requests.filter(r => this.matchesFilters(r))
                : folder.requests;
            for (const request of visibleRequests) {
                const requestActive = this.state.currentRequest === request ? 'active' : '';
                html += `<div class="tree-item ${requestActive}" data-type="request" data-id="${request.name}" draggable="true"><span class="method-badge method-${(request.method || 'GET').toLowerCase()}">${(request.method || 'GET')}</span><span class="request-name">${request.name}</span></div>`;
            }
        }

        // Add subfolders recursively (filtered)
        if (folder.folders && folder.folders.length > 0) {
            const visibleSubfolders = filtering
                ? folder.folders.filter(f => this.folderHasMatchingRequests(f))
                : folder.folders;
            for (const subfolder of visibleSubfolders) {
                html += this.renderCollapsibleFolder(subfolder, depth + 1);
            }
        }

        html += '</div>'; // Close tree-children
        
        return html;
    }
    
    setupCollapsibleTree() {
        // Set up toggle functionality for all collapsible elements
        document.querySelectorAll('.tree-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering folder click
                
                const targetId = toggle.getAttribute('data-target');
                const targetElement = document.getElementById(targetId);
                
                if (targetElement) {
                    const isCollapsed = targetElement.style.display === 'none';
                    
                    if (isCollapsed) {
                        targetElement.style.display = 'block';
                        toggle.textContent = '▼';
                    } else {
                        targetElement.style.display = 'none';
                        toggle.textContent = '▶';
                    }
                }
            });
        });
        
        // Initially expand active collection, collapse others
        document.querySelectorAll('.tree-children').forEach(children => {
            const colIdx = children.dataset.collectionIndex;
            const isActiveCollection = colIdx !== undefined &&
                this.state.collections[parseInt(colIdx)] === this.state.currentCollection;
            // Collection-level children: expand if active, collapse if not
            if (children.id && children.id.startsWith('collection-')) {
                if (isActiveCollection) {
                    children.style.display = 'block';
                    const toggle = document.querySelector(`.tree-toggle[data-target="${children.id}"]`);
                    if (toggle) toggle.textContent = '▼';
                } else {
                    children.style.display = 'none';
                    const toggle = document.querySelector(`.tree-toggle[data-target="${children.id}"]`);
                    if (toggle) toggle.textContent = '▶';
                }
            } else {
                // Folders: collapsed by default
                children.style.display = 'none';
                const toggle = document.querySelector(`.tree-toggle[data-target="${children.id}"]`);
                if (toggle) toggle.textContent = '▶';
            }
        });
    }
    
    switchToCollectionByIndex(index) {
        const col = this.state.collections[index];
        if (col && col !== this.state.currentCollection) {
            this.state.currentCollection = col;
            this.state.currentRequest = null;
            this.state.currentFolder = null;
            this.state.updateStatusBar();
            this.updateCollectionTree();
            this.updateTabContent('request');
        }
    }

    setupTreeClickHandlers() {
        // Set up click handlers for collection headers
        document.querySelectorAll('.tree-item[data-type="collection"]').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('tree-toggle')) return;
                const colIdx = parseInt(item.dataset.collectionIndex);
                if (!isNaN(colIdx)) {
                    this.switchToCollectionByIndex(colIdx);
                }
            });
        });

        // Set up click handlers for requests (use closest() since clicks may land on child spans)
        document.querySelectorAll('.tree-item[data-type="request"]').forEach(item => {
            item.addEventListener('click', (e) => {
                const treeItem = e.target.closest('.tree-item[data-type="request"]');
                if (!treeItem) return;

                // Auto-switch collection if needed
                const colIdxAttr = treeItem.dataset.collectionIndex ||
                    (treeItem.closest('[data-collection-index]') || {}).dataset?.collectionIndex;
                if (colIdxAttr !== undefined) {
                    const colIdx = parseInt(colIdxAttr);
                    const col = this.state.collections[colIdx];
                    if (col && col !== this.state.currentCollection) {
                        this.state.currentCollection = col;
                        this.state.currentFolder = null;
                        this.state.updateStatusBar();
                    }
                }

                const requestName = treeItem.dataset.id;
                let request = this.state.currentCollection.requests.find(r => r.name === requestName);

                // Also check in folders
                if (!request) {
                    const findInFolders = (folders) => {
                        for (const folder of folders) {
                            const found = folder.requests.find(r => r.name === requestName);
                            if (found) return found;
                            const subFound = findInFolders(folder.folders || []);
                            if (subFound) return subFound;
                        }
                        return null;
                    };
                    request = findInFolders(this.state.currentCollection.folders || []);
                }

                if (request) {
                    this.state.setCurrentRequest(request);
                    this.state.setCurrentFolder(null);
                    this.updateTabContent();
                    this.switchTab('request');
                }
            });
        });

        // Set up click handlers for folders
        document.querySelectorAll('.tree-item[data-type="folder"]').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't trigger if click was on toggle
                if (e.target.classList.contains('tree-toggle')) return;

                const treeItem = e.target.closest('.tree-item[data-type="folder"]');
                if (!treeItem) return;
                const folderName = treeItem.dataset.id;
                const folder = this.findFolderByName(this.state.currentCollection.folders, folderName);

                if (folder) {
                    this.state.setCurrentFolder(folder);
                    this.state.setCurrentRequest(null);
                    this.updateTabContent();
                    this.switchTab('request');
                }
            });
        });
    }

    matchesFilters(request) {
        const f = this.state.filters;
        if (f.text && !(request.name.toLowerCase().includes(f.text) || (request.url && request.url.toLowerCase().includes(f.text)) || (request.body && request.body.toLowerCase().includes(f.text)) || (request.tests && request.tests.toLowerCase().includes(f.text)))) {
            return false;
        }
        if (f.methods.length > 0 && !f.methods.includes(request.method)) {
            return false;
        }
        if (f.hasTests && !(request.tests && request.tests.trim())) {
            return false;
        }
        if (f.hasBody && !(request.body && request.body.trim())) {
            return false;
        }
        return true;
    }

    hasFiltersActive() {
        const f = this.state.filters;
        return f.text !== '' || f.methods.length > 0 || f.hasTests || f.hasBody;
    }

    folderHasMatchingRequests(folder) {
        if (folder.requests && folder.requests.some(r => this.matchesFilters(r))) return true;
        if (folder.folders) {
            for (const sub of folder.folders) {
                if (this.folderHasMatchingRequests(sub)) return true;
            }
        }
        return false;
    }

    findFolderByName(folders, name) {
        for (const folder of folders) {
            if (folder.name === name) {
                return folder;
            }
            const found = this.findFolderByName(folder.folders, name);
            if (found) {
                return found;
            }
        }
        return null;
    }

    // Request Management
    saveRequest() {
        if (!this.state.currentRequest || !this.state.currentCollection) return;

        // 1. Capture raw user inputs
        const name = document.getElementById('requestName').value;
        const method = document.getElementById('requestMethod').value;
        const url = document.getElementById('requestUrl').value;
        const body = document.getElementById('requestBody').value;
        const description = document.getElementById('requestDescription').value;

        // 2. Capture headers
        const headers = {};
        document.querySelectorAll('#requestHeadersContainer .header-row').forEach(row => {
            const keyInput = row.querySelector('.header-key');
            const valueInput = row.querySelector('.header-value');
            if (keyInput && valueInput && keyInput.value.trim() !== '') {
                headers[keyInput.value] = valueInput.value;
            }
        });

        // 3. Update the source object with RAW data only
        this.state.currentRequest.name = name;
        this.state.currentRequest.method = method;
        this.state.currentRequest.url = url; // Save the raw path (e.g. "/users")
        this.state.currentRequest.headers = headers;
        this.state.currentRequest.body = body;
        this.state.currentRequest.description = description;

        // REMOVED: The block that merged processedRequest back into currentRequest.
        // Inheritance should only be calculated at the moment of *sending* the request, 
        // not when saving the definition.

        this.state.markAsChanged();
        
        // Update UI to reflect changes
        this.updateCollectionTree();
        
        // If the request name changed, we need to update the tree selection
        if (this.state.currentRequest.name !== name) {
            // Force re-selection of the request to update UI
            const currentRequest = this.state.currentRequest;
            this.state.setCurrentRequest(null);
            this.state.setCurrentRequest(currentRequest);
        }
        
        // Update all tabs to show the latest data
        this.updateTabContent();
        
        alert('Request saved successfully!');
    }

    deleteRequest() {
        if (!this.state.currentRequest || !this.state.currentCollection) return;

        DialogSystem.showConfirm(`Are you sure you want to delete "${this.state.currentRequest.name}"?`, (confirmDelete) => {
            if (confirmDelete) {
                this.state.currentCollection.requests = this.state.currentCollection.requests.filter(
                    r => r !== this.state.currentRequest
                );
                this.state.setCurrentRequest(null);
                this.updateCollectionTree();
                this.switchTab('request');
                this.state.markAsChanged();
            }
        });
    }

    duplicateRequest() {
        if (!this.state.currentRequest || !this.state.currentCollection) return;

        DialogSystem.showPrompt('Enter name for duplicated request:', `${this.state.currentRequest.name} Copy`, (newName) => {
            if (newName) {
                const duplicatedRequest = new Request(
                    newName,
                    this.state.currentRequest.method,
                    this.state.currentRequest.url,
                    { ...this.state.currentRequest.headers },
                    this.state.currentRequest.body,
                    this.state.currentRequest.description,
                    { prerequest: '', test: this.state.currentRequest.tests || '' }
                );

                this.state.currentCollection.addRequest(duplicatedRequest);
                this.state.setCurrentRequest(duplicatedRequest);
                this.updateCollectionTree();
                this.switchTab('request');
                this.state.markAsChanged();
            }
        });
    }

    addRequestHeader() {
        const container = document.getElementById('requestHeadersContainer');
        const emptyState = container.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const headerRow = document.createElement('div');
        headerRow.className = 'header-row';
        headerRow.innerHTML = `
            <input type="text" class="header-key" placeholder="Header Name">
            <input type="text" class="header-value" placeholder="Header Value">
            <button class="remove-header-btn">❌</button>
        `;

        container.appendChild(headerRow);

        // Set up remove button
        headerRow.querySelector('.remove-header-btn').addEventListener('click', () => {
            headerRow.remove();
            if (container.children.length === 0) {
                container.innerHTML = '<div class="empty-state" style="padding: 20px;">No headers defined</div>';
            }
            this.state.markAsChanged();
        });

        // Set up change listeners
        const inputs = headerRow.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('change', () => this.state.markAsChanged());
            input.addEventListener('input', () => this.state.markAsChanged());
        });
    }

    saveTests() {
        if (!this.state.currentRequest) return;

        const tests = document.getElementById('requestTests').value;
        this.state.currentRequest.tests = tests;
        this.state.markAsChanged();
        alert('Tests saved successfully!');
    }

    // Inheritance Management
    addGlobalHeader() {
        DialogSystem.showPrompt('Enter header name:', 'Authorization', (key) => {
            if (key) {
                DialogSystem.showPrompt('Enter header value:', '', (value) => {
                    if (value !== null) {
                        this.state.inheritanceManager.addGlobalHeader(key, value);
                        this.state.markAsChanged();
                        this.updateInheritanceTab();
                    }
                });
            }
        });
    }

    addBaseEndpoint() {
        const endpoint = document.getElementById('newBaseEndpoint').value;
        if (endpoint && endpoint.trim() !== '') {
            this.state.inheritanceManager.addBaseEndpoint(endpoint);
            document.getElementById('newBaseEndpoint').value = '';
            this.state.markAsChanged();
            this.updateInheritanceTab();
        } else {
            alert('Please enter a valid endpoint URL');
        }
    }

    addBodyTemplate() {
        DialogSystem.showPrompt('Enter template name:', 'JSON Template', (name) => {
            if (name) {
                DialogSystem.showPrompt('Enter template content:', '{\n    "key": "value"\n}', (content) => {
                    if (content !== null) {
                        this.state.inheritanceManager.addBodyTemplate(name, content);
                        this.state.markAsChanged();
                        this.updateInheritanceTab();
                    }
                });
            }
        });
    }

    addTestTemplate() {
        DialogSystem.showPrompt('Enter template name:', 'Status Test', (name) => {
            if (name) {
                DialogSystem.showPrompt('Enter template content:', 'pm.test("Status code is 200", function() {\n    pm.response.to.have.status(200);\n});', (content) => {
                    if (content !== null) {
                        this.state.inheritanceManager.addTestTemplate(name, content);
                        this.state.markAsChanged();
                        this.updateInheritanceTab();
                    }
                });
            }
        });
    }

    // Template apply methods
    applyBodyTemplateToRequest(name) {
        if (!this.state.currentRequest) {
            this.showToast('Select a request first');
            return;
        }
        const tmpl = this.state.inheritanceManager.getBodyTemplates().find(t => t.name === name);
        if (!tmpl) return;
        this.state.currentRequest.body = tmpl.content;
        this.state.markAsChanged();
        this.updateTabContent('request');
        this.showToast(`Applied body template "${name}"`);
    }

    applyTestTemplateToRequest(name) {
        if (!this.state.currentRequest) {
            this.showToast('Select a request first');
            return;
        }
        const tmpl = this.state.inheritanceManager.getTestTemplates().find(t => t.name === name);
        if (!tmpl) return;
        this.state.currentRequest.tests = tmpl.content;
        this.state.markAsChanged();
        this.updateTabContent('tests');
        this.showToast(`Applied test template "${name}"`);
    }

    getAllRequests() {
        if (!this.state.currentCollection) return [];
        const all = [...this.state.currentCollection.requests];
        const collectFromFolders = (folders) => {
            for (const f of folders) {
                all.push(...f.requests);
                if (f.folders) collectFromFolders(f.folders);
            }
        };
        collectFromFolders(this.state.currentCollection.folders || []);
        return all;
    }

    applyBodyTemplateToAll(name) {
        const tmpl = this.state.inheritanceManager.getBodyTemplates().find(t => t.name === name);
        if (!tmpl) return;
        const requests = this.getAllRequests();
        if (requests.length === 0) {
            this.showToast('No requests to apply to');
            return;
        }
        DialogSystem.showConfirm(`Apply body template "${name}" to all ${requests.length} requests?`, (confirmed) => {
            if (!confirmed) return;
            for (const req of requests) {
                req.body = tmpl.content;
            }
            this.state.markAsChanged();
            this.updateTabContent('request');
            this.showToast(`Applied to ${requests.length} requests`);
        });
    }

    applyTestTemplateToAll(name) {
        const tmpl = this.state.inheritanceManager.getTestTemplates().find(t => t.name === name);
        if (!tmpl) return;
        const requests = this.getAllRequests();
        if (requests.length === 0) {
            this.showToast('No requests to apply to');
            return;
        }
        DialogSystem.showConfirm(`Apply test template "${name}" to all ${requests.length} requests?`, (confirmed) => {
            if (!confirmed) return;
            for (const req of requests) {
                req.tests = tmpl.content;
            }
            this.state.markAsChanged();
            this.updateTabContent('tests');
            this.showToast(`Applied to ${requests.length} requests`);
        });
    }

    createRequestFromTemplate(name) {
        if (!this.state.currentCollection) {
            this.showToast('Create a collection first');
            return;
        }
        const tmpl = this.state.inheritanceManager.getBodyTemplates().find(t => t.name === name);
        if (!tmpl) return;
        DialogSystem.showPrompt('Enter request name:', `New ${name} Request`, (reqName) => {
            if (!reqName) return;
            const endpoints = this.state.inheritanceManager.getBaseEndpoints();
            const url = endpoints.length > 0 ? endpoints[0] : '/';
            const request = new Request(reqName, 'POST', url);
            request.body = tmpl.content;
            this.state.currentCollection.addRequest(request);
            this.state.setCurrentRequest(request);
            this.updateCollectionTree();
            this.switchTab('request');
            this.state.markAsChanged();
        });
    }

    addBearerTokenPreset() {
        DialogSystem.showPrompt('Enter Bearer token:', '', (token) => {
            if (token !== null && token.trim()) {
                this.state.inheritanceManager.addGlobalHeader('Authorization', `Bearer ${token}`);
                this.state.markAsChanged();
                this.updateInheritanceTab();
                this.showToast('Bearer token added as global header');
            }
        });
    }

    addApiKeyPreset() {
        DialogSystem.showPrompt('Enter header name:', 'X-API-Key', (headerName) => {
            if (!headerName) return;
            DialogSystem.showPrompt('Enter API key value:', '', (value) => {
                if (value !== null && value.trim()) {
                    this.state.inheritanceManager.addGlobalHeader(headerName, value);
                    this.state.markAsChanged();
                    this.updateInheritanceTab();
                    this.showToast('API key added as global header');
                }
            });
        });
    }

    addBasicAuthPreset() {
        DialogSystem.showPrompt('Enter username:', '', (username) => {
            if (!username) return;
            DialogSystem.showPrompt('Enter password:', '', (password) => {
                if (password !== null) {
                    const encoded = btoa(`${username}:${password}`);
                    this.state.inheritanceManager.addGlobalHeader('Authorization', `Basic ${encoded}`);
                    this.state.markAsChanged();
                    this.updateInheritanceTab();
                    this.showToast('Basic auth added as global header');
                }
            });
        });
    }

    copyHeadersFromRequest() {
        if (!this.state.currentRequest) {
            this.showToast('No request selected');
            return;
        }
        const headers = this.state.currentRequest.headers;
        if (!headers || (Array.isArray(headers) && headers.length === 0) || (typeof headers === 'object' && !Array.isArray(headers) && Object.keys(headers).length === 0)) {
            this.showToast('Current request has no headers');
            return;
        }
        let count = 0;
        if (Array.isArray(headers)) {
            for (const h of headers) {
                if (h.key && h.value !== undefined) {
                    this.state.inheritanceManager.addGlobalHeader(h.key, h.value);
                    count++;
                }
            }
        } else {
            for (const [key, value] of Object.entries(headers)) {
                this.state.inheritanceManager.addGlobalHeader(key, value);
                count++;
            }
        }
        this.state.markAsChanged();
        this.updateInheritanceTab();
        this.showToast(`Copied ${count} header(s) from current request`);
    }

    copyBodyFromRequest() {
        if (!this.state.currentRequest) {
            this.showToast('No request selected');
            return;
        }
        const body = this.state.currentRequest.body;
        if (!body || !body.trim()) {
            this.showToast('Current request has no body');
            return;
        }
        DialogSystem.showPrompt('Template name:', '', (name) => {
            if (name !== null && name.trim()) {
                this.state.inheritanceManager.addBodyTemplate(name.trim(), body);
                this.state.markAsChanged();
                this.updateInheritanceTab();
                this.showToast(`Body template "${name.trim()}" created from current request`);
            }
        });
    }

    copyTestsFromRequest() {
        if (!this.state.currentRequest) {
            this.showToast('No request selected');
            return;
        }
        const tests = this.state.currentRequest.tests;
        if (!tests || !tests.trim()) {
            this.showToast('Current request has no tests');
            return;
        }
        DialogSystem.showPrompt('Template name:', '', (name) => {
            if (name !== null && name.trim()) {
                this.state.inheritanceManager.addTestTemplate(name.trim(), tests);
                this.state.markAsChanged();
                this.updateInheritanceTab();
                this.showToast(`Test template "${name.trim()}" created from current request`);
            }
        });
    }

    resetAllInheritance() {
        DialogSystem.showConfirm('Reset all inheritance settings? This will clear all global headers, base endpoints, body templates, and test templates.', (confirmed) => {
            if (confirmed) {
                this.state.inheritanceManager.globalHeaders = [];
                this.state.inheritanceManager.baseEndpoints = [];
                this.state.inheritanceManager.bodyTemplates = [];
                this.state.inheritanceManager.testTemplates = [];
                this.state.markAsChanged();
                this.updateInheritanceTab();
                this.showToast('All inheritance settings have been reset');
            }
        });
    }

    // File Operations
    async importCollection() {
        try {
            const result = await window.electronAPI.openFile({
                filters: [{ name: 'JSON Files', extensions: ['json'] }]
            });

            if (result.success) {
                const collection = new Collection('Imported Collection');
                collection.importFromJSON(result.content);
                this.state.addCollection(collection);
                this.state.currentCollection = collection;
                this.state.currentRequest = null;
                this.state.currentFolder = null;
                this.updateCollectionTree();
                this.switchTab('request');
                alert('Collection imported successfully!');
            }
        } catch (error) {
            console.error('Import error:', error);
            alert('Error importing collection: ' + error.message);
        }
    }

    async exportCollection() {
        if (!this.state.currentCollection) {
            alert('No collection to export');
            return;
        }

        try {
            const jsonContent = JSON.stringify(this.state.currentCollection.toPostmanJSON(), null, 2);
            const result = await window.electronAPI.saveFile({
                defaultPath: `${this.state.currentCollection.name}.json`,
                filters: [{ name: 'JSON Files', extensions: ['json'] }],
                content: jsonContent
            });

            if (result.success) {
                this.state.unsavedChanges = false;
                this.state.updateStatusBar();
                alert(`Collection exported successfully to: ${result.path}`);
            }
        } catch (error) {
            console.error('Export error:', error);
            alert('Error exporting collection: ' + error.message);
        }
    }

    showSettings() {
        // Remove existing settings panel if open
        const existing = document.getElementById('settingsModal');
        if (existing) existing.remove();
        const existingPanel = document.getElementById('settingsPanel');
        if (existingPanel) existingPanel.remove();

        // Create settings overlay (keeps settingsModal id for test compatibility)
        const settingsModal = document.createElement('div');
        settingsModal.id = 'settingsModal';
        settingsModal.className = 'settings-overlay';

        // Create slide-out panel
        const panel = document.createElement('div');
        panel.id = 'settingsPanel';
        panel.className = 'settings-panel';
        panel.innerHTML = `
            <div class="settings-header">
                <h3>Settings</h3>
                <button class="settings-close-btn" id="closeSettingsBtn">&times;</button>
            </div>
            <div class="settings-body">
                <div class="settings-group">
                    <h4>General</h4>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Auto-save</div>
                            <div class="settings-item-desc">Automatically save changes</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoSave" ${this.state.autoSave ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Dark Mode</div>
                            <div class="settings-item-desc">Toggle dark/light theme</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="darkMode" ${this.state.darkMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="settings-group">
                    <h4>Editor</h4>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Auto-format JSON</div>
                            <div class="settings-item-desc">Format JSON on paste/save</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoFormat" ${this.state.autoFormat ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Show Line Numbers</div>
                            <div class="settings-item-desc">Display line numbers in editor</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="showLineNumbers" ${this.state.showLineNumbers ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="settings-group">
                    <h4>Request</h4>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Inherit Global Headers</div>
                            <div class="settings-item-desc">Apply global headers to all requests</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="inheritGlobally" ${this.state.inheritGlobally ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="settings-footer">
                <button id="saveSettingsBtn">Save Settings</button>
                <button id="cancelSettingsBtn" class="secondary">Cancel</button>
            </div>
        `;

        document.body.appendChild(settingsModal);
        document.body.appendChild(panel);

        // Live dark mode toggle preview
        document.getElementById('darkMode').addEventListener('change', (e) => {
            this.applyTheme(e.target.checked ? 'dark' : 'light');
        });

        // Trigger open animation
        requestAnimationFrame(() => {
            settingsModal.classList.add('open');
            panel.classList.add('open');
        });

        const closeSettings = () => {
            settingsModal.classList.remove('open');
            panel.classList.remove('open');
            setTimeout(() => {
                settingsModal.remove();
                panel.remove();
            }, 300);
        };

        // Close on overlay click
        settingsModal.addEventListener('click', closeSettings);

        // Close button
        document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);

        // Cancel button
        document.getElementById('cancelSettingsBtn').addEventListener('click', () => {
            // Revert theme if changed
            this.applyTheme(this.state.darkMode ? 'dark' : 'light');
            closeSettings();
        });

        // Save button
        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            this.state.autoSave = document.getElementById('autoSave').checked;
            this.state.darkMode = document.getElementById('darkMode').checked;
            this.state.autoFormat = document.getElementById('autoFormat').checked;
            this.state.showLineNumbers = document.getElementById('showLineNumbers').checked;
            this.state.inheritGlobally = document.getElementById('inheritGlobally').checked;

            this.applyTheme(this.state.darkMode ? 'dark' : 'light');
            this.showToast('Settings saved');
            closeSettings();
        });
    }

    // Theme Management
    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.state.darkMode = (theme === 'dark');
    }

    // Toast Notification
    showToast(message, duration = 2000) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        // Trigger slide-in
        requestAnimationFrame(() => {
            toast.classList.add('toast-visible');
        });

        // Remove after duration
        setTimeout(() => {
            toast.classList.remove('toast-visible');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // Drag and Drop - find request location in collection tree
    findRequestLocation(requestName) {
        if (!this.state.currentCollection) return null;

        // Check root requests
        const rootIdx = this.state.currentCollection.requests.findIndex(r => r.name === requestName);
        if (rootIdx !== -1) {
            return {
                item: this.state.currentCollection.requests[rootIdx],
                container: this.state.currentCollection.requests,
                index: rootIdx,
                type: 'request'
            };
        }

        // Recursively check folders
        const searchFolders = (folders) => {
            for (const folder of folders) {
                const idx = folder.requests.findIndex(r => r.name === requestName);
                if (idx !== -1) {
                    return {
                        item: folder.requests[idx],
                        container: folder.requests,
                        index: idx,
                        type: 'request'
                    };
                }
                if (folder.folders && folder.folders.length > 0) {
                    const found = searchFolders(folder.folders);
                    if (found) return found;
                }
            }
            return null;
        };

        return searchFolders(this.state.currentCollection.folders || []);
    }

    // Drag and Drop - find folder location in collection tree
    findFolderLocation(folderName) {
        if (!this.state.currentCollection) return null;

        // Check root folders
        const rootIdx = this.state.currentCollection.folders.findIndex(f => f.name === folderName);
        if (rootIdx !== -1) {
            return {
                item: this.state.currentCollection.folders[rootIdx],
                container: this.state.currentCollection.folders,
                index: rootIdx,
                type: 'folder'
            };
        }

        // Recursively check nested folders
        const searchFolders = (parentFolders) => {
            for (const parent of parentFolders) {
                if (!parent.folders) continue;
                const idx = parent.folders.findIndex(f => f.name === folderName);
                if (idx !== -1) {
                    return {
                        item: parent.folders[idx],
                        container: parent.folders,
                        index: idx,
                        type: 'folder'
                    };
                }
                const found = searchFolders(parent.folders);
                if (found) return found;
            }
            return null;
        };

        return searchFolders(this.state.currentCollection.folders || []);
    }

    // Check if targetFolder is a descendant of sourceFolder
    isFolderDescendant(sourceFolder, targetFolderName) {
        if (!sourceFolder.folders) return false;
        for (const sub of sourceFolder.folders) {
            if (sub.name === targetFolderName) return true;
            if (this.isFolderDescendant(sub, targetFolderName)) return true;
        }
        return false;
    }

    // Drag and Drop Setup - uses event delegation on collectionTree
    setupDragAndDrop() {
        if (!this.state.currentCollection) return;

        const tree = document.getElementById('collectionTree');
        if (!tree) return;

        // Use a flag to avoid adding duplicate delegated listeners
        if (tree._dragInitialized) return;
        tree._dragInitialized = true;

        // --- dragstart (requests and folders) ---
        tree.addEventListener('dragstart', (e) => {
            const item = e.target.closest('.tree-item[draggable="true"]');
            if (!item) return;

            const dragType = item.dataset.type; // 'request' or 'folder'
            const dragName = item.dataset.id;
            e.dataTransfer.setData('application/json', JSON.stringify({ type: dragType, name: dragName }));
            e.dataTransfer.effectAllowed = 'move';
            item.classList.add('dragging');
        });

        // --- dragend (cleanup) ---
        tree.addEventListener('dragend', (e) => {
            const item = e.target.closest('.tree-item');
            if (item) item.classList.remove('dragging');
            tree.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        });

        // --- dragover (highlight drop targets) ---
        tree.addEventListener('dragover', (e) => {
            // Find the innermost drop target under the cursor
            const dropTarget = e.target.closest('[data-drop-target]');
            if (!dropTarget) return;

            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            // Clear previous highlights, then highlight current
            tree.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            dropTarget.classList.add('drag-over');
        });

        // --- dragleave ---
        tree.addEventListener('dragleave', (e) => {
            const dropTarget = e.target.closest('[data-drop-target]');
            if (dropTarget) dropTarget.classList.remove('drag-over');
        });

        // --- drop ---
        tree.addEventListener('drop', (e) => {
            e.preventDefault();
            tree.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

            // Find the innermost drop target (folder's tree-children beats collection-root)
            const dropTarget = e.target.closest('[data-drop-target]');
            if (!dropTarget) return;

            const raw = e.dataTransfer.getData('application/json');
            if (!raw) return;

            let dragData;
            try { dragData = JSON.parse(raw); } catch (_) { return; }

            const dropType = dropTarget.dataset.dropTarget; // 'folder' or 'collection'

            if (dragData.type === 'request') {
                this.handleRequestDrop(dragData.name, dropTarget, dropType);
            } else if (dragData.type === 'folder') {
                this.handleFolderDrop(dragData.name, dropTarget, dropType);
            }
        });
    }

    handleRequestDrop(requestName, dropTarget, dropType) {
        const source = this.findRequestLocation(requestName);
        if (!source) return;

        let targetContainer;
        if (dropType === 'collection') {
            targetContainer = this.state.currentCollection.requests;
        } else if (dropType === 'folder') {
            const folderName = dropTarget.dataset.id;
            const folder = this.findFolderByName(this.state.currentCollection.folders, folderName);
            if (folder) targetContainer = folder.requests;
        }

        if (!targetContainer || targetContainer === source.container) return;

        source.container.splice(source.index, 1);
        targetContainer.push(source.item);

        this.state.markAsChanged();
        this.updateCollectionTree();
        this.showToast(`Moved "${requestName}"`);
    }

    handleFolderDrop(folderName, dropTarget, dropType) {
        const source = this.findFolderLocation(folderName);
        if (!source) return;

        let targetContainer;
        if (dropType === 'collection') {
            // Move folder to root level
            targetContainer = this.state.currentCollection.folders;
        } else if (dropType === 'folder') {
            const targetFolderName = dropTarget.dataset.id;
            // Don't drop folder into itself
            if (targetFolderName === folderName) return;
            // Don't drop folder into its own descendant
            if (this.isFolderDescendant(source.item, targetFolderName)) return;

            const targetFolder = this.findFolderByName(this.state.currentCollection.folders, targetFolderName);
            if (targetFolder) {
                if (!targetFolder.folders) targetFolder.folders = [];
                targetContainer = targetFolder.folders;
            }
        }

        if (!targetContainer || targetContainer === source.container) return;

        source.container.splice(source.index, 1);
        targetContainer.push(source.item);

        this.state.markAsChanged();
        this.updateCollectionTree();
        this.showToast(`Moved folder "${folderName}"`);
    }

    // ===== Feature 1: Context Menus =====

    setupContextMenus() {
        const tree = document.getElementById('collectionTree');
        if (!tree) return;

        tree.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.hideContextMenu();

            const treeItem = e.target.closest('.tree-item');
            if (!treeItem) return;

            const type = treeItem.dataset.type;
            const id = treeItem.dataset.id;
            let items = [];

            if (type === 'request') {
                const request = this.findRequestByName(id);
                if (!request) return;
                items = [
                    { label: 'Rename', action: () => this.renameRequest(request) },
                    { label: 'Duplicate', action: () => this.duplicateRequestDirect(request) },
                    { label: 'Move to Folder', action: () => this.moveRequestToFolder(request) },
                    { divider: true },
                    { label: 'Delete', danger: true, action: () => this.deleteRequestDirect(request) }
                ];
            } else if (type === 'folder') {
                const folder = this.findFolderByName(this.state.currentCollection.folders, id);
                if (!folder) return;
                items = [
                    { label: 'Rename', action: () => this.renameFolder(folder) },
                    { label: 'Add Request', action: () => this.addRequestToFolder(folder) },
                    { label: 'Add Subfolder', action: () => this.addSubfolder(folder) },
                    { divider: true },
                    { label: 'Delete Folder', danger: true, action: () => this.deleteFolder(folder) }
                ];
            } else if (type === 'collection') {
                const colIdx = parseInt(treeItem.dataset.collectionIndex);
                const collection = this.state.collections[colIdx];
                if (!collection) return;
                // Switch to this collection for context actions
                if (collection !== this.state.currentCollection) {
                    this.state.currentCollection = collection;
                    this.state.currentRequest = null;
                    this.state.currentFolder = null;
                    this.state.updateStatusBar();
                }
                items = [
                    { label: 'Rename', action: () => this.renameCollection() },
                    { label: 'Add Request', action: () => this.createNewRequest() },
                    { label: 'Add Folder', action: () => this.createNewFolder() },
                    { divider: true },
                    { label: 'Delete Collection', danger: true, action: () => this.deleteCollection(collection) }
                ];
            }

            if (items.length > 0) {
                this.showContextMenu(e.clientX, e.clientY, items);
            }
        });
    }

    showContextMenu(x, y, items) {
        this.hideContextMenu();
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.id = 'contextMenu';

        items.forEach(item => {
            if (item.divider) {
                const div = document.createElement('div');
                div.className = 'context-menu-divider';
                menu.appendChild(div);
                return;
            }
            const el = document.createElement('div');
            el.className = 'context-menu-item' + (item.danger ? ' danger' : '');
            el.textContent = item.label;
            el.addEventListener('click', () => {
                this.hideContextMenu();
                item.action();
            });
            menu.appendChild(el);
        });

        document.body.appendChild(menu);

        // Reposition if menu overflows viewport
        const rect = menu.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
        if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        // Close on click outside or Escape
        const closeHandler = () => {
            this.hideContextMenu();
            document.removeEventListener('click', closeHandler);
            document.removeEventListener('keydown', escHandler);
        };
        const escHandler = (e) => {
            if (e.key === 'Escape') closeHandler();
        };
        setTimeout(() => {
            document.addEventListener('click', closeHandler);
            document.addEventListener('keydown', escHandler);
        }, 0);
    }

    hideContextMenu() {
        const existing = document.getElementById('contextMenu');
        if (existing) existing.remove();
    }

    findRequestByName(name) {
        if (!this.state.currentCollection) return null;
        const fromRoot = this.state.currentCollection.requests.find(r => r.name === name);
        if (fromRoot) return fromRoot;
        const searchFolders = (folders) => {
            for (const folder of folders) {
                const found = folder.requests.find(r => r.name === name);
                if (found) return found;
                if (folder.folders) {
                    const sub = searchFolders(folder.folders);
                    if (sub) return sub;
                }
            }
            return null;
        };
        return searchFolders(this.state.currentCollection.folders || []);
    }

    renameRequest(request) {
        DialogSystem.showPrompt('Rename request:', request.name, (newName) => {
            if (newName && newName !== request.name) {
                request.name = newName;
                this.state.markAsChanged();
                this.updateCollectionTree();
                if (this.state.currentRequest === request) {
                    this.updateTabContent('request');
                }
            }
        });
    }

    renameFolder(folder) {
        DialogSystem.showPrompt('Rename folder:', folder.name, (newName) => {
            if (newName && newName !== folder.name) {
                folder.name = newName;
                this.state.markAsChanged();
                this.updateCollectionTree();
            }
        });
    }

    renameCollection() {
        if (!this.state.currentCollection) return;
        DialogSystem.showPrompt('Rename collection:', this.state.currentCollection.name, (newName) => {
            if (newName && newName !== this.state.currentCollection.name) {
                this.state.currentCollection.name = newName;
                this.state.markAsChanged();
                this.updateCollectionTree();
                this.state.updateStatusBar();
            }
        });
    }

    deleteCollection(collection) {
        DialogSystem.showConfirm(`Delete collection "${collection.name}" and all its contents?`, (confirmed) => {
            if (!confirmed) return;
            this.state.removeCollection(collection);
            this.state.markAsChanged();
            this.updateCollectionTree();
            this.state.updateStatusBar();
            this.updateTabContent('request');
        });
    }

    deleteRequestDirect(request) {
        DialogSystem.showConfirm(`Delete "${request.name}"?`, (confirmed) => {
            if (!confirmed) return;
            // Remove from root
            const rootIdx = this.state.currentCollection.requests.indexOf(request);
            if (rootIdx !== -1) {
                this.state.currentCollection.requests.splice(rootIdx, 1);
            } else {
                // Remove from folders
                const removeFromFolders = (folders) => {
                    for (const f of folders) {
                        const idx = f.requests.indexOf(request);
                        if (idx !== -1) { f.requests.splice(idx, 1); return true; }
                        if (f.folders && removeFromFolders(f.folders)) return true;
                    }
                    return false;
                };
                removeFromFolders(this.state.currentCollection.folders || []);
            }
            if (this.state.currentRequest === request) {
                this.state.setCurrentRequest(null);
                this.switchTab('request');
            }
            this.state.markAsChanged();
            this.updateCollectionTree();
        });
    }

    duplicateRequestDirect(request) {
        DialogSystem.showPrompt('Name for duplicate:', `${request.name} Copy`, (newName) => {
            if (newName) {
                const dup = new Request(
                    newName, request.method, request.url,
                    { ...request.headers }, request.body,
                    request.description,
                    { prerequest: '', test: request.tests || '' }
                );
                // Add to same container as original
                const loc = this.findRequestLocation(request.name);
                if (loc) {
                    loc.container.push(dup);
                } else {
                    this.state.currentCollection.addRequest(dup);
                }
                this.state.markAsChanged();
                this.updateCollectionTree();
            }
        });
    }

    moveRequestToFolder(request) {
        if (!this.state.currentCollection) return;
        // Collect all folder names
        const folderNames = ['(Root)'];
        const collectFolders = (folders, prefix) => {
            for (const f of folders) {
                folderNames.push(prefix + f.name);
                if (f.folders) collectFolders(f.folders, prefix + f.name + '/');
            }
        };
        collectFolders(this.state.currentCollection.folders || [], '');

        DialogSystem.showPrompt('Move to folder (type name, or "(Root)" for root):', '(Root)', (target) => {
            if (target === null) return;
            // Remove from current location
            const loc = this.findRequestLocation(request.name);
            if (!loc) return;
            loc.container.splice(loc.index, 1);

            if (target === '(Root)' || target === '') {
                this.state.currentCollection.requests.push(request);
            } else {
                // Resolve nested paths like "Auth/Login"
                const parts = target.split('/');
                const folderName = parts[parts.length - 1];
                const folder = this.findFolderByName(this.state.currentCollection.folders, folderName);
                if (folder) {
                    folder.requests.push(request);
                } else {
                    // Folder not found, put back at root
                    this.state.currentCollection.requests.push(request);
                    this.showToast('Folder not found, moved to root');
                }
            }
            this.state.markAsChanged();
            this.updateCollectionTree();
            this.showToast(`Moved "${request.name}"`);
        });
    }

    addRequestToFolder(folder) {
        DialogSystem.showPrompt('Enter request name:', 'New Request', (name) => {
            if (name) {
                const request = new Request(name, 'GET', '/');
                folder.requests.push(request);
                this.state.setCurrentRequest(request);
                this.state.markAsChanged();
                this.updateCollectionTree();
                this.switchTab('request');
            }
        });
    }

    addSubfolder(parentFolder) {
        DialogSystem.showPrompt('Enter subfolder name:', 'New Subfolder', (name) => {
            if (name) {
                if (!parentFolder.folders) parentFolder.folders = [];
                parentFolder.folders.push(new Folder(name));
                this.state.markAsChanged();
                this.updateCollectionTree();
            }
        });
    }

    deleteFolder(folder) {
        DialogSystem.showConfirm(`Delete folder "${folder.name}" and all its contents?`, (confirmed) => {
            if (!confirmed) return;
            // Remove from parent
            const removeFolderFrom = (folders) => {
                const idx = folders.indexOf(folder);
                if (idx !== -1) { folders.splice(idx, 1); return true; }
                for (const f of folders) {
                    if (f.folders && removeFolderFrom(f.folders)) return true;
                }
                return false;
            };
            removeFolderFrom(this.state.currentCollection.folders);
            if (this.state.currentFolder === folder) {
                this.state.setCurrentFolder(null);
            }
            this.state.markAsChanged();
            this.updateCollectionTree();
        });
    }

    // ===== Feature 2: Environment Variables =====

    substituteVariables(text) {
        if (!text || !this.state.activeEnvironment) return text;
        const env = this.state.environments.find(e => e.name === this.state.activeEnvironment);
        if (!env) return text;
        return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
            return env.variables[varName] !== undefined ? env.variables[varName] : match;
        });
    }

    getActiveEnvironmentVariables() {
        if (!this.state.activeEnvironment) return {};
        const env = this.state.environments.find(e => e.name === this.state.activeEnvironment);
        return env ? env.variables : {};
    }

    updateEnvironmentSelector() {
        const selector = document.getElementById('envSelector');
        if (!selector) return;
        const current = this.state.activeEnvironment;
        selector.innerHTML = '<option value="">No Environment</option>';
        this.state.environments.forEach(env => {
            const opt = document.createElement('option');
            opt.value = env.name;
            opt.textContent = env.name;
            if (env.name === current) opt.selected = true;
            selector.appendChild(opt);
        });
    }

    updateUrlPreview() {
        const previewEl = document.getElementById('urlPreview');
        const urlInput = document.getElementById('requestUrl');
        if (!previewEl || !urlInput) return;
        const raw = urlInput.value;
        if (!raw || !this.state.activeEnvironment || !raw.includes('{{')) {
            previewEl.textContent = '';
            previewEl.style.display = 'none';
            return;
        }
        const resolved = this.substituteVariables(raw);
        if (resolved !== raw) {
            previewEl.textContent = resolved;
            previewEl.style.display = 'block';
        } else {
            previewEl.textContent = '';
            previewEl.style.display = 'none';
        }
    }

    showEnvironmentManager() {
        // Remove existing
        const existingOverlay = document.getElementById('envManagerOverlay');
        if (existingOverlay) existingOverlay.remove();
        const existingPanel = document.getElementById('envManagerPanel');
        if (existingPanel) existingPanel.remove();

        const overlay = document.createElement('div');
        overlay.id = 'envManagerOverlay';
        overlay.className = 'settings-overlay';

        const panel = document.createElement('div');
        panel.id = 'envManagerPanel';
        panel.className = 'env-manager-panel';

        let editingEnvName = this.state.environments.length > 0 ? this.state.environments[0].name : null;

        const render = () => {
            panel.innerHTML = `
                <div class="settings-header">
                    <h3>Environments</h3>
                    <button class="settings-close-btn" id="closeEnvMgrBtn">&times;</button>
                </div>
                <div class="env-list">
                    ${this.state.environments.map(env => `
                        <div class="env-list-item ${env.name === editingEnvName ? 'active' : ''}" data-env="${env.name}">
                            <span>${env.name}</span>
                            <button class="env-var-remove" data-delete-env="${env.name}">&times;</button>
                        </div>
                    `).join('')}
                    <button id="addEnvBtn" style="margin-top:8px; font-size:12px; padding:6px 12px;">+ Add Environment</button>
                    <button id="importEnvBtn" style="margin-top:4px; font-size:12px; padding:6px 12px;">Import from Postman</button>
                </div>
                <div style="padding:16px; flex:1; overflow-y:auto;">
                    ${editingEnvName ? this.renderEnvEditor(editingEnvName) : '<div class="empty-state" style="padding:20px;">Select or create an environment</div>'}
                </div>
                <div class="settings-footer">
                    <button id="saveEnvBtn">Save</button>
                    <button id="cancelEnvBtn" class="secondary">Close</button>
                </div>
            `;

            // Event listeners
            panel.querySelector('#closeEnvMgrBtn').addEventListener('click', close);
            panel.querySelector('#cancelEnvBtn').addEventListener('click', close);

            panel.querySelectorAll('.env-list-item').forEach(el => {
                el.addEventListener('click', (e) => {
                    if (e.target.dataset.deleteEnv) return;
                    editingEnvName = el.dataset.env;
                    render();
                });
            });

            panel.querySelectorAll('[data-delete-env]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const name = btn.dataset.deleteEnv;
                    this.state.environments = this.state.environments.filter(env => env.name !== name);
                    if (this.state.activeEnvironment === name) this.state.activeEnvironment = null;
                    if (editingEnvName === name) editingEnvName = this.state.environments.length > 0 ? this.state.environments[0].name : null;
                    this.updateEnvironmentSelector();
                    render();
                });
            });

            const addBtn = panel.querySelector('#addEnvBtn');
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    DialogSystem.showPrompt('Environment name:', 'New Environment', (name) => {
                        if (name && !this.state.environments.find(e => e.name === name)) {
                            this.state.environments.push({ name, variables: {} });
                            editingEnvName = name;
                            this.updateEnvironmentSelector();
                            render();
                        }
                    });
                });
            }

            const importEnvBtn = panel.querySelector('#importEnvBtn');
            if (importEnvBtn) {
                importEnvBtn.addEventListener('click', async () => {
                    const importedName = await this.importEnvironment();
                    if (importedName) {
                        editingEnvName = importedName;
                        render();
                    }
                });
            }

            const saveBtn = panel.querySelector('#saveEnvBtn');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    if (editingEnvName) {
                        const env = this.state.environments.find(e => e.name === editingEnvName);
                        if (env) {
                            const newVars = {};
                            panel.querySelectorAll('.env-var-row').forEach(row => {
                                const key = row.querySelector('.env-key')?.value?.trim();
                                const val = row.querySelector('.env-val')?.value || '';
                                if (key) newVars[key] = val;
                            });
                            env.variables = newVars;
                        }
                    }
                    this.updateEnvironmentSelector();
                    this.updateUrlPreview();
                    this.triggerAutoSave();
                    this.showToast('Environments saved');
                });
            }

            // Add variable button
            const addVarBtn = panel.querySelector('#addEnvVarBtn');
            if (addVarBtn) {
                addVarBtn.addEventListener('click', () => {
                    const container = panel.querySelector('#envVarsContainer');
                    if (!container) return;
                    const row = document.createElement('div');
                    row.className = 'env-var-row';
                    row.innerHTML = `
                        <input type="text" class="env-key" placeholder="Variable name">
                        <input type="text" class="env-val" placeholder="Value">
                        <button class="env-var-remove">&times;</button>
                    `;
                    row.querySelector('.env-var-remove').addEventListener('click', () => row.remove());
                    container.appendChild(row);
                });
            }

            // Remove var buttons
            panel.querySelectorAll('.env-var-row .env-var-remove').forEach(btn => {
                btn.addEventListener('click', () => btn.closest('.env-var-row').remove());
            });
        };

        const close = () => {
            overlay.classList.remove('open');
            panel.classList.remove('open');
            setTimeout(() => { overlay.remove(); panel.remove(); }, 300);
        };

        document.body.appendChild(overlay);
        document.body.appendChild(panel);

        requestAnimationFrame(() => {
            overlay.classList.add('open');
            panel.classList.add('open');
        });

        overlay.addEventListener('click', close);
        render();
    }

    renderEnvEditor(envName) {
        const env = this.state.environments.find(e => e.name === envName);
        if (!env) return '';
        const vars = Object.entries(env.variables);
        return `
            <h4 style="margin-bottom:12px; color:var(--text-primary);">${envName} Variables</h4>
            <div id="envVarsContainer">
                ${vars.map(([key, val]) => `
                    <div class="env-var-row">
                        <input type="text" class="env-key" value="${key}" placeholder="Variable name">
                        <input type="text" class="env-val" value="${val}" placeholder="Value">
                        <button class="env-var-remove">&times;</button>
                    </div>
                `).join('')}
            </div>
            <button id="addEnvVarBtn" class="add-header-btn" style="margin-top:8px;">+ Add Variable</button>
        `;
    }

    async importEnvironment() {
        try {
            const result = await window.electronAPI.openFile({
                filters: [{ name: 'JSON Files', extensions: ['json'] }]
            });
            if (!result || !result.success) return null;

            const data = JSON.parse(result.content);

            // Validate: must have values array
            if (!data.values || !Array.isArray(data.values)) {
                this.showToast('Invalid environment file: missing values array');
                return null;
            }

            const name = data.name || 'Imported Environment';

            // Check for duplicate name, append suffix if needed
            let finalName = name;
            let counter = 1;
            while (this.state.environments.find(e => e.name === finalName)) {
                finalName = `${name} (${counter++})`;
            }

            // Convert Postman format: [{key, value, enabled}] → {key: value}
            const variables = {};
            for (const v of data.values) {
                if (v.key && v.enabled !== false) {
                    variables[v.key] = v.value || '';
                }
            }

            this.state.environments.push({ name: finalName, variables });
            this.updateEnvironmentSelector();
            this.triggerAutoSave();
            this.showToast(`Environment "${finalName}" imported (${Object.keys(variables).length} variables)`);
            return finalName;
        } catch (err) {
            console.error('Environment import error:', err);
            this.showToast('Failed to import environment file');
            return null;
        }
    }

    // ===== Feature 3: Request Execution =====

    async sendRequest() {
        if (!this.state.currentRequest && !this.state.currentCollection) {
            this.showToast('No request selected');
            return;
        }

        const form = this.getRequestFromForm();
        if (!form.url || form.url.trim() === '' || form.url.trim() === '/') {
            this.showToast('Please enter a valid URL');
            return;
        }

        // Substitute environment variables
        let url = this.substituteVariables(form.url);
        const body = this.substituteVariables(form.body);
        const headers = {};
        for (const [k, v] of Object.entries(form.headers)) {
            headers[this.substituteVariables(k)] = this.substituteVariables(v);
        }

        // Apply inheritance: add global headers
        if (this.state.inheritGlobally) {
            const globalHeaders = this.state.inheritanceManager.getGlobalHeaders();
            if (Array.isArray(globalHeaders)) {
                globalHeaders.forEach(h => {
                    if (h.key && !headers[h.key]) headers[h.key] = h.value;
                });
            }
            // Prepend base endpoint if url is relative
            if (url.startsWith('/')) {
                const endpoints = this.state.inheritanceManager.getBaseEndpoints();
                if (endpoints.length > 0) {
                    url = endpoints[0].replace(/\/+$/, '') + url;
                }
            }
        }

        // Ensure URL has protocol
        if (url && !url.match(/^https?:\/\//i)) {
            url = 'https://' + url;
        }

        const sendBtn = document.getElementById('sendRequestBtn');
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<span class="spinner"></span>Sending...';
        }

        try {
            const result = await window.electronAPI.sendRequest({
                method: form.method,
                url: url,
                headers: headers,
                body: body
            });
            this.displayResponse(result);
        } catch (error) {
            this.displayResponse({ success: false, error: error.message || 'Request failed' });
        } finally {
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send';
            }
        }
    }

    getRequestFromForm() {
        return {
            method: document.getElementById('requestMethod')?.value || 'GET',
            url: document.getElementById('requestUrl')?.value || '',
            headers: this.getHeadersFromForm(),
            body: document.getElementById('requestBody')?.value || ''
        };
    }

    getHeadersFromForm() {
        const headers = {};
        document.querySelectorAll('#requestHeadersContainer .header-row').forEach(row => {
            const key = row.querySelector('.header-key')?.value?.trim();
            const val = row.querySelector('.header-value')?.value || '';
            if (key) headers[key] = val;
        });
        return headers;
    }

    displayResponse(response) {
        let existingPanel = document.getElementById('responsePanel');
        if (existingPanel) existingPanel.remove();

        const requestTab = document.getElementById('requestTab');
        if (!requestTab) return;

        const panel = document.createElement('div');
        panel.id = 'responsePanel';
        panel.className = 'response-panel';

        if (!response.success) {
            panel.innerHTML = `
                <div class="response-header">
                    <span class="response-status status-err">Error</span>
                    <span class="response-time">${response.error || 'Unknown error'}</span>
                </div>
            `;
            requestTab.appendChild(panel);
            return;
        }

        const statusClass = response.status < 300 ? 'status-2xx' :
                            response.status < 400 ? 'status-3xx' :
                            response.status < 500 ? 'status-4xx' : 'status-5xx';

        // Try to pretty-print JSON
        let bodyDisplay = response.body || '';
        let isJson = false;
        try {
            const parsed = JSON.parse(bodyDisplay);
            bodyDisplay = JSON.stringify(parsed, null, 2);
            isJson = true;
        } catch (_) {}

        const sizeStr = response.body ? this.formatBytes(new Blob([response.body]).size) : '0 B';

        // Build response headers HTML
        let headersHtml = '';
        if (response.headers && typeof response.headers === 'object') {
            for (const [k, v] of Object.entries(response.headers)) {
                headersHtml += `<div class="header-entry"><span class="header-key">${this.escapeHtml(k)}</span><span class="header-val">${this.escapeHtml(String(v))}</span></div>`;
            }
        }

        panel.innerHTML = `
            <div class="response-header">
                <span class="response-status ${statusClass}">${response.status} ${response.statusText || ''}</span>
                <span class="response-time">${response.time}ms</span>
                <span class="response-size">${sizeStr}</span>
            </div>
            <div class="response-tabs">
                <div class="response-tab active" data-rtab="body">Body</div>
                <div class="response-tab" data-rtab="headers">Headers</div>
            </div>
            <div id="responseBodyPane" class="response-body"><pre>${this.escapeHtml(bodyDisplay)}</pre></div>
            <div id="responseHeadersPane" class="response-headers-list" style="display:none;">${headersHtml}</div>
        `;

        requestTab.appendChild(panel);

        // Tab switching
        panel.querySelectorAll('.response-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                panel.querySelectorAll('.response-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.rtab;
                document.getElementById('responseBodyPane').style.display = target === 'body' ? 'block' : 'none';
                document.getElementById('responseHeadersPane').style.display = target === 'headers' ? 'block' : 'none';
            });
        });
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    // ===== Feature 4: Auto-save & Persistence =====

    triggerAutoSave() {
        if (!this.state.autoSave) return;
        if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
        this._autoSaveTimer = setTimeout(() => this.performAutoSave(), 2000);
    }

    async performAutoSave() {
        if (!window.electronAPI || !window.electronAPI.autoSave) return;
        try {
            const data = {
                version: 2,
                timestamp: new Date().toISOString(),
                collections: this.state.collections.map(c => c.toPostmanJSON()),
                activeCollectionIndex: this.state.collections.indexOf(this.state.currentCollection),
                currentRequestName: this.state.currentRequest ? this.state.currentRequest.name : null,
                currentFolderName: this.state.currentFolder ? this.state.currentFolder.name : null,
                environments: this.state.environments,
                activeEnvironment: this.state.activeEnvironment,
                inheritance: this.state.inheritanceManager.toJSON ? this.state.inheritanceManager.toJSON() : null,
                settings: {
                    darkMode: this.state.darkMode,
                    autoSave: this.state.autoSave,
                    autoFormat: this.state.autoFormat,
                    showLineNumbers: this.state.showLineNumbers,
                    inheritGlobally: this.state.inheritGlobally,
                    sidebarWidth: parseInt(getComputedStyle(document.querySelector('.sidebar')).width, 10) || 280
                }
            };
            await window.electronAPI.autoSave(data);
        } catch (error) {
            console.error('Auto-save failed:', error);
        }
    }

    async loadAutoSave() {
        if (!window.electronAPI || !window.electronAPI.autoLoad) return;
        try {
            const result = await window.electronAPI.autoLoad();
            if (!result || !result.success || !result.data) return;

            DialogSystem.showConfirm('Restore previous session?', (restore) => {
                if (restore) {
                    this.restoreFromAutoSave(result.data);
                } else {
                    window.electronAPI.clearAutosave().catch(() => {});
                }
            });
        } catch (error) {
            console.error('Auto-load failed:', error);
        }
    }

    restoreFromAutoSave(data) {
        try {
            // Restore settings first
            if (data.settings) {
                this.state.autoSave = data.settings.autoSave !== undefined ? data.settings.autoSave : false;
                this.state.darkMode = data.settings.darkMode !== undefined ? data.settings.darkMode : false;
                this.state.autoFormat = data.settings.autoFormat !== undefined ? data.settings.autoFormat : true;
                this.state.showLineNumbers = data.settings.showLineNumbers !== undefined ? data.settings.showLineNumbers : true;
                this.state.inheritGlobally = data.settings.inheritGlobally !== undefined ? data.settings.inheritGlobally : true;
                this.applyTheme(this.state.darkMode ? 'dark' : 'light');
                if (data.settings.sidebarWidth) {
                    document.documentElement.style.setProperty('--sidebar-width', data.settings.sidebarWidth + 'px');
                }
            }

            // Restore environments
            if (data.environments && Array.isArray(data.environments)) {
                this.state.environments = data.environments;
                this.state.activeEnvironment = data.activeEnvironment || null;
                this.updateEnvironmentSelector();
            }

            // Restore inheritance
            if (data.inheritance && InheritanceManager.fromJSON) {
                this.state.inheritanceManager = InheritanceManager.fromJSON(data.inheritance);
            }

            // Restore collections (v2 format: array; v1 fallback: single collection)
            if (data.version >= 2 && data.collections && Array.isArray(data.collections)) {
                this.state.collections = [];
                for (const colData of data.collections) {
                    const col = new Collection('Restored');
                    col.importFromJSON(colData);
                    this.state.collections.push(col);
                }
                const activeIdx = data.activeCollectionIndex >= 0 && data.activeCollectionIndex < this.state.collections.length
                    ? data.activeCollectionIndex : 0;
                this.state.currentCollection = this.state.collections[activeIdx] || null;
            } else if (data.collection) {
                // v1 fallback: single collection
                const collection = new Collection('Restored');
                collection.importFromJSON(data.collection);
                this.state.collections = [collection];
                this.state.currentCollection = collection;
            }

            if (this.state.currentCollection) {
                this.updateCollectionTree();

                // Restore current request selection
                if (data.currentRequestName) {
                    const req = this.findRequestByName(data.currentRequestName);
                    if (req) {
                        this.state.setCurrentRequest(req);
                        this.switchTab('request');
                    }
                }
                if (data.currentFolderName) {
                    const folder = this.findFolderByName(this.state.currentCollection.folders, data.currentFolderName);
                    if (folder) this.state.setCurrentFolder(folder);
                }
            }

            this.state.unsavedChanges = false;
            this.state.updateStatusBar();
            this.showToast('Session restored');
        } catch (error) {
            console.error('Restore failed:', error);
            this.showToast('Failed to restore session');
        }
    }

    // Sample Data
    loadSampleData() {
         // Create a sample collection for demonstration
        const sampleCollection = {
            name: 'Sample API Collection',
            description: 'A sample collection demonstrating Postman Helper features',
            requests: [],
            folders: [],
            addRequest: function(req) { this.requests.push(req); },
            addFolder: function(folder) { this.folders.push(folder); }
        };

        // Set up inheritance
        this.state.inheritanceManager.setGlobalHeaders({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        });
        this.state.inheritanceManager.addBaseEndpoint('https://api.example.com/v1');

        // Create sample requests
         const request1 = new Request(
             'Get Users',
             'GET',
             '/users',
             {},
             null,
             'Get all users',
             { prerequest: '', test: 'pm.test("Status code is 200", function() {\n    pm.response.to.have.status(200);\n});' }
         );

         const request2 = new Request(
             'Create User',
             'POST',
             '/users',
             {},
             '{\n    "name": "John Doe",\n    "email": "john@example.com"\n}',
             'Create a new user',
             { prerequest: '', test: 'pm.test("User created successfully", function() {\n    pm.expect(pm.response.code).to.be.oneOf([200, 201]);\n});' }
         );

        // Apply inheritance to requests
        const processedRequest1 = this.state.inheritanceManager.processRequest(request1);
        const processedRequest2 = this.state.inheritanceManager.processRequest(request2);

        sampleCollection.addRequest(processedRequest1);
        sampleCollection.addRequest(processedRequest2);

        // Create a folder with requests
        const authFolder = new Folder('Authentication');
         const loginRequest = new Request(
             'Login',
             'POST',
             '/auth/login',
             {},
             '{\n    "username": "admin",\n    "password": "password"\n}',
             'User login',
             { prerequest: '', test: '' }
         );
        const processedLoginRequest = this.state.inheritanceManager.processRequest(loginRequest);
        authFolder.addRequest(processedLoginRequest);
        sampleCollection.addFolder(authFolder);

        this.state.setCurrentCollection(sampleCollection);
        this.updateCollectionTree();
    }
}

// Add CSS for collapsible tree view
const style = document.createElement('style');
style.textContent = `
    /* Tree View Styles */
    .tree-item {
        padding: 4px 10px;
        cursor: pointer;
        border-radius: var(--radius-sm, 6px);
        transition: background-color 0.2s;
        font-size: 12px;
        line-height: 1.4;
        display: flex;
        align-items: center;
    }

    .tree-item:hover {
        background-color: var(--bg-tertiary, #f5f5f5);
    }

    .tree-item.active {
        background-color: var(--accent-subtle, rgba(255,108,55,0.12));
        color: var(--accent, #FF6C37);
        font-weight: 500;
    }

    .tree-toggle {
        margin-right: 4px;
        color: var(--text-muted, #666);
        font-size: 10px;
        width: 14px;
        display: inline-block;
        text-align: center;
        cursor: pointer;
        flex-shrink: 0;
    }

    .tree-label {
        vertical-align: middle;
    }

    .tree-children {
        margin-left: 12px;
        border-left: 1px dashed var(--border, #ccc);
        padding-left: 6px;
    }

    .tree-section {
        font-size: 10px;
        color: var(--text-muted, #666);
        margin: 6px 0 3px 10px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }

    .tree-item .request-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* Folder specific styles */
    .tree-item.folder {
        font-weight: 500;
        font-size: 12px;
    }

    .tree-item.folder:hover {
        background-color: var(--bg-tertiary, #e8f5e9);
    }
`;
document.head.appendChild(style);

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Postman Helper application starting...');
    window.__app = new PostmanHelperApp();
});
