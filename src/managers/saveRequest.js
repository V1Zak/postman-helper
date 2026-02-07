// SaveRequest.js
// This module handles saving requests in the Postman Helper application

class SaveRequest {
    constructor(state) {
        this.state = state;
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

    // Method to render folder tree
    renderFolderTree(folder, depth = 0) {
        const indent = '  '.repeat(depth);
        const activeClass = this.state.currentFolder === folder ? 'active' : '';
        let html = `<div class="tree-item folder ${activeClass}" data-type="folder" data-id="${folder.name}" style="padding-left: ${12 + depth * 15}px">📁 ${folder.name}</div>`;

        // Add folder contents with indentation
        for (const request of folder.requests) {
            const requestActive = this.state.currentRequest === request ? 'active' : '';
            html += `<div class="tree-item ${requestActive}" data-type="request" data-id="${request.name}" style="padding-left: ${24 + depth * 15}px">📄 ${request.name}</div>`;
        }

        // Add subfolders recursively
        for (const subfolder of folder.folders) {
            html += this.renderFolderTree(subfolder, depth + 1);
        }

        return html;
    }

    // Method to set up event listeners for request saving
    setupEventListeners() {
        const saveRequestBtn = document.getElementById('saveRequestBtn');
        if (saveRequestBtn) {
            saveRequestBtn.addEventListener('click', () => {
                this.saveRequest();
            });
        }

        // Set up event listeners for folder tree navigation
        document.querySelectorAll('.tree-item[data-type="request"]').forEach(item => {
            item.addEventListener('click', (e) => {
                const requestName = e.target.dataset.id;
                const request = this.state.currentCollection.requests.find(r => r.name === requestName);
                if (request) {
                    this.state.setCurrentRequest(request);
                    this.state.updateCollectionTree();
                    this.state.switchTab('request');
                }
            });
        });

        document.querySelectorAll('.tree-item[data-type="folder"]').forEach(item => {
            item.addEventListener('click', (e) => {
                const folderName = e.target.dataset.id;
                const folder = this.findFolderByName(this.state.currentCollection.folders, folderName);
                if (folder) {
                    this.state.setCurrentFolder(folder);
                    this.state.setCurrentRequest(null);
                    this.state.updateCollectionTree();
                    // Could show folder contents in a different way
                }
            });
        });
    }
}

// Export the SaveRequest class
module.exports = { SaveRequest };
