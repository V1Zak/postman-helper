// FindFolderByName utility class
// This class provides functionality to find folders by name in the collection tree

class FindFolderByName {
    constructor(state) {
        this.state = state;
    }

    // Find a folder by name in the current collection
    findFolderByName(folderName) {
        if (!this.state.currentCollection) {
            return null;
        }

        // Search in the root folders
        const foundFolder = this.state.currentCollection.folders.find(
            folder => folder.name === folderName
        );

        return foundFolder || null;
    }

    // Find a folder by name recursively (including subfolders)
    findFolderRecursive(folderName, folders = null) {
        const targetFolders = folders || this.state.currentCollection?.folders || [];

        for (const folder of targetFolders) {
            if (folder.name === folderName) {
                return folder;
            }

            // Recursively search in subfolders
            if (folder.folders && folder.folders.length > 0) {
                const foundInSubfolder = this.findFolderRecursive(folderName, folder.folders);
                if (foundInSubfolder) {
                    return foundInSubfolder;
                }
            }
        }

        return null;
    }

    // Update the collection tree UI
    updateCollectionTree() {
        if (!this.state.currentCollection) {
            return;
        }

        const collectionTree = document.getElementById('collection-tree');
        if (!collectionTree) {
            console.warn('Collection tree element not found');
            return;
        }

        let html = '<div class="tree-header">Collections</div>';

        // Render folders
        if (this.state.currentCollection.folders && this.state.currentCollection.folders.length > 0) {
            html += this._renderFolderTree(this.state.currentCollection.folders);
        }

        // Render requests
        if (this.state.currentCollection.requests && this.state.currentCollection.requests.length > 0) {
            html += '<div class="tree-section">Requests</div>';
            this.state.currentCollection.requests.forEach(request => {
                html += `<div class="tree-item" data-type="request" data-id="${request.name}">
                    <span class="tree-icon">📄</span>
                    <span class="tree-label">${request.name}</span>
                </div>`;
            });
        }

        collectionTree.innerHTML = html;

        // Set up click handlers
        document.querySelectorAll('.tree-item[data-type="request"]').forEach(item => {
            item.addEventListener('click', (e) => {
                const requestName = e.target.dataset.id;
                const request = this.state.currentCollection.requests.find(r => r.name === requestName);
                if (request) {
                    this.state.setCurrentRequest(request);
                    this.state.setCurrentFolder(null);
                    this.updateCollectionTree();
                    this.switchTab('request');
                }
            });
        });
    }

    // Helper method to render folder tree recursively
    _renderFolderTree(folders, depth = 0) {
        let html = '';
        const indent = '  '.repeat(depth);

        folders.forEach(folder => {
            html += `<div class="tree-item folder-item" data-type="folder" data-id="${folder.name}" style="padding-left: ${depth * 20}px">
                <span class="tree-icon">📁</span>
                <span class="tree-label">${folder.name}</span>
            </div>`;

            // Render subfolders recursively
            if (folder.folders && folder.folders.length > 0) {
                html += this._renderFolderTree(folder.folders, depth + 1);
            }

            // Render requests in this folder
            if (folder.requests && folder.requests.length > 0) {
                folder.requests.forEach(request => {
                    html += `<div class="tree-item" data-type="request" data-id="${request.name}" style="padding-left: ${(depth + 1) * 20}px">
                        <span class="tree-icon">📄</span>
                        <span class="tree-label">${request.name}</span>
                    </div>`;
                });
            }
        });

        return html;
    }

    // Switch between different tabs
    switchTab(tabName) {
        // Hide all tabs
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.style.display = 'none';
        });

        // Remove active class from all tab buttons
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('active');
        });

        // Show the selected tab
        const selectedTab = document.getElementById(`${tabName}-tab`);
        if (selectedTab) {
            selectedTab.style.display = 'block';
        }

        // Add active class to the selected button
        const activeButton = document.querySelector(`.tab-button[data-tab="${tabName}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }
}

// Export the function
module.exports = { FindFolderByName };
