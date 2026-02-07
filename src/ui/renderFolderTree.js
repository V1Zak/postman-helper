// Render Folder Tree class
class RenderFolderTree {
    constructor() {
        this.state = null;
    }

    init(state) {
        this.state = state;
    }

    updateCollectionTree() {
        const collectionTree = document.getElementById('collectionTree');
        
        if (!this.state.currentCollection) {
            collectionTree.innerHTML = '<div class="empty-state">No collections yet</div>';
            return;
        }

        let html = '<div class="tree-item collection-item" data-type="collection">📚 ' + this.state.currentCollection.name + '</div>';

        // Add requests
        for (const request of this.state.currentCollection.requests) {
            const activeClass = this.state.currentRequest === request ? 'active' : '';
            html += `<div class="tree-item ${activeClass}" data-type="request" data-id="${request.name}">📄 ${request.name}</div>`;
        }

        // Add folders
        for (const folder of this.state.currentCollection.folders) {
            html += this.renderFolderTree(folder, 1);
        }

        collectionTree.innerHTML = html;
    }

    renderFolderTree(folder, depth = 0) {
        let html = '';
        const indent = '  '.repeat(depth);
        const activeClass = this.state.currentFolder === folder ? 'active' : '';

        html += `<div class="tree-item folder-item ${activeClass}" data-type="folder" data-id="${folder.name}" style="padding-left: ${depth * 20}px">📁 ${folder.name}</div>`;

        // Add requests in this folder
        for (const request of folder.requests) {
            const requestActiveClass = this.state.currentRequest === request ? 'active' : '';
            html += `<div class="tree-item request-item ${requestActiveClass}" data-type="request" data-id="${request.name}" style="padding-left: ${(depth + 1) * 20}px">📄 ${request.name}</div>`;
        }

        // Recursively render subfolders
        for (const subfolder of folder.folders) {
            html += this.renderFolderTree(subfolder, depth + 1);
        }

        return html;
    }

    // Method placeholders
    markAsChanged() {}
}

// Export the class
module.exports = RenderFolderTree;
