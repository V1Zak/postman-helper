// AddGlobalHeader.js
// This module handles adding global headers to requests in the Postman Helper application

class AddGlobalHeader {
    constructor(state) {
        this.state = state;
    }

    // Method to add a new global header
    addGlobalHeader(key, value) {
        try {
            this.state.inheritanceManager.addGlobalHeader(key, value);
            this.state.markAsChanged();
            return { key, value };
        } catch (error) {
            console.error('Error adding global header:', error);
            throw error;
        }
    }

    // Method to create a global header row in the UI
    createGlobalHeaderRow(key, value, container) {
        const headerRow = document.createElement('div');
        headerRow.className = 'global-header-row';
        headerRow.style.marginBottom = '8px';
        headerRow.style.display = 'flex';
        headerRow.style.alignItems = 'center';
        
        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.className = 'global-header-key';
        keyInput.value = key;
        keyInput.placeholder = 'Header Name';
        keyInput.style.flex = '1';
        keyInput.style.marginRight = '5px';
        
        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.className = 'global-header-value';
        valueInput.value = value;
        valueInput.placeholder = 'Header Value';
        valueInput.style.flex = '1';
        valueInput.style.marginRight = '5px';
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-global-header-btn';
        removeBtn.textContent = '❌';
        removeBtn.dataset.key = key;
        removeBtn.style.padding = '5px 10px';
        
        headerRow.appendChild(keyInput);
        headerRow.appendChild(valueInput);
        headerRow.appendChild(removeBtn);
        container.appendChild(headerRow);
        
        // Set up event listener for removing the header
        removeBtn.addEventListener('click', () => {
            this.state.inheritanceManager.removeGlobalHeader(key);
            this.state.markAsChanged();
            headerRow.remove();
            
            if (container.children.length === 0) {
                container.innerHTML = '<div class="empty-state" style="padding: 20px;">No global headers defined</div>';
            }
        });
        
        // Set up change listeners for the inputs
        const inputs = headerRow.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('change', () => {
                const newKey = keyInput.value;
                const newValue = valueInput.value;
                this.state.inheritanceManager.updateGlobalHeader(key, newKey, newValue);
                this.state.markAsChanged();
            });
        });
    }

    // Method to update the global headers UI
    updateGlobalHeadersUI() {
        const container = document.getElementById('globalHeadersContainer');
        const headers = this.state.inheritanceManager.getGlobalHeaders();
        
        container.innerHTML = '';
        
        if (Object.keys(headers).length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding: 20px;">No global headers defined</div>';
        } else {
            for (const [key, value] of Object.entries(headers)) {
                this.createGlobalHeaderRow(key, value, container);
            }
        }
    }

    // Method to set up event listeners for global header management
    setupEventListeners() {
        // Event listener for adding new global headers
        const addHeaderBtn = document.getElementById('addGlobalHeaderBtn');
        if (addHeaderBtn) {
            addHeaderBtn.addEventListener('click', () => {
                const key = prompt('Enter header name:');
                if (key) {
                    const value = prompt('Enter header value:');
                    if (value) {
                        this.addGlobalHeader(key, value);
                        this.updateGlobalHeadersUI();
                    }
                }
            });
        }
    }
}

// Export the AddGlobalHeader class
module.exports = { AddGlobalHeader };
