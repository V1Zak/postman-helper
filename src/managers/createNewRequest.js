// CreateNewRequest.js
// This module handles creating new requests in the Postman Helper application

class CreateNewRequest {
    constructor(state) {
        this.state = state;
    }

    // Method to create a new request
    createRequest(name, method = 'GET', url = '', description = '') {
        try {
            const request = new this.state.models.Request(name, method, url, description);
            
            if (this.state.currentCollection) {
                this.state.currentCollection.addRequest(request);
            } else {
                throw new Error('No collection selected');
            }
            
            this.state.setCurrentRequest(request);
            this.state.markAsChanged();
            return request;
        } catch (error) {
            console.error('Error creating new request:', error);
            throw error;
        }
    }

    // Method to create a new request in the UI
    createRequestInUI() {
        const requestName = prompt('Enter request name:');
        if (requestName) {
            const requestMethod = prompt('Enter request method (GET, POST, etc.):', 'GET');
            const requestUrl = prompt('Enter request URL:');
            const requestDescription = prompt('Enter request description:');
            
            this.createRequest(requestName, requestMethod, requestUrl, requestDescription);
            this.state.updateCollectionTree();
            this.state.switchTab('request');
        }
    }

    // Method to set up event listeners for request creation
    setupEventListeners() {
        const createRequestBtn = document.getElementById('createRequestBtn');
        if (createRequestBtn) {
            createRequestBtn.addEventListener('click', () => {
                this.createRequestInUI();
            });
        }
    }

    // Method to update the tests tab
    updateTestsTab() {
        const testsTab = document.getElementById('testsTab');
        
        if (!this.state.currentRequest) {
            testsTab.innerHTML = '<div class="empty-state">Select a request to view and edit tests</div>';
            return;
        }

        testsTab.innerHTML = `
            <div class="form-group">
                <label for="requestTests">Test Scripts</label>
                <textarea id="requestTests" class="form-control" placeholder="// Write your Postman test scripts here\n// Example:\npm.test(\"Status code is 200\", function() {\n    pm.response.to.have.status(200);\n});">${this.state.currentRequest.tests || ''}</textarea>
            </div>

            <div class="btn-group">
                <button id="saveTestsBtn" class="primary">Save Tests</button>
                <button id="clearTestsBtn" class="secondary">Clear</button>
            </div>
        `;

        // Set up event listeners for test management
        document.getElementById('saveTestsBtn').addEventListener('click', () => this.saveTests());
        document.getElementById('clearTestsBtn').addEventListener('click', () => {
            document.getElementById('requestTests').value = '';
            this.state.markAsChanged();
        });

        document.getElementById('requestTests').addEventListener('input', () => this.state.markAsChanged());
    }

    // Method to save tests for the current request
    saveTests() {
        if (!this.state.currentRequest) {
            alert('Please select a request first');
            return;
        }

        const tests = document.getElementById('requestTests').value;
        this.state.currentRequest.tests = tests;
        this.state.markAsChanged();
        alert('Tests saved successfully!');
    }

    // Method to update the inheritance tab
    updateInheritanceTab() {
        const inheritanceTab = document.getElementById('inheritanceTab');
        
        if (!this.state.currentRequest) {
            inheritanceTab.innerHTML = '<div class="empty-state">Select a request to view inheritance settings</div>';
            return;
        }

        inheritanceTab.innerHTML = `
            <div class="form-group">
                <h3>Global Headers</h3>
                <div id="globalHeadersContainer"></div>
                <button id="addGlobalHeaderBtn" class="secondary">Add Global Header</button>
            </div>

            <div class="form-group">
                <h3>Base Endpoints</h3>
                <div id="baseEndpointsContainer"></div>
                <button id="addBaseEndpointBtn" class="secondary">Add Base Endpoint</button>
            </div>
        `;

        // Update global headers and base endpoints
        this.updateGlobalHeaders();
        this.updateBaseEndpoints();

        // Set up event listeners for inheritance management
        document.querySelectorAll('.remove-global-header-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const key = e.target.dataset.key;
                this.state.inheritanceManager.removeGlobalHeader(key);
                this.state.markAsChanged();
                this.updateInheritanceTab();
            });
        });

        document.querySelectorAll('.remove-base-endpoint-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const endpoint = e.target.dataset.endpoint;
                this.state.inheritanceManager.removeBaseEndpoint(endpoint);
                this.state.markAsChanged();
                this.updateInheritanceTab();
            });
        });
    }

    // Method to update global headers in the inheritance tab
    updateGlobalHeaders() {
        const globalHeadersContainer = document.getElementById('globalHeadersContainer');
        const headers = this.state.inheritanceManager.getGlobalHeaders();
        
        if (headers.length === 0) {
            globalHeadersContainer.innerHTML = '<div class="empty-state" style="padding: 20px;">No global headers defined</div>';
        } else {
            let headersHtml = '';
            for (const [key, value] of Object.entries(headers)) {
                headersHtml += `
                    <div style="margin-bottom: 8px; display: flex; align-items: center;">
                        <span style="flex: 1; word-break: break-all;">${key}: ${value}</span>
                        <button class="remove-global-header-btn" data-key="${key}" style="margin-left: 10px;">❌</button>
                    </div>
                `;
            }
            globalHeadersContainer.innerHTML = headersHtml;
        }
    }

    // Method to update base endpoints in the inheritance tab
    updateBaseEndpoints() {
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
    }
}

// Export the CreateNewRequest class
module.exports = { CreateNewRequest };
