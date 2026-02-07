// ShowSettings Manager - CommonJS Version
// Using CommonJS requires for Electron compatibility

class ShowSettings {
    constructor(app) {
        this.app = app;
    }

    // Method to show settings dialog
    async showSettings() {
        const { dialog } = require('electron');
        const fs = require('fs');
        const path = require('path');

        // Show save dialog for settings file
        const { filePath } = await dialog.showSaveDialog({
            title: 'Save Settings',
            defaultPath: 'postman-helper-settings.json',
            filters: [
                { name: 'JSON Files', extensions: ['json'] }
            ]
        });

        if (!filePath) return; // User cancelled

        // Get current settings from app state
        const settings = {
            globalHeaders: this.app.appState.globalHeaders,
            baseEndpoints: this.app.appState.baseEndpoints,
            bodyTemplates: this.app.appState.bodyTemplates,
            testTemplates: this.app.appState.testTemplates
        };

        // Write to file
        fs.writeFile(filePath, JSON.stringify(settings, null, 2), (err) => {
            if (err) {
                console.error('Error saving settings:', err);
                alert('Error saving settings.');
            } else {
                alert(`Settings saved successfully to: ${filePath}`);
            }
        });
    }

    // Method to load settings from file
    async loadSettings() {
        const { dialog } = require('electron');
        const fs = require('fs');

        // Show open dialog for settings file
        const { filePaths } = await dialog.showOpenDialog({
            title: 'Load Settings',
            filters: [
                { name: 'JSON Files', extensions: ['json'] }
            ]
        });

        if (!filePaths || filePaths.length === 0) return; // User cancelled

        // Read file
        fs.readFile(filePaths[0], 'utf-8', (err, data) => {
            if (err) {
                console.error('Error loading settings:', err);
                alert('Error loading settings.');
                return;
            }

            try {
                const settings = JSON.parse(data);
                
                // Update app state
                this.app.appState.globalHeaders = settings.globalHeaders || [];
                this.app.appState.baseEndpoints = settings.baseEndpoints || [];
                this.app.appState.bodyTemplates = settings.bodyTemplates || [];
                this.app.appState.testTemplates = settings.testTemplates || [];
                
                alert('Settings loaded successfully!');
            } catch (error) {
                console.error('Error parsing settings file:', error);
                alert('Error parsing settings file.');
            }
        });
    }

    // Method to set up event listeners for settings
    setupEventListeners() {
        const saveSettingsBtn = document.getElementById('saveSettingsBtn');
        const loadSettingsBtn = document.getElementById('loadSettingsBtn');
        
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => {
                this.showSettings();
            });
        }
        
        if (loadSettingsBtn) {
            loadSettingsBtn.addEventListener('click', () => {
                this.loadSettings();
            });
        }
    }
}

// Export the ShowSettings class
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ShowSettings };
}
