// Switch Tab class
class SwitchTab {
    constructor() {
        this.state = null;
    }

    init(state) {
        this.state = state;
    }

    handleKeyboardShortcuts(e) {
        // Command/Ctrl + O - Import
        if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
            e.preventDefault();
            this.importCollection();
        }

        // Command/Ctrl + S - Export
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            this.exportCollection();
        }
    }

    switchTab(tabName) {
        // Hide all tab panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.style.display = 'none';
        });

        // Show selected tab pane
        const tabPane = document.getElementById(`${tabName}Tab`);
        if (tabPane) {
            tabPane.style.display = 'block';
        }

        // Add active class to selected tab
        const activeTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        // Update tab content based on current state
        this.updateTabContent(tabName);
    }

    // Method placeholders
    importCollection() {}
    exportCollection() {}
    updateTabContent(tabName) {}
}

// Export the class
module.exports = SwitchTab;
