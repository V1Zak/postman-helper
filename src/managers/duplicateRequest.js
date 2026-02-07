// DuplicateRequest.js
// This module handles duplicating requests in the Postman Helper application

class DuplicateRequest {
    constructor(state) {
        this.state = state;
    }

    // Method to duplicate a request
    duplicateRequest() {
        if (!this.state.currentRequest || !this.state.currentCollection) {
            alert('No request or collection selected');
            return;
        }

        const newName = prompt('Enter name for duplicated request:', `${this.state.currentRequest.name} Copy`);
        if (newName) {
            try {
                const duplicatedRequest = new this.state.models.Request(
                    newName,
                    this.state.currentRequest.method,
                    this.state.currentRequest.url,
                    this.state.currentRequest.description
                );
                
                // Copy headers
                for (const [key, value] of Object.entries(this.state.currentRequest.headers)) {
                    duplicatedRequest.addHeader(key, value);
                }
                
                // Copy body
                duplicatedRequest.body = this.state.currentRequest.body;
                
                // Copy tests
                duplicatedRequest.tests = this.state.currentRequest.tests;
                
                // Add to collection
                this.state.currentCollection.addRequest(duplicatedRequest);
                this.state.setCurrentRequest(duplicatedRequest);
                this.state.updateCollectionTree();
                this.state.switchTab('request');
                this.state.markAsChanged();
                
                return duplicatedRequest;
            } catch (error) {
                console.error('Error duplicating request:', error);
                alert('Error duplicating request: ' + error.message);
            }
        }
    }

    // Method to save a request
    saveRequest() {
        if (!this.state.currentRequest || !this.state.currentCollection) {
            alert('No request or collection selected');
            return;
        }

        try {
            const name = document.getElementById('requestName').value;
            const method = document.getElementById('requestMethod').value;
            const url = document.getElementById('requestUrl').value;
            const body = document.getElementById('requestBody').value;
            const description = document.getElementById('requestDescription').value;

            // Update request properties
            this.state.currentRequest.name = name;
            this.state.currentRequest.method = method;
            this.state.currentRequest.url = url;
            this.state.currentRequest.body = body;
            this.state.currentRequest.description = description;

            // Update headers
            const headers = {};
            document.querySelectorAll('#requestHeadersContainer .header-row').forEach(row => {
                const keyInput = row.querySelector('.header-key');
                const valueInput = row.querySelector('.header-value');
                if (keyInput && valueInput && keyInput.value.trim() !== '') {
                    headers[keyInput.value] = valueInput.value;
                }
            });
            
            this.state.currentRequest.headers = headers;

            // Apply inheritance
            const processedRequest = this.state.inheritanceManager.processRequest(this.state.currentRequest);
            Object.assign(this.state.currentRequest, processedRequest);

            this.state.markAsChanged();
            this.state.updateCollectionTree();
            alert('Request saved successfully!');
        } catch (error) {
            console.error('Error saving request:', error);
            alert('Error saving request: ' + error.message);
        }
    }

    // Method to set up event listeners for request duplication and saving
    setupEventListeners() {
        const duplicateRequestBtn = document.getElementById('duplicateRequestBtn');
        if (duplicateRequestBtn) {
            duplicateRequestBtn.addEventListener('click', () => {
                this.duplicateRequest();
            });
        }

        const saveRequestBtn = document.getElementById('saveRequestBtn');
        if (saveRequestBtn) {
            saveRequestBtn.addEventListener('click', () => {
                this.saveRequest();
            });
        }
    }
}

// Export the DuplicateRequest class
module.exports = { DuplicateRequest };
