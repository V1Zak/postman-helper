// Test file to verify import functionality
// This file can be used to test the Collection.importFromJSON method

const { Collection } = require('./models.js');

// Test 1: Simple JSON import
console.log('Test 1: Simple JSON import');
const simpleCollection = new Collection('Test Collection');
const simpleData = {
    name: 'Imported Collection',
    description: 'Test import',
    requests: [
        { name: 'Test Request', method: 'GET', url: '/test' }
    ],
    folders: [
        { name: 'Test Folder', requests: [] }
    ]
};

try {
    simpleCollection.importFromJSON(simpleData);
    console.log('✅ Simple import successful');
    console.log('Collection name:', simpleCollection.name);
    console.log('Requests count:', simpleCollection.requests.length);
    console.log('Folders count:', simpleCollection.folders.length);
} catch (error) {
    console.error('❌ Simple import failed:', error);
}

// Test 2: Postman Collection v2.1 format
console.log('\nTest 2: Postman Collection v2.1 format');
const postmanCollection = new Collection('Postman Test');
const postmanData = {
    info: {
        name: 'Postman Import Test',
        description: 'Testing Postman format import'
    },
    item: [
        {
            name: 'GET Users',
            request: {
                method: 'GET',
                url: {
                    raw: 'https://api.example.com/users',
                    protocol: 'https',
                    host: ['api', 'example', 'com'],
                    path: ['users']
                }
            }
        },
        {
            name: 'Authentication',
            item: [
                {
                    name: 'Login',
                    request: {
                        method: 'POST',
                        url: {
                            raw: 'https://api.example.com/auth/login',
                            protocol: 'https',
                            host: ['api', 'example', 'com'],
                            path: ['auth', 'login']
                        },
                        body: {
                            mode: 'raw',
                            raw: '{"username":"admin","password":"password"}'
                        }
                    }
                }
            ]
        }
    ]
};

try {
    postmanCollection.importFromJSON(postmanData);
    console.log('✅ Postman format import successful');
    console.log('Collection name:', postmanCollection.name);
    console.log('Requests count:', postmanCollection.requests.length);
    console.log('Folders count:', postmanCollection.folders.length);
    
    if (postmanCollection.requests.length > 0) {
        console.log('First request:', postmanCollection.requests[0].name);
    }
    
    if (postmanCollection.folders.length > 0) {
        console.log('First folder:', postmanCollection.folders[0].name);
    }
} catch (error) {
    console.error('❌ Postman format import failed:', error);
}

// Test 3: String JSON import
console.log('\nTest 3: String JSON import');
const stringCollection = new Collection('String Test');
const jsonString = JSON.stringify({
    name: 'String Import Test',
    requests: [
        { name: 'String Request', method: 'POST', url: '/api/data' }
    ]
});

try {
    stringCollection.importFromJSON(jsonString);
    console.log('✅ String JSON import successful');
    console.log('Collection name:', stringCollection.name);
    console.log('Requests count:', stringCollection.requests.length);
} catch (error) {
    console.error('❌ String JSON import failed:', error);
}

console.log('\n🎉 All import tests completed!');