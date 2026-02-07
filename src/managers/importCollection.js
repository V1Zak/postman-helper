// ImportCollection Manager - CommonJS Version
// Using CommonJS requires for Electron compatibility

class ImportCollection {
    constructor(app) {
        this.app = app;
    }

    // Method to import a collection from a file
    importCollection() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const collectionData = JSON.parse(e.target.result);
                    this.processImportedCollection(collectionData);
                } catch (error) {
                    console.error('Error parsing collection file:', error);
                    alert('Error parsing collection file. Please check the file format.');
                }
            };
            reader.readAsText(file);
        });
        
        input.click();
    }

    // Method to process imported collection data
    processImportedCollection(collectionData) {
        // Validate collection data structure
        if (!collectionData.info || !collectionData.item) {
            alert('Invalid collection format. Expected Postman collection v2.1 format.');
            return;
        }

        // Create a new collection
        const newCollection = new this.app.models.Collection(
            collectionData.info.name || 'Imported Collection'
        );

        // Process items recursively
        this.processCollectionItems(collectionData.item, newCollection);

        // Add to app state
        this.app.appState.collections.push(newCollection);

        // Update UI
        this.app.updateCollectionTree();
        this.app.switchTab('collection');
        
        alert(`Successfully imported collection: ${newCollection.name}`);
    }

    // Method to process collection items recursively
    processCollectionItems(items, parent) {
        items.forEach(item => {
            if (item.request) {
                // This is a request
                const request = new this.app.models.PostmanRequest(
                    item.name,
                    item.request.method || 'GET',
                    item.request.url?.raw || ''
                );

                // Add headers if they exist
                if (item.request.header) {
                    item.request.header.forEach(header => {
                        request.addHeader(header.key, header.value);
                    });
                }

                // Add body if it exists
                if (item.request.body) {
                    request.body = item.request.body;
                }

                // Add to parent (collection or folder)
                if (parent.addRequest) {
                    parent.addRequest(request);
                }

            } else if (item.item) {
                // This is a folder
                const folder = new this.app.models.Folder(item.name || 'Unnamed Folder');
                
                // Process folder items recursively
                this.processCollectionItems(item.item, folder);
                
                // Add to parent (collection or folder)
                if (parent.addFolder) {
                    parent.addFolder(folder);
                }
            }
        });
    }

    // Method to set up event listeners for import
    setupEventListeners() {
        const importCollectionBtn = document.getElementById('importCollectionBtn');
        if (importCollectionBtn) {
            importCollectionBtn.addEventListener('click', () => {
                this.importCollection();
            });
        }
    }
}

// Export the ImportCollection class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ImportCollection };
}
