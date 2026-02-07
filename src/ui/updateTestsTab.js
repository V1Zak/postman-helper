// Update Tests Tab class
class UpdateTestsTab {
    constructor() {
        this.state = null;
    }

    init(state) {
        this.state = state;
    }

    updateTestsTab(requestTab) {
        const inputs = requestTab.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('change', () => this.state.markAsChanged());
            input.addEventListener('input', () => this.state.markAsChanged());
        });
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

    updateInheritanceTab() {
        const inheritanceTab = document.getElementById('inheritanceTab');
        
        // Update global headers
        const globalHeadersContainer = document.getElementById('globalHeadersContainer');
        if (Object.keys(this.state.inheritanceManager.getGlobalHeaders()).length === 0) {
            globalHeadersContainer.innerHTML = '<div class="empty-state" style="padding: 20px;">No global headers defined</div>';
        } else {
            let headersHtml = '';
            const headers = this.state.inheritanceManager.getGlobalHeaders();
            for (const [key, value] of Object.entries(headers)) {
                headersHtml += `
                    <div class="header-row">
                        <input type="text" class="header-key" value="${key}" placeholder="Header Name">
                        <input type="text" class="header-value" value="${value}" placeholder="Header Value">
                        <button class="remove-header-btn" data-key="${key}">❌</button>
                    </div>
                `;
            }
            globalHeadersContainer.innerHTML = headersHtml;
        }
    }

    // Method placeholders
    markAsChanged() {}
}

// Export the class
module.exports = UpdateTestsTab;
