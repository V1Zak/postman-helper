// AddBaseEndpoint.js
// This module handles adding base endpoints in the Postman Helper application

class AddBaseEndpoint {
    constructor(state) {
        this.state = state;
    }

    // Method to add a base endpoint
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

    // Method to add a header row
    addHeaderRow() {
        const container = document.getElementById('requestHeadersContainer');
        const headerRow = document.createElement('div');
        headerRow.className = 'header-row';
        headerRow.innerHTML = `
            <input type="text" class="header-key" placeholder="Header Name">
            <input type="text" class="header-value" placeholder="Header Value">
            <button class="remove-header-btn">❌</button>
        `;

        container.appendChild(headerRow);

        // Set up event listener for the remove button
        headerRow.querySelector('.remove-header-btn').addEventListener('click', () => {
            container.removeChild(headerRow);
        });
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
                <input type="text" id="newBaseEndpoint" placeholder="Enter base endpoint URL" style="width: 100%; padding: 8px; margin-bottom: 10px;">
                <button id="addBaseEndpointBtn" class="secondary">Add Base Endpoint</button>
            </div>

            <div class="form-group">
                <h3>Body Templates</h3>
                <div id="bodyTemplatesContainer"></div>
                <button id="addBodyTemplateBtn" class="secondary">Add Body Template</button>
            </div>

            <div class="form-group">
                <h3>Test Templates</h3>
                <div id="testTemplatesContainer"></div>
                <button id="addTestTemplateBtn" class="secondary">Add Test Template</button>
            </div>
        `;

        // Update all template containers
        this.updateGlobalHeaders();
        this.updateBaseEndpoints();
        this.updateBodyTemplates();
        this.updateTestTemplates();

        // Set up event listeners for inheritance management
        document.getElementById('addGlobalHeaderBtn').addEventListener('click', () => this.addGlobalHeader());
        document.getElementById('addBaseEndpointBtn').addEventListener('click', () => this.addBaseEndpoint());
        document.getElementById('addBodyTemplateBtn').addEventListener('click', () => this.addBodyTemplate());
        document.getElementById('addTestTemplateBtn').addEventListener('click', () => this.addTestTemplate());

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

        document.querySelectorAll('.remove-body-template-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const templateName = e.target.dataset.templateName;
                this.state.inheritanceManager.removeBodyTemplate(templateName);
                this.state.markAsChanged();
                this.updateInheritanceTab();
            });
        });

        document.querySelectorAll('.remove-test-template-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const templateName = e.target.dataset.templateName;
                this.state.inheritanceManager.removeTestTemplate(templateName);
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

    // Method to update body templates in the inheritance tab
    updateBodyTemplates() {
        const bodyTemplatesContainer = document.getElementById('bodyTemplatesContainer');
        const templates = this.state.inheritanceManager.getBodyTemplates();
        
        if (templates.length === 0) {
            bodyTemplatesContainer.innerHTML = '<div class="empty-state" style="padding: 20px;">No body templates defined</div>';
        } else {
            let templatesHtml = '';
            for (const template of templates) {
                templatesHtml += `
                    <div style="margin-bottom: 8px; display: flex; align-items: center;">
                        <span style="flex: 1; word-break: break-all;">${template.name}</span>
                        <button class="remove-body-template-btn" data-template-name="${template.name}" style="margin-left: 10px;">❌</button>
                    </div>
                `;
            }
            bodyTemplatesContainer.innerHTML = templatesHtml;
        }
    }

    // Method to update test templates in the inheritance tab
    updateTestTemplates() {
        const testTemplatesContainer = document.getElementById('testTemplatesContainer');
        const templates = this.state.inheritanceManager.getTestTemplates();
        
        if (templates.length === 0) {
            testTemplatesContainer.innerHTML = '<div class="empty-state" style="padding: 20px;">No test templates defined</div>';
        } else {
            let templatesHtml = '';
            for (const template of templates) {
                templatesHtml += `
                    <div style="margin-bottom: 8px; display: flex; align-items: center;">
                        <span style="flex: 1; word-break: break-all;">${template.name}</span>
                        <button class="remove-test-template-btn" data-template-name="${template.name}" style="margin-left: 10px;">❌</button>
                    </div>
                `;
            }
            testTemplatesContainer.innerHTML = templatesHtml;
        }
    }

    // Method to add a global header
    addGlobalHeader() {
        const key = prompt('Enter header name:', 'Authorization');
        if (key) {
            const value = prompt('Enter header value:', '');
            if (value !== null) {
                this.state.inheritanceManager.addGlobalHeader(key, value);
                this.state.markAsChanged();
                this.updateInheritanceTab();
            }
        }
    }

    // Method to add a body template
    addBodyTemplate() {
        const name = prompt('Enter template name:', 'JSON Template');
        if (name) {
            const content = prompt('Enter template content:', '{\n    "key": "value"\n}');
            if (content !== null) {
                this.state.inheritanceManager.addBodyTemplate(name, content);
                this.state.markAsChanged();
                this.updateInheritanceTab();
            }
        }
    }

    // Method to add a test template
    addTestTemplate() {
        const name = prompt('Enter template name:', 'Status Test');
        if (name) {
            const content = prompt('Enter template content:', 'pm.test("Status code is 200", function() {\n    pm.response.to.have.status(200);\n});');
            if (content !== null) {
                this.state.inheritanceManager.addTestTemplate(name, content);
                this.state.markAsChanged();
                this.updateInheritanceTab();
            }
        }
    }

    // Method to set up event listeners for base endpoint operations
    setupEventListeners() {
        const addBaseEndpointBtn = document.getElementById('addBaseEndpointBtn');
        if (addBaseEndpointBtn) {
            addBaseEndpointBtn.addEventListener('click', () => {
                this.addBaseEndpoint();
            });
        }

        const addHeaderBtn = document.getElementById('addHeaderBtn');
        if (addHeaderBtn) {
            addHeaderBtn.addEventListener('click', () => {
                this.addHeaderRow();
            });
        }
    }
}

// Export the AddBaseEndpoint class
module.exports = { AddBaseEndpoint };
