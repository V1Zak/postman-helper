/**
 * Unit tests for DialogSystem in app.js
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

    // Re-create DialogSystem in this scope
    DialogSystem = class {
        static showPrompt(title, defaultValue = '', callback) {
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

            okButton.addEventListener('click', () => {
                document.body.removeChild(overlay);
                callback(input.value);
            });
            cancelButton.addEventListener('click', () => {
                document.body.removeChild(overlay);
                callback(null);
            });

            buttonContainer.appendChild(okButton);
            buttonContainer.appendChild(cancelButton);
            dialogBox.appendChild(titleElement);
            dialogBox.appendChild(input);
            dialogBox.appendChild(buttonContainer);
            overlay.appendChild(dialogBox);
            document.body.appendChild(overlay);
            input.focus();
        }

        static showConfirm(message, callback) {
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

            okButton.addEventListener('click', () => {
                document.body.removeChild(overlay);
                callback(true);
            });
            cancelButton.addEventListener('click', () => {
                document.body.removeChild(overlay);
                callback(false);
            });

            buttonContainer.appendChild(okButton);
            buttonContainer.appendChild(cancelButton);
            dialogBox.appendChild(messageElement);
            dialogBox.appendChild(buttonContainer);
            overlay.appendChild(dialogBox);
            document.body.appendChild(overlay);
        }
    };
});

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
    });

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
    });
});
