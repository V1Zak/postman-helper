// Setup Event Listeners class
class SetupEventListeners {
    constructor() {
        this.state = null;
    }

    init(state) {
        this.state = state;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Header buttons
        document.getElementById('newRequestBtn').addEventListener('click', () => this.createNewRequest());
        document.getElementById('newFolderBtn').addEventListener('click', () => this.createNewFolder());
        document.getElementById('importBtn').addEventListener('click', () => this.importCollection());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportCollection());
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettings());

        // Inheritance buttons
        document.getElementById('addGlobalHeaderBtn').addEventListener('click', () => this.addGlobalHeader());
        document.getElementById('addBaseEndpointBtn').addEventListener('click', () => this.addBaseEndpoint());
        document.getElementById('addBodyTemplateBtn').addEventListener('click', () => this.addBodyTemplate());
        document.getElementById('addTestTemplateBtn').addEventListener('click', () => this.addTestTemplate());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    handleKeyboardShortcuts(e) {
        // Check if we're in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        // Command/Ctrl + N - New Request
        if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
            e.preventDefault();
            this.createNewRequest();
        }

        // Command/Ctrl + O - Import
        if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
            e.preventDefault();
            this.importCollection();
        }
    }

    // Method placeholders - these would be implemented elsewhere
    createNewRequest() {}
    createNewFolder() {}
    importCollection() {}
    exportCollection() {}
    showSettings() {}
    addGlobalHeader() {}
    addBaseEndpoint() {}
    addBodyTemplate() {}
    addTestTemplate() {}
}

// Export the class
module.exports = SetupEventListeners;
