/**
 * Unit tests for showToast, _repositionToasts, _drainToastQueue
 * Tests close button, rate limiting (max 5), dynamic stacking, queue drain
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

let document, window, app;

/**
 * Minimal object that mirrors PostmanHelperApp's toast methods.
 * Extracted from app.js showToast / _repositionToasts / _drainToastQueue.
 */
function createToastHost(doc) {
    return {
        _toastQueue: [],
        showToast(message, duration = 2000, type = 'info') {
            const MAX_VISIBLE = 5;
            const visible = doc.querySelectorAll('.toast.toast-visible');
            if (visible.length >= MAX_VISIBLE) {
                this._toastQueue.push({ message, duration, type });
                return;
            }

            const toast = doc.createElement('div');
            toast.className = `toast toast-${type}`;

            const msgSpan = doc.createElement('span');
            msgSpan.className = 'toast-message';
            msgSpan.textContent = message;
            toast.appendChild(msgSpan);

            const closeBtn = doc.createElement('button');
            closeBtn.className = 'toast-close';
            closeBtn.innerHTML = '&times;';
            closeBtn.setAttribute('aria-label', 'Dismiss');
            toast.appendChild(closeBtn);

            doc.body.appendChild(toast);

            this._repositionToasts();

            const self = this;
            const dismissToast = () => {
                if (toast._dismissed) return;
                toast._dismissed = true;
                clearTimeout(timer);
                toast.classList.remove('toast-visible');
                // In JSDOM setTimeout won't run automatically, so do cleanup inline for tests
                toast.remove();
                self._repositionToasts();
                self._drainToastQueue();
            };

            closeBtn.addEventListener('click', dismissToast);

            // Immediately add visible for test purposes (no rAF in JSDOM)
            toast.classList.add('toast-visible');

            toast._dismiss = dismissToast;

            const timer = setTimeout(dismissToast, duration);
            return toast;
        },

        _repositionToasts() {
            const toasts = doc.querySelectorAll('.toast');
            let bottom = 60;
            toasts.forEach(t => {
                t.style.bottom = `${bottom}px`;
                // JSDOM doesn't compute offsetHeight, so use a default
                bottom += 52 + 8;
            });
        },

        _drainToastQueue() {
            if (!this._toastQueue || this._toastQueue.length === 0) return;
            const visible = doc.querySelectorAll('.toast.toast-visible');
            if (visible.length < 5) {
                const next = this._toastQueue.shift();
                this.showToast(next.message, next.duration, next.type);
            }
        }
    };
}

beforeEach(() => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
        url: 'http://localhost',
        pretendToBeVisual: true
    });
    window = dom.window;
    document = window.document;
    global.document = document;
    app = createToastHost(document);
});

afterEach(() => {
    delete global.document;
});

describe('showToast: basic rendering', () => {
    it('creates a toast element in the DOM', () => {
        app.showToast('Hello');
        const toasts = document.querySelectorAll('.toast');
        assert.equal(toasts.length, 1);
    });

    it('sets the correct message text', () => {
        app.showToast('Test message');
        const msg = document.querySelector('.toast-message');
        assert.equal(msg.textContent, 'Test message');
    });

    it('applies type class: info (default)', () => {
        app.showToast('Info toast');
        const toast = document.querySelector('.toast');
        assert.ok(toast.classList.contains('toast-info'));
    });

    it('applies type class: success', () => {
        app.showToast('Success', 2000, 'success');
        const toast = document.querySelector('.toast');
        assert.ok(toast.classList.contains('toast-success'));
    });

    it('applies type class: error', () => {
        app.showToast('Error', 2000, 'error');
        const toast = document.querySelector('.toast');
        assert.ok(toast.classList.contains('toast-error'));
    });

    it('applies type class: warning', () => {
        app.showToast('Warning', 2000, 'warning');
        const toast = document.querySelector('.toast');
        assert.ok(toast.classList.contains('toast-warning'));
    });

    it('adds toast-visible class', () => {
        app.showToast('Visible');
        const toast = document.querySelector('.toast');
        assert.ok(toast.classList.contains('toast-visible'));
    });
});

describe('showToast: close button', () => {
    it('renders a close button', () => {
        app.showToast('Closable');
        const closeBtn = document.querySelector('.toast-close');
        assert.ok(closeBtn);
        assert.equal(closeBtn.getAttribute('aria-label'), 'Dismiss');
    });

    it('removes toast when close button is clicked', () => {
        app.showToast('Dismiss me');
        assert.equal(document.querySelectorAll('.toast').length, 1);

        const closeBtn = document.querySelector('.toast-close');
        closeBtn.click();
        assert.equal(document.querySelectorAll('.toast').length, 0);
    });

    it('dismissing twice does not throw', () => {
        const toast = app.showToast('Double dismiss');
        toast._dismiss();
        toast._dismiss(); // idempotent
        assert.equal(document.querySelectorAll('.toast').length, 0);
    });
});

describe('showToast: stacking', () => {
    it('stacks multiple toasts at increasing bottom offsets', () => {
        app.showToast('First');
        app.showToast('Second');
        app.showToast('Third');

        const toasts = document.querySelectorAll('.toast');
        assert.equal(toasts.length, 3);

        // Each should have a different bottom value
        const bottoms = Array.from(toasts).map(t => parseInt(t.style.bottom, 10));
        assert.ok(bottoms[0] < bottoms[1], 'second toast should be higher than first');
        assert.ok(bottoms[1] < bottoms[2], 'third toast should be higher than second');
    });

    it('repositions remaining toasts after one is dismissed', () => {
        const t1 = app.showToast('First');
        app.showToast('Second');

        // Dismiss the first toast
        t1._dismiss();

        const toasts = document.querySelectorAll('.toast');
        assert.equal(toasts.length, 1);
        // Remaining toast should start at base offset
        assert.equal(parseInt(toasts[0].style.bottom, 10), 60);
    });
});

describe('showToast: rate limiting (max 5)', () => {
    it('allows up to 5 visible toasts', () => {
        for (let i = 0; i < 5; i++) {
            app.showToast(`Toast ${i}`);
        }
        const visible = document.querySelectorAll('.toast.toast-visible');
        assert.equal(visible.length, 5);
    });

    it('queues the 6th toast', () => {
        for (let i = 0; i < 6; i++) {
            app.showToast(`Toast ${i}`);
        }
        const visible = document.querySelectorAll('.toast.toast-visible');
        assert.equal(visible.length, 5);
        assert.equal(app._toastQueue.length, 1);
        assert.equal(app._toastQueue[0].message, 'Toast 5');
    });

    it('queues multiple excess toasts', () => {
        for (let i = 0; i < 8; i++) {
            app.showToast(`Toast ${i}`);
        }
        assert.equal(document.querySelectorAll('.toast.toast-visible').length, 5);
        assert.equal(app._toastQueue.length, 3);
    });

    it('drains queue when a toast is dismissed', () => {
        const toasts = [];
        for (let i = 0; i < 6; i++) {
            const t = app.showToast(`Toast ${i}`);
            if (t) toasts.push(t);
        }
        // 5 visible, 1 queued
        assert.equal(document.querySelectorAll('.toast.toast-visible').length, 5);
        assert.equal(app._toastQueue.length, 1);

        // Dismiss the first toast — should drain queue
        toasts[0]._dismiss();
        assert.equal(document.querySelectorAll('.toast.toast-visible').length, 5);
        assert.equal(app._toastQueue.length, 0);
    });

    it('preserves queued toast properties', () => {
        for (let i = 0; i < 5; i++) {
            app.showToast(`Toast ${i}`, 2000, 'info');
        }
        app.showToast('Error toast', 4000, 'error');
        assert.equal(app._toastQueue[0].message, 'Error toast');
        assert.equal(app._toastQueue[0].duration, 4000);
        assert.equal(app._toastQueue[0].type, 'error');
    });
});

describe('showToast: _repositionToasts', () => {
    it('sets bottom offsets starting from 60', () => {
        app.showToast('A');
        const toast = document.querySelector('.toast');
        assert.equal(parseInt(toast.style.bottom, 10), 60);
    });

    it('handles empty DOM gracefully', () => {
        app._repositionToasts(); // no toasts exist
        // Should not throw
    });
});

describe('showToast: _drainToastQueue', () => {
    it('does nothing when queue is empty', () => {
        app._drainToastQueue(); // should not throw
        assert.equal(document.querySelectorAll('.toast').length, 0);
    });

    it('does nothing when queue is undefined', () => {
        app._toastQueue = undefined;
        app._drainToastQueue(); // should not throw
    });

    it('drains one item from queue', () => {
        app._toastQueue = [{ message: 'Queued', duration: 2000, type: 'info' }];
        // No visible toasts, so drain should show it
        app._drainToastQueue();
        assert.equal(document.querySelectorAll('.toast.toast-visible').length, 1);
        assert.equal(app._toastQueue.length, 0);
    });
});

describe('showToast: alert() replacement coverage', () => {
    it('success toast for request saved', () => {
        app.showToast('Request saved successfully!', 2000, 'success');
        const msg = document.querySelector('.toast-message');
        assert.equal(msg.textContent, 'Request saved successfully!');
        assert.ok(document.querySelector('.toast').classList.contains('toast-success'));
    });

    it('success toast for tests saved', () => {
        app.showToast('Tests saved successfully!', 2000, 'success');
        const msg = document.querySelector('.toast-message');
        assert.equal(msg.textContent, 'Tests saved successfully!');
    });

    it('warning toast for invalid endpoint', () => {
        app.showToast('Please enter a valid endpoint URL', 2000, 'warning');
        assert.ok(document.querySelector('.toast').classList.contains('toast-warning'));
    });

    it('error toast for import error', () => {
        app.showToast('Error importing collection: parse error', 4000, 'error');
        assert.ok(document.querySelector('.toast').classList.contains('toast-error'));
        assert.equal(document.querySelector('.toast-message').textContent, 'Error importing collection: parse error');
    });

    it('warning toast for no collection to export', () => {
        app.showToast('No collection to export', 2000, 'warning');
        assert.ok(document.querySelector('.toast').classList.contains('toast-warning'));
    });

    it('success toast for export success', () => {
        app.showToast('Collection exported successfully to: /path/file.json', 3000, 'success');
        assert.ok(document.querySelector('.toast-message').textContent.includes('/path/file.json'));
    });

    it('error toast for export error', () => {
        app.showToast('Error exporting collection: write error', 4000, 'error');
        assert.ok(document.querySelector('.toast').classList.contains('toast-error'));
    });
});
