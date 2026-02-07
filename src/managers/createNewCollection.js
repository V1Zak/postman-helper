// CreateNewCollection.js
// This module handles the creation of new collections in the Postman Helper application

class CreateNewCollection {
    constructor(state) {
        this.state = state;
    }

    // Method to create a new collection
    createCollection(name, description = '') {
        try {
            const collection = new this.state.models.Collection(name, description);
            this.state.addCollection(collection);
            this.state.markAsChanged();
            return collection;
        } catch (error) {
            console.error('Error creating new collection:', error);
            throw error;
        }
    }

    // Method to update the UI with global headers
    updateGlobalHeadersUI() {
        const globalHeadersContainer = document.getElementById('globalHeadersContainer');
        const headers = this.state.inheritanceManager.getGlobalHeaders();
        
        if (headers.length === 0) {
            globalHeadersContainer.innerHTML = '<div class="empty-state" style="padding: 20px;">No global headers defined</div>';
        } else {
            let headersHtml = '';
            for (const [key, value] of Object.entries(headers)) {
                headersHtml += `
                    <div style="margin-bottom: 8px; display: flex; align-items: center;">
                        <input type="text" class="global-header-key" value="${key}" placeholder="Header Name" style="flex: 1; margin-right: 5px;">
                        <input type="text" class="global-header-value" value="${value}" placeholder="Header Value" style="flex: 1; margin-right: 5px;">
                        <button class="remove-global-header-btn" data-key="${key}" style="padding: 5px 10px;">❌</button>
                    </div>
                `;
            }
            globalHeadersContainer.innerHTML = headersHtml;
        }
    }

    // Method to update the UI with base endpoints
    updateBaseEndpointsUI() {
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
                        <button class="remove-base-endpoint-btn" data-endpoint="${endpoint}" style="margin-left: 10px; padding: 5px 10px;">❌</button>
                    </div>
                `;
            }
            baseEndpointsContainer.innerHTML = endpointsHtml;
        }
    }

    // Method to set up event listeners for inheritance management
    setupEventListeners() {
        // Event listener for removing global headers
        document.querySelectorAll('.remove-global-header-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const key = e.target.dataset.key;
                this.state.inheritanceManager.removeGlobalHeader(key);
                this.state.markAsChanged();
                this.updateGlobalHeadersUI();
            });
        });

        // Event listener for removing base endpoints
        document.querySelectorAll('.remove-base-endpoint-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const endpoint = e.target.dataset.endpoint;
                this.state.inheritanceManager.removeBaseEndpoint(endpoint);
                this.state.markAsChanged();
                this.updateBaseEndpointsUI();
            });
        });
    }
}

// Export the CreateNewCollection class
module.exports = { CreateNewCollection };
