// DeleteRequest.js
// This module handles deleting requests in the Postman Helper application

class DeleteRequest {
    constructor(state) {
        this.state = state;
    }

    // Method to delete a request
    deleteRequest() {
        if (!this.state.currentRequest || !this.state.currentCollection) {
            alert('No request or collection selected');
            return;
        }

        const confirmDelete = confirm(`Are you sure you want to delete "${this.state.currentRequest.name}"?`);
        if (confirmDelete) {
            try {
                this.state.currentCollection.requests = this.state.currentCollection.requests.filter(
                    r => r !== this.state.currentRequest
                );
                this.state.setCurrentRequest(null);
                this.state.updateCollectionTree();
                this.state.switchTab('request');
                this.state.markAsChanged();
            } catch (error) {
                console.error('Error deleting request:', error);
                alert('Error deleting request: ' + error.message);
            }
        }
    }

    // Method to find a folder by name
    findFolderByName(folders, name) {
        for (const folder of folders) {
            if (folder.name === name) {
                return folder;
            }
            if (folder.children) {
                const found = this.findFolderByName(folder.children, name);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }

    // Method to set up event listeners for request deletion
    setupEventListeners() {
        const deleteRequestBtn = document.getElementById('deleteRequestBtn');
        if (deleteRequestBtn) {
            deleteRequestBtn.addEventListener('click', () => {
                this.deleteRequest();
            });
        }
    }

    // Method to handle request management
    handleRequestManagement() {
        // This method can be expanded to handle additional request management features
        // such as moving requests between collections, renaming requests, etc.
    }
}

// Export the DeleteRequest class
module.exports = { DeleteRequest };
