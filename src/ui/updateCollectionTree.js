// Update Collection Tree class
class UpdateCollectionTree {
    constructor() {
        this.state = null;
    }

    init(state) {
        this.state = state;
    }

    // Collection Management
    createNewCollection() {
        const name = prompt('Enter collection name:', 'New Collection');
        if (name) {
            this.state.setCurrentCollection(new Collection(name));
            this.updateCollectionTree();
            this.state.markAsChanged();
        }
    }

    createNewRequest() {
        if (!this.state.currentCollection) {
            const createCollection = confirm('No collection loaded. Create a new collection first?');
            if (createCollection) {
                this.createNewCollection();
                return;
            }
        }

        const name = prompt('Enter request name:', 'New Request');
        if (name) {
            const request = new Request(name, 'GET', '/');
            this.state.currentCollection.addRequest(request);
            this.state.setCurrentRequest(request);
            this.updateCollectionTree();
            this.switchTab('request');
            this.state.markAsChanged();
        }
    }

    createNewFolder() {
        if (!this.state.currentCollection) {
            const createCollection = confirm('No collection loaded. Create a new collection first?');
            if (createCollection) {
                this.createNewCollection();
                return;
            }
        }

        const name = prompt('Enter folder name:', 'New Folder');
        if (name) {
            const folder = new Folder(name);
            this.state.currentCollection.addFolder(folder);
            this.state.setCurrentFolder(folder);
            this.updateCollectionTree();
            this.state.markAsChanged();
        }
    }

    // Method placeholders
    updateCollectionTree() {}
    switchTab(tabName) {}
    markAsChanged() {}
}

// Export the class
module.exports = UpdateCollectionTree;
