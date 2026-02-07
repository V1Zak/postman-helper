// LoadSampleData.js
// This module handles loading sample data in the Postman Helper application

class LoadSampleData {
    constructor(state) {
        this.state = state;
    }

    // Method to load sample data
    loadSampleData() {
        // Create a sample collection for demonstration
        const sampleCollection = new this.state.models.Collection('Sample API Collection', 'A sample collection demonstrating Postman Helper features');

        // Set up inheritance
        this.state.inheritanceManager.setGlobalHeaders({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        });
        this.state.inheritanceManager.addBaseEndpoint('https://api.example.com/v1');

        // Create sample requests
        const request1 = new this.state.models.Request(
            'Get Users',
            'GET',
            '/users',
            {},
            null,
            'pm.test("Status code is 200", function() {\n    pm.response.to.have.status(200);\n});'
        );

        const request2 = new this.state.models.Request(
            'Create User',
            'POST',
            '/users',
            {},
            '{\n    "name": "John Doe",\n    "email": "john@example.com"\n}',
            'pm.test("User created successfully", function() {\n    pm.expect(pm.response.code).to.be.oneOf([200, 201]);\n});'
        );

        // Apply inheritance to requests
        const processedRequest1 = this.state.inheritanceManager.processRequest(request1);
        const processedRequest2 = this.state.inheritanceManager.processRequest(request2);

        sampleCollection.addRequest(processedRequest1);
        sampleCollection.addRequest(processedRequest2);

        // Create a folder with requests
        const authFolder = new this.state.models.Folder('Authentication');
        const loginRequest = new this.state.models.Request(
            'Login',
            'POST',
            '/auth/login',
            {},
            '{\n    "username": "admin",\n    "password": "password"\n}'
        );
        const processedLoginRequest = this.state.inheritanceManager.processRequest(loginRequest);
        authFolder.addRequest(processedLoginRequest);
        sampleCollection.addFolder(authFolder);

        this.state.setCurrentCollection(sampleCollection);
        this.state.updateCollectionTree();
    }

    // Method to show settings
    showSettings() {
        alert('Settings functionality will be implemented in a future version');
    }

    // Method to set up event listeners for sample data loading
    setupEventListeners() {
        const loadSampleDataBtn = document.getElementById('loadSampleDataBtn');
        if (loadSampleDataBtn) {
            loadSampleDataBtn.addEventListener('click', () => {
                this.loadSampleData();
            });
        }

        const showSettingsBtn = document.getElementById('showSettingsBtn');
        if (showSettingsBtn) {
            showSettingsBtn.addEventListener('click', () => {
                this.showSettings();
            });
        }
    }
}

// Export the LoadSampleData class
module.exports = { LoadSampleData };
