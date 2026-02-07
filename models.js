// Postman Helper Models - ES6 Module Version

class PostmanRequest {
    constructor(name, method, url, headers, body, description, events) {
        this.name = name || 'New Request';
        this.method = method || 'GET';
        this.url = url || '';
        this.headers = headers || [];
        this.body = body || '';
        this.description = description || '';
        this.events = events || { prerequest: '', test: '' };
        this.uuid = this.generateUUID();
    }
    
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    toJSON() {
        return {
            name: this.name,
            method: this.method,
            url: this.url,
            headers: this.headers,
            body: this.body,
            description: this.description,
            events: this.events,
            uuid: this.uuid
        };
    }
    
    static fromJSON(data) {
        const request = new PostmanRequest(
            data.name,
            data.method,
            data.url,
            data.headers,
            data.body,
            data.description,
            data.events
        );
        request.uuid = data.uuid || request.uuid;
        if (data.tests) request.tests = data.tests;
        return request;
    }

    toPostmanJSON() {
        const item = {
            name: this.name,
            request: {
                method: this.method || 'GET',
                header: [],
                url: {
                    raw: this.url || '',
                    protocol: '',
                    host: [],
                    path: []
                }
            },
            response: []
        };
        // Convert headers
        if (this.headers && typeof this.headers === 'object' && !Array.isArray(this.headers)) {
            for (const [key, value] of Object.entries(this.headers)) {
                item.request.header.push({ key, value, type: 'text' });
            }
        } else if (Array.isArray(this.headers)) {
            this.headers.forEach(h => {
                if (h.key) item.request.header.push({ key: h.key, value: h.value || '', type: 'text' });
            });
        }
        // Add body
        if (this.body) {
            item.request.body = {
                mode: 'raw',
                raw: this.body,
                options: { raw: { language: 'json' } }
            };
        }
        if (this.description) {
            item.request.description = this.description;
        }
        // Add events
        const events = [];
        if (this.tests) {
            events.push({
                listen: 'test',
                script: { type: 'text/javascript', exec: this.tests.split('\n') }
            });
        }
        if (this.events && this.events.prerequest) {
            events.push({
                listen: 'prerequest',
                script: { type: 'text/javascript', exec: this.events.prerequest.split('\n') }
            });
        }
        if (events.length > 0) item.event = events;
        return item;
    }
}

class Collection {
    constructor(name) {
        this.name = name || 'New Collection';
        this.folders = [];
        this.requests = [];
        this.uuid = this.generateUUID();
    }
    
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    addFolder(folder) {
        this.folders.push(folder);
    }
    
    addRequest(request) {
        this.requests.push(request);
    }
    
    toJSON() {
        return {
            name: this.name,
            folders: this.folders.map(f => f.toJSON()),
            requests: this.requests.map(r => r.toJSON()),
            uuid: this.uuid
        };
    }
    
    static fromJSON(data) {
        const collection = new Collection(data.name);
        collection.uuid = data.uuid || collection.uuid;
        
        if (data.folders) {
            collection.folders = data.folders.map(f => Folder.fromJSON(f));
        }
        
        if (data.requests) {
            collection.requests = data.requests.map(r => PostmanRequest.fromJSON(r));
        }
        
        return collection;
    }

    importFromJSON(data) {
        let dataObj = data;
        if (typeof data === 'string') {
            dataObj = JSON.parse(data);
        }

        // Handle Postman Collection v2.1 format
        if (dataObj.info) {
            this.name = dataObj.info.name || this.name;
            if (dataObj.item) {
                this.processPostmanItems(dataObj.item);
            }
            return this;
        }

        // Simple format
        const imported = Collection.fromJSON(dataObj);
        Object.assign(this, imported);
        return this;
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
        const req = new PostmanRequest(
            item.name || 'Unnamed Request',
            (item.request.method || 'GET').toUpperCase(),
            urlRaw,
            headers,
            bodyStr,
            item.request.description || ''
        );
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

    toPostmanJSON() {
        const requestToPostmanItem = (req) => {
            if (typeof req.toPostmanJSON === 'function') return req.toPostmanJSON();
            return {
                name: req.name,
                request: {
                    method: req.method || 'GET',
                    header: [],
                    url: { raw: req.url || '', protocol: '', host: [], path: [] }
                },
                response: []
            };
        };

        const folderToPostmanItem = (folder) => {
            const item = { name: folder.name, item: [] };
            if (folder.requests) {
                folder.requests.forEach(req => item.item.push(requestToPostmanItem(req)));
            }
            if (folder.folders) {
                folder.folders.forEach(sub => item.item.push(folderToPostmanItem(sub)));
            }
            return item;
        };

        const postmanCollection = {
            info: {
                name: this.name,
                description: '',
                schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
            },
            item: []
        };

        this.requests.forEach(req => postmanCollection.item.push(requestToPostmanItem(req)));
        this.folders.forEach(folder => postmanCollection.item.push(folderToPostmanItem(folder)));

        return postmanCollection;
    }
}

class Folder {
    constructor(name) {
        this.name = name || 'New Folder';
        this.requests = [];
        this.folders = [];
        this.uuid = this.generateUUID();
    }
    
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    addRequest(request) {
        this.requests.push(request);
    }
    
    addFolder(folder) {
        this.folders.push(folder);
    }
    
    toJSON() {
        return {
            name: this.name,
            requests: this.requests.map(r => r.toJSON()),
            folders: this.folders.map(f => f.toJSON()),
            uuid: this.uuid
        };
    }
    
    static fromJSON(data) {
        const folder = new Folder(data.name);
        folder.uuid = data.uuid || folder.uuid;
        
        if (data.requests) {
            folder.requests = data.requests.map(r => PostmanRequest.fromJSON(r));
        }
        
        if (data.folders) {
            folder.folders = data.folders.map(f => Folder.fromJSON(f));
        }
        
        return folder;
    }
}

class InheritanceManager {
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

    addGlobalHeader(header) {
        this.globalHeaders.push(header);
    }

    addBaseEndpoint(endpoint) {
        this.baseEndpoints.push(endpoint);
    }

    addBodyTemplate(template) {
        this.bodyTemplates.push(template);
    }

    addTestTemplate(template) {
        this.testTemplates.push(template);
    }

    removeGlobalHeader(index) {
        if (index >= 0 && index < this.globalHeaders.length) {
            this.globalHeaders.splice(index, 1);
        }
    }

    removeBaseEndpoint(index) {
        if (index >= 0 && index < this.baseEndpoints.length) {
            this.baseEndpoints.splice(index, 1);
        }
    }

    removeBodyTemplate(index) {
        if (index >= 0 && index < this.bodyTemplates.length) {
            this.bodyTemplates.splice(index, 1);
        }
    }

    removeTestTemplate(index) {
        if (index >= 0 && index < this.testTemplates.length) {
            this.testTemplates.splice(index, 1);
        }
    }

    addRule(target, source, properties) {
        this.rules.push({ target, source, properties });
    }

    getRules() { return this.rules; }

    applyInheritance(request) {
        const appliedHeaders = [...this.globalHeaders];

        if (request.headers) {
            if (Array.isArray(request.headers)) {
                appliedHeaders.push(...request.headers);
            }
        }

        return {
            ...request,
            headers: appliedHeaders
        };
    }

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
        const manager = new InheritanceManager();
        manager.globalHeaders = data.globalHeaders || [];
        manager.baseEndpoints = data.baseEndpoints || [];
        manager.bodyTemplates = data.bodyTemplates || [];
        manager.testTemplates = data.testTemplates || [];
        manager.rules = data.rules || [];
        return manager;
    }
}

// Export all models
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PostmanRequest,
        Collection,
        Folder,
        InheritanceManager
    };
}

if (typeof window !== 'undefined') {
    window.models = {
        PostmanRequest,
        Collection,
        Folder,
        InheritanceManager
    };
}

// ES6 exports for modular usage
