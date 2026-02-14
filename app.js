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
        this._history = [];
        this._maxHistoryDepth = 20;
    }

    takeSnapshot() {
        const snapshot = {
            timestamp: new Date().toISOString(),
            name: this.name,
            method: this.method,
            url: this.url,
            headers: JSON.parse(JSON.stringify(this.headers || {})),
            body: this.body || '',
            tests: this.tests || '',
            description: this.description || ''
        };
        // Don't store duplicate if nothing changed since last snapshot
        if (this._history.length > 0) {
            const last = this._history[0];
            if (last.method === snapshot.method
                && last.url === snapshot.url
                && JSON.stringify(last.headers) === JSON.stringify(snapshot.headers)
                && last.body === snapshot.body
                && last.tests === snapshot.tests
                && last.description === snapshot.description) {
                return;
            }
        }
        this._history.unshift(snapshot);
        if (this._history.length > this._maxHistoryDepth) {
            this._history.pop();
        }
    }

    getHistory() {
        return this._history;
    }

    restoreVersion(index) {
        const snapshot = this._history[index];
        if (!snapshot) return false;
        this.takeSnapshot(); // Save current state before restoring
        this.method = snapshot.method;
        this.url = snapshot.url;
        this.headers = JSON.parse(JSON.stringify(snapshot.headers));
        this.body = snapshot.body;
        this.tests = snapshot.tests;
        this.description = snapshot.description;
        return true;
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
            this.globalHeaders = this.globalHeaders.filter(h => h.key !== key);
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

// Custom Dialog System - Replacement for prompt(), confirm(), and alert()
class DialogSystem {
    // Apply ARIA attributes for accessibility
    static _applyAriaAttrs(overlay, dialogBox, titleElement) {
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        if (titleElement) {
            const titleId = 'dialog-title-' + Date.now();
            titleElement.id = titleId;
            overlay.setAttribute('aria-labelledby', titleId);
        }
    }

    // Animated close: add closing class, then remove after animation
    static _closeOverlay(overlay, keyHandler) {
        if (keyHandler) document.removeEventListener('keydown', keyHandler);
        overlay.classList.add('closing');
        setTimeout(() => overlay.remove(), 120);
    }

    // Focus trap: Tab cycles within the dialog container
    static trapFocus(container) {
        const focusable = container.querySelectorAll('input, select, button, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        container.addEventListener('keydown', (e) => {
            if (e.key !== 'Tab') return;
            if (e.shiftKey) {
                if (document.activeElement === first) { e.preventDefault(); last.focus(); }
            } else {
                if (document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        });
    }

    static showPrompt(title, defaultValue = '', callback) {
        // Promise support: if no callback, return a Promise
        if (!callback) {
            return new Promise(resolve => DialogSystem.showPrompt(title, defaultValue, resolve));
        }

        const trigger = document.activeElement;
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

        const cleanup = () => {
            DialogSystem._closeOverlay(overlay, keyHandler);
            if (trigger && trigger.focus) try { trigger.focus(); } catch (_) {}
        };

        okButton.addEventListener('click', () => { cleanup(); callback(input.value); });
        cancelButton.addEventListener('click', () => { cleanup(); callback(null); });

        const keyHandler = (e) => {
            if (e.key === 'Enter') { cleanup(); callback(input.value); }
            else if (e.key === 'Escape') { cleanup(); callback(null); }
        };
        document.addEventListener('keydown', keyHandler);

        buttonContainer.appendChild(okButton);
        buttonContainer.appendChild(cancelButton);

        dialogBox.appendChild(titleElement);
        dialogBox.appendChild(input);
        dialogBox.appendChild(buttonContainer);
        overlay.appendChild(dialogBox);
        DialogSystem._applyAriaAttrs(overlay, dialogBox, titleElement);
        document.body.appendChild(overlay);

        DialogSystem.trapFocus(dialogBox);
        input.focus();
        input.select();
    }

    static showConfirm(message, callback) {
        if (!callback) {
            return new Promise(resolve => DialogSystem.showConfirm(message, resolve));
        }

        const trigger = document.activeElement;
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

        const cleanup = () => {
            DialogSystem._closeOverlay(overlay, keyHandler);
            if (trigger && trigger.focus) try { trigger.focus(); } catch (_) {}
        };

        okButton.addEventListener('click', () => { cleanup(); callback(true); });
        cancelButton.addEventListener('click', () => { cleanup(); callback(false); });

        const keyHandler = (e) => {
            if (e.key === 'Enter') { cleanup(); callback(true); }
            else if (e.key === 'Escape') { cleanup(); callback(false); }
        };
        document.addEventListener('keydown', keyHandler);

        buttonContainer.appendChild(okButton);
        buttonContainer.appendChild(cancelButton);

        dialogBox.appendChild(messageElement);
        dialogBox.appendChild(buttonContainer);
        overlay.appendChild(dialogBox);
        DialogSystem._applyAriaAttrs(overlay, dialogBox, messageElement);
        document.body.appendChild(overlay);

        DialogSystem.trapFocus(dialogBox);
        okButton.focus();
    }

    static showDangerConfirm(message, confirmText, callback) {
        if (!callback) {
            return new Promise(resolve => DialogSystem.showDangerConfirm(message, confirmText, resolve));
        }

        const trigger = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';

        const dialogBox = document.createElement('div');
        dialogBox.className = 'dialog-box';

        const msgEl = document.createElement('p');
        msgEl.textContent = message;
        msgEl.style.margin = '20px 0';
        msgEl.style.fontSize = '16px';

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'dialog-buttons';

        const dangerBtn = document.createElement('button');
        dangerBtn.textContent = confirmText || 'Delete';
        dangerBtn.className = 'dialog-btn danger';

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'dialog-btn secondary';

        const cleanup = () => {
            DialogSystem._closeOverlay(overlay, keyHandler);
            if (trigger && trigger.focus) try { trigger.focus(); } catch (_) {}
        };

        dangerBtn.addEventListener('click', () => { cleanup(); callback(true); });
        cancelButton.addEventListener('click', () => { cleanup(); callback(false); });

        const keyHandler = (e) => {
            if (e.key === 'Escape') { cleanup(); callback(false); }
        };
        document.addEventListener('keydown', keyHandler);

        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(dangerBtn);

        dialogBox.appendChild(msgEl);
        dialogBox.appendChild(buttonContainer);
        overlay.appendChild(dialogBox);
        DialogSystem._applyAriaAttrs(overlay, dialogBox, msgEl);
        document.body.appendChild(overlay);

        DialogSystem.trapFocus(dialogBox);
        cancelButton.focus(); // Focus cancel by default for safety
    }

    static showAlert(message, callback) {
        if (!callback) {
            return new Promise(resolve => DialogSystem.showAlert(message, resolve));
        }

        const trigger = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';

        const dialogBox = document.createElement('div');
        dialogBox.className = 'dialog-box';

        const msgEl = document.createElement('p');
        msgEl.textContent = message;
        msgEl.style.margin = '20px 0';
        msgEl.style.fontSize = '16px';

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'dialog-buttons';

        const okButton = document.createElement('button');
        okButton.textContent = 'OK';
        okButton.className = 'dialog-btn primary';

        const cleanup = () => {
            DialogSystem._closeOverlay(overlay, keyHandler);
            if (trigger && trigger.focus) try { trigger.focus(); } catch (_) {}
        };

        okButton.addEventListener('click', () => { cleanup(); callback(); });

        const keyHandler = (e) => {
            if (e.key === 'Enter' || e.key === 'Escape') { cleanup(); callback(); }
        };
        document.addEventListener('keydown', keyHandler);

        buttonContainer.appendChild(okButton);
        dialogBox.appendChild(msgEl);
        dialogBox.appendChild(buttonContainer);
        overlay.appendChild(dialogBox);
        DialogSystem._applyAriaAttrs(overlay, dialogBox, msgEl);
        document.body.appendChild(overlay);

        DialogSystem.trapFocus(dialogBox);
        okButton.focus();
    }

    static showSelect(title, options, callback) {
        if (!callback) {
            return new Promise(resolve => DialogSystem.showSelect(title, options, resolve));
        }

        const trigger = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';

        const dialogBox = document.createElement('div');
        dialogBox.className = 'dialog-box';

        const titleEl = document.createElement('h3');
        titleEl.textContent = title;

        const select = document.createElement('select');
        select.className = 'dialog-select';
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            if (opt.selected) option.selected = true;
            select.appendChild(option);
        });

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'dialog-buttons';

        const okButton = document.createElement('button');
        okButton.textContent = 'OK';
        okButton.className = 'dialog-btn primary';

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'dialog-btn secondary';

        const cleanup = () => {
            DialogSystem._closeOverlay(overlay, keyHandler);
            if (trigger && trigger.focus) try { trigger.focus(); } catch (_) {}
        };

        okButton.addEventListener('click', () => { cleanup(); callback(select.value); });
        cancelButton.addEventListener('click', () => { cleanup(); callback(null); });

        const keyHandler = (e) => {
            if (e.key === 'Enter') { cleanup(); callback(select.value); }
            if (e.key === 'Escape') { cleanup(); callback(null); }
        };
        document.addEventListener('keydown', keyHandler);

        buttonContainer.appendChild(okButton);
        buttonContainer.appendChild(cancelButton);
        dialogBox.appendChild(titleEl);
        dialogBox.appendChild(select);
        dialogBox.appendChild(buttonContainer);
        overlay.appendChild(dialogBox);
        DialogSystem._applyAriaAttrs(overlay, dialogBox, titleEl);
        document.body.appendChild(overlay);

        DialogSystem.trapFocus(dialogBox);
        select.focus();
    }

    static showMultiSelect(title, options, callback) {
        if (!callback) {
            return new Promise(resolve => DialogSystem.showMultiSelect(title, options, resolve));
        }

        const trigger = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';

        const dialogBox = document.createElement('div');
        dialogBox.className = 'dialog-box';

        const titleEl = document.createElement('h3');
        titleEl.textContent = title;

        const listContainer = document.createElement('div');
        listContainer.className = 'dialog-multi-list';

        options.forEach((opt, i) => {
            const item = document.createElement('label');
            item.className = 'dialog-multi-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = opt.value;
            checkbox.checked = !!opt.checked;
            checkbox.dataset.index = i;
            const labelText = document.createElement('span');
            labelText.textContent = opt.label;
            item.appendChild(checkbox);
            item.appendChild(labelText);
            listContainer.appendChild(item);
        });

        // Select All / Deselect All controls
        const selectActions = document.createElement('div');
        selectActions.className = 'dialog-select-actions';
        const selectAllBtn = document.createElement('button');
        selectAllBtn.textContent = 'Select All';
        selectAllBtn.type = 'button';
        const deselectAllBtn = document.createElement('button');
        deselectAllBtn.textContent = 'Deselect All';
        deselectAllBtn.type = 'button';

        selectAllBtn.addEventListener('click', () => {
            listContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; });
        });
        deselectAllBtn.addEventListener('click', () => {
            listContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
        });
        selectActions.appendChild(selectAllBtn);
        selectActions.appendChild(deselectAllBtn);

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'dialog-buttons';

        const okButton = document.createElement('button');
        okButton.textContent = 'OK';
        okButton.className = 'dialog-btn primary';

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'dialog-btn secondary';

        const getSelected = () => Array.from(listContainer.querySelectorAll('input:checked')).map(cb => cb.value);

        const cleanup = () => {
            DialogSystem._closeOverlay(overlay, keyHandler);
            if (trigger && trigger.focus) try { trigger.focus(); } catch (_) {}
        };

        okButton.addEventListener('click', () => { cleanup(); callback(getSelected()); });
        cancelButton.addEventListener('click', () => { cleanup(); callback(null); });

        const keyHandler = (e) => {
            if (e.key === 'Enter') { cleanup(); callback(getSelected()); }
            if (e.key === 'Escape') { cleanup(); callback(null); }
        };
        document.addEventListener('keydown', keyHandler);

        buttonContainer.appendChild(okButton);
        buttonContainer.appendChild(cancelButton);
        dialogBox.appendChild(titleEl);
        dialogBox.appendChild(listContainer);
        dialogBox.appendChild(selectActions);
        dialogBox.appendChild(buttonContainer);
        overlay.appendChild(dialogBox);
        DialogSystem._applyAriaAttrs(overlay, dialogBox, titleEl);
        document.body.appendChild(overlay);

        DialogSystem.trapFocus(dialogBox);
    }
}

// Documentation Generator - generates Markdown and HTML docs from collections
class DocGenerator {
    static generateMarkdown(collection) {
        let md = '';
        md += `# ${collection.name}\n\n`;
        if (collection.description) {
            md += `${collection.description}\n\n`;
        }
        md += `> Generated on ${new Date().toLocaleDateString()}\n\n`;
        md += `---\n\n`;
        md += `## Table of Contents\n\n`;
        md += DocGenerator.generateTOC(collection);
        md += `\n---\n\n`;

        // Root requests
        if (collection.requests && collection.requests.length > 0) {
            md += `## Requests\n\n`;
            collection.requests.forEach(req => {
                md += DocGenerator.requestToMarkdown(req);
            });
        }

        // Folders (recursive)
        if (collection.folders && collection.folders.length > 0) {
            collection.folders.forEach(folder => {
                md += DocGenerator.folderToMarkdown(folder, 2);
            });
        }

        return md;
    }

    static generateTOC(collection) {
        let toc = '';
        let counter = 1;

        if (collection.requests) {
            collection.requests.forEach(req => {
                toc += `${counter}. **${req.name}** — \`${req.method || 'GET'} ${req.url || ''}\`\n`;
                counter++;
            });
        }

        if (collection.folders) {
            collection.folders.forEach(folder => {
                toc += `${counter}. **${folder.name}/**\n`;
                counter++;
                toc += DocGenerator.folderTOC(folder, '   ');
            });
        }

        return toc;
    }

    static folderTOC(folder, indent) {
        let toc = '';
        let sub = 1;

        if (folder.requests) {
            folder.requests.forEach(req => {
                toc += `${indent}${sub}. **${req.name}** — \`${req.method || 'GET'} ${req.url || ''}\`\n`;
                sub++;
            });
        }

        if (folder.folders) {
            folder.folders.forEach(subfolder => {
                toc += `${indent}${sub}. **${subfolder.name}/**\n`;
                sub++;
                toc += DocGenerator.folderTOC(subfolder, indent + '   ');
            });
        }

        return toc;
    }

    static requestToMarkdown(req) {
        let md = '';
        const method = req.method || 'GET';
        const url = req.url || '';

        md += `### ${method} ${req.name}\n\n`;
        md += `**Method:** \`${method}\`\n`;
        md += `**URL:** \`${url}\`\n\n`;

        if (req.description) {
            md += `${req.description}\n\n`;
        }

        // Headers
        const headers = DocGenerator.normalizeHeaders(req.headers);
        if (headers.length > 0) {
            md += `#### Headers\n\n`;
            md += `| Key | Value |\n`;
            md += `|-----|-------|\n`;
            headers.forEach(h => {
                md += `| ${h.key} | ${h.value} |\n`;
            });
            md += `\n`;
        }

        // Body
        if (req.body && req.body.trim()) {
            md += `#### Body\n\n`;
            md += '```json\n';
            md += `${req.body}\n`;
            md += '```\n\n';
        }

        // Tests
        const tests = req.tests || (req.events && req.events.test) || '';
        if (tests && tests.trim()) {
            md += `#### Tests\n\n`;
            md += '```javascript\n';
            md += `${tests}\n`;
            md += '```\n\n';
        }

        md += `---\n\n`;
        return md;
    }

    static folderToMarkdown(folder, depth) {
        let md = '';
        const heading = '#'.repeat(Math.min(depth, 6));

        md += `${heading} ${folder.name}\n\n`;

        if (folder.requests) {
            folder.requests.forEach(req => {
                md += DocGenerator.requestToMarkdown(req);
            });
        }

        if (folder.folders) {
            folder.folders.forEach(subfolder => {
                md += DocGenerator.folderToMarkdown(subfolder, depth + 1);
            });
        }

        return md;
    }

    static normalizeHeaders(headers) {
        if (!headers) return [];
        if (Array.isArray(headers)) {
            return headers.filter(h => h.key).map(h => ({ key: h.key, value: h.value || '' }));
        }
        if (typeof headers === 'object') {
            return Object.entries(headers).map(([key, value]) => ({ key, value: String(value) }));
        }
        return [];
    }

    static generateHTML(collection) {
        const bodyContent = DocGenerator.renderHTMLBody(collection);
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${DocGenerator.htmlEscape(collection.name)} - API Documentation</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 40px 20px; color: #333; line-height: 1.6; }
h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }
h2 { border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-top: 40px; }
h3 { margin-top: 30px; }
table { border-collapse: collapse; width: 100%; margin: 10px 0 20px; }
th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
th { background: #f4f4f4; font-weight: 600; }
code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
pre { background: #f4f4f4; padding: 16px; border-radius: 6px; overflow-x: auto; font-size: 0.9em; }
pre code { background: none; padding: 0; }
blockquote { border-left: 4px solid #ddd; margin: 16px 0; padding: 8px 16px; color: #666; }
hr { border: none; border-top: 1px solid #ddd; margin: 30px 0; }
.method-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; color: white; font-weight: bold; font-size: 12px; margin-right: 6px; }
.method-get { background: #61affe; }
.method-post { background: #49cc90; }
.method-put { background: #fca130; }
.method-delete { background: #f93e3e; }
.method-patch { background: #50e3c2; }
.method-head { background: #9012fe; }
.method-options { background: #0d5aa7; }
.toc { background: #fafafa; padding: 20px; border-radius: 8px; border: 1px solid #eee; }
.toc ol { padding-left: 20px; }
.toc li { margin: 4px 0; }
.toc a { text-decoration: none; color: #0366d6; }
.toc a:hover { text-decoration: underline; }
.endpoint { background: #f8f9fa; padding: 12px 16px; border-radius: 6px; border: 1px solid #eee; margin: 10px 0; }
</style>
</head>
<body>
${bodyContent}
</body>
</html>`;
    }

    static renderHTMLBody(collection) {
        let html = '';
        html += `<h1>${DocGenerator.htmlEscape(collection.name)}</h1>\n`;
        if (collection.description) {
            html += `<p>${DocGenerator.htmlEscape(collection.description)}</p>\n`;
        }
        html += `<blockquote>Generated on ${new Date().toLocaleDateString()}</blockquote>\n`;
        html += `<hr>\n`;

        // TOC
        html += `<div class="toc">\n<h2>Table of Contents</h2>\n<ol>\n`;
        html += DocGenerator.generateHTMLTOC(collection);
        html += `</ol>\n</div>\n<hr>\n`;

        // Root requests
        if (collection.requests && collection.requests.length > 0) {
            html += `<h2>Requests</h2>\n`;
            collection.requests.forEach(req => {
                html += DocGenerator.requestToHTML(req);
            });
        }

        // Folders
        if (collection.folders && collection.folders.length > 0) {
            collection.folders.forEach(folder => {
                html += DocGenerator.folderToHTML(folder, 2);
            });
        }

        return html;
    }

    static generateHTMLTOC(collection) {
        let html = '';
        if (collection.requests) {
            collection.requests.forEach(req => {
                const anchor = DocGenerator.slugify(req.name);
                html += `<li><a href="#${anchor}">${DocGenerator.htmlEscape(req.name)}</a> — <code>${req.method || 'GET'} ${DocGenerator.htmlEscape(req.url || '')}</code></li>\n`;
            });
        }
        if (collection.folders) {
            collection.folders.forEach(folder => {
                html += `<li><strong>${DocGenerator.htmlEscape(folder.name)}/</strong>\n<ol>\n`;
                html += DocGenerator.folderHTMLTOC(folder);
                html += `</ol>\n</li>\n`;
            });
        }
        return html;
    }

    static folderHTMLTOC(folder) {
        let html = '';
        if (folder.requests) {
            folder.requests.forEach(req => {
                const anchor = DocGenerator.slugify(req.name);
                html += `<li><a href="#${anchor}">${DocGenerator.htmlEscape(req.name)}</a> — <code>${req.method || 'GET'} ${DocGenerator.htmlEscape(req.url || '')}</code></li>\n`;
            });
        }
        if (folder.folders) {
            folder.folders.forEach(subfolder => {
                html += `<li><strong>${DocGenerator.htmlEscape(subfolder.name)}/</strong>\n<ol>\n`;
                html += DocGenerator.folderHTMLTOC(subfolder);
                html += `</ol>\n</li>\n`;
            });
        }
        return html;
    }

    static requestToHTML(req) {
        const method = req.method || 'GET';
        const methodClass = `method-${method.toLowerCase()}`;
        const anchor = DocGenerator.slugify(req.name);
        let html = '';

        html += `<h3 id="${anchor}"><span class="method-badge ${methodClass}">${method}</span> ${DocGenerator.htmlEscape(req.name)}</h3>\n`;
        html += `<div class="endpoint"><strong>URL:</strong> <code>${DocGenerator.htmlEscape(req.url || '')}</code></div>\n`;

        if (req.description) {
            html += `<p>${DocGenerator.htmlEscape(req.description)}</p>\n`;
        }

        // Headers
        const headers = DocGenerator.normalizeHeaders(req.headers);
        if (headers.length > 0) {
            html += `<h4>Headers</h4>\n<table><tr><th>Key</th><th>Value</th></tr>\n`;
            headers.forEach(h => {
                html += `<tr><td>${DocGenerator.htmlEscape(h.key)}</td><td>${DocGenerator.htmlEscape(h.value)}</td></tr>\n`;
            });
            html += `</table>\n`;
        }

        // Body
        if (req.body && req.body.trim()) {
            html += `<h4>Body</h4>\n<pre><code>${DocGenerator.htmlEscape(req.body)}</code></pre>\n`;
        }

        // Tests
        const tests = req.tests || (req.events && req.events.test) || '';
        if (tests && tests.trim()) {
            html += `<h4>Tests</h4>\n<pre><code>${DocGenerator.htmlEscape(tests)}</code></pre>\n`;
        }

        html += `<hr>\n`;
        return html;
    }

    static folderToHTML(folder, depth) {
        const tag = `h${Math.min(depth, 6)}`;
        let html = `<${tag}>${DocGenerator.htmlEscape(folder.name)}</${tag}>\n`;

        if (folder.requests) {
            folder.requests.forEach(req => {
                html += DocGenerator.requestToHTML(req);
            });
        }
        if (folder.folders) {
            folder.folders.forEach(subfolder => {
                html += DocGenerator.folderToHTML(subfolder, depth + 1);
            });
        }
        return html;
    }

    static htmlEscape(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    static slugify(str) {
        return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }
}

// DiffUtil — simple line-by-line diff utility for version history
class DiffUtil {
    /**
     * Compare two text strings line by line.
     * Returns array of { type: 'same'|'added'|'removed', line: string }
     */
    static diffLines(oldText, newText) {
        const oldLines = (oldText || '').split('\n');
        const newLines = (newText || '').split('\n');
        const result = [];
        const maxLen = Math.max(oldLines.length, newLines.length);
        for (let i = 0; i < maxLen; i++) {
            const oldLine = i < oldLines.length ? oldLines[i] : undefined;
            const newLine = i < newLines.length ? newLines[i] : undefined;
            if (oldLine === newLine) {
                result.push({ type: 'same', line: oldLine });
            } else if (oldLine === undefined) {
                result.push({ type: 'added', line: newLine });
            } else if (newLine === undefined) {
                result.push({ type: 'removed', line: oldLine });
            } else {
                result.push({ type: 'removed', line: oldLine });
                result.push({ type: 'added', line: newLine });
            }
        }
        return result;
    }

    /**
     * Compare two request snapshots field by field.
     * Returns { url, method, headers, body, tests, description } each with old/new/changed.
     */
    static diffRequest(snapshotA, snapshotB) {
        return {
            method: {
                old: snapshotA.method || 'GET',
                new: snapshotB.method || 'GET',
                changed: (snapshotA.method || 'GET') !== (snapshotB.method || 'GET')
            },
            url: {
                old: snapshotA.url || '',
                new: snapshotB.url || '',
                changed: (snapshotA.url || '') !== (snapshotB.url || '')
            },
            headers: {
                old: JSON.stringify(snapshotA.headers || {}, null, 2),
                new: JSON.stringify(snapshotB.headers || {}, null, 2),
                changed: JSON.stringify(snapshotA.headers || {}) !== JSON.stringify(snapshotB.headers || {})
            },
            body: {
                diff: DiffUtil.diffLines(snapshotA.body || '', snapshotB.body || ''),
                changed: (snapshotA.body || '') !== (snapshotB.body || '')
            },
            tests: {
                diff: DiffUtil.diffLines(snapshotA.tests || '', snapshotB.tests || ''),
                changed: (snapshotA.tests || '') !== (snapshotB.tests || '')
            },
            description: {
                old: snapshotA.description || '',
                new: snapshotB.description || '',
                changed: (snapshotA.description || '') !== (snapshotB.description || '')
            }
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign(module.exports || {}, { DiffUtil });
}

// FormatParser — multi-format import/export for Swagger, OpenAPI, HAR, cURL
class FormatParser {
    /**
     * Detect the format of a file's content.
     * @param {string} content - Raw file content
     * @returns {'openapi-3'|'swagger-2'|'har'|'curl'|'postman-v2.1'|'insomnia'|'simple'|'unknown'}
     */
    static detectFormat(content) {
        if (!content || typeof content !== 'string') return 'unknown';
        const trimmed = content.trim();

        // cURL detection (starts with "curl " — plain text, not JSON)
        if (trimmed.startsWith('curl ') || trimmed.startsWith('curl.exe ')) {
            return 'curl';
        }

        // Try to parse as JSON
        let obj;
        try {
            obj = JSON.parse(trimmed);
        } catch {
            // Not valid JSON — check for YAML indicators
            if (trimmed.match(/^(openapi|swagger)\s*:/m)) {
                return trimmed.match(/^openapi\s*:\s*['"]?3/m) ? 'openapi-3' : 'swagger-2';
            }
            // Could be multi-line cURL
            if (trimmed.match(/^curl\s/m)) return 'curl';
            return 'unknown';
        }

        // JSON-based format detection
        if (obj.openapi && String(obj.openapi).startsWith('3')) return 'openapi-3';
        if (obj.swagger && String(obj.swagger).startsWith('2')) return 'swagger-2';
        if (obj.log && obj.log.entries) return 'har';
        if (obj.info && obj.info.schema && obj.info.schema.includes('getpostman.com')) return 'postman-v2.1';
        if (obj.info) return 'postman-v2.1'; // Postman without explicit schema
        if (obj._type === 'export' && obj.resources) return 'insomnia';
        if (obj.requests || obj.name) return 'simple';

        return 'unknown';
    }

    /**
     * Parse OpenAPI 3.x JSON into a simple collection format.
     * @param {object} spec - Parsed OpenAPI 3.x object
     * @returns {{ name: string, description: string, requests: Array, folders: Array }}
     */
    static parseOpenAPI3(spec) {
        const info = spec.info || {};
        const name = info.title || 'OpenAPI Import';
        const description = info.description || '';
        const servers = spec.servers || [];
        const baseUrl = servers.length > 0 ? servers[0].url : '';
        const folders = [];
        const rootRequests = [];

        // Group by tags; untagged go to root
        const tagMap = new Map();

        for (const [path, pathItem] of Object.entries(spec.paths || {})) {
            const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
            for (const method of methods) {
                const operation = pathItem[method];
                if (!operation) continue;

                const reqName = operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`;
                const reqDescription = operation.description || '';
                const headers = {};

                // Extract header parameters
                const params = (operation.parameters || []).concat(pathItem.parameters || []);
                for (const param of params) {
                    if (param.in === 'header') {
                        headers[param.name] = param.example || param.schema?.default || '';
                    }
                }

                // Extract request body
                let body = '';
                if (operation.requestBody) {
                    const content = operation.requestBody.content || {};
                    const jsonContent = content['application/json'];
                    if (jsonContent && jsonContent.example) {
                        body = typeof jsonContent.example === 'string'
                            ? jsonContent.example
                            : JSON.stringify(jsonContent.example, null, 2);
                    } else if (jsonContent && jsonContent.schema && jsonContent.schema.example) {
                        body = JSON.stringify(jsonContent.schema.example, null, 2);
                    }
                    if (jsonContent && !headers['Content-Type']) {
                        headers['Content-Type'] = 'application/json';
                    }
                }

                const request = {
                    name: reqName,
                    method: method.toUpperCase(),
                    url: baseUrl + path,
                    headers: headers,
                    body: body,
                    description: reqDescription
                };

                const tags = operation.tags || [];
                if (tags.length > 0) {
                    const tag = tags[0];
                    if (!tagMap.has(tag)) tagMap.set(tag, []);
                    tagMap.get(tag).push(request);
                } else {
                    rootRequests.push(request);
                }
            }
        }

        // Convert tag groups to folders
        for (const [tagName, requests] of tagMap) {
            const tagDef = (spec.tags || []).find(t => t.name === tagName);
            folders.push({
                name: tagName,
                description: tagDef ? tagDef.description : '',
                requests: requests,
                folders: []
            });
        }

        return { name, description, requests: rootRequests, folders };
    }

    /**
     * Parse Swagger 2.0 JSON into a simple collection format.
     * @param {object} spec - Parsed Swagger 2.0 object
     * @returns {{ name: string, description: string, requests: Array, folders: Array }}
     */
    static parseSwagger2(spec) {
        const info = spec.info || {};
        const name = info.title || 'Swagger Import';
        const description = info.description || '';
        const scheme = (spec.schemes || ['https'])[0];
        const host = spec.host || 'localhost';
        const basePath = spec.basePath || '';
        const baseUrl = `${scheme}://${host}${basePath}`;
        const folders = [];
        const rootRequests = [];
        const tagMap = new Map();

        for (const [path, pathItem] of Object.entries(spec.paths || {})) {
            const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
            for (const method of methods) {
                const operation = pathItem[method];
                if (!operation) continue;

                const reqName = operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`;
                const headers = {};
                let body = '';

                // Extract parameters
                const params = (operation.parameters || []).concat(pathItem.parameters || []);
                for (const param of params) {
                    if (param.in === 'header') {
                        headers[param.name] = param.default || '';
                    } else if (param.in === 'body' && param.schema) {
                        if (param.schema.example) {
                            body = JSON.stringify(param.schema.example, null, 2);
                        }
                    }
                }

                // Content-Type from consumes
                const consumes = operation.consumes || spec.consumes || [];
                if (consumes.includes('application/json') && !headers['Content-Type']) {
                    headers['Content-Type'] = 'application/json';
                }

                const request = {
                    name: reqName,
                    method: method.toUpperCase(),
                    url: baseUrl + path,
                    headers: headers,
                    body: body,
                    description: operation.description || ''
                };

                const tags = operation.tags || [];
                if (tags.length > 0) {
                    const tag = tags[0];
                    if (!tagMap.has(tag)) tagMap.set(tag, []);
                    tagMap.get(tag).push(request);
                } else {
                    rootRequests.push(request);
                }
            }
        }

        for (const [tagName, requests] of tagMap) {
            folders.push({ name: tagName, requests, folders: [] });
        }

        return { name, description, requests: rootRequests, folders };
    }

    /**
     * Parse HAR 1.2 JSON into a simple collection format.
     * @param {object} har - Parsed HAR object
     * @returns {{ name: string, description: string, requests: Array, folders: Array }}
     */
    static parseHAR(har) {
        const log = har.log || {};
        const entries = log.entries || [];
        const name = `HAR Import (${entries.length} requests)`;
        const requests = [];

        for (const entry of entries) {
            const req = entry.request || {};
            const headers = {};
            for (const h of (req.headers || [])) {
                // Skip pseudo-headers and cookie headers
                if (h.name.startsWith(':') || h.name.toLowerCase() === 'cookie') continue;
                headers[h.name] = h.value;
            }

            let body = '';
            if (req.postData) {
                body = req.postData.text || '';
            }

            // Parse URL to get a readable name
            let urlName;
            try {
                const parsed = new URL(req.url);
                urlName = `${req.method} ${parsed.pathname}`;
            } catch {
                urlName = `${req.method || 'GET'} ${req.url || '/'}`;
            }

            requests.push({
                name: urlName,
                method: req.method || 'GET',
                url: req.url || '',
                headers: headers,
                body: body,
                description: ''
            });
        }

        return { name, description: 'Imported from HAR file', requests, folders: [] };
    }

    /**
     * Parse a cURL command string into a single request.
     * Supports: -X METHOD, -H "Header: Value", -d 'body', --data, --data-raw, --data-binary, URL
     * @param {string} curlStr - cURL command string
     * @returns {{ name: string, description: string, requests: Array, folders: Array }}
     */
    static parseCurl(curlStr) {
        if (!curlStr || typeof curlStr !== 'string') {
            return { name: 'cURL Import', description: '', requests: [], folders: [] };
        }

        // Normalize: join backslash-continued lines, trim
        const normalized = curlStr.replace(/\\\s*\n/g, ' ').trim();

        let method = 'GET';
        let url = '';
        const headers = {};
        let body = '';

        // Tokenize respecting quoted strings
        const tokens = FormatParser._tokenize(normalized);

        let i = 0;
        while (i < tokens.length) {
            const token = tokens[i];
            if (token === 'curl' || token === 'curl.exe') {
                i++;
                continue;
            }
            if (token === '-X' || token === '--request') {
                i++;
                if (i < tokens.length) method = tokens[i].toUpperCase();
            } else if (token === '-H' || token === '--header') {
                i++;
                if (i < tokens.length) {
                    const colonIdx = tokens[i].indexOf(':');
                    if (colonIdx > 0) {
                        const key = tokens[i].substring(0, colonIdx).trim();
                        const value = tokens[i].substring(colonIdx + 1).trim();
                        headers[key] = value;
                    }
                }
            } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary') {
                i++;
                if (i < tokens.length) {
                    body = tokens[i];
                    if (method === 'GET') method = 'POST'; // cURL defaults to POST with data
                }
            } else if (token === '--compressed' || token === '-s' || token === '--silent'
                || token === '-k' || token === '--insecure' || token === '-v' || token === '--verbose'
                || token === '-L' || token === '--location' || token === '-i' || token === '--include') {
                // Skip known flags without arguments
            } else if (token === '-u' || token === '--user') {
                i++; // Skip basic auth value
            } else if (token === '-o' || token === '--output' || token === '-A' || token === '--user-agent') {
                i++; // Skip flags with arguments
            } else if (!token.startsWith('-')) {
                // Assume it's the URL
                url = token;
            }
            i++;
        }

        let reqName;
        try {
            const parsed = new URL(url);
            reqName = `${method} ${parsed.pathname}`;
        } catch {
            reqName = `${method} ${url || '/'}`;
        }

        const requests = [{
            name: reqName,
            method,
            url,
            headers,
            body,
            description: 'Imported from cURL'
        }];

        return { name: 'cURL Import', description: '', requests, folders: [] };
    }

    /**
     * Tokenize a shell command respecting single and double quotes.
     * @param {string} str - Shell command string
     * @returns {string[]} Tokens
     */
    static _tokenize(str) {
        const tokens = [];
        let current = '';
        let inSingle = false;
        let inDouble = false;
        let escaped = false;

        for (let i = 0; i < str.length; i++) {
            const ch = str[i];
            if (escaped) {
                current += ch;
                escaped = false;
                continue;
            }
            if (ch === '\\' && !inSingle) {
                escaped = true;
                continue;
            }
            if (ch === "'" && !inDouble) {
                inSingle = !inSingle;
                continue;
            }
            if (ch === '"' && !inSingle) {
                inDouble = !inDouble;
                continue;
            }
            if ((ch === ' ' || ch === '\t') && !inSingle && !inDouble) {
                if (current.length > 0) {
                    tokens.push(current);
                    current = '';
                }
                continue;
            }
            current += ch;
        }
        if (current.length > 0) tokens.push(current);
        return tokens;
    }

    /**
     * Export a single request as a cURL command string.
     * @param {object} request - Request object with method, url, headers, body
     * @param {string} [baseUrl] - Optional base URL to prepend
     * @returns {string} cURL command
     */
    static toCurl(request, baseUrl) {
        const method = (request.method || 'GET').toUpperCase();
        const url = (baseUrl || '') + (request.url || '');
        const esc = (s) => String(s).replace(/'/g, "'\\''");
        let cmd = `curl -X ${method}`;

        // Headers
        const headers = request.headers || {};
        if (typeof headers === 'object' && !Array.isArray(headers)) {
            for (const [key, value] of Object.entries(headers)) {
                cmd += ` \\\n  -H '${esc(key)}: ${esc(value)}'`;
            }
        } else if (Array.isArray(headers)) {
            for (const h of headers) {
                if (h.key) cmd += ` \\\n  -H '${esc(h.key)}: ${esc(h.value || '')}'`;
            }
        }

        // Body
        const body = request.body || '';
        if (body) {
            cmd += ` \\\n  -d '${esc(body)}'`;
        }

        cmd += ` \\\n  '${esc(url)}'`;
        return cmd;
    }

    /**
     * Convert a parsed collection format to the internal simple format
     * and import it into an existing Collection object.
     * @param {Collection} collection - Target collection
     * @param {{ name, description, requests, folders }} parsed - Parsed data
     */
    static importParsedInto(collection, parsed) {
        collection.name = parsed.name || collection.name;
        collection.description = parsed.description || '';

        for (const reqData of (parsed.requests || [])) {
            const req = new Request(
                reqData.name,
                reqData.method,
                reqData.url,
                reqData.headers || {},
                reqData.body || '',
                reqData.description || ''
            );
            if (reqData.tests) req.tests = reqData.tests;
            collection.addRequest(req);
        }

        for (const folderData of (parsed.folders || [])) {
            const folder = new Folder(folderData.name);
            for (const reqData of (folderData.requests || [])) {
                const req = new Request(
                    reqData.name,
                    reqData.method,
                    reqData.url,
                    reqData.headers || {},
                    reqData.body || '',
                    reqData.description || ''
                );
                if (reqData.tests) req.tests = reqData.tests;
                folder.addRequest(req);
            }
            collection.addFolder(folder);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign(module.exports || {}, { FormatParser });
}

// AnalyticsCollector — local-first usage analytics
class AnalyticsCollector {
    constructor() {
        this.events = [];
        this.sessionStart = new Date().toISOString();
        this.stats = {
            requestsSent: 0,
            requestsCreated: 0,
            requestsDeleted: 0,
            collectionsCreated: 0,
            collectionsImported: 0,
            collectionsExported: 0,
            searchesPerformed: 0,
            totalSessionTime: 0,
            methodBreakdown: {},
            statusCodeBreakdown: {},
            responseTimes: [],
            dailyActivity: {},
            mostUsedEndpoints: {}
        };
    }

    track(eventName, data = {}) {
        const event = {
            event: eventName,
            timestamp: new Date().toISOString(),
            data: data
        };
        this.events.push(event);
        this._updateStats(eventName, data);

        // Keep event log bounded (last 1000 events)
        if (this.events.length > 1000) {
            this.events = this.events.slice(-1000);
        }
    }

    _updateStats(eventName, data) {
        const today = new Date().toISOString().split('T')[0];
        if (!this.stats.dailyActivity[today]) {
            this.stats.dailyActivity[today] = { requests: 0, created: 0, errors: 0 };
        }

        switch (eventName) {
            case 'request_sent':
                this.stats.requestsSent++;
                this.stats.dailyActivity[today].requests++;
                if (data.method) {
                    this.stats.methodBreakdown[data.method] = (this.stats.methodBreakdown[data.method] || 0) + 1;
                }
                if (data.statusCode !== undefined) {
                    const code = String(data.statusCode);
                    this.stats.statusCodeBreakdown[code] = (this.stats.statusCodeBreakdown[code] || 0) + 1;
                }
                if (data.responseTime !== undefined) {
                    this.stats.responseTimes.push(data.responseTime);
                    // Keep bounded to last 5000 measurements
                    if (this.stats.responseTimes.length > 5000) {
                        this.stats.responseTimes = this.stats.responseTimes.slice(-5000);
                    }
                }
                if (data.url) {
                    // Normalize URL to pathname for grouping
                    let endpoint = data.url;
                    try { endpoint = new URL(data.url).pathname; } catch { /* use raw */ }
                    this.stats.mostUsedEndpoints[endpoint] = (this.stats.mostUsedEndpoints[endpoint] || 0) + 1;
                }
                break;
            case 'request_created':
                this.stats.requestsCreated++;
                this.stats.dailyActivity[today].created++;
                break;
            case 'request_deleted':
                this.stats.requestsDeleted++;
                break;
            case 'collection_created':
                this.stats.collectionsCreated++;
                break;
            case 'collection_imported':
                this.stats.collectionsImported++;
                break;
            case 'collection_exported':
                this.stats.collectionsExported++;
                break;
            case 'search_performed':
                this.stats.searchesPerformed++;
                break;
            case 'error':
                this.stats.dailyActivity[today].errors++;
                break;
        }
    }

    getAverageResponseTime() {
        const times = this.stats.responseTimes;
        if (times.length === 0) return 0;
        return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    }

    getPercentile(p) {
        const times = [...this.stats.responseTimes].sort((a, b) => a - b);
        if (times.length === 0) return 0;
        const idx = Math.ceil((p / 100) * times.length) - 1;
        return times[Math.max(0, idx)];
    }

    getSuccessRate() {
        const codes = this.stats.statusCodeBreakdown;
        const total = Object.values(codes).reduce((a, b) => a + b, 0);
        if (total === 0) return 0;
        const success = Object.entries(codes)
            .filter(([code]) => code.startsWith('2'))
            .reduce((sum, [, count]) => sum + count, 0);
        return Math.round((success / total) * 100);
    }

    getTopEndpoints(n = 10) {
        return Object.entries(this.stats.mostUsedEndpoints)
            .sort((a, b) => b[1] - a[1])
            .slice(0, n);
    }

    getRecentActivity(days = 30) {
        const result = [];
        const now = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            result.push({
                date: key,
                requests: (this.stats.dailyActivity[key] || {}).requests || 0,
                created: (this.stats.dailyActivity[key] || {}).created || 0,
                errors: (this.stats.dailyActivity[key] || {}).errors || 0
            });
        }
        return result;
    }

    toJSON() {
        return {
            sessionStart: this.sessionStart,
            stats: this.stats,
            events: this.events,
            lastUpdated: new Date().toISOString()
        };
    }

    fromJSON(data) {
        if (!data) return;
        if (data.stats) {
            // Merge stats: accumulate counters
            const s = data.stats;
            this.stats.requestsSent += s.requestsSent || 0;
            this.stats.requestsCreated += s.requestsCreated || 0;
            this.stats.requestsDeleted += s.requestsDeleted || 0;
            this.stats.collectionsCreated += s.collectionsCreated || 0;
            this.stats.collectionsImported += s.collectionsImported || 0;
            this.stats.collectionsExported += s.collectionsExported || 0;
            this.stats.searchesPerformed += s.searchesPerformed || 0;
            this.stats.totalSessionTime += s.totalSessionTime || 0;

            // Merge maps
            for (const [k, v] of Object.entries(s.methodBreakdown || {})) {
                this.stats.methodBreakdown[k] = (this.stats.methodBreakdown[k] || 0) + v;
            }
            for (const [k, v] of Object.entries(s.statusCodeBreakdown || {})) {
                this.stats.statusCodeBreakdown[k] = (this.stats.statusCodeBreakdown[k] || 0) + v;
            }
            for (const [k, v] of Object.entries(s.mostUsedEndpoints || {})) {
                this.stats.mostUsedEndpoints[k] = (this.stats.mostUsedEndpoints[k] || 0) + v;
            }
            for (const [k, v] of Object.entries(s.dailyActivity || {})) {
                if (!this.stats.dailyActivity[k]) {
                    this.stats.dailyActivity[k] = { requests: 0, created: 0, errors: 0 };
                }
                this.stats.dailyActivity[k].requests += v.requests || 0;
                this.stats.dailyActivity[k].created += v.created || 0;
                this.stats.dailyActivity[k].errors += v.errors || 0;
            }

            // Append response times (bounded)
            if (Array.isArray(s.responseTimes)) {
                this.stats.responseTimes = this.stats.responseTimes.concat(s.responseTimes);
                if (this.stats.responseTimes.length > 5000) {
                    this.stats.responseTimes = this.stats.responseTimes.slice(-5000);
                }
            }
        }
        if (Array.isArray(data.events)) {
            this.events = data.events.slice(-1000);
        }
    }

    reset() {
        this.events = [];
        this.sessionStart = new Date().toISOString();
        this.stats = {
            requestsSent: 0,
            requestsCreated: 0,
            requestsDeleted: 0,
            collectionsCreated: 0,
            collectionsImported: 0,
            collectionsExported: 0,
            searchesPerformed: 0,
            totalSessionTime: 0,
            methodBreakdown: {},
            statusCodeBreakdown: {},
            responseTimes: [],
            dailyActivity: {},
            mostUsedEndpoints: {}
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign(module.exports || {}, { AnalyticsCollector });
}

// PluginAPI — restricted API surface exposed to each plugin
class PluginAPI {
    constructor(app, pluginName) {
        this.pluginName = pluginName;
        this._app = app;
        this._storage = new Map();
    }

    // --- Read-only state access ---
    getCurrentCollection() {
        return this._app && this._app.state ? this._app.state.currentCollection : null;
    }
    getCurrentRequest() {
        return this._app && this._app.state ? this._app.state.currentRequest : null;
    }
    getCollections() {
        return this._app && this._app.state ? [...this._app.state.collections] : [];
    }

    // --- Notifications ---
    showToast(message, duration, type) {
        if (this._app && typeof this._app.showToast === 'function') {
            this._app.showToast(message, duration, type);
        }
    }

    // --- Per-plugin storage (in-memory, persisted via auto-save) ---
    getStorage(key) {
        return this._storage.get(key);
    }
    setStorage(key, value) {
        this._storage.set(key, value);
    }
    deleteStorage(key) {
        return this._storage.delete(key);
    }
    getStorageData() {
        const obj = {};
        for (const [k, v] of this._storage) obj[k] = v;
        return obj;
    }
    loadStorageData(data) {
        if (data && typeof data === 'object') {
            for (const [k, v] of Object.entries(data)) this._storage.set(k, v);
        }
    }

    // --- Logging ---
    log(message) {
        console.log(`[plugin:${this.pluginName}] ${message}`);
    }
    error(message) {
        console.error(`[plugin:${this.pluginName}] ${message}`);
    }
}

// PluginManager — discovers, loads, activates plugins and dispatches hooks
class PluginManager {
    constructor(app) {
        this.app = app;
        this.plugins = new Map();    // name -> { manifest, instance, api, enabled }
        this.hooks = new Map();      // hookName -> [{ pluginName, handler }]
    }

    // --- Manifest validation ---
    static REQUIRED_MANIFEST_FIELDS = ['name', 'version', 'main'];
    static VALID_HOOKS = [
        'onAppReady',
        'onBeforeRequestSend',
        'onResponseReceive',
        'onRequestCreate',
        'onRequestDelete',
        'onCollectionImport',
        'onCollectionExport',
        'onBeforeTestRun',
        'onTestComplete',
        'onTabSwitch',
        'onTreeSelect'
    ];

    validateManifest(manifest) {
        const errors = [];
        if (!manifest || typeof manifest !== 'object') {
            return { valid: false, errors: ['Manifest must be a non-null object'] };
        }
        for (const field of PluginManager.REQUIRED_MANIFEST_FIELDS) {
            if (!manifest[field]) {
                errors.push(`Missing required field: ${field}`);
            }
        }
        if (manifest.name && typeof manifest.name !== 'string') {
            errors.push('name must be a string');
        }
        if (manifest.version && typeof manifest.version !== 'string') {
            errors.push('version must be a string');
        }
        if (manifest.hooks && !Array.isArray(manifest.hooks)) {
            errors.push('hooks must be an array');
        }
        if (manifest.hooks && Array.isArray(manifest.hooks)) {
            for (const h of manifest.hooks) {
                if (!PluginManager.VALID_HOOKS.includes(h)) {
                    errors.push(`Unknown hook: ${h}`);
                }
            }
        }
        return { valid: errors.length === 0, errors };
    }

    /**
     * Register a plugin from its manifest and module object.
     * @param {object} manifest — parsed manifest.json
     * @param {object} pluginModule — the exports of the plugin's main.js
     * @returns {{ success: boolean, error?: string }}
     */
    registerPlugin(manifest, pluginModule) {
        const validation = this.validateManifest(manifest);
        if (!validation.valid) {
            return { success: false, error: validation.errors.join('; ') };
        }

        if (this.plugins.has(manifest.name)) {
            return { success: false, error: `Plugin "${manifest.name}" is already registered` };
        }

        const api = new PluginAPI(this.app, manifest.name);

        this.plugins.set(manifest.name, {
            manifest,
            instance: pluginModule || {},
            api,
            enabled: true
        });

        // Register declared hooks
        if (manifest.hooks && Array.isArray(manifest.hooks)) {
            for (const hookName of manifest.hooks) {
                if (!this.hooks.has(hookName)) {
                    this.hooks.set(hookName, []);
                }
                // Look for a matching method on the module
                const handler = pluginModule && typeof pluginModule[hookName] === 'function'
                    ? pluginModule[hookName]
                    : null;
                if (handler) {
                    this.hooks.get(hookName).push({
                        pluginName: manifest.name,
                        handler
                    });
                }
            }
        }

        return { success: true };
    }

    /**
     * Activate all registered plugins by calling their activate() method.
     */
    async activateAll() {
        const results = [];
        for (const [name, plugin] of this.plugins) {
            if (!plugin.enabled) continue;
            try {
                if (plugin.instance && typeof plugin.instance.activate === 'function') {
                    await plugin.instance.activate(plugin.api);
                }
                results.push({ name, activated: true });
            } catch (err) {
                plugin.enabled = false;
                results.push({ name, activated: false, error: err.message });
            }
        }
        return results;
    }

    /**
     * Deactivate all registered plugins by calling their deactivate() method.
     */
    async deactivateAll() {
        for (const [name, plugin] of this.plugins) {
            try {
                if (plugin.instance && typeof plugin.instance.deactivate === 'function') {
                    await plugin.instance.deactivate();
                }
            } catch (err) {
                console.error(`Plugin ${name} deactivation failed:`, err.message);
            }
        }
    }

    /**
     * Dispatch a hook to all registered handlers.
     * Transform hooks: each handler can return modified data that feeds into the next.
     * @param {string} hookName
     * @param {*} data
     * @returns {Promise<*>} — final (possibly transformed) data
     */
    async dispatchHook(hookName, data) {
        const handlers = this.hooks.get(hookName) || [];
        let result = data;
        for (const { pluginName, handler } of handlers) {
            const plugin = this.plugins.get(pluginName);
            if (!plugin || !plugin.enabled) continue;
            try {
                const hookResult = await handler(result, plugin.api);
                if (hookResult !== undefined) {
                    result = hookResult;
                }
            } catch (err) {
                console.error(`[plugin:${pluginName}] Hook ${hookName} failed:`, err.message);
            }
        }
        return result;
    }

    /**
     * Get the list of all registered plugins with their metadata.
     */
    getPluginList() {
        return Array.from(this.plugins.entries()).map(([name, p]) => ({
            name,
            version: p.manifest.version,
            description: p.manifest.description || '',
            enabled: p.enabled,
            hooks: p.manifest.hooks || []
        }));
    }

    /**
     * Enable a previously disabled plugin.
     */
    enablePlugin(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) return false;
        plugin.enabled = true;
        return true;
    }

    /**
     * Disable a plugin (prevents its hooks from being called).
     */
    disablePlugin(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) return false;
        plugin.enabled = false;
        return true;
    }

    /**
     * Remove a plugin entirely.
     */
    removePlugin(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) return false;

        // Remove all hook registrations for this plugin
        for (const [hookName, handlers] of this.hooks) {
            this.hooks.set(hookName,
                handlers.filter(h => h.pluginName !== name)
            );
        }

        this.plugins.delete(name);
        return true;
    }

    /**
     * Get the PluginAPI instance for a given plugin (for testing).
     */
    getPluginAPI(name) {
        const plugin = this.plugins.get(name);
        return plugin ? plugin.api : null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign(module.exports || {}, { PluginAPI, PluginManager });
}

// TutorialSystem — lightweight onboarding walkthrough for first-time users
class TutorialSystem {
    constructor(options = {}) {
        this.storageKey = options.storageKey || 'postman-helper-tutorial-completed';
        this.currentStep = 0;
        this.overlay = null;
        this.onComplete = options.onComplete || null;
        this.steps = TutorialSystem.defaultSteps();
    }

    static defaultSteps() {
        return [
            {
                icon: '\uD83D\uDC4B',
                title: 'Welcome to Postman Helper',
                body: 'A powerful tool for creating, managing, and exporting API requests for Postman. Let\u2019s walk through the basics.',
                shortcuts: []
            },
            {
                icon: '\uD83D\uDCC1',
                title: 'Create a Collection',
                body: 'Collections group related API requests together. Click <strong>+ Add</strong> in the sidebar or use the shortcut to create your first collection.',
                shortcuts: ['\u2318N']
            },
            {
                icon: '\uD83D\uDCE8',
                title: 'Add a Request',
                body: 'Click <strong>+ Request</strong> in the toolbar to add an API request. Set the method, URL, headers, and body in the request editor.',
                shortcuts: ['\u2318N']
            },
            {
                icon: '\u2699',
                title: 'Headers, Body & Tests',
                body: 'Use the <strong>Request</strong>, <strong>Inheritance</strong>, and <strong>Tests</strong> tabs to configure headers, body templates, and test scripts for your requests.',
                shortcuts: []
            },
            {
                icon: '\uD83D\uDE80',
                title: 'Export & Share',
                body: 'Click <strong>Export</strong> to save your collection as a Postman-compatible JSON file. You can also import existing collections, Swagger specs, or cURL commands.',
                shortcuts: ['\u2318S', '\u2318O']
            }
        ];
    }

    shouldShow() {
        if (typeof localStorage === 'undefined') return false;
        return localStorage.getItem(this.storageKey) !== 'true';
    }

    markCompleted() {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(this.storageKey, 'true');
        }
    }

    reset() {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(this.storageKey);
        }
        this.currentStep = 0;
    }

    show() {
        this.currentStep = 0;
        this._render();
    }

    _render() {
        // Remove existing overlay if any
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }

        const step = this.steps[this.currentStep];
        if (!step) return;

        const overlay = document.createElement('div');
        overlay.className = 'tutorial-overlay';

        const dots = this.steps.map((_, i) => {
            let cls = 'tutorial-dot';
            if (i === this.currentStep) cls += ' active';
            else if (i < this.currentStep) cls += ' completed';
            return `<span class="${cls}"></span>`;
        }).join('');

        const shortcuts = step.shortcuts.length > 0
            ? '<div style="margin-top: 8px;">' + step.shortcuts.map(s => `<span class="tutorial-shortcut">${s}</span>`).join(' ') + '</div>'
            : '';

        const isFirst = this.currentStep === 0;
        const isLast = this.currentStep === this.steps.length - 1;

        const prevBtn = isFirst
            ? '<button class="tutorial-skip" data-action="skip">Skip tutorial</button>'
            : '<button class="secondary" data-action="prev">Back</button>';

        const nextBtn = isLast
            ? '<button class="primary" data-action="finish">Get Started</button>'
            : '<button class="primary" data-action="next">Next</button>';

        overlay.innerHTML = `
            <div class="tutorial-card">
                <span class="tutorial-icon">${step.icon}</span>
                <h2>${step.title}</h2>
                <p>${step.body}${shortcuts}</p>
                <div class="tutorial-steps">${dots}</div>
                <div class="tutorial-actions">
                    ${prevBtn}
                    <span style="font-size: 12px; color: var(--text-muted);">${this.currentStep + 1} / ${this.steps.length}</span>
                    ${nextBtn}
                </div>
                ${isLast ? `
                <label class="tutorial-dont-show">
                    <input type="checkbox" data-action="dont-show" checked>
                    Don\u2019t show again
                </label>` : ''}
            </div>
        `;

        document.body.appendChild(overlay);
        this.overlay = overlay;

        // Fade in
        requestAnimationFrame(() => overlay.classList.add('visible'));

        // Event delegation
        overlay.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (!action) {
                // Click on overlay background (not card) closes tutorial
                if (e.target === overlay) this._close(true);
                return;
            }
            if (action === 'next') this._next();
            else if (action === 'prev') this._prev();
            else if (action === 'skip') this._close(true);
            else if (action === 'finish') this._finish();
        });

        // Keyboard navigation
        this._keyHandler = (e) => {
            if (e.key === 'Escape') this._close(true);
            else if (e.key === 'ArrowRight' || e.key === 'Enter') {
                if (isLast) this._finish();
                else this._next();
            } else if (e.key === 'ArrowLeft') this._prev();
        };
        document.addEventListener('keydown', this._keyHandler);
    }

    _next() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this._cleanupKeyHandler();
            this._render();
        }
    }

    _prev() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this._cleanupKeyHandler();
            this._render();
        }
    }

    _finish() {
        const dontShow = this.overlay && this.overlay.querySelector('[data-action="dont-show"]');
        if (dontShow && dontShow.checked) {
            this.markCompleted();
        }
        this._close(false);
    }

    _close(markCompleted) {
        if (markCompleted) {
            this.markCompleted();
        }
        this._cleanupKeyHandler();
        if (this.overlay) {
            this.overlay.classList.remove('visible');
            const el = this.overlay;
            setTimeout(() => el.remove(), 250);
            this.overlay = null;
        }
        if (typeof this.onComplete === 'function') {
            this.onComplete();
        }
    }

    _cleanupKeyHandler() {
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }
    }

    getStepCount() {
        return this.steps.length;
    }

    getCurrentStep() {
        return this.currentStep;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign(module.exports || {}, { TutorialSystem });
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
        this.darkMode = true;
        this.autoFormat = true;
        this.showLineNumbers = true;
        this.inheritGlobally = true;
        this.defaultMethod = 'GET';
        this.requestTimeout = 30;
        this.editorFontSize = 13;
        this.maxHistoryDepth = 20;
        this.toastDuration = 2000;
        this.confirmBeforeDelete = true;
        this.bodyViewMode = 'raw';
        this.filters = { text: '', methods: [], hasTests: false, hasBody: false, useRegex: false };
        this.environments = [];
        this.activeEnvironment = null;
        // Per-request dirty tracking
        this._dirtyRequests = new Set();
        this._cleanSnapshots = new Map();
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
            const dirtyCount = this._dirtyRequests.size;
            const dirtyLabel = dirtyCount > 0 ? ` | ${dirtyCount} unsaved` : '';
            const colCount = this.collections.length > 1 ? ` (${this.collections.length} collections)` : '';
            statusInfo.textContent = `${changeIndicator}${this.currentCollection.name} | ${this.currentCollection.requests.length} requests, ${this.currentCollection.folders.length} folders${colCount}${dirtyLabel}`;
        } else {
            statusInfo.textContent = 'No collection loaded';
        }
    }

    static get SETTINGS_KEY() { return 'postman-helper-settings'; }

    static get DEFAULT_SETTINGS() {
        return {
            autoSave: false,
            darkMode: true,
            autoFormat: true,
            showLineNumbers: true,
            inheritGlobally: true,
            defaultMethod: 'GET',
            requestTimeout: 30,
            editorFontSize: 13,
            maxHistoryDepth: 20,
            toastDuration: 2000,
            confirmBeforeDelete: true,
            aiProvider: 'openai',
            aiApiKey: '',
            aiBaseUrl: '',
            aiModel: ''
        };
    }

    static get AI_PROVIDERS() {
        return {
            openai: {
                name: 'OpenAI',
                baseUrl: 'https://api.openai.com/v1',
                models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
                keyUrl: 'https://platform.openai.com/api-keys',
                keyLabel: 'OpenAI Platform'
            },
            anthropic: {
                name: 'Anthropic',
                baseUrl: 'https://api.anthropic.com/v1',
                models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
                keyUrl: 'https://console.anthropic.com/settings/keys',
                keyLabel: 'Anthropic Console'
            },
            gemini: {
                name: 'Google Gemini',
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
                models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'],
                keyUrl: 'https://aistudio.google.com/apikey',
                keyLabel: 'Google AI Studio'
            }
        };
    }

    loadSettings() {
        try {
            const raw = localStorage.getItem(AppState.SETTINGS_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                const defaults = AppState.DEFAULT_SETTINGS;
                for (const key of Object.keys(defaults)) {
                    this[key] = saved[key] !== undefined ? saved[key] : defaults[key];
                }
            }
        } catch (e) {
            console.error('Failed to load settings from localStorage:', e);
        }
    }

    saveSettings() {
        try {
            const settings = {};
            for (const key of Object.keys(AppState.DEFAULT_SETTINGS)) {
                settings[key] = this[key];
            }
            localStorage.setItem(AppState.SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) {
            console.error('Failed to save settings to localStorage:', e);
        }
    }

    resetSettings() {
        const defaults = AppState.DEFAULT_SETTINGS;
        for (const key of Object.keys(defaults)) {
            this[key] = defaults[key];
        }
        this.saveSettings();
    }

    markRequestDirty(requestName) {
        if (!requestName) return;
        this._dirtyRequests.add(requestName);
        this.markAsChanged();
    }

    markRequestClean(requestName) {
        if (!requestName) return;
        this._dirtyRequests.delete(requestName);
    }

    isRequestDirty(requestName) {
        return this._dirtyRequests.has(requestName);
    }

    clearAllDirty() {
        this._dirtyRequests.clear();
        this._cleanSnapshots.clear();
    }

    takeCleanSnapshot(request) {
        if (!request || !request.name) return;
        this._cleanSnapshots.set(request.name, {
            method: request.method || 'GET',
            url: request.url || '',
            headers: JSON.stringify(request.headers || {}),
            body: request.body || '',
            tests: request.tests || '',
            description: request.description || ''
        });
    }

    hasRequestChanged(request) {
        if (!request || !request.name) return false;
        const snapshot = this._cleanSnapshots.get(request.name);
        if (!snapshot) return false;
        return (request.method || 'GET') !== snapshot.method
            || (request.url || '') !== snapshot.url
            || JSON.stringify(request.headers || {}) !== snapshot.headers
            || (request.body || '') !== snapshot.body
            || (request.tests || '') !== snapshot.tests
            || (request.description || '') !== snapshot.description;
    }
}

// Main application class
class PostmanHelperApp {
    constructor() {
        this.state = new AppState();
        this.state.loadSettings();
        this._autoSaveTimer = null;
        this._expandedFolders = new Set(); // Track expanded tree node IDs
        this._treeScrollTop = 0; // Preserve scroll position across re-renders
        this.state._onChanged = () => this.triggerAutoSave();
        this.initUI();
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.setupContextMenus();
        this.analytics = new AnalyticsCollector();
        this.tutorial = new TutorialSystem({
            onComplete: () => this.showToast('Tutorial complete! Start by creating a collection.', 3000, 'success')
        });
        this.loadAutoSave();
        this.initChangeTracking();
        this.applySettingsToUI();
        // Push saved AI config to main process on startup
        if (this.state.aiApiKey && window.electronAPI && window.electronAPI.aiUpdateConfig) {
            window.electronAPI.aiUpdateConfig({
                chatApiKey: this.state.aiApiKey,
                aiBaseUrl: this.state.aiBaseUrl,
                aiModel: this.state.aiModel
            }).catch(err => console.error('Failed to push AI config on startup:', err));
        }
        // Show tutorial on first launch
        if (this.tutorial.shouldShow()) {
            setTimeout(() => this.tutorial.show(), 500);
        }
    }

    initUI() {
        // Apply theme from settings
        this.applyTheme(this.state.darkMode ? 'dark' : 'light');

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

        // Double-click to reset sidebar width to default
        handle.addEventListener('dblclick', () => {
            document.documentElement.style.setProperty('--sidebar-width', '280px');
            localStorage.setItem('sidebarWidth', 280);
        });
    }

    setupEventListeners() {
        // Header buttons
        document.getElementById('newRequestBtn').addEventListener('click', () => this.createNewRequest());
        document.getElementById('newFolderBtn').addEventListener('click', () => this.createNewFolder());
        document.getElementById('importBtn').addEventListener('click', () => this.importCollection());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportCollection());
        const exportDocsBtn = document.getElementById('exportDocsBtn');
        if (exportDocsBtn) {
            exportDocsBtn.addEventListener('click', () => {
                DialogSystem.showConfirm('Export documentation as:\n\nOK = Markdown (.md)\nCancel = HTML (.html)', (isMarkdown) => {
                    this.exportDocumentation(isMarkdown ? 'markdown' : 'html');
                });
            });
        }
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettings());
        const loadSampleBtn = document.getElementById('loadSampleBtn');
        if (loadSampleBtn) {
            loadSampleBtn.addEventListener('click', () => {
                DialogSystem.showConfirm(
                    'Load a sample API collection? This will add a new collection without affecting existing ones.',
                    (confirmed) => { if (confirmed) this.loadSampleData(); }
                );
            });
        }
        document.getElementById('addCollectionBtn').addEventListener('click', () => this.createNewCollection());

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

        // Analytics button
        const analyticsBtn = document.getElementById('analyticsBtn');
        if (analyticsBtn) analyticsBtn.addEventListener('click', () => this.showAnalytics());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

        // Filter controls
        this.setupFilterListeners();
    }

    setupFilterListeners() {
        const filterText = document.getElementById('filterText');
        const clearBtn = document.getElementById('filterClearBtn');
        if (filterText) {
            let debounceTimer = null;
            const updateClearBtn = () => {
                if (clearBtn) {
                    clearBtn.classList.toggle('visible', filterText.value.length > 0);
                }
            };
            filterText.addEventListener('input', () => {
                updateClearBtn();
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.state.filters.text = filterText.value.toLowerCase();
                    this.updateCollectionTree();
                    if (filterText.value.trim()) {
                        this.analytics.track('search_performed', { query: filterText.value.trim() });
                    }
                }, 200);
            });
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    filterText.value = '';
                    this.state.filters.text = '';
                    updateClearBtn();
                    this.updateCollectionTree();
                    filterText.focus();
                });
            }
        }

        document.querySelectorAll('.method-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const method = chip.dataset.method;
                const idx = this.state.filters.methods.indexOf(method);
                if (idx === -1) {
                    this.state.filters.methods.push(method);
                    chip.classList.add('active');
                    chip.setAttribute('aria-pressed', 'true');
                } else {
                    this.state.filters.methods.splice(idx, 1);
                    chip.classList.remove('active');
                    chip.setAttribute('aria-pressed', 'false');
                }
                this.updateCollectionTree();
            });
        });

        const hasTestsBtn = document.getElementById('filterHasTests');
        if (hasTestsBtn) {
            hasTestsBtn.addEventListener('click', () => {
                this.state.filters.hasTests = !this.state.filters.hasTests;
                hasTestsBtn.classList.toggle('active', this.state.filters.hasTests);
                hasTestsBtn.setAttribute('aria-pressed', String(this.state.filters.hasTests));
                this.updateCollectionTree();
            });
        }

        const hasBodyBtn = document.getElementById('filterHasBody');
        if (hasBodyBtn) {
            hasBodyBtn.addEventListener('click', () => {
                this.state.filters.hasBody = !this.state.filters.hasBody;
                hasBodyBtn.classList.toggle('active', this.state.filters.hasBody);
                hasBodyBtn.setAttribute('aria-pressed', String(this.state.filters.hasBody));
                this.updateCollectionTree();
            });
        }

        const regexToggle = document.getElementById('filterRegexToggle');
        if (regexToggle) {
            regexToggle.addEventListener('click', () => {
                this.state.filters.useRegex = !this.state.filters.useRegex;
                regexToggle.classList.toggle('active', this.state.filters.useRegex);
                regexToggle.setAttribute('aria-pressed', String(this.state.filters.useRegex));
                this.updateCollectionTree();
            });
        }

        const clearAllBtn = document.getElementById('filterClearAllBtn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                this.state.filters = { text: '', methods: [], hasTests: false, hasBody: false, useRegex: false };
                const filterTextInput = document.getElementById('filterText');
                if (filterTextInput) filterTextInput.value = '';
                document.querySelectorAll('.method-chip').forEach(c => {
                    c.classList.remove('active');
                    c.setAttribute('aria-pressed', 'false');
                });
                const ht = document.getElementById('filterHasTests');
                const hb = document.getElementById('filterHasBody');
                const rt = document.getElementById('filterRegexToggle');
                if (ht) { ht.classList.remove('active'); ht.setAttribute('aria-pressed', 'false'); }
                if (hb) { hb.classList.remove('active'); hb.setAttribute('aria-pressed', 'false'); }
                if (rt) { rt.classList.remove('active'); rt.setAttribute('aria-pressed', 'false'); }
                this.updateCollectionTree();
            });
        }
    }

    handleKeyboardShortcuts(e) {
        const mod = e.metaKey || e.ctrlKey;
        const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

        // Escape — always active: close open panels/dialogs
        if (e.key === 'Escape') {
            const overlay = document.querySelector('.dialog-overlay');
            if (overlay) return; // let dialog handle its own Escape
            const settings = document.querySelector('.settings-panel');
            if (settings) {
                const closeBtn = document.getElementById('closeSettingsBtn');
                if (closeBtn) closeBtn.click();
                return;
            }
            this.closeHistory();
            // Blur any focused input
            if (inInput) e.target.blur();
            return;
        }

        // Modifier combos — allowed even inside input/textarea
        if (mod) {
            // Cmd+S — Save current request (NOT export)
            if (e.key === 's' && !e.shiftKey) {
                e.preventDefault();
                this.saveRequest();
                return;
            }

            // Cmd+Shift+E — Export collection
            if (e.key === 'E' || (e.key === 'e' && e.shiftKey)) {
                e.preventDefault();
                this.exportCollection();
                return;
            }

            // Cmd+Enter — Send request
            if (e.key === 'Enter') {
                e.preventDefault();
                this.sendRequest();
                return;
            }

            // Cmd+N — New request
            if (e.key === 'n' && !e.shiftKey) {
                e.preventDefault();
                this.createNewRequest();
                return;
            }

            // Cmd+O — Import collection
            if (e.key === 'o') {
                e.preventDefault();
                this.importCollection();
                return;
            }

            // Cmd+D — Duplicate request
            if (e.key === 'd') {
                e.preventDefault();
                this.duplicateRequest();
                return;
            }

            // Cmd+F — Focus sidebar search
            if (e.key === 'f' && !e.shiftKey) {
                e.preventDefault();
                const filterInput = document.getElementById('filterText');
                if (filterInput) filterInput.focus();
                return;
            }

            // Cmd+1/2/3 — Switch tabs
            if (e.key === '1') {
                e.preventDefault();
                this.switchTab('request');
                return;
            }
            if (e.key === '2') {
                e.preventDefault();
                this.switchTab('inheritance');
                return;
            }
            if (e.key === '3') {
                e.preventDefault();
                this.switchTab('tests');
                return;
            }

            // Cmd+, — Open settings
            if (e.key === ',') {
                e.preventDefault();
                this.showSettings();
                return;
            }

            // Cmd+/ — Show keyboard shortcuts help
            if (e.key === '/') {
                e.preventDefault();
                this.showKeyboardShortcuts();
                return;
            }

            return;
        }

        // Non-modifier keys — block when in input/textarea
        if (inInput) return;
    }

    showKeyboardShortcuts() {
        const shortcuts = [
            ['\u2318S', 'Save current request'],
            ['\u2318\u21E7E', 'Export collection'],
            ['\u2318\u23CE', 'Send request'],
            ['\u2318N', 'New request'],
            ['\u2318O', 'Import collection'],
            ['\u2318D', 'Duplicate request'],
            ['\u2318F', 'Focus search'],
            ['\u23181/2/3', 'Switch tab (Request/Inherit/Tests)'],
            ['\u2318,', 'Open settings'],
            ['\u2318/', 'Show this help'],
            ['Esc', 'Close panel / blur input']
        ];

        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';

        const box = document.createElement('div');
        box.className = 'dialog-box';
        box.style.maxWidth = '420px';

        const title = document.createElement('h3');
        title.textContent = 'Keyboard Shortcuts';
        title.style.marginBottom = '16px';
        box.appendChild(title);

        const table = document.createElement('table');
        table.className = 'shortcuts-table';
        shortcuts.forEach(([key, desc]) => {
            const row = document.createElement('tr');
            const kd = document.createElement('td');
            const kbd = document.createElement('kbd');
            kbd.textContent = key;
            kd.appendChild(kbd);
            const dd = document.createElement('td');
            dd.textContent = desc;
            row.appendChild(kd);
            row.appendChild(dd);
            table.appendChild(row);
        });
        box.appendChild(table);

        const btnContainer = document.createElement('div');
        btnContainer.className = 'dialog-buttons';
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.className = 'dialog-btn primary';
        btnContainer.appendChild(closeBtn);
        box.appendChild(btnContainer);

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const cleanup = () => {
            document.removeEventListener('keydown', keyHandler);
            overlay.remove();
        };

        closeBtn.addEventListener('click', cleanup);
        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) cleanup();
        });

        const keyHandler = (ev) => {
            if (ev.key === 'Escape' || ev.key === '/') {
                ev.preventDefault();
                cleanup();
            }
        };
        document.addEventListener('keydown', keyHandler);
        closeBtn.focus();
    }

    switchTab(tabName) {
        // Close history panel when switching tabs
        this.closeHistory();

        // Hide all tab panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.style.display = 'none';
        });

        // Remove active class from all tabs and update ARIA
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
            tab.setAttribute('tabindex', '-1');
        });

        // Show selected tab pane
        const tabPane = document.getElementById(`${tabName}Tab`);
        if (tabPane) {
            tabPane.style.display = 'block';
        }

        // Add active class to selected tab and update ARIA
        const activeTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
            activeTab.setAttribute('aria-selected', 'true');
            activeTab.setAttribute('tabindex', '0');
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
                <button id="showHistoryBtn" class="secondary" title="View version history">History</button>
                <button id="copyAsCurlBtn" class="secondary" title="Copy request as cURL command">Copy as cURL</button>
            </div>
        `;

        // Set up event listeners for the request form
        document.getElementById('saveRequestBtn').addEventListener('click', () => this.saveRequest());
        document.getElementById('deleteRequestBtn').addEventListener('click', () => this.deleteRequest());
        document.getElementById('duplicateRequestBtn').addEventListener('click', () => this.duplicateRequest());
        document.getElementById('showHistoryBtn').addEventListener('click', () => this.showHistory());
        document.getElementById('copyAsCurlBtn').addEventListener('click', () => this.copyRequestAsCurl());
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

        // Set up change listeners for auto-save indication and dirty tracking
        const inputs = requestTab.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('change', () => {
                this.state.markAsChanged();
                this.markCurrentRequestDirty();
            });
            input.addEventListener('input', () => {
                this.state.markAsChanged();
                this.markCurrentRequestDirty();
            });
        });

        // Take a clean snapshot when loading a request (for change tracking)
        this.state.takeCleanSnapshot(this.state.currentRequest);
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
            // Lenient cleanup: strip comments, trailing commas, single quotes, template vars
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
                // Quote unquoted {{var}} template variables used as bare JSON values
                cleaned = cleaned.replace(/:\s*(\{\{[\w.]+\}\})\s*([,}\]\n\r])/g, ': "$1"$2');
                return JSON.parse(cleaned);
            } catch (lenientError) {
                // Throw error with position info from the original strict error
                throw strictError;
            }
        }
    }

    restoreBareTemplateVars(original, formatted) {
        const bareVars = new Set();
        original.replace(/:\s*(\{\{[\w.]+\}\})\s*([,}\]\n\r])/g, (_, v) => { bareVars.add(v); });
        bareVars.forEach(v => {
            formatted = formatted.split(`"${v}"`).join(v);
        });
        return formatted;
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
                let formatted = JSON.stringify(this.tryParseJSON(raw), null, 2);
                formatted = this.restoreBareTemplateVars(raw, formatted);
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
                let formatted = JSON.stringify(this.tryParseJSON(raw), null, 2);
                formatted = this.restoreBareTemplateVars(raw, formatted);
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
                    <button class="remove-header-btn" data-key="${key}" aria-label="Remove header ${key}">\u274C</button>
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
                        <button class="remove-global-header-btn" data-key="${header.key}" aria-label="Remove global header ${header.key}">\u274C</button>
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
                        <button class="remove-base-endpoint-btn" data-endpoint="${endpoint}" style="margin-left: 10px;" aria-label="Remove endpoint">\u274C</button>
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
                                <button class="template-action-btn remove-body-tmpl-btn" data-name="${tmpl.name}" aria-label="Remove body template">\u274C</button>
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
                                <button class="template-action-btn remove-test-tmpl-btn" data-name="${tmpl.name}" aria-label="Remove test template">\u274C</button>
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
        // If cursor is at position 0 with no selection and textarea has content,
        // append at the end (cursor resets to 0 when textarea loses focus)
        if (start === 0 && end === 0 && textarea.value.length > 0 && document.activeElement !== textarea) {
            const needsNewline = textarea.value.length > 0 && !textarea.value.endsWith('\n');
            textarea.value = textarea.value + (needsNewline ? '\n' : '') + text;
            textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
        } else {
            const before = textarea.value.substring(0, start);
            const after = textarea.value.substring(end);
            const needsNewline = before.length > 0 && !before.endsWith('\n');
            textarea.value = before + (needsNewline ? '\n' : '') + text + after;
            const newPos = start + (needsNewline ? 1 : 0) + text.length;
            textarea.selectionStart = textarea.selectionEnd = newPos;
        }
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
                this.analytics.track('collection_created', { name });
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

        const defaultMethod = this.state.defaultMethod || 'GET';
        DialogSystem.showPrompt('Enter request name:', 'New Request', (name) => {
            if (name) {
                const request = new Request(name, defaultMethod, '/');
                this.state.currentCollection.addRequest(request);
                this.state.setCurrentRequest(request);
                this.updateCollectionTree();
                this.switchTab('request');
                this.state.markAsChanged();
                this.analytics.track('request_created', { name, method: defaultMethod });
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

        // Save scroll position before re-render
        if (collectionTree) {
            this._treeScrollTop = collectionTree.scrollTop;
        }

        if (this.state.collections.length === 0) {
            collectionTree.innerHTML = '<div class="empty-state">No collections yet</div>';
            return;
        }

        let html = '';
        const filtering = this.hasFiltersActive();
        const f = this.state.filters;

        for (let index = 0; index < this.state.collections.length; index++) {
            const collection = this.state.collections[index];
            const isActive = collection === this.state.currentCollection;
            const activeClass = isActive ? ' active' : '';
            const colId = `collection-${index}`;

            const totalRequests = this.countCollectionRequests(collection);
            const colExpanded = this._expandedFolders.has(colId);
            html += `
                <div class="tree-item collection-item${activeClass}" data-type="collection" data-collection-index="${index}" data-collapsible="true" role="treeitem" aria-expanded="${colExpanded}" aria-selected="${isActive}" tabindex="${index === 0 ? '0' : '-1'}">
                    <span class="tree-toggle" data-target="${colId}" aria-hidden="true">\u25B6</span>
                    <span class="tree-label"><span aria-hidden="true">${isActive ? '\uD83D\uDCDA' : '\uD83D\uDCC1'}</span> ${this.escapeHtml(collection.name)}<span class="collection-count" aria-label="${totalRequests} requests">${totalRequests}</span></span>
                </div>
                <div id="${colId}" class="tree-children" role="group" data-drop-target="collection" data-collection-index="${index}">
            `;

            // Add requests at root level (filtered)
            if (collection.requests && collection.requests.length > 0) {
                const visibleRequests = filtering
                    ? collection.requests.filter(r => this.matchesFilters(r))
                    : collection.requests;
                if (visibleRequests.length > 0) {
                    html += '<div class="tree-section">Root Requests:</div>';
                    for (const request of visibleRequests) {
                        const isReqActive = this.state.currentRequest === request;
                        const reqActive = isReqActive ? 'active' : '';
                        const displayName = filtering && f.text
                            ? this.highlightMatch(request.name, f.text, f.useRegex)
                            : this.escapeHtml(request.name);
                        const dirtyDot = this.state.isRequestDirty(request.name) ? '<span class="dirty-indicator" aria-label="unsaved changes">\u25CF</span>' : '';
                        html += `<div class="tree-item ${reqActive}" data-type="request" data-id="${request.name}" data-collection-index="${index}" draggable="true" role="treeitem" aria-selected="${isReqActive}" tabindex="-1"><span class="method-badge method-${(request.method || 'GET').toLowerCase()}">${(request.method || 'GET')}</span>${dirtyDot}<span class="request-name">${displayName}</span></div>`;
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

        // Set up collapsible functionality (respects _expandedFolders)
        this.setupCollapsibleTree();

        // Set up delegated click handler for tree (replaces per-item handlers)
        this.setupTreeClickHandlers();

        // Set up drag and drop for the new tree elements
        this.setupDragAndDrop();

        // Restore scroll position after re-render
        if (collectionTree && this._treeScrollTop) {
            collectionTree.scrollTop = this._treeScrollTop;
        }
    }

    renderCollapsibleFolder(folder, depth = 0) {
        const folderId = `folder-${folder.name.replace(/\s+/g, '-')}-${depth}`;
        const isFolderActive = this.state.currentFolder === folder;
        const activeClass = isFolderActive ? 'active' : '';
        const folderExpanded = this._expandedFolders.has(folderId);

        let html = `
            <div class="tree-item folder ${activeClass}" data-type="folder" data-id="${folder.name}" data-drop-target="folder" draggable="true" style="padding-left: ${12 + depth * 15}px" role="treeitem" aria-expanded="${folderExpanded}" aria-selected="${isFolderActive}" tabindex="-1">
                <span class="tree-toggle" data-target="${folderId}" aria-hidden="true">\u25B6</span>
                <span class="tree-label"><span aria-hidden="true">\uD83D\uDCC1</span> ${folder.name}</span>
            </div>
            <div id="${folderId}" class="tree-children" role="group" data-drop-target="folder" data-id="${folder.name}" style="padding-left: ${24 + depth * 15}px">
        `;

        // Add folder contents (filtered)
        const filtering = this.hasFiltersActive();
        const f = this.state.filters;
        if (folder.requests && folder.requests.length > 0) {
            const visibleRequests = filtering
                ? folder.requests.filter(r => this.matchesFilters(r))
                : folder.requests;
            for (const request of visibleRequests) {
                const isReqActive = this.state.currentRequest === request;
                const requestActive = isReqActive ? 'active' : '';
                const displayName = filtering && f.text
                    ? this.highlightMatch(request.name, f.text, f.useRegex)
                    : this.escapeHtml(request.name);
                const dirtyDot = this.state.isRequestDirty(request.name) ? '<span class="dirty-indicator" aria-label="unsaved changes">\u25CF</span>' : '';
                html += `<div class="tree-item ${requestActive}" data-type="request" data-id="${request.name}" draggable="true" role="treeitem" aria-selected="${isReqActive}" tabindex="-1"><span class="method-badge method-${(request.method || 'GET').toLowerCase()}">${(request.method || 'GET')}</span>${dirtyDot}<span class="request-name">${displayName}</span></div>`;
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
    
    countCollectionRequests(collection) {
        let count = (collection.requests || []).length;
        const countFolders = (folders) => {
            for (const f of (folders || [])) {
                count += (f.requests || []).length;
                if (f.folders) countFolders(f.folders);
            }
        };
        countFolders(collection.folders);
        return count;
    }

    setupCollapsibleTree() {
        // Restore expand/collapse state from _expandedFolders Set.
        // Active collection is expanded by default on first view.
        document.querySelectorAll('.tree-children').forEach(children => {
            const nodeId = children.id;
            if (!nodeId) return;

            const colIdx = children.dataset.collectionIndex;
            const isActiveCollection = colIdx !== undefined &&
                this.state.collections[parseInt(colIdx)] === this.state.currentCollection;

            // Determine if this node should be expanded:
            // - If we have a stored state in _expandedFolders, use it
            // - Otherwise: active collection defaults expanded, everything else collapsed
            let shouldExpand;
            if (this._expandedFolders.has(nodeId)) {
                shouldExpand = true;
            } else if (nodeId.startsWith('collection-') && isActiveCollection && !this._expandedFolders.has('_init_' + nodeId)) {
                // First time seeing this active collection — expand it and record
                shouldExpand = true;
                this._expandedFolders.add(nodeId);
                this._expandedFolders.add('_init_' + nodeId);
            } else {
                shouldExpand = false;
            }

            children.style.display = shouldExpand ? 'block' : 'none';
            const toggle = document.querySelector(`.tree-toggle[data-target="${nodeId}"]`);
            if (toggle) toggle.textContent = shouldExpand ? '\u25BC' : '\u25B6';
            // Update aria-expanded on the parent treeitem
            const parentItem = toggle ? toggle.closest('[role="treeitem"]') : null;
            if (parentItem) parentItem.setAttribute('aria-expanded', String(shouldExpand));
        });

        // NOTE: Toggle click events are handled via event delegation in setupTreeClickHandlers()
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
        const collectionTree = document.getElementById('collectionTree');
        if (!collectionTree) return;

        // Remove any existing delegated handler before adding a new one
        if (this._treeClickHandler) {
            collectionTree.removeEventListener('click', this._treeClickHandler);
        }

        // Single delegated click handler for all tree interactions
        this._treeClickHandler = (e) => {
            // --- Toggle expand/collapse ---
            const toggle = e.target.closest('.tree-toggle');
            if (toggle) {
                e.stopPropagation();
                const targetId = toggle.getAttribute('data-target');
                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    const isCollapsed = targetElement.style.display === 'none';
                    const parentItem = toggle.closest('[role="treeitem"]');
                    if (isCollapsed) {
                        targetElement.style.display = 'block';
                        toggle.textContent = '\u25BC';
                        this._expandedFolders.add(targetId);
                        if (parentItem) parentItem.setAttribute('aria-expanded', 'true');
                    } else {
                        targetElement.style.display = 'none';
                        toggle.textContent = '\u25B6';
                        this._expandedFolders.delete(targetId);
                        if (parentItem) parentItem.setAttribute('aria-expanded', 'false');
                    }
                }
                return;
            }

            // --- Collection click ---
            const collectionItem = e.target.closest('.tree-item[data-type="collection"]');
            if (collectionItem) {
                const colIdx = parseInt(collectionItem.dataset.collectionIndex);
                if (!isNaN(colIdx)) {
                    this.switchToCollectionByIndex(colIdx);
                }
                return;
            }

            // --- Request click ---
            const requestItem = e.target.closest('.tree-item[data-type="request"]');
            if (requestItem) {
                // Auto-switch collection if needed
                const colIdxAttr = requestItem.dataset.collectionIndex ||
                    (requestItem.closest('[data-collection-index]') || {}).dataset?.collectionIndex;
                if (colIdxAttr !== undefined) {
                    const colIdx = parseInt(colIdxAttr);
                    const col = this.state.collections[colIdx];
                    if (col && col !== this.state.currentCollection) {
                        this.state.currentCollection = col;
                        this.state.currentFolder = null;
                        this.state.updateStatusBar();
                    }
                }

                const requestName = requestItem.dataset.id;
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
                    const current = this.state.currentRequest;
                    const switchToRequest = () => {
                        this.state.setCurrentRequest(request);
                        this.state.setCurrentFolder(null);
                        this.updateTabContent();
                        this.switchTab('request');
                    };

                    // Warn if switching away from a dirty request
                    if (current && current !== request && this.state.isRequestDirty(current.name)) {
                        DialogSystem.showConfirm(
                            `"${current.name}" has unsaved changes. Switch anyway?`,
                            (confirmed) => {
                                if (confirmed) {
                                    this.state.markRequestClean(current.name);
                                    switchToRequest();
                                }
                            }
                        );
                    } else {
                        switchToRequest();
                    }
                }
                return;
            }

            // --- Folder click ---
            const folderItem = e.target.closest('.tree-item[data-type="folder"]');
            if (folderItem) {
                const folderName = folderItem.dataset.id;
                const folder = this.findFolderByName(this.state.currentCollection.folders, folderName);
                if (folder) {
                    this.state.setCurrentFolder(folder);
                    this.state.setCurrentRequest(null);
                    this.updateTabContent();
                    this.switchTab('request');
                }
                return;
            }
        };

        collectionTree.addEventListener('click', this._treeClickHandler);

        // Keyboard navigation for tree (Arrow keys, Enter, Home, End)
        if (this._treeKeyHandler) {
            collectionTree.removeEventListener('keydown', this._treeKeyHandler);
        }
        this._treeKeyHandler = (e) => {
            const treeItems = Array.from(collectionTree.querySelectorAll('[role="treeitem"]'));
            if (treeItems.length === 0) return;

            // Only visible items (parent group is not display:none)
            const visibleItems = treeItems.filter(item => {
                let el = item;
                while (el && el !== collectionTree) {
                    if (el.style && el.style.display === 'none') return false;
                    el = el.parentElement;
                }
                return true;
            });

            const currentIdx = visibleItems.indexOf(document.activeElement);
            if (currentIdx === -1 && !['ArrowDown', 'Home'].includes(e.key)) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = currentIdx < visibleItems.length - 1 ? currentIdx + 1 : 0;
                visibleItems[next].focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = currentIdx > 0 ? currentIdx - 1 : visibleItems.length - 1;
                visibleItems[prev].focus();
            } else if (e.key === 'Home') {
                e.preventDefault();
                visibleItems[0].focus();
            } else if (e.key === 'End') {
                e.preventDefault();
                visibleItems[visibleItems.length - 1].focus();
            } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                document.activeElement.click();
            } else if (e.key === 'ArrowRight') {
                // Expand if collapsed
                const focused = document.activeElement;
                if (focused && focused.getAttribute('aria-expanded') === 'false') {
                    const toggle = focused.querySelector('.tree-toggle');
                    if (toggle) toggle.click();
                }
            } else if (e.key === 'ArrowLeft') {
                // Collapse if expanded
                const focused = document.activeElement;
                if (focused && focused.getAttribute('aria-expanded') === 'true') {
                    const toggle = focused.querySelector('.tree-toggle');
                    if (toggle) toggle.click();
                }
            }
        };
        collectionTree.addEventListener('keydown', this._treeKeyHandler);
    }

    matchesFilters(request) {
        const f = this.state.filters;
        if (f.text) {
            const matchFn = f.useRegex ? this.regexMatch : this.textMatch;
            if (!(matchFn(request.name, f.text)
                || matchFn(request.url, f.text)
                || matchFn(request.body, f.text)
                || matchFn(request.tests, f.text)
                || this.headersMatchText(request.headers, f.text, f.useRegex))) {
                return false;
            }
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

    // --- Search helper methods ---

    textMatch(field, text) {
        return field && field.toLowerCase().includes(text);
    }

    regexMatch(field, text) {
        if (!field) return false;
        try { return new RegExp(text, 'i').test(field); }
        catch { return false; }
    }

    headersMatchText(headers, text, useRegex) {
        if (!headers) return false;
        const matchFn = useRegex ? this.regexMatch : this.textMatch;
        if (Array.isArray(headers)) {
            return headers.some(h =>
                matchFn(h.key, text) || matchFn(h.value, text)
            );
        }
        if (typeof headers === 'object') {
            return Object.entries(headers).some(([k, v]) =>
                matchFn(k, text) || matchFn(String(v), text)
            );
        }
        return false;
    }

    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    highlightMatch(text, searchTerm, useRegex) {
        if (!searchTerm || !text) return this.escapeHtml(text || '');
        try {
            const pattern = useRegex ? searchTerm : this.escapeRegex(searchTerm);
            const regex = new RegExp(`(${pattern})`, 'gi');
            return this.escapeHtml(text).replace(regex, '<mark class="search-highlight">$1</mark>');
        } catch {
            return this.escapeHtml(text);
        }
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

    // Change Tracking Helpers
    markCurrentRequestDirty() {
        const req = this.state.currentRequest;
        if (!req) return;
        this.state.markRequestDirty(req.name);
        this.updateDirtyIndicators();
    }

    updateDirtyIndicators() {
        // Update request tab label
        const requestTabBtn = document.querySelector('.tab[data-tab="request"]');
        if (requestTabBtn) {
            const isDirty = this.state.currentRequest &&
                this.state.isRequestDirty(this.state.currentRequest.name);
            requestTabBtn.textContent = isDirty ? '● Request' : 'Request';
        }

        // Update dirty dots in tree (lightweight — just toggle existing spans)
        document.querySelectorAll('.tree-item[data-type="request"]').forEach(item => {
            const reqName = item.dataset.id;
            const nameSpan = item.querySelector('.request-name');
            if (!nameSpan) return;
            const existingDot = item.querySelector('.dirty-indicator');
            if (this.state.isRequestDirty(reqName)) {
                if (!existingDot) {
                    const dot = document.createElement('span');
                    dot.className = 'dirty-indicator';
                    dot.textContent = '●';
                    nameSpan.parentNode.insertBefore(dot, nameSpan);
                }
            } else {
                if (existingDot) existingDot.remove();
            }
        });

        // Update status bar dirty count
        this.state.updateStatusBar();
    }

    initChangeTracking() {
        // Change tracking is initialized per-request in updateRequestTab()
        // This method exists as the entry point called from the constructor
    }

    // Request Management
    saveRequest() {
        if (!this.state.currentRequest || !this.state.currentCollection) return;

        // Sync max history depth from settings
        if (this.state.currentRequest._maxHistoryDepth !== undefined) {
            this.state.currentRequest._maxHistoryDepth = this.state.maxHistoryDepth;
        }
        // Take a version history snapshot before overwriting fields
        if (this.state.currentRequest.takeSnapshot) {
            this.state.currentRequest.takeSnapshot();
        }

        // 1. Capture raw user inputs
        const name = document.getElementById('requestName').value;
        const method = document.getElementById('requestMethod').value;
        const url = document.getElementById('requestUrl').value;
        let body = document.getElementById('requestBody').value;
        const description = document.getElementById('requestDescription').value;

        // Auto-format JSON body if setting is enabled
        if (this.state.autoFormat && body && body.trim()) {
            try {
                const parsed = JSON.parse(body);
                const formatted = JSON.stringify(parsed, null, 2);
                body = formatted;
                const bodyEl = document.getElementById('requestBody');
                if (bodyEl) bodyEl.value = formatted;
            } catch (_) { /* not JSON, leave as-is */ }
        }

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

        // Mark request clean and take a fresh snapshot after save
        this.state.markRequestClean(name);
        this.state.takeCleanSnapshot(this.state.currentRequest);
        
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
        this.updateDirtyIndicators();
        
        this.showToast('Request saved successfully!', 2000, 'success');
    }

    deleteRequest() {
        if (!this.state.currentRequest || !this.state.currentCollection) return;
        const deleteName = this.state.currentRequest.name;

        const doDelete = () => {
            const col = this.state.currentCollection;
            const req = this.state.currentRequest;
            // Remove from root requests
            const rootIdx = col.requests.indexOf(req);
            if (rootIdx !== -1) {
                col.requests.splice(rootIdx, 1);
            } else {
                // Search folders recursively (#75)
                const removeFromFolders = (folders) => {
                    for (const f of folders) {
                        const idx = f.requests.indexOf(req);
                        if (idx !== -1) { f.requests.splice(idx, 1); return true; }
                        if (f.folders && removeFromFolders(f.folders)) return true;
                    }
                    return false;
                };
                removeFromFolders(col.folders || []);
            }
            this.state.setCurrentRequest(null);
            this.updateCollectionTree();
            this.switchTab('request');
            this.state.markAsChanged();
            this.analytics.track('request_deleted', { name: deleteName });
        };

        if (this.state.confirmBeforeDelete) {
            DialogSystem.showDangerConfirm(`Are you sure you want to delete "${deleteName}"?`, 'Delete', (confirmDelete) => {
                if (confirmDelete) doDelete();
            });
        } else {
            doDelete();
        }
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
            <button class="remove-header-btn" aria-label="Remove header">\u274C</button>
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

        // Take a version history snapshot before overwriting tests
        if (this.state.currentRequest.takeSnapshot) {
            this.state.currentRequest.takeSnapshot();
        }

        const tests = document.getElementById('requestTests').value;
        this.state.currentRequest.tests = tests;
        this.state.markAsChanged();

        // Mark request clean and take fresh snapshot after saving tests
        this.state.markRequestClean(this.state.currentRequest.name);
        this.state.takeCleanSnapshot(this.state.currentRequest);
        this.updateDirtyIndicators();

        this.showToast('Tests saved successfully!', 2000, 'success');
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
            this.showToast('Please enter a valid endpoint URL', 2000, 'warning');
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
                filters: [
                    { name: 'All Supported', extensions: ['json', 'yaml', 'yml', 'har', 'txt'] },
                    { name: 'JSON Files', extensions: ['json'] },
                    { name: 'YAML Files', extensions: ['yaml', 'yml'] },
                    { name: 'HAR Files', extensions: ['har'] },
                    { name: 'cURL/Text', extensions: ['txt'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (result.success) {
                const collection = new Collection('Imported Collection');
                const format = FormatParser.detectFormat(result.content);

                switch (format) {
                    case 'openapi-3': {
                        let spec;
                        try { spec = JSON.parse(result.content); } catch {
                            this.showToast('YAML OpenAPI files are not supported — please convert to JSON first');
                            return;
                        }
                        const parsed = FormatParser.parseOpenAPI3(spec);
                        FormatParser.importParsedInto(collection, parsed);
                        this.showToast(`Imported OpenAPI 3.x: ${parsed.name}`, 2000, 'success');
                        break;
                    }
                    case 'swagger-2': {
                        let spec;
                        try { spec = JSON.parse(result.content); } catch {
                            this.showToast('YAML Swagger files are not supported — please convert to JSON first');
                            return;
                        }
                        const parsed = FormatParser.parseSwagger2(spec);
                        FormatParser.importParsedInto(collection, parsed);
                        this.showToast(`Imported Swagger 2.0: ${parsed.name}`, 2000, 'success');
                        break;
                    }
                    case 'har': {
                        const har = JSON.parse(result.content);
                        const parsed = FormatParser.parseHAR(har);
                        FormatParser.importParsedInto(collection, parsed);
                        this.showToast(`Imported HAR: ${parsed.requests.length} requests`, 2000, 'success');
                        break;
                    }
                    case 'curl': {
                        const parsed = FormatParser.parseCurl(result.content);
                        FormatParser.importParsedInto(collection, parsed);
                        this.showToast('Imported cURL request', 2000, 'success');
                        break;
                    }
                    default: {
                        // Postman v2.1 or simple format — existing path
                        collection.importFromJSON(result.content);
                        this.showToast('Collection imported successfully!', 2000, 'success');
                        break;
                    }
                }

                this.state.addCollection(collection);
                this.state.currentCollection = collection;
                this.state.currentRequest = null;
                this.state.currentFolder = null;
                this.updateCollectionTree();
                this.switchTab('request');
                this.analytics.track('collection_imported', {
                    format,
                    requestCount: collection.requests.length
                });
            }
        } catch (error) {
            console.error('Import error:', error);
            this.showToast('Error importing collection: ' + error.message, 4000, 'error');
            this.analytics.track('error', { message: error.message, context: 'importCollection' });
        }
    }

    async exportCollection() {
        if (!this.state.currentCollection) {
            this.showToast('No collection to export', 2000, 'warning');
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
                this.state.clearAllDirty();
                this.state.updateStatusBar();
                this.updateDirtyIndicators();
                this.showToast(`Collection exported successfully to: ${result.path}`, 3000, 'success');
                this.analytics.track('collection_exported', {
                    name: this.state.currentCollection.name,
                    requestCount: this.state.currentCollection.requests.length
                });
            }
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('Error exporting collection: ' + error.message, 4000, 'error');
        }
    }

    async exportDocumentation(format = 'markdown') {
        if (!this.state.currentCollection) {
            this.showToast('No collection to document');
            return;
        }
        const collection = this.state.currentCollection;
        const content = format === 'html'
            ? DocGenerator.generateHTML(collection)
            : DocGenerator.generateMarkdown(collection);
        const ext = format === 'html' ? 'html' : 'md';
        try {
            const result = await window.electronAPI.saveFile({
                defaultPath: `${collection.name}-docs.${ext}`,
                filters: [{ name: `${format.toUpperCase()} Files`, extensions: [ext] }],
                content: content
            });
            if (result.success) {
                this.showToast(`Documentation exported to ${result.path}`);
            }
        } catch (error) {
            console.error('Documentation export error:', error);
            this.showToast('Error exporting documentation');
        }
    }

    showSettings() {
        // Remove existing settings panel if open
        const existing = document.getElementById('settingsModal');
        if (existing) existing.remove();
        const existingPanel = document.getElementById('settingsPanel');
        if (existingPanel) existingPanel.remove();

        const s = this.state;
        const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
        const methodOptions = methods.map(m => `<option value="${m}" ${s.defaultMethod === m ? 'selected' : ''}>${m}</option>`).join('');

        // AI provider presets
        const providers = AppState.AI_PROVIDERS;
        const currentProvider = s.aiProvider || 'openai';
        const providerOptions = Object.keys(providers).map(k =>
            `<option value="${k}" ${currentProvider === k ? 'selected' : ''}>${providers[k].name}</option>`
        ).join('');
        const providerInfo = providers[currentProvider] || providers.openai;
        const currentModel = s.aiModel || providerInfo.models[0];
        const modelOptions = providerInfo.models.map(m =>
            `<option value="${m}" ${currentModel === m ? 'selected' : ''}>${m}</option>`
        ).join('');
        const currentBaseUrl = s.aiBaseUrl || providerInfo.baseUrl;
        const maskedKey = s.aiApiKey ? '\u2022'.repeat(Math.min(s.aiApiKey.length, 32)) : '';

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
                <button class="settings-close-btn" id="closeSettingsBtn" aria-label="Close settings">&times;</button>
            </div>
            <div class="settings-body">
                <div class="settings-group">
                    <h4>Appearance</h4>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Dark Mode</div>
                            <div class="settings-item-desc">Toggle dark/light theme</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="darkMode" ${s.darkMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>

                <div class="settings-group">
                    <h4>Editor</h4>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Auto-format JSON</div>
                            <div class="settings-item-desc">Format JSON body on save</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoFormat" ${s.autoFormat ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Show Line Numbers</div>
                            <div class="settings-item-desc">Display line numbers in text areas</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="showLineNumbers" ${s.showLineNumbers ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Font Size</div>
                            <div class="settings-item-desc">Editor font size (px)</div>
                        </div>
                        <input type="number" id="editorFontSize" value="${s.editorFontSize}" min="10" max="24" style="width:60px;text-align:center;">
                    </div>
                </div>

                <div class="settings-group">
                    <h4>Behavior</h4>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Auto-save</div>
                            <div class="settings-item-desc">Automatically save changes to disk</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoSave" ${s.autoSave ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Inherit Global Headers</div>
                            <div class="settings-item-desc">Apply global headers to all requests</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="inheritGlobally" ${s.inheritGlobally ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Confirm Before Delete</div>
                            <div class="settings-item-desc">Ask confirmation before deleting requests</div>
                        </div>
                        <label class="toggle-switch">
                            <input type="checkbox" id="confirmBeforeDelete" ${s.confirmBeforeDelete ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Default Method</div>
                            <div class="settings-item-desc">HTTP method for new requests</div>
                        </div>
                        <select id="defaultMethod" style="width:90px;">${methodOptions}</select>
                    </div>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Request Timeout</div>
                            <div class="settings-item-desc">Timeout in seconds</div>
                        </div>
                        <input type="number" id="requestTimeout" value="${s.requestTimeout}" min="1" max="300" style="width:60px;text-align:center;">
                    </div>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Toast Duration</div>
                            <div class="settings-item-desc">Notification display time (ms)</div>
                        </div>
                        <input type="number" id="toastDuration" value="${s.toastDuration}" min="500" max="10000" step="500" style="width:70px;text-align:center;">
                    </div>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Max History Depth</div>
                            <div class="settings-item-desc">Version snapshots per request</div>
                        </div>
                        <input type="number" id="maxHistoryDepth" value="${s.maxHistoryDepth}" min="5" max="100" style="width:60px;text-align:center;">
                    </div>
                </div>

                <div class="settings-group">
                    <h4>AI Provider</h4>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Provider</div>
                            <div class="settings-item-desc">Select AI service provider</div>
                        </div>
                        <select id="aiProvider" style="width:140px;">${providerOptions}</select>
                    </div>
                    <div class="settings-item" style="flex-direction:column;align-items:stretch;gap:6px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <div class="settings-item-label">API Key</div>
                                <div class="settings-item-desc">Stored locally, never sent to our servers</div>
                            </div>
                            <a id="aiKeyLink" href="#" class="ai-key-link" title="Get API key">${providerInfo.keyLabel} &#x2197;</a>
                        </div>
                        <div class="ai-key-input-wrap">
                            <input type="password" id="aiApiKey" value="${maskedKey}" placeholder="Enter API key..." class="ai-key-input" autocomplete="off" spellcheck="false">
                            <button type="button" id="aiKeyToggle" class="ai-key-toggle" aria-label="Show/hide key" title="Show/hide key">&#x25CE;</button>
                        </div>
                    </div>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Base URL</div>
                            <div class="settings-item-desc">API endpoint base URL</div>
                        </div>
                        <input type="text" id="aiBaseUrl" value="${currentBaseUrl}" class="ai-url-input" placeholder="https://..." spellcheck="false">
                    </div>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Model</div>
                            <div class="settings-item-desc">AI model to use</div>
                        </div>
                        <select id="aiModel" style="width:240px;">${modelOptions}</select>
                    </div>
                    <div class="settings-item" style="justify-content:flex-end;border-bottom:none;padding-top:12px;">
                        <button id="aiTestBtn" class="secondary ai-test-btn" style="padding:5px 14px;font-size:12px;">Test Connection</button>
                        <span id="aiTestResult" class="ai-test-result"></span>
                    </div>
                </div>

                <div class="settings-group">
                    <h4>Help</h4>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Show Tutorial</div>
                            <div class="settings-item-desc">Replay the getting started guide</div>
                        </div>
                        <button id="showTutorialBtn" class="secondary" style="padding: 5px 14px; font-size: 12px;">Show</button>
                    </div>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Keyboard Shortcuts</div>
                            <div class="settings-item-desc">View all available shortcuts</div>
                        </div>
                        <button id="showShortcutsBtn" class="secondary" style="padding: 5px 14px; font-size: 12px;">View</button>
                    </div>
                </div>

                <div class="settings-group">
                    <h4>About</h4>
                    <div class="settings-item">
                        <div>
                            <div class="settings-item-label">Postman Helper</div>
                            <div class="settings-item-desc">v1.98 &mdash; Electron desktop app for API request management</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="settings-footer">
                <button id="resetSettingsBtn" class="secondary">Reset to Defaults</button>
                <div style="flex:1"></div>
                <button id="cancelSettingsBtn" class="secondary">Cancel</button>
                <button id="saveSettingsBtn">Save Settings</button>
            </div>
        `;

        document.body.appendChild(settingsModal);
        document.body.appendChild(panel);

        // Show Tutorial button
        document.getElementById('showTutorialBtn').addEventListener('click', () => {
            closeSettings();
            setTimeout(() => {
                this.tutorial.reset();
                this.tutorial.show();
            }, 350);
        });

        // Show Shortcuts button
        document.getElementById('showShortcutsBtn').addEventListener('click', () => {
            closeSettings();
            setTimeout(() => this.showKeyboardShortcuts(), 350);
        });

        // Live dark mode toggle preview
        document.getElementById('darkMode').addEventListener('change', (e) => {
            this.applyTheme(e.target.checked ? 'dark' : 'light');
        });

        // ===== AI Provider settings event handlers =====

        // Track the actual API key (not the masked display value)
        let _aiKeyValue = s.aiApiKey || '';
        let _aiKeyRevealed = false;
        const aiKeyInput = document.getElementById('aiApiKey');
        const aiKeyToggle = document.getElementById('aiKeyToggle');
        const aiProviderSelect = document.getElementById('aiProvider');
        const aiModelSelect = document.getElementById('aiModel');
        const aiBaseUrlInput = document.getElementById('aiBaseUrl');
        const aiKeyLink = document.getElementById('aiKeyLink');
        const aiTestBtn = document.getElementById('aiTestBtn');
        const aiTestResult = document.getElementById('aiTestResult');

        // When user types in the key field, capture the real value
        aiKeyInput.addEventListener('input', () => {
            _aiKeyValue = aiKeyInput.value;
        });
        aiKeyInput.addEventListener('focus', () => {
            // On focus, show real value if user had a masked key
            if (!_aiKeyRevealed && _aiKeyValue) {
                aiKeyInput.type = 'password';
                aiKeyInput.value = _aiKeyValue;
            }
        });

        // Show/hide key toggle
        aiKeyToggle.addEventListener('click', () => {
            _aiKeyRevealed = !_aiKeyRevealed;
            if (_aiKeyRevealed) {
                aiKeyInput.type = 'text';
                aiKeyInput.value = _aiKeyValue;
                aiKeyToggle.textContent = '\u25C9';
            } else {
                aiKeyInput.type = 'password';
                aiKeyInput.value = _aiKeyValue;
                aiKeyToggle.textContent = '\u25CE';
            }
        });

        // Provider change: update base URL, model list, and key link
        aiProviderSelect.addEventListener('change', () => {
            const prov = providers[aiProviderSelect.value] || providers.openai;
            aiBaseUrlInput.value = prov.baseUrl;
            // Rebuild model options
            aiModelSelect.innerHTML = prov.models.map(m =>
                '<option value="' + m + '">' + m + '</option>'
            ).join('');
            // Update key link
            aiKeyLink.href = '#';
            aiKeyLink.textContent = prov.keyLabel + ' \u2197';
            aiKeyLink.setAttribute('data-url', prov.keyUrl);
        });

        // Open provider key page in external browser
        aiKeyLink.setAttribute('data-url', providerInfo.keyUrl);
        aiKeyLink.addEventListener('click', (e) => {
            e.preventDefault();
            const url = aiKeyLink.getAttribute('data-url');
            if (url && window.electronAPI) {
                // Use shell.openExternal via a simple window.open fallback
                window.open(url, '_blank');
            } else if (url) {
                window.open(url, '_blank');
            }
        });

        // Test Connection button
        aiTestBtn.addEventListener('click', async () => {
            const key = _aiKeyValue;
            if (!key) {
                aiTestResult.textContent = 'No API key entered';
                aiTestResult.className = 'ai-test-result ai-test-error';
                return;
            }
            aiTestBtn.disabled = true;
            aiTestBtn.textContent = 'Testing...';
            aiTestResult.textContent = '';
            aiTestResult.className = 'ai-test-result';

            try {
                const config = {
                    chatApiKey: key,
                    aiBaseUrl: aiBaseUrlInput.value,
                    aiModel: aiModelSelect.value
                };
                let result;
                if (window.electronAPI && window.electronAPI.aiTestConnection) {
                    result = await window.electronAPI.aiTestConnection(config);
                } else {
                    result = { success: false, error: 'Electron API not available' };
                }
                if (result.success) {
                    aiTestResult.textContent = 'Connected (' + (result.model || 'ok') + ')';
                    aiTestResult.className = 'ai-test-result ai-test-ok';
                } else {
                    aiTestResult.textContent = result.error || 'Connection failed';
                    aiTestResult.className = 'ai-test-result ai-test-error';
                }
            } catch (err) {
                aiTestResult.textContent = err.message || 'Connection failed';
                aiTestResult.className = 'ai-test-result ai-test-error';
            } finally {
                aiTestBtn.disabled = false;
                aiTestBtn.textContent = 'Test Connection';
            }
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
            this.applyTheme(s.darkMode ? 'dark' : 'light');
            closeSettings();
        });

        // Reset to Defaults
        document.getElementById('resetSettingsBtn').addEventListener('click', () => {
            this.state.resetSettings();
            this.applySettingsToUI();
            this.showToast('Settings reset to defaults');
            closeSettings();
        });

        // Save button
        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            s.autoSave = document.getElementById('autoSave').checked;
            s.darkMode = document.getElementById('darkMode').checked;
            s.autoFormat = document.getElementById('autoFormat').checked;
            s.showLineNumbers = document.getElementById('showLineNumbers').checked;
            s.inheritGlobally = document.getElementById('inheritGlobally').checked;
            s.confirmBeforeDelete = document.getElementById('confirmBeforeDelete').checked;
            s.defaultMethod = document.getElementById('defaultMethod').value;
            s.requestTimeout = parseInt(document.getElementById('requestTimeout').value, 10) || 30;
            s.editorFontSize = parseInt(document.getElementById('editorFontSize').value, 10) || 13;
            s.toastDuration = parseInt(document.getElementById('toastDuration').value, 10) || 2000;
            s.maxHistoryDepth = parseInt(document.getElementById('maxHistoryDepth').value, 10) || 20;

            // AI Provider settings
            s.aiProvider = document.getElementById('aiProvider').value;
            s.aiApiKey = _aiKeyValue;
            s.aiBaseUrl = document.getElementById('aiBaseUrl').value;
            s.aiModel = document.getElementById('aiModel').value;

            s.saveSettings();
            this.applySettingsToUI();

            // Push AI config to main process
            if (window.electronAPI && window.electronAPI.aiUpdateConfig) {
                window.electronAPI.aiUpdateConfig({
                    chatApiKey: s.aiApiKey,
                    aiBaseUrl: s.aiBaseUrl,
                    aiModel: s.aiModel
                }).catch(err => console.error('Failed to update AI config:', err));
            }

            this.showToast('Settings saved');
            closeSettings();
        });
    }

    // Apply settings to UI elements
    applySettingsToUI() {
        // Font size for textareas
        const size = this.state.editorFontSize + 'px';
        document.querySelectorAll('textarea').forEach(ta => {
            ta.style.fontSize = size;
        });
        // Theme
        this.applyTheme(this.state.darkMode ? 'dark' : 'light');
    }

    // Theme Management
    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.state.darkMode = (theme === 'dark');
    }

    // Toast Notification
    showToast(message, duration, type = 'info') {
        if (duration === undefined) duration = (this.state && this.state.toastDuration) || 2000;
        // Rate limiting: max 5 visible toasts, queue the rest
        if (!this._toastQueue) this._toastQueue = [];
        const MAX_VISIBLE = 5;
        const visible = document.querySelectorAll('.toast.toast-visible');
        if (visible.length >= MAX_VISIBLE) {
            this._toastQueue.push({ message, duration, type });
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

        const msgSpan = document.createElement('span');
        msgSpan.className = 'toast-message';
        msgSpan.textContent = message;
        toast.appendChild(msgSpan);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.setAttribute('aria-label', 'Dismiss');
        toast.appendChild(closeBtn);

        document.body.appendChild(toast);

        // Dynamic stacking: compute offset from actual toast heights
        this._repositionToasts();

        const dismissToast = () => {
            if (toast._dismissed) return;
            toast._dismissed = true;
            clearTimeout(timer);
            toast.classList.remove('toast-visible');
            setTimeout(() => {
                toast.remove();
                this._repositionToasts();
                this._drainToastQueue();
            }, 300);
        };

        closeBtn.addEventListener('click', dismissToast);

        requestAnimationFrame(() => {
            toast.classList.add('toast-visible');
        });

        const timer = setTimeout(dismissToast, duration);
    }

    _repositionToasts() {
        const toasts = document.querySelectorAll('.toast');
        let bottom = 60;
        toasts.forEach(t => {
            t.style.bottom = `${bottom}px`;
            bottom += t.offsetHeight + 8;
        });
    }

    _drainToastQueue() {
        if (!this._toastQueue || this._toastQueue.length === 0) return;
        const visible = document.querySelectorAll('.toast.toast-visible');
        if (visible.length < 5) {
            const next = this._toastQueue.shift();
            this.showToast(next.message, next.duration, next.type);
        }
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
                    { label: 'Copy as cURL', action: () => this.copyRequestAsCurl(request) },
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
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Context menu');

        items.forEach(item => {
            if (item.divider) {
                const div = document.createElement('div');
                div.className = 'context-menu-divider';
                div.setAttribute('role', 'separator');
                menu.appendChild(div);
                return;
            }
            const el = document.createElement('div');
            el.className = 'context-menu-item' + (item.danger ? ' danger' : '');
            el.textContent = item.label;
            el.setAttribute('role', 'menuitem');
            el.setAttribute('tabindex', '-1');
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
            if (e.key === 'Escape') { closeHandler(); return; }
            // Arrow key navigation within context menu
            const menuItems = Array.from(menu.querySelectorAll('[role="menuitem"]'));
            if (menuItems.length === 0) return;
            const currentIdx = menuItems.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = currentIdx < menuItems.length - 1 ? currentIdx + 1 : 0;
                menuItems[next].focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = currentIdx > 0 ? currentIdx - 1 : menuItems.length - 1;
                menuItems[prev].focus();
            } else if (e.key === 'Enter' && currentIdx >= 0) {
                e.preventDefault();
                menuItems[currentIdx].click();
            }
        };
        setTimeout(() => {
            document.addEventListener('click', closeHandler);
            document.addEventListener('keydown', escHandler);
            // Focus first menu item
            const firstItem = menu.querySelector('[role="menuitem"]');
            if (firstItem) firstItem.focus();
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
        DialogSystem.showDangerConfirm(`Delete collection "${collection.name}" and all its contents?`, 'Delete', (confirmed) => {
            if (!confirmed) return;
            this.state.removeCollection(collection);
            this.state.markAsChanged();
            this.updateCollectionTree();
            this.state.updateStatusBar();
            this.updateTabContent('request');
        });
    }

    deleteRequestDirect(request) {
        DialogSystem.showDangerConfirm(`Delete "${request.name}"?`, 'Delete', (confirmed) => {
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

    copyRequestAsCurl(request) {
        const req = request || this.state.currentRequest;
        if (!req) {
            this.showToast('No request selected');
            return;
        }
        try {
            const curl = FormatParser.toCurl(req);
            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                navigator.clipboard.writeText(curl).then(() => {
                    this.showToast('cURL command copied to clipboard', 2000, 'success');
                }).catch(() => {
                    this._showCurlFallback(curl);
                });
            } else {
                this._showCurlFallback(curl);
            }
        } catch (err) {
            console.error('Failed to generate cURL:', err);
            this.showToast('Failed to generate cURL command');
        }
    }

    _showCurlFallback(curl) {
        // Fallback: show in a prompt dialog so user can copy
        DialogSystem.showPrompt('cURL command (select all & copy):', curl, () => {});
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
        DialogSystem.showDangerConfirm(`Delete folder "${folder.name}" and all its contents?`, 'Delete', (confirmed) => {
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
                    <button class="settings-close-btn" id="closeEnvMgrBtn" aria-label="Close environment manager">&times;</button>
                </div>
                <div class="env-list">
                    ${this.state.environments.map(env => `
                        <div class="env-list-item ${env.name === editingEnvName ? 'active' : ''}" data-env="${env.name}">
                            <span>${env.name}</span>
                            <button class="env-var-remove" data-delete-env="${env.name}" aria-label="Delete environment ${env.name}">&times;</button>
                        </div>
                    `).join('')}
                    <button id="addEnvBtn" style="margin-top:8px; font-size:12px; padding:6px 12px;">+ Add Environment</button>
                    <button id="importEnvBtn" style="margin-top:4px; font-size:12px; padding:6px 12px;">Import from Postman</button>
                    <button id="exportCurrentEnvBtn" style="margin-top:4px; font-size:12px; padding:6px 12px;">Export Current</button>
                    <button id="exportAllEnvBtn" style="margin-top:4px; font-size:12px; padding:6px 12px;">Export All</button>
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

            const exportCurrentEnvBtn = panel.querySelector('#exportCurrentEnvBtn');
            if (exportCurrentEnvBtn) {
                exportCurrentEnvBtn.addEventListener('click', () => {
                    if (editingEnvName) {
                        this.exportEnvironment(editingEnvName);
                    } else {
                        this.showToast('Select an environment to export');
                    }
                });
            }

            const exportAllEnvBtn = panel.querySelector('#exportAllEnvBtn');
            if (exportAllEnvBtn) {
                exportAllEnvBtn.addEventListener('click', () => {
                    this.exportAllEnvironments();
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

            // Detect format: multi-env bundle
            if (data._type === 'postman_helper_environments' && data.environments) {
                return this.importMultipleEnvironments(data.environments);
            }

            // Single Postman environment: must have values array
            if (!data.values || !Array.isArray(data.values)) {
                this.showToast('Invalid environment file: missing values array');
                return null;
            }

            const name = data.name || 'Imported Environment';

            // Convert Postman format: [{key, value, enabled}] → {key: value}
            const variables = {};
            for (const v of data.values) {
                if (v.key && v.enabled !== false) {
                    variables[v.key] = v.value || '';
                }
            }

            // Check for name conflict
            const existing = this.state.environments.find(e => e.name === name);
            if (existing) {
                return this.resolveEnvironmentConflict(name, variables, existing);
            }

            this.state.environments.push({ name, variables });
            this.updateEnvironmentSelector();
            this.triggerAutoSave();
            this.showToast(`Environment "${name}" imported (${Object.keys(variables).length} variables)`);
            return name;
        } catch (err) {
            console.error('Environment import error:', err);
            this.showToast('Failed to import environment file');
            return null;
        }
    }

    resolveEnvironmentConflict(name, newVars, existingEnv) {
        return new Promise((resolve) => {
            const message = `Environment "${name}" already exists.\n\nOK = Merge variables (existing values kept on conflict)\nCancel = Import as new with different name`;
            DialogSystem.showConfirm(message, (merge) => {
                if (merge) {
                    // Merge: new vars added, existing vars NOT overwritten
                    Object.entries(newVars).forEach(([key, value]) => {
                        if (!(key in existingEnv.variables)) {
                            existingEnv.variables[key] = value;
                        }
                    });
                    this.showToast(`Merged into "${name}"`);
                } else {
                    // Rename and add as new
                    let counter = 2;
                    let newName = `${name} (${counter})`;
                    while (this.state.environments.some(e => e.name === newName)) {
                        counter++;
                        newName = `${name} (${counter})`;
                    }
                    this.state.environments.push({ name: newName, variables: newVars });
                    this.showToast(`Imported as "${newName}"`);
                }
                this.updateEnvironmentSelector();
                this.triggerAutoSave();
                resolve(name);
            });
        });
    }

    async importMultipleEnvironments(envArray) {
        let imported = 0;
        for (const envData of envArray) {
            const name = envData.name || `Environment ${imported + 1}`;
            const variables = {};
            if (envData.values) {
                envData.values.forEach(v => {
                    if (v.key && v.enabled !== false) { variables[v.key] = v.value || ''; }
                });
            } else if (envData.variables) {
                Object.assign(variables, envData.variables);
            }

            const existing = this.state.environments.find(e => e.name === name);
            if (existing) {
                // Auto-merge for bulk import
                Object.entries(variables).forEach(([key, value]) => {
                    if (!(key in existing.variables)) { existing.variables[key] = value; }
                });
            } else {
                this.state.environments.push({ name, variables });
            }
            imported++;
        }

        this.updateEnvironmentSelector();
        this.triggerAutoSave();
        this.showToast(`Imported ${imported} environment(s)`);
        return this.state.environments.length > 0 ? this.state.environments[this.state.environments.length - 1].name : null;
    }

    async exportEnvironment(envName) {
        const env = envName
            ? this.state.environments.find(e => e.name === envName)
            : this.state.environments.find(e => e.name === this.state.activeEnvironment);

        if (!env) {
            this.showToast('No environment selected to export');
            return;
        }

        const postmanEnv = {
            name: env.name,
            values: Object.entries(env.variables || {}).map(([key, value]) => ({
                key: key,
                value: String(value),
                type: 'default',
                enabled: true
            })),
            _postman_variable_scope: 'environment',
            _postman_exported_at: new Date().toISOString(),
            _postman_exported_using: 'PostmanHelper/1.98'
        };

        try {
            const content = JSON.stringify(postmanEnv, null, 2);
            const result = await window.electronAPI.saveFile({
                defaultPath: `${env.name}.postman_environment.json`,
                filters: [{ name: 'JSON Files', extensions: ['json'] }],
                content: content
            });

            if (result.success) {
                this.showToast(`Environment "${env.name}" exported to ${result.path}`);
            }
        } catch (error) {
            console.error('Environment export error:', error);
            this.showToast('Error exporting environment');
        }
    }

    async exportAllEnvironments() {
        if (this.state.environments.length === 0) {
            this.showToast('No environments to export');
            return;
        }

        const exportData = {
            _type: 'postman_helper_environments',
            _version: 1,
            environments: this.state.environments.map(env => ({
                name: env.name,
                values: Object.entries(env.variables || {}).map(([key, value]) => ({
                    key, value: String(value), type: 'default', enabled: true
                }))
            }))
        };

        try {
            const content = JSON.stringify(exportData, null, 2);
            const result = await window.electronAPI.saveFile({
                defaultPath: 'environments.json',
                filters: [{ name: 'JSON Files', extensions: ['json'] }],
                content: content
            });

            if (result.success) {
                this.showToast(`${this.state.environments.length} environment(s) exported`);
            }
        } catch (error) {
            console.error('Environment export error:', error);
            this.showToast('Error exporting environments');
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

        // Warn about unresolved environment variables
        const hasUnresolved = (s) => s && /\{\{\w+\}\}/.test(s);
        if (hasUnresolved(url) || hasUnresolved(body) || Object.values(headers).some(v => hasUnresolved(v))) {
            this.showToast('Warning: Request contains unresolved environment variables');
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
            const startTime = Date.now();
            const result = await window.electronAPI.sendRequest({
                method: form.method,
                url: url,
                headers: headers,
                body: body,
                timeout: (this.state.requestTimeout || 30) * 1000
            });
            const elapsed = result.time || (Date.now() - startTime);
            this.displayResponse(result);
            this.analytics.track('request_sent', {
                method: form.method,
                url: url,
                statusCode: result.status,
                responseTime: elapsed
            });
        } catch (error) {
            this.displayResponse({ success: false, error: error.message || 'Request failed' });
            this.analytics.track('error', { message: error.message, context: 'sendRequest' });
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
                    <span class="response-time">${this.escapeHtml(response.error || 'Unknown error')}</span>
                    <span style="flex:1"></span>
                    <button class="response-close-btn" title="Dismiss" aria-label="Dismiss response">&times;</button>
                </div>`;
            panel.querySelector('.response-close-btn').addEventListener('click', () => panel.remove());
            return;
        }

        const statusClass = response.status < 300 ? 'status-2xx' :
                            response.status < 400 ? 'status-3xx' :
                            response.status < 500 ? 'status-4xx' : 'status-5xx';
        const statusDesc = this.getStatusDescription(response.status);

        // Try to pretty-print JSON
        let bodyDisplay = response.body || '';
        let rawBody = response.body || '';
        let isJson = false;
        let parsedJson = null;
        try {
            parsedJson = JSON.parse(bodyDisplay);
            bodyDisplay = JSON.stringify(parsedJson, null, 2);
            isJson = true;
        } catch (_) {}

        const sizeStr = response.body ? this.formatBytes(new Blob([response.body]).size) : '0 B';
        const headerCount = response.headers ? Object.keys(response.headers).length : 0;

        // Build response headers HTML with copy buttons
        let headersHtml = '';
        if (response.headers && typeof response.headers === 'object') {
            for (const [k, v] of Object.entries(response.headers)) {
                headersHtml += `<div class="header-entry"><span class="header-key">${this.escapeHtml(k)}</span><span class="header-val">${this.escapeHtml(String(v))}</span><button class="header-copy-btn" data-copy="${this.escapeHtml(k + ': ' + v)}" title="Copy header">&boxbox;</button></div>`;
            }
        }

        // Test results tab content
        let testResultsHtml = '';
        if (response.testResults && response.testResults.length > 0) {
            testResultsHtml = response.testResults.map(r =>
                `<div class="test-result-entry ${r.passed ? 'test-pass' : 'test-fail'}"><span class="test-result-icon">${r.passed ? '\u2713' : '\u2717'}</span><span>${this.escapeHtml(r.name)}</span></div>`
            ).join('');
        }

        const bodyHtml = isJson ? this.highlightJson(bodyDisplay) : `<pre>${this.escapeHtml(bodyDisplay)}</pre>`;

        panel.innerHTML = `
            <div class="response-header">
                <span class="response-status ${statusClass}">${response.status} ${statusDesc}</span>
                <span class="response-time">${response.time}ms</span>
                <span class="response-size">${sizeStr}</span>
                <span style="flex:1"></span>
                <button class="response-action-btn" id="copyResponseBtn" title="Copy body">Copy</button>
                <button class="response-action-btn" id="saveResponseBtn" title="Save to file">Save</button>
                <button class="response-close-btn" title="Dismiss" aria-label="Dismiss response">&times;</button>
            </div>
            <div class="response-tabs">
                <div class="response-tab active" data-rtab="body">Body</div>
                <div class="response-tab" data-rtab="headers">Headers (${headerCount})</div>
                ${testResultsHtml ? '<div class="response-tab" data-rtab="tests">Tests</div>' : ''}
            </div>
            <div class="response-toolbar">
                <label class="response-toggle" title="Toggle raw/pretty"><input type="checkbox" id="prettyPrintToggle" ${isJson ? 'checked' : ''} ${isJson ? '' : 'disabled'}><span>Pretty</span></label>
            </div>
            <div id="responseBodyPane" class="response-body">${bodyHtml}</div>
            <div id="responseHeadersPane" class="response-headers-list" style="display:none;">${headersHtml}</div>
            ${testResultsHtml ? `<div id="responseTestsPane" class="response-tests-list" style="display:none;">${testResultsHtml}</div>` : ''}
        `;

        requestTab.appendChild(panel);

        // Close button
        panel.querySelector('.response-close-btn').addEventListener('click', () => panel.remove());

        // Copy body button
        const copyBtn = document.getElementById('copyResponseBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const text = isJson && document.getElementById('prettyPrintToggle').checked ? bodyDisplay : rawBody;
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(text).then(() => this.showToast('Response copied', 1500, 'success'));
                }
            });
        }

        // Save to file button
        const saveBtn = document.getElementById('saveResponseBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                if (window.electronAPI && window.electronAPI.saveFile) {
                    const ext = isJson ? 'json' : 'txt';
                    const content = isJson && document.getElementById('prettyPrintToggle').checked ? bodyDisplay : rawBody;
                    try {
                        const result = await window.electronAPI.saveFile({
                            defaultPath: `response.${ext}`,
                            filters: [{ name: `${ext.toUpperCase()} Files`, extensions: [ext] }],
                            content: content
                        });
                        if (result.success) {
                            this.showToast(`Response saved to ${result.path}`, 2000, 'success');
                        }
                    } catch (_) {
                        this.showToast('Failed to save response', 2000, 'error');
                    }
                }
            });
        }

        // Pretty-print toggle
        const prettyToggle = document.getElementById('prettyPrintToggle');
        if (prettyToggle && isJson) {
            prettyToggle.addEventListener('change', () => {
                const bodyPane = document.getElementById('responseBodyPane');
                if (prettyToggle.checked) {
                    bodyPane.innerHTML = this.highlightJson(bodyDisplay);
                } else {
                    bodyPane.innerHTML = `<pre>${this.escapeHtml(rawBody)}</pre>`;
                }
            });
        }

        // Copy individual header buttons
        panel.querySelectorAll('.header-copy-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const text = btn.dataset.copy;
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(text).then(() => this.showToast('Header copied', 1500, 'success'));
                }
            });
        });

        // Tab switching
        const panes = ['responseBodyPane', 'responseHeadersPane', 'responseTestsPane'];
        const toolbar = panel.querySelector('.response-toolbar');
        panel.querySelectorAll('.response-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                panel.querySelectorAll('.response-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.rtab;
                panes.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
                if (target === 'body') {
                    document.getElementById('responseBodyPane').style.display = 'block';
                    if (toolbar) toolbar.style.display = 'flex';
                } else if (target === 'headers') {
                    document.getElementById('responseHeadersPane').style.display = 'block';
                    if (toolbar) toolbar.style.display = 'none';
                } else if (target === 'tests') {
                    const testsPane = document.getElementById('responseTestsPane');
                    if (testsPane) testsPane.style.display = 'block';
                    if (toolbar) toolbar.style.display = 'none';
                }
            });
        });
    }

    getStatusDescription(code) {
        const descriptions = {
            200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
            301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
            400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
            405: 'Method Not Allowed', 408: 'Request Timeout', 409: 'Conflict',
            422: 'Unprocessable Entity', 429: 'Too Many Requests',
            500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout'
        };
        return descriptions[code] || '';
    }

    highlightJson(jsonStr) {
        // CSS-based JSON syntax highlighting (no dependencies)
        const escaped = this.escapeHtml(jsonStr);
        const highlighted = escaped
            .replace(/"([^"\\]*(\\.[^"\\]*)*)"\s*:/g, '<span class="json-key">"$1"</span>:')
            .replace(/:\s*"([^"\\]*(\\.[^"\\]*)*)"/g, ': <span class="json-string">"$1"</span>')
            .replace(/:\s*(-?\d+\.?\d*([eE][+-]?\d+)?)/g, ': <span class="json-number">$1</span>')
            .replace(/:\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
            .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>');
        return `<pre class="json-highlighted">${highlighted}</pre>`;
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

    // ===== Version History UI =====

    showHistory() {
        const req = this.state.currentRequest;
        if (!req) {
            this.showToast('No request selected');
            return;
        }
        if (!req._history || req._history.length === 0) {
            this.showToast('No history for this request. Save a request to start tracking changes.');
            return;
        }

        const panel = document.getElementById('historyPanel');
        const list = document.getElementById('historyList');
        const diffContainer = document.getElementById('historyDiff');
        panel.style.display = 'block';

        // Render history list
        list.innerHTML = req._history.map((snapshot, i) => {
            const date = new Date(snapshot.timestamp);
            const timeStr = date.toLocaleString();
            const versionNum = req._history.length - i;
            return `<div class="history-item" data-index="${i}">
                <div>
                    <span class="version-label">v${versionNum}</span>
                    <span class="version-time">${this.escapeHtml(timeStr)}</span>
                </div>
                <button class="restore-btn" data-restore-index="${i}" title="Restore this version">Restore</button>
            </div>`;
        }).join('');

        // Clear diff area
        diffContainer.innerHTML = '<div class="diff-no-changes">Select a version to compare with current</div>';

        // Click handler: show diff between selected version and current state
        list.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('restore-btn')) return;
                const idx = parseInt(item.dataset.index);
                this.showDiff(req, idx);
                list.querySelectorAll('.history-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
            });
        });

        // Restore button handlers
        list.querySelectorAll('.restore-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.restoreIndex);
                this.restoreVersion(idx);
            });
        });

        // Close button
        document.getElementById('closeHistoryBtn').onclick = () => {
            panel.style.display = 'none';
        };
    }

    showDiff(request, historyIndex) {
        const snapshot = request._history[historyIndex];
        if (!snapshot) return;

        const current = {
            method: request.method || 'GET',
            url: request.url || '',
            headers: request.headers || {},
            body: request.body || '',
            tests: request.tests || '',
            description: request.description || ''
        };

        const diff = DiffUtil.diffRequest(snapshot, current);
        const diffContainer = document.getElementById('historyDiff');

        let html = '<div class="diff-section"><div class="diff-section-title">Changes: Version &rarr; Current</div>';

        // Check if anything changed at all
        const anyChanged = diff.method.changed || diff.url.changed || diff.headers.changed
            || diff.body.changed || diff.tests.changed || diff.description.changed;

        if (!anyChanged) {
            html += '<div class="diff-no-changes">No differences found</div>';
        } else {
            // Method
            if (diff.method.changed) {
                html += '<div class="diff-section-title">Method</div>';
                html += `<div class="diff-field-change diff-field-old">- ${this.escapeHtml(diff.method.old)}</div>`;
                html += `<div class="diff-field-change diff-field-new">+ ${this.escapeHtml(diff.method.new)}</div>`;
            }
            // URL
            if (diff.url.changed) {
                html += '<div class="diff-section-title">URL</div>';
                html += `<div class="diff-field-change diff-field-old">- ${this.escapeHtml(diff.url.old)}</div>`;
                html += `<div class="diff-field-change diff-field-new">+ ${this.escapeHtml(diff.url.new)}</div>`;
            }
            // Description
            if (diff.description.changed) {
                html += '<div class="diff-section-title">Description</div>';
                html += `<div class="diff-field-change diff-field-old">- ${this.escapeHtml(diff.description.old || '(empty)')}</div>`;
                html += `<div class="diff-field-change diff-field-new">+ ${this.escapeHtml(diff.description.new || '(empty)')}</div>`;
            }
            // Headers
            if (diff.headers.changed) {
                html += '<div class="diff-section-title">Headers</div>';
                const headerDiff = DiffUtil.diffLines(diff.headers.old, diff.headers.new);
                html += this.renderLineDiff(headerDiff);
            }
            // Body
            if (diff.body.changed) {
                html += '<div class="diff-section-title">Body</div>';
                html += this.renderLineDiff(diff.body.diff);
            }
            // Tests
            if (diff.tests.changed) {
                html += '<div class="diff-section-title">Tests</div>';
                html += this.renderLineDiff(diff.tests.diff);
            }
        }

        html += '</div>';
        diffContainer.innerHTML = html;
    }

    renderLineDiff(diffLines) {
        if (!diffLines || diffLines.length === 0) return '';
        return diffLines.map(d => {
            const cls = d.type === 'added' ? 'diff-added'
                : d.type === 'removed' ? 'diff-removed'
                : 'diff-same';
            return `<div class="diff-line ${cls}">${this.escapeHtml(d.line || '')}</div>`;
        }).join('');
    }

    restoreVersion(historyIndex) {
        const req = this.state.currentRequest;
        if (!req) return;

        DialogSystem.showConfirm(
            'Restore this version? Current state will be saved to history first.',
            (confirmed) => {
                if (confirmed) {
                    const success = req.restoreVersion(historyIndex);
                    if (success) {
                        this.updateTabContent();
                        this.switchTab('request');
                        this.state.markAsChanged();
                        this.showToast('Version restored');
                        // Refresh history panel
                        this.showHistory();
                    } else {
                        this.showToast('Failed to restore version');
                    }
                }
            }
        );
    }

    closeHistory() {
        const panel = document.getElementById('historyPanel');
        if (panel) panel.style.display = 'none';
    }

    // ===== Version History Persistence Helpers =====

    collectRequestHistory() {
        const history = {};
        const traverse = (requests, prefix) => {
            for (const req of requests) {
                if (req._history && req._history.length > 0) {
                    history[`${prefix}:${req.name}`] = req._history;
                }
            }
        };
        const traverseFolders = (folders, prefix) => {
            for (const folder of folders) {
                traverse(folder.requests || [], `${prefix}/f:${folder.name}`);
                traverseFolders(folder.folders || [], `${prefix}/f:${folder.name}`);
            }
        };
        this.state.collections.forEach((col, ci) => {
            traverse(col.requests || [], `c${ci}`);
            traverseFolders(col.folders || [], `c${ci}`);
        });
        return history;
    }

    restoreRequestHistory(historyMap) {
        if (!historyMap || typeof historyMap !== 'object') return;
        const traverse = (requests, prefix) => {
            for (const req of requests) {
                const key = `${prefix}:${req.name}`;
                if (historyMap[key]) {
                    req._history = historyMap[key];
                    if (!req._maxHistoryDepth) req._maxHistoryDepth = 20;
                }
            }
        };
        const traverseFolders = (folders, prefix) => {
            for (const folder of folders) {
                traverse(folder.requests || [], `${prefix}/f:${folder.name}`);
                traverseFolders(folder.folders || [], `${prefix}/f:${folder.name}`);
            }
        };
        this.state.collections.forEach((col, ci) => {
            traverse(col.requests || [], `c${ci}`);
            traverseFolders(col.folders || [], `c${ci}`);
        });
    }

    // ===== Feature 5: Analytics Dashboard =====

    showAnalytics() {
        const panel = document.getElementById('analyticsPanel');
        if (!panel) return;
        panel.style.display = 'block';
        this.renderAnalytics();

        // Wire up panel buttons
        document.getElementById('closeAnalyticsBtn').onclick = () => {
            panel.style.display = 'none';
        };
        document.getElementById('exportAnalyticsBtn').onclick = () => this.exportAnalytics();
        document.getElementById('clearAnalyticsBtn').onclick = () => {
            DialogSystem.showConfirm('Clear all analytics data? This cannot be undone.', (confirmed) => {
                if (confirmed) {
                    this.analytics.reset();
                    this.renderAnalytics();
                    this.triggerAutoSave();
                    this.showToast('Analytics data cleared');
                }
            });
        };
    }

    renderAnalytics() {
        const a = this.analytics;

        // Summary cards
        const setEl = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        setEl('statRequestsSent', a.stats.requestsSent);
        setEl('statAvgResponse', a.getAverageResponseTime() + 'ms');
        setEl('statSuccessRate', a.getSuccessRate() + '%');
        setEl('statCollections', a.stats.collectionsCreated);

        // Method breakdown chart
        this._renderBarChart('methodChart', 'HTTP Methods', a.stats.methodBreakdown, {
            GET: '#61affe', POST: '#49cc90', PUT: '#fca130',
            DELETE: '#f93e3e', PATCH: '#50e3c2', HEAD: '#9012fe', OPTIONS: '#888'
        });

        // Status code chart
        const statusColors = {};
        for (const code of Object.keys(a.stats.statusCodeBreakdown)) {
            if (code.startsWith('2')) statusColors[code] = '#49cc90';
            else if (code.startsWith('3')) statusColors[code] = '#61affe';
            else if (code.startsWith('4')) statusColors[code] = '#fca130';
            else if (code.startsWith('5')) statusColors[code] = '#f93e3e';
            else statusColors[code] = '#888';
        }
        this._renderBarChart('statusChart', 'Status Codes', a.stats.statusCodeBreakdown, statusColors);

        // Top endpoints table
        this._renderEndpointsTable('endpointsChart', a.getTopEndpoints(10));

        // Activity chart (last 30 days)
        this._renderActivityChart('activityChart', a.getRecentActivity(30));
    }

    _renderBarChart(containerId, title, data, colors) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
        const max = Math.max(...entries.map(e => e[1]), 1);

        let html = `<h3>${title}</h3>`;
        if (entries.length === 0) {
            html += '<div class="activity-empty">No data yet</div>';
        } else {
            html += '<div class="bar-chart">';
            for (const [label, count] of entries) {
                const pct = (count / max) * 100;
                const color = (colors && colors[label]) || 'var(--accent)';
                html += `<div class="bar-row">
                    <span class="bar-label">${label}</span>
                    <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
                    <span class="bar-value">${count}</span>
                </div>`;
            }
            html += '</div>';
        }
        container.innerHTML = html;
    }

    _renderEndpointsTable(containerId, topEndpoints) {
        const container = document.getElementById(containerId);
        if (!container) return;
        let html = '<h3>Top Endpoints</h3>';
        if (topEndpoints.length === 0) {
            html += '<div class="activity-empty">No data yet</div>';
        } else {
            html += '<table class="endpoints-table">';
            for (const [endpoint, count] of topEndpoints) {
                html += `<tr><td>${endpoint}</td><td>${count}</td></tr>`;
            }
            html += '</table>';
        }
        container.innerHTML = html;
    }

    _renderActivityChart(containerId, activity) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const max = Math.max(...activity.map(d => d.requests), 1);
        const hasData = activity.some(d => d.requests > 0);

        let html = '<h3>Daily Activity (Last 30 Days)</h3>';
        if (!hasData) {
            html += '<div class="activity-empty">No data yet</div>';
        } else {
            html += '<div class="activity-chart">';
            for (const day of activity) {
                const height = Math.max((day.requests / max) * 100, 2);
                html += `<div class="activity-bar" style="height:${height}%" title="${day.date}: ${day.requests} requests"></div>`;
            }
            html += '</div>';
        }
        container.innerHTML = html;
    }

    async exportAnalytics() {
        try {
            const content = JSON.stringify(this.analytics.toJSON(), null, 2);
            const result = await window.electronAPI.saveFile({
                defaultPath: 'postman-helper-analytics.json',
                filters: [{ name: 'JSON Files', extensions: ['json'] }],
                content: content
            });
            if (result.success) {
                this.showToast('Analytics exported', 2000, 'success');
            }
        } catch (err) {
            console.error('Export analytics failed:', err);
            this.showToast('Failed to export analytics');
        }
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
                requestHistory: this.collectRequestHistory(),
                expandedFolders: Array.from(this._expandedFolders).filter(id => !id.startsWith('_init_')),
                analytics: this.analytics.toJSON(),
                settings: {
                    darkMode: this.state.darkMode,
                    autoSave: this.state.autoSave,
                    autoFormat: this.state.autoFormat,
                    showLineNumbers: this.state.showLineNumbers,
                    inheritGlobally: this.state.inheritGlobally,
                    defaultMethod: this.state.defaultMethod,
                    requestTimeout: this.state.requestTimeout,
                    editorFontSize: this.state.editorFontSize,
                    maxHistoryDepth: this.state.maxHistoryDepth,
                    toastDuration: this.state.toastDuration,
                    confirmBeforeDelete: this.state.confirmBeforeDelete,
                    aiProvider: this.state.aiProvider,
                    aiApiKey: this.state.aiApiKey,
                    aiBaseUrl: this.state.aiBaseUrl,
                    aiModel: this.state.aiModel,
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
                const defaults = AppState.DEFAULT_SETTINGS;
                for (const key of Object.keys(defaults)) {
                    this.state[key] = data.settings[key] !== undefined ? data.settings[key] : defaults[key];
                }
                this.applyTheme(this.state.darkMode ? 'dark' : 'light');
                this.applySettingsToUI();
                if (data.settings.sidebarWidth) {
                    document.documentElement.style.setProperty('--sidebar-width', data.settings.sidebarWidth + 'px');
                }
                // Push restored AI config to main process
                if (this.state.aiApiKey && window.electronAPI && window.electronAPI.aiUpdateConfig) {
                    window.electronAPI.aiUpdateConfig({
                        chatApiKey: this.state.aiApiKey,
                        aiBaseUrl: this.state.aiBaseUrl,
                        aiModel: this.state.aiModel
                    }).catch(err => console.error('Failed to restore AI config:', err));
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

            // Restore version history for all requests
            if (data.requestHistory) {
                this.restoreRequestHistory(data.requestHistory);
            }

            // Restore analytics
            if (data.analytics) {
                this.analytics.fromJSON(data.analytics);
            }

            // Restore expanded folder state
            if (data.expandedFolders && Array.isArray(data.expandedFolders)) {
                this._expandedFolders = new Set(data.expandedFolders);
                // Mark collections as initialized so setupCollapsibleTree doesn't override
                for (const id of data.expandedFolders) {
                    if (id.startsWith('collection-')) {
                        this._expandedFolders.add('_init_' + id);
                    }
                }
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
        try {
            // Prevent duplicate sample collections
            if (this.state.collections.some(c => c.name === 'Sample API Collection')) {
                this.showToast('Sample collection already exists');
                return;
            }

            const collection = new Collection('Sample API Collection');
            collection.description = 'A sample collection demonstrating Postman Helper features';

            // --- Root Requests ---
            const getUsers = new Request(
                'Get Users', 'GET', 'https://api.example.com/v1/users',
                { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                '', 'Fetch all users from the API'
            );
            getUsers.tests = "tests['Status code is 200'] = responseCode.code === 200;\ntests['Response has data'] = responseBody.has('data');";

            const createUser = new Request(
                'Create User', 'POST', 'https://api.example.com/v1/users',
                { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                JSON.stringify({ name: 'John Doe', email: 'john@example.com', role: 'user' }, null, 2),
                'Create a new user account'
            );
            createUser.tests = "tests['Status code is 201'] = responseCode.code === 201;\ntests['User created'] = responseBody.has('id');";

            collection.addRequest(getUsers);
            collection.addRequest(createUser);

            // --- Auth Folder ---
            const authFolder = new Folder('Authentication');

            const loginReq = new Request(
                'Login', 'POST', 'https://api.example.com/v1/auth/login',
                { 'Content-Type': 'application/json' },
                JSON.stringify({ email: 'admin@example.com', password: 'password123' }, null, 2),
                'Authenticate and receive a JWT token'
            );
            loginReq.tests = "tests['Status code is 200'] = responseCode.code === 200;\ntests['Has token'] = responseBody.has('token');";

            const refreshReq = new Request(
                'Refresh Token', 'POST', 'https://api.example.com/v1/auth/refresh',
                { 'Content-Type': 'application/json', 'Authorization': 'Bearer {{refreshToken}}' },
                '', 'Refresh an expired JWT token'
            );

            authFolder.addRequest(loginReq);
            authFolder.addRequest(refreshReq);
            collection.addFolder(authFolder);

            // --- Users Folder ---
            const usersFolder = new Folder('User Management');

            const getUserById = new Request(
                'Get User by ID', 'GET', 'https://api.example.com/v1/users/{{userId}}',
                { 'Content-Type': 'application/json', 'Authorization': 'Bearer {{token}}' },
                '', 'Fetch a specific user by their ID'
            );

            const updateUser = new Request(
                'Update User', 'PUT', 'https://api.example.com/v1/users/{{userId}}',
                { 'Content-Type': 'application/json', 'Authorization': 'Bearer {{token}}' },
                JSON.stringify({ name: 'Jane Doe', role: 'admin' }, null, 2),
                'Update user details'
            );

            const deleteUser = new Request(
                'Delete User', 'DELETE', 'https://api.example.com/v1/users/{{userId}}',
                { 'Authorization': 'Bearer {{token}}' },
                '', 'Delete a user account'
            );
            deleteUser.tests = "tests['Status code is 204'] = responseCode.code === 204;";

            usersFolder.addRequest(getUserById);
            usersFolder.addRequest(updateUser);
            usersFolder.addRequest(deleteUser);
            collection.addFolder(usersFolder);

            // --- Inheritance Examples ---
            if (this.state.inheritanceManager) {
                const im = this.state.inheritanceManager;
                if (im.addGlobalHeader) {
                    im.addGlobalHeader('Content-Type', 'application/json');
                    im.addGlobalHeader('Accept', 'application/json');
                }
                if (im.addBaseEndpoint) {
                    im.addBaseEndpoint('default', 'https://api.example.com/v1');
                }
                if (im.addBodyTemplate) {
                    im.addBodyTemplate('Create User Template', JSON.stringify({
                        name: '', email: '', role: 'user'
                    }, null, 2));
                }
                if (im.addTestTemplate) {
                    im.addTestTemplate('Status 200 Check',
                        "tests['Status code is 200'] = responseCode.code === 200;");
                }
            }

            // --- Add to state ---
            this.state.addCollection(collection);
            this.updateCollectionTree();
            this.showToast('Sample collection loaded');

        } catch (error) {
            console.error('Failed to load sample data:', error);
            this.showToast('Failed to load sample data');
        }
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
