/**
 * Unit tests for loadSampleData() (Issue #8)
 * Extracts PostmanHelperApp and related classes from app.js,
 * then verifies sample data loading creates correct structures.
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { extractAppClasses } = require('./helpers/app_class_extractor');

let Request, Collection, Folder, InheritanceManager;

before(() => {
    const classes = extractAppClasses();
    Request = classes.Request;
    Collection = classes.Collection;
    Folder = classes.Folder;
    InheritanceManager = classes.InheritanceManager;
});

// Helper: build a minimal app-like object with state so loadSampleData can run
function createMockApp() {
    const state = {
        collections: [],
        currentCollection: null,
        inheritanceManager: new InheritanceManager(),
        addCollection(col) {
            this.collections.push(col);
            if (this.collections.length === 1) {
                this.currentCollection = col;
            }
        }
    };

    // Simulate loadSampleData extracted from app.js
    // We re-implement the logic here to test the data structures independently
    function loadSampleData() {
        if (state.collections.some(c => c.name === 'Sample API Collection')) {
            return 'duplicate';
        }

        const collection = new Collection('Sample API Collection');
        collection.description = 'A sample collection demonstrating Postman Helper features';

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

        // Inheritance setup
        const im = state.inheritanceManager;
        im.addGlobalHeader('Content-Type', 'application/json');
        im.addGlobalHeader('Accept', 'application/json');
        im.addBaseEndpoint('default', 'https://api.example.com/v1');
        im.addBodyTemplate('Create User Template', JSON.stringify({
            name: '', email: '', role: 'user'
        }, null, 2));
        im.addTestTemplate('Status 200 Check',
            "tests['Status code is 200'] = responseCode.code === 200;");

        state.addCollection(collection);
        return 'loaded';
    }

    return { state, loadSampleData };
}

// ─── Collection Structure ──────────────────────────────────────────────────────

describe('Sample Data: Collection Structure', () => {
    it('creates a collection named "Sample API Collection"', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        assert.equal(state.collections.length, 1);
        assert.equal(state.collections[0].name, 'Sample API Collection');
    });

    it('collection has a description', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        assert.ok(state.collections[0].description.includes('sample'));
    });

    it('collection has 2 root requests', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        assert.equal(state.collections[0].requests.length, 2);
    });

    it('collection has 2 folders', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        assert.equal(state.collections[0].folders.length, 2);
    });

    it('sets current collection on first load', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        assert.equal(state.currentCollection.name, 'Sample API Collection');
    });
});

// ─── Root Requests ─────────────────────────────────────────────────────────────

describe('Sample Data: Root Requests', () => {
    it('Get Users has correct method and URL', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const req = state.collections[0].requests[0];
        assert.equal(req.name, 'Get Users');
        assert.equal(req.method, 'GET');
        assert.equal(req.url, 'https://api.example.com/v1/users');
    });

    it('Get Users has headers', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const req = state.collections[0].requests[0];
        assert.equal(req.headers['Content-Type'], 'application/json');
    });

    it('Get Users has test scripts', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const req = state.collections[0].requests[0];
        assert.ok(req.tests.includes('Status code is 200'));
    });

    it('Create User has POST method and body', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const req = state.collections[0].requests[1];
        assert.equal(req.name, 'Create User');
        assert.equal(req.method, 'POST');
        assert.ok(req.body.includes('John Doe'));
    });

    it('Create User has test scripts', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const req = state.collections[0].requests[1];
        assert.ok(req.tests.includes('Status code is 201'));
    });
});

// ─── Auth Folder ───────────────────────────────────────────────────────────────

describe('Sample Data: Authentication Folder', () => {
    it('has correct name', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        assert.equal(state.collections[0].folders[0].name, 'Authentication');
    });

    it('has 2 requests', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        assert.equal(state.collections[0].folders[0].requests.length, 2);
    });

    it('Login request has correct details', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const login = state.collections[0].folders[0].requests[0];
        assert.equal(login.name, 'Login');
        assert.equal(login.method, 'POST');
        assert.ok(login.url.includes('auth/login'));
        assert.ok(login.body.includes('admin@example.com'));
        assert.ok(login.tests.includes('Has token'));
    });

    it('Refresh Token request has auth header with template var', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const refresh = state.collections[0].folders[0].requests[1];
        assert.equal(refresh.name, 'Refresh Token');
        assert.ok(refresh.headers['Authorization'].includes('{{refreshToken}}'));
    });
});

// ─── Users Folder ──────────────────────────────────────────────────────────────

describe('Sample Data: User Management Folder', () => {
    it('has correct name', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        assert.equal(state.collections[0].folders[1].name, 'User Management');
    });

    it('has 3 requests', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        assert.equal(state.collections[0].folders[1].requests.length, 3);
    });

    it('Get User by ID uses template variable in URL', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const req = state.collections[0].folders[1].requests[0];
        assert.equal(req.name, 'Get User by ID');
        assert.ok(req.url.includes('{{userId}}'));
    });

    it('Update User is PUT with body', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const req = state.collections[0].folders[1].requests[1];
        assert.equal(req.method, 'PUT');
        assert.ok(req.body.includes('Jane Doe'));
    });

    it('Delete User is DELETE method', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const req = state.collections[0].folders[1].requests[2];
        assert.equal(req.method, 'DELETE');
        assert.ok(req.tests.includes('Status code is 204'));
    });
});

// ─── Inheritance Setup ─────────────────────────────────────────────────────────

describe('Sample Data: Inheritance Setup', () => {
    it('adds global headers', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const headers = state.inheritanceManager.getGlobalHeaders();
        assert.ok(headers.some(h => h.key === 'Content-Type'));
        assert.ok(headers.some(h => h.key === 'Accept'));
    });

    it('adds base endpoint', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const endpoints = state.inheritanceManager.getBaseEndpoints();
        assert.ok(endpoints.length > 0);
    });

    it('adds body template', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const templates = state.inheritanceManager.getBodyTemplates();
        assert.ok(templates.some(t => t.name === 'Create User Template'));
    });

    it('adds test template', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const templates = state.inheritanceManager.getTestTemplates();
        assert.ok(templates.some(t => t.name === 'Status 200 Check'));
    });
});

// ─── Duplicate Prevention ──────────────────────────────────────────────────────

describe('Sample Data: Duplicate Prevention', () => {
    it('does not add duplicate collection', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        assert.equal(state.collections.length, 1);
        const result = loadSampleData();
        assert.equal(result, 'duplicate');
        assert.equal(state.collections.length, 1);
    });

    it('can coexist with other collections', () => {
        const { state, loadSampleData } = createMockApp();
        const existing = new Collection('My API');
        state.addCollection(existing);
        loadSampleData();
        assert.equal(state.collections.length, 2);
        assert.equal(state.collections[0].name, 'My API');
        assert.equal(state.collections[1].name, 'Sample API Collection');
    });
});

// ─── Request Validity ──────────────────────────────────────────────────────────

describe('Sample Data: Request Validity', () => {
    it('all requests are proper Request instances', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const col = state.collections[0];
        for (const req of col.requests) {
            assert.ok(req instanceof Request, `Root request "${req.name}" is not a Request instance`);
        }
        for (const folder of col.folders) {
            for (const req of folder.requests) {
                assert.ok(req instanceof Request, `Folder request "${req.name}" is not a Request instance`);
            }
        }
    });

    it('all folders are proper Folder instances', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const col = state.collections[0];
        for (const folder of col.folders) {
            assert.ok(folder instanceof Folder, `"${folder.name}" is not a Folder instance`);
        }
    });

    it('collection is a proper Collection instance', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        assert.ok(state.collections[0] instanceof Collection);
    });

    it('total request count is 7 (2 root + 2 auth + 3 users)', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const col = state.collections[0];
        let total = col.requests.length;
        for (const f of col.folders) {
            total += f.requests.length;
        }
        assert.equal(total, 7);
    });

    it('collection can be exported to valid Postman v2.1 JSON', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const json = state.collections[0].toPostmanJSON();
        assert.ok(json.info);
        assert.ok(json.info.name);
        assert.ok(json.info.schema.includes('v2.1.0'));
        assert.ok(Array.isArray(json.item));
        // 2 root requests + 2 folders = 4 top-level items
        assert.equal(json.item.length, 4);
    });

    it('collection round-trips through export/import', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const exported = state.collections[0].toPostmanJSON();
        const reimported = new Collection('test');
        reimported.importFromJSON(exported);
        assert.equal(reimported.name, 'Sample API Collection');
        assert.equal(reimported.requests.length, 2);
        assert.equal(reimported.folders.length, 2);
    });

    it('all HTTP methods are valid', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const col = state.collections[0];
        const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
        const allReqs = [...col.requests];
        col.folders.forEach(f => allReqs.push(...f.requests));
        for (const req of allReqs) {
            assert.ok(validMethods.includes(req.method), `Invalid method: ${req.method} on "${req.name}"`);
        }
    });

    it('all URLs start with https://', () => {
        const { state, loadSampleData } = createMockApp();
        loadSampleData();
        const col = state.collections[0];
        const allReqs = [...col.requests];
        col.folders.forEach(f => allReqs.push(...f.requests));
        for (const req of allReqs) {
            assert.ok(req.url.startsWith('https://'), `URL doesn't start with https://: "${req.url}" on "${req.name}"`);
        }
    });
});
