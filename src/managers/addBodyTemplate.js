// AddBodyTemplate.js
// This module handles adding body templates to requests in the Postman Helper application

class AddBodyTemplate {
    constructor(state) {
        this.state = state;
    }

    // Method to add a new body template
    addBodyTemplate(templateName, templateContent) {
        try {
            const template = {
                name: templateName,
                content: templateContent,
                timestamp: new Date().toISOString()
            };
            
            this.state.addBodyTemplate(template);
            this.state.markAsChanged();
            return template;
        } catch (error) {
            console.error('Error adding body template:', error);
            throw error;
        }
    }

    // Method to create a body template row in the UI
    createBodyTemplateRow(template, container) {
        const templateRow = document.createElement('div');
        templateRow.className = 'body-template-row';
        templateRow.style.marginBottom = '8px';
        templateRow.style.display = 'flex';
        templateRow.style.alignItems = 'center';
        
        const templateNameSpan = document.createElement('span');
        templateNameSpan.textContent = template.name;
        templateNameSpan.style.flex = '1';
        templateNameSpan.style.wordBreak = 'break-all';
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-body-template-btn';
        removeBtn.textContent = '❌';
        removeBtn.dataset.templateName = template.name;
        removeBtn.style.marginLeft = '10px';
        removeBtn.style.padding = '5px 10px';
        
        templateRow.appendChild(templateNameSpan);
        templateRow.appendChild(removeBtn);
        container.appendChild(templateRow);
        
        // Set up event listener for removing the template
        removeBtn.addEventListener('click', () => {
            this.state.removeBodyTemplate(template.name);
            this.state.markAsChanged();
            templateRow.remove();
            
            if (container.children.length === 0) {
                container.innerHTML = '<div class="empty-state" style="padding: 20px;">No body templates defined</div>';
            }
        });
    }

    // Method to update the body templates UI
    updateBodyTemplatesUI() {
        const container = document.getElementById('bodyTemplatesContainer');
        const templates = this.state.getBodyTemplates();
        
        container.innerHTML = '';
        
        if (templates.length === 0) {
            container.innerHTML = '<div class="empty-state" style="padding: 20px;">No body templates defined</div>';
        } else {
            for (const template of templates) {
                this.createBodyTemplateRow(template, container);
            }
        }
    }

    // Method to set up event listeners for body template management
    setupEventListeners() {
        // Event listener for adding new body templates
        const addTemplateBtn = document.getElementById('addBodyTemplateBtn');
        if (addTemplateBtn) {
            addTemplateBtn.addEventListener('click', () => {
                const templateName = prompt('Enter template name:');
                if (templateName) {
                    const templateContent = prompt('Enter template content:');
                    if (templateContent) {
                        this.addBodyTemplate(templateName, templateContent);
                        this.updateBodyTemplatesUI();
                    }
                }
            });
        }
    }
}

// Export the AddBodyTemplate class
module.exports = { AddBodyTemplate };
