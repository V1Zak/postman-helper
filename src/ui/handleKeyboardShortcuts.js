// Handle Keyboard Shortcuts class
class HandleKeyboardShortcuts {
    constructor() {
        this.state = null;
    }

    init(state) {
        this.state = state;
        this.setupKeyboardShortcuts();
    }

    setupKeyboardShortcuts() {
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

    // Method placeholders
    createNewRequest() {}
    importCollection() {}
}

// Export the class
module.exports = HandleKeyboardShortcuts;
