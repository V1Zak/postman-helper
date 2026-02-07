// AddTestTemplate.js
// This module handles adding test templates to requests in the Postman Helper application

class AddTestTemplate {
    constructor(state) {
        this.state = state;
    }

    // Method to add a new test template
    addTestTemplate(templateName, templateContent) {
        try {
            const template = {
                name: templateName,
                content: templateContent,
                timestamp: new Date().toISOString()
            };
            
            this.state.addTestTemplate(template);
            this.state.markAsChanged();
            return template;
        } catch (error) {
            console.error('Error adding test template:', error);
            throw error;
        }
    }

    // Method to create a test template row in the UI
    createTestTemplateRow(template, container) {
        const templateRow = document.createElement('div');
        templateRow.className = 'test-template-row';
        templateRow.style.marginBottom = '8px';
        templateRow.style.display = 'flex';
        templateRow.style.alignItems = 'center';
        
        const templateNameSpan = document.createElement('span');
        templateNameSpan.textContent = template.name;
        templateNameSpan.style.flex = '1';
        templateNameSpan.style.wordBreak = 'break-all';
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-test-template-btn';
        removeBtn.textContent = '❌';
        removeBtn.dataset.templateName = template.name;
        removeBtn.style.marginLeft = '10px';
        removeBtn.style.padding = '5px 10px';
        
        templateRow.appendChild(templateNameSpan);
        templateRow.appendChild(removeBtn);
        container.appendChild(templateRow);
        
        // Set up event listener for removing the template
        removeBtn.addEventListener('click', () => {
            this.state.removeTestTemplate(template.name);
            this.state.markAsChanged();
            templateRow.remove();
            
            if (container.children.length === 0) {
                container.innerHTML = '<div class="empty-state" style="padding: 20px;">No test templates defined</div>';
            }
        });
    }

    // Method to update the test templates UI
    updateTestTemplatesUI() {
        const container = document.getElementById('testTemplatesContainer');
        const templates = this.state.getTestTemplates();
        
        container.innerHTML = '';
        
        if (templates.length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding: 20px;">No test templates defined</div>';
        } else {
            for (const template of templates) {
                this.createTestTemplateRow(template, container);
            }
        }
    }

    // Method to set up event listeners for test template management
    setupEventListeners() {
        // Event listener for adding new test templates
        const addTemplateBtn = document.getElementById('addTestTemplateBtn');
        if (addTemplateBtn) {
            addTemplateBtn.addEventListener('click', () => {
                const templateName = prompt('Enter template name:');
                if (templateName) {
                    const templateContent = prompt('Enter template content:');
                    if (templateContent) {
                        this.addTestTemplate(templateName, templateContent);
                        this.updateTestTemplatesUI();
                    }
                }
            });
        }
    }

    // Method to save tests for the current request
    saveTests() {
        if (!this.state.currentRequest) {
            alert('Please select a request first');
            return;
        }

        const tests = document.getElementById('requestTests').value;
        this.state.currentRequest.tests = tests;
        this.state.markAsChanged();
        alert('Tests saved successfully!');
    }

    // Method to set up event listeners for test input
    setupTestInputListeners() {
        const testInput = document.getElementById('requestTests');
        if (testInput) {
            testInput.addEventListener('input', () => this.state.markAsChanged());
        }
    }
}

// Export the AddTestTemplate class
module.exports = { AddTestTemplate };
