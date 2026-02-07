// CreateNewFolder.js
// This module handles creating new folders in the Postman Helper application

class CreateNewFolder {
    constructor(state) {
        this.state = state;
    }

    // Method to create a new folder
    createFolder(name, parentFolder = null) {
        try {
            const folder = {
                name: name,
                type: 'folder',
                children: [],
                timestamp: new Date().toISOString()
            };
            
            if (parentFolder) {
                parentFolder.children.push(folder);
            } else {
                this.state.folders.push(folder);
            }
            
            this.state.markAsChanged();
            return folder;
        } catch (error) {
            console.error('Error creating new folder:', error);
            throw error;
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
                if (found) return found;
            }
        }
        return null;
    }

    // Method to create a folder in the UI
    createFolderInUI() {
        const folderName = prompt('Enter folder name:');
        if (folderName) {
            const parentFolder = this.state.currentFolder || null;
            this.createFolder(folderName, parentFolder);
            this.state.updateCollectionTree();
        }
    }

    // Method to set up event listeners for folder creation
    setupEventListeners() {
        const createFolderBtn = document.getElementById('createFolderBtn');
        if (createFolderBtn) {
            createFolderBtn.addEventListener('click', () => {
                this.createFolderInUI();
            });
        }
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

    // Method to set up event listeners for test management
    setupTestEventListeners() {
        const saveTestsBtn = document.getElementById('saveTestsBtn');
        if (saveTestsBtn) {
            saveTestsBtn.addEventListener('click', () => this.saveTests());
        }

        const clearTestsBtn = document.getElementById('clearTestsBtn');
        if (clearTestsBtn) {
            clearTestsBtn.addEventListener('click', () => {
                document.getElementById('requestTests').value = '';
                this.state.markAsChanged();
            });
        }

        const requestTests = document.getElementById('requestTests');
        if (requestTests) {
            requestTests.addEventListener('input', () => this.state.markAsChanged());
        }
    }

    // Method to render common test examples
    renderCommonTestExamples() {
        const examplesContainer = document.createElement('div');
        examplesContainer.style.marginTop = '20px';
        examplesContainer.style.padding = '15px';
        examplesContainer.style.backgroundColor = '#f8f9fa';
        examplesContainer.style.borderRadius = '4px';
        
        const heading = document.createElement('h4');
        heading.textContent = 'Common Test Examples';
        heading.style.marginTop = '0';
        
        const examplesContent = document.createElement('div');
        examplesContent.style.fontFamily = 'monospace';
        examplesContent.style.fontSize = '13px';
        examplesContent.style.backgroundColor = '#e9ecef';
        examplesContent.style.padding = '10px';
        examplesContent.style.borderRadius = '4px';
        examplesContent.style.marginTop = '10px';
        examplesContent.textContent = `
// Status code test
pm.test("Status code is 200", function() {
    pm.response.to.have.status(200);
});

// Response time test
pm.test("Response time is less than 500ms", function() {
    pm.expect(pm.response.responseTime).to.be.below(500);
});

// JSON response validation
pm.test("Response has valid JSON", function() {
    pm.response.to.be.json;
});
        `;
        
        examplesContainer.appendChild(heading);
        examplesContainer.appendChild(examplesContent);
        
        return examplesContainer;
    }
}

// Export the CreateNewFolder class
module.exports = { CreateNewFolder };
