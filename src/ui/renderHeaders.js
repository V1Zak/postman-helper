// Render Headers class
class RenderHeaders {
    constructor() {
        this.state = null;
    }

    init(state) {
        this.state = state;
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
                <label>Headers</label>
                <div id="requestHeadersContainer" class="headers-container">
                    ${this.renderHeaders(this.state.currentRequest.headers)}
                </div>
                <button id="addRequestHeaderBtn" class="add-header-btn">+ Add Header</button>
            </div>
        `;

        // Set up event listeners
        document.getElementById('addRequestHeaderBtn').addEventListener('click', () => this.addRequestHeader());
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

    // Method placeholders
    createNewRequest() {}
    addRequestHeader() {}
}

// Export the class
module.exports = RenderHeaders;
