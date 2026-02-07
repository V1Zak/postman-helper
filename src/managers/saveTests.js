// SaveTests.js
// This module handles saving tests in the Postman Helper application

class SaveTests {
    constructor(state) {
        this.state = state;
    }

    // Method to save tests for a request
    saveTests() {
        if (!this.state.currentRequest) {
            alert('No request selected');
            return;
        }

        try {
            const tests = document.getElementById('requestTests').value;
            this.state.currentRequest.tests = tests;
            
            // Apply inheritance to the request
            const processedRequest = this.state.inheritanceManager.processRequest(this.state.currentRequest);
            Object.assign(this.state.currentRequest, processedRequest);

            this.state.markAsChanged();
            alert('Tests saved successfully!');
        } catch (error) {
            console.error('Error saving tests:', error);
            alert('Error saving tests: ' + error.message);
        }
    }

    // Method to duplicate a request with tests
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
                    { ...this.state.currentRequest.headers },
                    this.state.currentRequest.body,
                    this.state.currentRequest.tests,
                    this.state.currentRequest.description
                );
                
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

    // Method to set up event listeners for test saving
    setupEventListeners() {
        const saveTestsBtn = document.getElementById('saveTestsBtn');
        if (saveTestsBtn) {
            saveTestsBtn.addEventListener('click', () => {
                this.saveTests();
            });
        }

        const duplicateRequestBtn = document.getElementById('duplicateRequestBtn');
        if (duplicateRequestBtn) {
            duplicateRequestBtn.addEventListener('click', () => {
                this.duplicateRequest();
            });
        }
    }
}

// Export the SaveTests class
module.exports = { SaveTests };
