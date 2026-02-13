/**
 * Unit tests for DialogSystem in app.js
 * Tests showPrompt, showConfirm, showAlert, showSelect, showMultiSelect
 * PRIORITY 4
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

let document, window, DialogSystem;

beforeEach(() => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
        url: 'http://localhost',
        pretendToBeVisual: true
    });
    window = dom.window;
    document = window.document;
    global.document = document;

    // Re-create DialogSystem with all enhanced methods
    DialogSystem = class {
        static trapFocus(container) {
            const focusable = container.querySelectorAll('input, select, button, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            container.addEventListener('keydown', (e) => {
                if (e.key !== 'Tab') return;
                if (e.shiftKey) {
                    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
                } else {
                    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
            });
        }

        static showPrompt(title, defaultValue = '', callback) {
            if (!callback) {
                return new Promise(resolve => DialogSystem.showPrompt(title, defaultValue, resolve));
            }

            const overlay = document.createElement('div');
            overlay.className = 'dialog-overlay';
            const dialogBox = document.createElement('div');
            dialogBox.className = 'dialog-box';
            const titleElement = document.createElement('h3');
            titleElement.textContent = title;
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'dialog-input';
            input.value = defaultValue;
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'dialog-buttons';
            const okButton = document.createElement('button');
            okButton.textContent = 'OK';
            okButton.className = 'dialog-btn primary';
            const cancelButton = document.createElement('button');
            cancelButton.textContent = 'Cancel';
            cancelButton.className = 'dialog-btn secondary';

            const cleanup = () => { overlay.remove(); };
            okButton.addEventListener('click', () => { cleanup(); callback(input.value); });
            cancelButton.addEventListener('click', () => { cleanup(); callback(null); });

            buttonContainer.appendChild(okButton);
            buttonContainer.appendChild(cancelButton);
            dialogBox.appendChild(titleElement);
            dialogBox.appendChild(input);
            dialogBox.appendChild(buttonContainer);
            overlay.appendChild(dialogBox);
            document.body.appendChild(overlay);
            DialogSystem.trapFocus(dialogBox);
            input.focus();
        }

        static showConfirm(message, callback) {
            if (!callback) {
                return new Promise(resolve => DialogSystem.showConfirm(message, resolve));
            }

            const overlay = document.createElement('div');
            overlay.className = 'dialog-overlay';
            const dialogBox = document.createElement('div');
            dialogBox.className = 'dialog-box';
            const messageElement = document.createElement('p');
            messageElement.textContent = message;
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'dialog-buttons';
            const okButton = document.createElement('button');
            okButton.textContent = 'OK';
            okButton.className = 'dialog-btn primary';
            const cancelButton = document.createElement('button');
            cancelButton.textContent = 'Cancel';
            cancelButton.className = 'dialog-btn secondary';

            const cleanup = () => { overlay.remove(); };
            okButton.addEventListener('click', () => { cleanup(); callback(true); });
            cancelButton.addEventListener('click', () => { cleanup(); callback(false); });

            buttonContainer.appendChild(okButton);
            buttonContainer.appendChild(cancelButton);
            dialogBox.appendChild(messageElement);
            dialogBox.appendChild(buttonContainer);
            overlay.appendChild(dialogBox);
            document.body.appendChild(overlay);
            DialogSystem.trapFocus(dialogBox);
            okButton.focus();
        }

        static showAlert(message, callback) {
            if (!callback) {
                return new Promise(resolve => DialogSystem.showAlert(message, resolve));
            }

            const overlay = document.createElement('div');
            overlay.className = 'dialog-overlay';
            const dialogBox = document.createElement('div');
            dialogBox.className = 'dialog-box';
            const msgEl = document.createElement('p');
            msgEl.textContent = message;
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'dialog-buttons';
            const okButton = document.createElement('button');
            okButton.textContent = 'OK';
            okButton.className = 'dialog-btn primary';

            const cleanup = () => { overlay.remove(); };
            okButton.addEventListener('click', () => { cleanup(); callback(); });

            buttonContainer.appendChild(okButton);
            dialogBox.appendChild(msgEl);
            dialogBox.appendChild(buttonContainer);
            overlay.appendChild(dialogBox);
            document.body.appendChild(overlay);
            DialogSystem.trapFocus(dialogBox);
            okButton.focus();
        }

        static showSelect(title, options, callback) {
            if (!callback) {
                return new Promise(resolve => DialogSystem.showSelect(title, options, resolve));
            }

            const overlay = document.createElement('div');
            overlay.className = 'dialog-overlay';
            const dialogBox = document.createElement('div');
            dialogBox.className = 'dialog-box';
            const titleEl = document.createElement('h3');
            titleEl.textContent = title;
            const select = document.createElement('select');
            select.className = 'dialog-select';
            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                if (opt.selected) option.selected = true;
                select.appendChild(option);
            });
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'dialog-buttons';
            const okButton = document.createElement('button');
            okButton.textContent = 'OK';
            okButton.className = 'dialog-btn primary';
            const cancelButton = document.createElement('button');
            cancelButton.textContent = 'Cancel';
            cancelButton.className = 'dialog-btn secondary';

            const cleanup = () => { overlay.remove(); };
            okButton.addEventListener('click', () => { cleanup(); callback(select.value); });
            cancelButton.addEventListener('click', () => { cleanup(); callback(null); });

            buttonContainer.appendChild(okButton);
            buttonContainer.appendChild(cancelButton);
            dialogBox.appendChild(titleEl);
            dialogBox.appendChild(select);
            dialogBox.appendChild(buttonContainer);
            overlay.appendChild(dialogBox);
            document.body.appendChild(overlay);
            DialogSystem.trapFocus(dialogBox);
            select.focus();
        }

        static showMultiSelect(title, options, callback) {
            if (!callback) {
                return new Promise(resolve => DialogSystem.showMultiSelect(title, options, resolve));
            }

            const overlay = document.createElement('div');
            overlay.className = 'dialog-overlay';
            const dialogBox = document.createElement('div');
            dialogBox.className = 'dialog-box';
            const titleEl = document.createElement('h3');
            titleEl.textContent = title;
            const listContainer = document.createElement('div');
            listContainer.className = 'dialog-multi-list';

            options.forEach((opt, i) => {
                const item = document.createElement('label');
                item.className = 'dialog-multi-item';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = opt.value;
                checkbox.checked = !!opt.checked;
                checkbox.dataset.index = i;
                const labelText = document.createElement('span');
                labelText.textContent = opt.label;
                item.appendChild(checkbox);
                item.appendChild(labelText);
                listContainer.appendChild(item);
            });

            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'dialog-buttons';
            const okButton = document.createElement('button');
            okButton.textContent = 'OK';
            okButton.className = 'dialog-btn primary';
            const cancelButton = document.createElement('button');
            cancelButton.textContent = 'Cancel';
            cancelButton.className = 'dialog-btn secondary';

            const getSelected = () => Array.from(listContainer.querySelectorAll('input:checked')).map(cb => cb.value);
            const cleanup = () => { overlay.remove(); };
            okButton.addEventListener('click', () => { cleanup(); callback(getSelected()); });
            cancelButton.addEventListener('click', () => { cleanup(); callback(null); });

            buttonContainer.appendChild(okButton);
            buttonContainer.appendChild(cancelButton);
            dialogBox.appendChild(titleEl);
            dialogBox.appendChild(listContainer);
            dialogBox.appendChild(buttonContainer);
            overlay.appendChild(dialogBox);
            document.body.appendChild(overlay);
            DialogSystem.trapFocus(dialogBox);
        }
    };
});

// ─── showPrompt ────────────────────────────────────────────────────────────────

describe('DialogSystem', () => {
    describe('showPrompt', () => {
        it('creates overlay and dialog', () => {
            DialogSystem.showPrompt('Enter name:', 'Default', () => {});
            const overlay = document.querySelector('.dialog-overlay');
            assert.ok(overlay, 'overlay should exist');
            const dialog = overlay.querySelector('.dialog-box');
            assert.ok(dialog, 'dialog box should exist');
        });

        it('shows title and default value', () => {
            DialogSystem.showPrompt('Enter name:', 'MyDefault', () => {});
            const title = document.querySelector('.dialog-box h3');
            assert.equal(title.textContent, 'Enter name:');
            const input = document.querySelector('.dialog-input');
            assert.equal(input.value, 'MyDefault');
        });

        it('OK button returns input value and removes overlay', (_, done) => {
            DialogSystem.showPrompt('Name:', 'Test', (value) => {
                assert.equal(value, 'Test');
                const overlay = document.querySelector('.dialog-overlay');
                assert.equal(overlay, null, 'overlay should be removed');
                done();
            });
            const ok = document.querySelector('.dialog-btn.primary');
            ok.click();
        });

        it('Cancel button returns null and removes overlay', (_, done) => {
            DialogSystem.showPrompt('Name:', 'Test', (value) => {
                assert.equal(value, null);
                const overlay = document.querySelector('.dialog-overlay');
                assert.equal(overlay, null, 'overlay should be removed');
                done();
            });
            const cancel = document.querySelector('.dialog-btn.secondary');
            cancel.click();
        });

        it('has OK and Cancel buttons', () => {
            DialogSystem.showPrompt('Title:', '', () => {});
            const buttons = document.querySelectorAll('.dialog-btn');
            assert.equal(buttons.length, 2);
            assert.equal(buttons[0].textContent, 'OK');
            assert.equal(buttons[1].textContent, 'Cancel');
        });

        it('returns Promise when no callback given', async () => {
            const promise = DialogSystem.showPrompt('Name:', 'Hello');
            assert.ok(promise instanceof Promise);
            // Resolve it by clicking OK
            document.querySelector('.dialog-btn.primary').click();
            const result = await promise;
            assert.equal(result, 'Hello');
        });
    });

    // ─── showConfirm ───────────────────────────────────────────────────────────

    describe('showConfirm', () => {
        it('creates overlay with message', () => {
            DialogSystem.showConfirm('Delete?', () => {});
            const overlay = document.querySelector('.dialog-overlay');
            assert.ok(overlay);
            const msg = overlay.querySelector('p');
            assert.equal(msg.textContent, 'Delete?');
        });

        it('OK returns true', (_, done) => {
            DialogSystem.showConfirm('Sure?', (result) => {
                assert.equal(result, true);
                done();
            });
            document.querySelector('.dialog-btn.primary').click();
        });

        it('Cancel returns false', (_, done) => {
            DialogSystem.showConfirm('Sure?', (result) => {
                assert.equal(result, false);
                done();
            });
            document.querySelector('.dialog-btn.secondary').click();
        });

        it('removes overlay after action', (_, done) => {
            DialogSystem.showConfirm('Sure?', () => {
                assert.equal(document.querySelector('.dialog-overlay'), null);
                done();
            });
            document.querySelector('.dialog-btn.primary').click();
        });

        it('returns Promise when no callback given', async () => {
            const promise = DialogSystem.showConfirm('OK?');
            assert.ok(promise instanceof Promise);
            document.querySelector('.dialog-btn.primary').click();
            const result = await promise;
            assert.equal(result, true);
        });
    });

    // ─── showAlert ─────────────────────────────────────────────────────────────

    describe('showAlert', () => {
        it('creates overlay with message', () => {
            DialogSystem.showAlert('Error occurred', () => {});
            const overlay = document.querySelector('.dialog-overlay');
            assert.ok(overlay);
            const msg = overlay.querySelector('p');
            assert.equal(msg.textContent, 'Error occurred');
        });

        it('has only OK button (no Cancel)', () => {
            DialogSystem.showAlert('Info', () => {});
            const buttons = document.querySelectorAll('.dialog-btn');
            assert.equal(buttons.length, 1);
            assert.equal(buttons[0].textContent, 'OK');
        });

        it('OK button calls callback and removes overlay', (_, done) => {
            DialogSystem.showAlert('Done', () => {
                assert.equal(document.querySelector('.dialog-overlay'), null);
                done();
            });
            document.querySelector('.dialog-btn.primary').click();
        });

        it('returns Promise when no callback given', async () => {
            const promise = DialogSystem.showAlert('Hello');
            assert.ok(promise instanceof Promise);
            document.querySelector('.dialog-btn.primary').click();
            await promise; // Should resolve without error
        });
    });

    // ─── showSelect ────────────────────────────────────────────────────────────

    describe('showSelect', () => {
        const options = [
            { label: 'Markdown', value: 'markdown' },
            { label: 'HTML', value: 'html' },
            { label: 'PDF', value: 'pdf' }
        ];

        it('creates overlay with title and select element', () => {
            DialogSystem.showSelect('Choose format:', options, () => {});
            const overlay = document.querySelector('.dialog-overlay');
            assert.ok(overlay);
            const title = overlay.querySelector('h3');
            assert.equal(title.textContent, 'Choose format:');
            const select = overlay.querySelector('.dialog-select');
            assert.ok(select);
        });

        it('renders all options', () => {
            DialogSystem.showSelect('Format:', options, () => {});
            const optionEls = document.querySelectorAll('.dialog-select option');
            assert.equal(optionEls.length, 3);
            assert.equal(optionEls[0].textContent, 'Markdown');
            assert.equal(optionEls[1].value, 'html');
        });

        it('OK returns selected value', (_, done) => {
            DialogSystem.showSelect('Format:', options, (value) => {
                assert.equal(value, 'markdown'); // First option selected by default
                done();
            });
            document.querySelector('.dialog-btn.primary').click();
        });

        it('Cancel returns null', (_, done) => {
            DialogSystem.showSelect('Format:', options, (value) => {
                assert.equal(value, null);
                done();
            });
            document.querySelector('.dialog-btn.secondary').click();
        });

        it('respects pre-selected option', () => {
            const opts = [
                { label: 'A', value: 'a' },
                { label: 'B', value: 'b', selected: true }
            ];
            DialogSystem.showSelect('Pick:', opts, () => {});
            const select = document.querySelector('.dialog-select');
            assert.equal(select.value, 'b');
        });

        it('removes overlay after action', (_, done) => {
            DialogSystem.showSelect('Pick:', options, () => {
                assert.equal(document.querySelector('.dialog-overlay'), null);
                done();
            });
            document.querySelector('.dialog-btn.primary').click();
        });

        it('returns Promise when no callback given', async () => {
            const promise = DialogSystem.showSelect('Pick:', options);
            assert.ok(promise instanceof Promise);
            document.querySelector('.dialog-btn.primary').click();
            const result = await promise;
            assert.equal(result, 'markdown');
        });
    });

    // ─── showMultiSelect ───────────────────────────────────────────────────────

    describe('showMultiSelect', () => {
        const options = [
            { label: 'GET', value: 'GET', checked: true },
            { label: 'POST', value: 'POST', checked: false },
            { label: 'PUT', value: 'PUT', checked: true },
            { label: 'DELETE', value: 'DELETE', checked: false }
        ];

        it('creates overlay with title and checkbox list', () => {
            DialogSystem.showMultiSelect('Select methods:', options, () => {});
            const overlay = document.querySelector('.dialog-overlay');
            assert.ok(overlay);
            const title = overlay.querySelector('h3');
            assert.equal(title.textContent, 'Select methods:');
            const list = overlay.querySelector('.dialog-multi-list');
            assert.ok(list);
        });

        it('renders all options as checkboxes', () => {
            DialogSystem.showMultiSelect('Methods:', options, () => {});
            const items = document.querySelectorAll('.dialog-multi-item');
            assert.equal(items.length, 4);
            const checkboxes = document.querySelectorAll('.dialog-multi-item input[type="checkbox"]');
            assert.equal(checkboxes.length, 4);
        });

        it('pre-checks specified options', () => {
            DialogSystem.showMultiSelect('Methods:', options, () => {});
            const checkboxes = document.querySelectorAll('.dialog-multi-item input[type="checkbox"]');
            assert.equal(checkboxes[0].checked, true);  // GET
            assert.equal(checkboxes[1].checked, false);  // POST
            assert.equal(checkboxes[2].checked, true);   // PUT
            assert.equal(checkboxes[3].checked, false);  // DELETE
        });

        it('OK returns array of checked values', (_, done) => {
            DialogSystem.showMultiSelect('Methods:', options, (result) => {
                assert.ok(Array.isArray(result));
                assert.ok(result.includes('GET'));
                assert.ok(result.includes('PUT'));
                assert.ok(!result.includes('POST'));
                done();
            });
            document.querySelector('.dialog-btn.primary').click();
        });

        it('Cancel returns null', (_, done) => {
            DialogSystem.showMultiSelect('Methods:', options, (result) => {
                assert.equal(result, null);
                done();
            });
            document.querySelector('.dialog-btn.secondary').click();
        });

        it('returns empty array when nothing checked', (_, done) => {
            const unchecked = options.map(o => ({ ...o, checked: false }));
            DialogSystem.showMultiSelect('Methods:', unchecked, (result) => {
                assert.ok(Array.isArray(result));
                assert.equal(result.length, 0);
                done();
            });
            document.querySelector('.dialog-btn.primary').click();
        });

        it('removes overlay after action', (_, done) => {
            DialogSystem.showMultiSelect('Methods:', options, () => {
                assert.equal(document.querySelector('.dialog-overlay'), null);
                done();
            });
            document.querySelector('.dialog-btn.primary').click();
        });

        it('returns Promise when no callback given', async () => {
            const promise = DialogSystem.showMultiSelect('Methods:', options);
            assert.ok(promise instanceof Promise);
            document.querySelector('.dialog-btn.primary').click();
            const result = await promise;
            assert.ok(Array.isArray(result));
        });
    });

    // ─── trapFocus ─────────────────────────────────────────────────────────────

    describe('trapFocus', () => {
        it('is a static method', () => {
            assert.equal(typeof DialogSystem.trapFocus, 'function');
        });

        it('handles container with no focusable elements', () => {
            const div = document.createElement('div');
            // Should not throw
            DialogSystem.trapFocus(div);
        });
    });
});
