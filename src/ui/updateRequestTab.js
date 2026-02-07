// Update Request Tab class
class UpdateRequestTab {
    constructor() {
        this.state = null;
    }

    init(state) {
        this.state = state;
    }

    updateTabContent(tabName) {
        switch (tabName) {
            case 'request':
                this.updateRequestTab();
                break;
            case 'inheritance':
                this.updateInheritanceTab();
                break;
            case 'tests':
                this.updateTestsTab();
                break;
        }
    }

    updateRequestTab() {
        const requestTab = document.getElementById('requestTab');
        
        if (!this.state.currentRequest) {
            requestTab.innerHTML = `
                <div class="empty-state">
                    <div>Select or create a request to get started</div>
                    <div style="margin-top: 10px; font-size: 13px;">
                        <button id="createRequestFromEmpty" class="secondary">Create New Request</button>
                    </div>
                </div>
            `;
            
            document.getElementById('createRequestFromEmpty').addEventListener('click', () => this.createNewRequest());
            return;
        }

        requestTab.innerHTML = `
            <div class="form-group">
                <label for="requestName">Request Name</label>
                <input type="text" id="requestName" class="form-control" value="${this.state.currentRequest.name}">
            </div>

            <div class="form-group">
                <label for="requestMethod">HTTP Method</label>
                <select id="requestMethod" class="form-control">
                    <option value="GET" ${this.state.currentRequest.method === 'GET' ? 'selected' : ''}>GET</option>
                    <option value="POST" ${this.state.currentRequest.method === 'POST' ? 'selected' : ''}>POST</option>
                    <option value="PUT" ${this.state.currentRequest.method === 'PUT' ? 'selected' : ''}>PUT</option>
                    <option value="DELETE" ${this.state.currentRequest.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                    <option value="PATCH" ${this.state.currentRequest.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
                    <option value="HEAD" ${this.state.currentRequest.method === 'HEAD' ? 'selected' : ''}>HEAD</option>
                    <option value="OPTIONS" ${this.state.currentRequest.method === 'OPTIONS' ? 'selected' : ''}>OPTIONS</option>
                </select>
            </div>

            <div class="form-group">
                <label for="requestUrl">URL</label>
                <input type="text" id="requestUrl" class="form-control" value="${this.state.currentRequest.url}">
            </div>

            <div class="form-group">
                <label for="requestHeaders">Headers</label>
                <div id="requestHeaders" class="headers-container">
                    ${this.renderHeaders(this.state.currentRequest.headers)}
                </div>
                <button id="addHeaderBtn" class="secondary">Add Header</button>
            </div>

            <div class="form-group">
                <label for="requestBody">Body</label>
                <textarea id="requestBody" class="form-control" style="height: 200px;">${this.state.currentRequest.body}</textarea>
            </div>
        `;

        // Set up event listeners for the request tab
        this.setupRequestTabEventListeners();
    }

    renderHeaders(headers) {
        if (Object.keys(headers).length === 0) {
            return '<div class="empty-state" style="padding: 20px;">No headers defined</div>';
        }

        let html = '';
        for (const [key, value] of Object.entries(headers)) {
            html += `
                <div class="header-row">
                    <input type="text" class="header-key" value="${key}" placeholder="Header Name">
                    <input type="text" class="header-value" value="${value}" placeholder="Header Value">
                    <button class="remove-header-btn" data-key="${key}">❌</button>
                </div>
            `;
        }
        return html;
    }

    setupRequestTabEventListeners() {
        // Add header button
        document.getElementById('addHeaderBtn').addEventListener('click', () => this.addRequestHeader());

        // Remove header buttons
        document.querySelectorAll('.remove-header-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const key = e.target.dataset.key;
                this.removeRequestHeader(key);
            });
        });

        // Input change listeners
        const inputs = document.querySelectorAll('#requestTab input, #requestTab select, #requestTab textarea');
        inputs.forEach(input => {
            input.addEventListener('change', () => this.state.markAsChanged());
            input.addEventListener('input', () => this.state.markAsChanged());
        });
    }

    // Method placeholders
    createNewRequest() {}
    updateInheritanceTab() {}
    updateTestsTab() {}
    addRequestHeader() {}
    removeRequestHeader(key) {}
    markAsChanged() {}
}

// Export the class
module.exports = UpdateRequestTab;
