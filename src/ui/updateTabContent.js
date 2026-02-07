// Update Tab Content class
class UpdateTabContent {
    constructor() {
        this.state = null;
    }

    init(state) {
        this.state = state;
    }

    switchTab(tabName) {
        // Hide all tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
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

    updateTabContent(tabName) {
        // This method would be implemented to update content based on the tab
        console.log(`Updating content for tab: ${tabName}`);
    }
}

// Export the class
module.exports = UpdateTabContent;
