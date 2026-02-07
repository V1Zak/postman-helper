// ExportCollection Manager - CommonJS Version
// Using CommonJS requires for Electron compatibility

class ExportCollection {
    constructor(app) {
        this.app = app;
    }

    // Method to export a collection to a file
    async exportCollection() {
        const { dialog } = require('electron');
        const fs = require('fs');
        const path = require('path');

        // Get the current collection
        const currentCollection = this.app.appState.currentCollection;
        if (!currentCollection) {
            alert('No collection selected for export.');
            return;
        }

        // Show save dialog
        const { filePath } = await dialog.showSaveDialog({
            title: 'Export Collection',
            defaultPath: `${currentCollection.name}.json`,
            filters: [
                { name: 'JSON Files', extensions: ['json'] }
            ]
        });

        if (!filePath) return; // User cancelled

        // Convert collection to Postman format
        const postmanCollection = this.convertToPostmanFormat(currentCollection);

        // Write to file
        fs.writeFile(filePath, JSON.stringify(postmanCollection, null, 2), (err) => {
            if (err) {
                console.error('Error exporting collection:', err);
                alert('Error exporting collection.');
            } else {
                alert(`Collection exported successfully to: ${filePath}`);
            }
        });
    }

    // Method to convert collection to Postman format
    convertToPostmanFormat(collection) {
        const postmanCollection = {
            info: {
                name: collection.name,
                schema: 'https://schema.getpostman.com/json/collection/v2.1.0'
            },
            item: []
        };

        // Process requests
        collection.requests.forEach(request => {
            postmanCollection.item.push({
                name: request.name,
                request: {
                    method: request.method,
                    header: request.headers.map(h => ({ key: h.key, value: h.value })),
                    body: request.body,
                    url: {
                        raw: request.url,
                        protocol: 'https',
                        host: request.url.split('/')[2] || 'example.com',
                        path: request.url.split('/').slice(3).join('/')
                    }
                }
            });
        });

        return postmanCollection;
    }

    // Method to set up event listeners for export
    setupEventListeners() {
        const exportCollectionBtn = document.getElementById('exportCollectionBtn');
        if (exportCollectionBtn) {
            exportCollectionBtn.addEventListener('click', () => {
                this.exportCollection();
            });
        }
    }
}

// Export the ExportCollection class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ExportCollection };
}
