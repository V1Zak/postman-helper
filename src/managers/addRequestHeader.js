// AddRequestHeader.js
// This module handles adding headers to individual requests in the Postman Helper application

class AddRequestHeader {
    constructor(state) {
        this.state = state;
    }

    // Method to add a new header to the current request
    addRequestHeader(key, value) {
        try {
            if (!this.state.currentRequest) {
                throw new Error('No current request selected');
            }
            
            this.state.currentRequest.addHeader(key, value);
            this.state.markAsChanged();
            return { key, value };
        } catch (error) {
            console.error('Error adding request header:', error);
            throw error;
        }
    }

    // Method to create a request header row in the UI
    createRequestHeaderRow(key, value, container) {
        const headerRow = document.createElement('div');
        headerRow.className = 'request-header-row';
        headerRow.style.marginBottom = '8px';
        headerRow.style.display = 'flex';
        headerRow.style.alignItems = 'center';
        
        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.className = 'request-header-key';
        keyInput.value = key;
        keyInput.placeholder = 'Header Name';
        keyInput.style.flex = '1';
        keyInput.style.marginRight = '5px';
        
        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.className = 'request-header-value';
        valueInput.value = value;
        valueInput.placeholder = 'Header Value';
        valueInput.style.flex = '1';
        valueInput.style.marginRight = '5px';
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-request-header-btn';
        removeBtn.textContent = '❌';
        removeBtn.dataset.key = key;
        removeBtn.style.padding = '5px 10px';
        
        headerRow.appendChild(keyInput);
        headerRow.appendChild(valueInput);
        headerRow.appendChild(removeBtn);
        container.appendChild(headerRow);
        
        // Set up event listener for removing the header
        removeBtn.addEventListener('click', () => {
            if (this.state.currentRequest) {
                this.state.currentRequest.removeHeader(key);
                this.state.markAsChanged();
                headerRow.remove();
                
                if (container.children.length === 0) {
                    container.innerHTML = '<div class="empty-state" style="padding: 20px;">No request headers defined</div>';
                }
            }
        });
        
        // Set up change listeners for the inputs
        const inputs = headerRow.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('change', () => {
                const newKey = keyInput.value;
                const newValue = valueInput.value;
                if (this.state.currentRequest) {
                    this.state.currentRequest.updateHeader(key, newKey, newValue);
                    this.state.markAsChanged();
                }
            });
        });
    }

    // Method to update the request headers UI
    updateRequestHeadersUI() {
        const container = document.getElementById('requestHeadersContainer');
        
        if (!this.state.currentRequest) {
            container.innerHTML = '<div class="empty-state" style="padding: 20px;">No request selected</div>';
            return;
        }
        
        const headers = this.state.currentRequest.getHeaders();
        
        container.innerHTML = '';
        
        if (Object.keys(headers).length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding: 20px;">No request headers defined</div>';
        } else {
            for (const [key, value] of Object.entries(headers)) {
                this.createRequestHeaderRow(key, value, container);
            }
        }
    }

    // Method to set up event listeners for request header management
    setupEventListeners() {
        // Event listener for adding new request headers
        const addHeaderBtn = document.getElementById('addRequestHeaderBtn');
        if (addHeaderBtn) {
            addHeaderBtn.addEventListener('click', () => {
                if (!this.state.currentRequest) {
                    alert('Please select a request first');
                    return;
                }
                
                const key = prompt('Enter header name:');
                if (key) {
                    const value = prompt('Enter header value:');
                    if (value) {
                        this.addRequestHeader(key, value);
                        this.updateRequestHeadersUI();
                    }
                }
            });
        }
    }
}

// Export the AddRequestHeader class
module.exports = { AddRequestHeader };
