/**
 * Unit tests for TutorialSystem — onboarding walkthrough (Issue #72)
 * Tests: shouldShow, markCompleted, reset, show, navigation, keyboard, close, defaultSteps
 */
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let TutorialSystem;

/**
 * Extract TutorialSystem from app.js source.
 * It sits between "// TutorialSystem" and "// AppState class"
 */
function extractTutorialSystem() {
    const appPath = path.join(__dirname, '..', 'app.js');
    const src = fs.readFileSync(appPath, 'utf-8');
    const lines = src.split('\n');

    let blockStart = -1;
    let blockEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^\/\/ TutorialSystem/) && blockStart === -1) {
            blockStart = i;
        }
        if (blockStart > -1 && i > blockStart && lines[i].match(/^\/\/ AppState class/)) {
            blockEnd = i;
            break;
        }
    }

    if (blockStart === -1 || blockEnd === -1) {
        throw new Error(`Could not find TutorialSystem in app.js (start=${blockStart}, end=${blockEnd})`);
    }

    const blockCode = lines.slice(blockStart, blockEnd).join('\n');
    const code = `${blockCode}\nmodule.exports = { TutorialSystem };`;

    const Module = require('module');
    const m = new Module('tutorial_virtual.js');
    m._compile(code, 'tutorial_virtual.js');
    return m.exports;
}

before(() => {
    const exported = extractTutorialSystem();
    TutorialSystem = exported.TutorialSystem;
});

// --- Helper: set up a minimal DOM + localStorage mock ---
function setupDOM() {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'http://localhost',
        pretendToBeVisual: true
    });
    global.document = dom.window.document;
    global.localStorage = dom.window.localStorage;
    global.requestAnimationFrame = (fn) => fn();
    // Use Node's native setTimeout (not JSDOM's which can recurse)
    return dom;
}

function teardownDOM(dom) {
    delete global.document;
    delete global.localStorage;
    delete global.requestAnimationFrame;
    dom.window.close();
}

// ===== Constructor =====
describe('TutorialSystem: Constructor', () => {
    it('initializes with default storageKey', () => {
        const t = new TutorialSystem();
        assert.strictEqual(t.storageKey, 'postman-helper-tutorial-completed');
    });

    it('accepts custom storageKey', () => {
        const t = new TutorialSystem({ storageKey: 'custom-key' });
        assert.strictEqual(t.storageKey, 'custom-key');
    });

    it('initializes currentStep to 0', () => {
        const t = new TutorialSystem();
        assert.strictEqual(t.currentStep, 0);
    });

    it('initializes overlay to null', () => {
        const t = new TutorialSystem();
        assert.strictEqual(t.overlay, null);
    });

    it('stores onComplete callback', () => {
        const cb = () => {};
        const t = new TutorialSystem({ onComplete: cb });
        assert.strictEqual(t.onComplete, cb);
    });

    it('initializes with default steps', () => {
        const t = new TutorialSystem();
        assert.ok(Array.isArray(t.steps));
        assert.ok(t.steps.length >= 3);
    });
});

// ===== Default Steps =====
describe('TutorialSystem: defaultSteps', () => {
    it('returns an array of 5 steps', () => {
        const steps = TutorialSystem.defaultSteps();
        assert.strictEqual(steps.length, 5);
    });

    it('each step has icon, title, body, shortcuts', () => {
        const steps = TutorialSystem.defaultSteps();
        for (const step of steps) {
            assert.ok(typeof step.icon === 'string', 'icon is string');
            assert.ok(typeof step.title === 'string', 'title is string');
            assert.ok(typeof step.body === 'string', 'body is string');
            assert.ok(Array.isArray(step.shortcuts), 'shortcuts is array');
        }
    });

    it('first step is a welcome step', () => {
        const steps = TutorialSystem.defaultSteps();
        assert.ok(steps[0].title.includes('Welcome'));
    });

    it('last step is about export', () => {
        const steps = TutorialSystem.defaultSteps();
        assert.ok(steps[steps.length - 1].title.includes('Export'));
    });
});

// ===== shouldShow / markCompleted / reset =====
describe('TutorialSystem: shouldShow', () => {
    let dom;
    beforeEach(() => { dom = setupDOM(); });

    it('returns true when localStorage has no key', () => {
        const t = new TutorialSystem();
        assert.strictEqual(t.shouldShow(), true);
        teardownDOM(dom);
    });

    it('returns false after markCompleted', () => {
        const t = new TutorialSystem();
        t.markCompleted();
        assert.strictEqual(t.shouldShow(), false);
        teardownDOM(dom);
    });

    it('returns true after reset', () => {
        const t = new TutorialSystem();
        t.markCompleted();
        t.reset();
        assert.strictEqual(t.shouldShow(), true);
        teardownDOM(dom);
    });

    it('returns false when localStorage is unavailable', () => {
        const saved = global.localStorage;
        delete global.localStorage;
        const t = new TutorialSystem();
        assert.strictEqual(t.shouldShow(), false);
        global.localStorage = saved;
        teardownDOM(dom);
    });
});

describe('TutorialSystem: markCompleted', () => {
    let dom;
    beforeEach(() => { dom = setupDOM(); });

    it('sets localStorage key to "true"', () => {
        const t = new TutorialSystem();
        t.markCompleted();
        assert.strictEqual(localStorage.getItem('postman-helper-tutorial-completed'), 'true');
        teardownDOM(dom);
    });

    it('uses custom storageKey', () => {
        const t = new TutorialSystem({ storageKey: 'my-key' });
        t.markCompleted();
        assert.strictEqual(localStorage.getItem('my-key'), 'true');
        teardownDOM(dom);
    });

    it('does not throw when localStorage unavailable', () => {
        const saved = global.localStorage;
        delete global.localStorage;
        const t = new TutorialSystem();
        assert.doesNotThrow(() => t.markCompleted());
        global.localStorage = saved;
        teardownDOM(dom);
    });
});

describe('TutorialSystem: reset', () => {
    let dom;
    beforeEach(() => { dom = setupDOM(); });

    it('removes localStorage key', () => {
        const t = new TutorialSystem();
        t.markCompleted();
        t.reset();
        assert.strictEqual(localStorage.getItem('postman-helper-tutorial-completed'), null);
        teardownDOM(dom);
    });

    it('resets currentStep to 0', () => {
        const t = new TutorialSystem();
        t.currentStep = 3;
        t.reset();
        assert.strictEqual(t.currentStep, 0);
        teardownDOM(dom);
    });
});

// ===== getStepCount / getCurrentStep =====
describe('TutorialSystem: getStepCount / getCurrentStep', () => {
    it('getStepCount returns number of steps', () => {
        const t = new TutorialSystem();
        assert.strictEqual(t.getStepCount(), 5);
    });

    it('getCurrentStep returns currentStep', () => {
        const t = new TutorialSystem();
        assert.strictEqual(t.getCurrentStep(), 0);
        t.currentStep = 2;
        assert.strictEqual(t.getCurrentStep(), 2);
    });
});

// ===== show / _render =====
describe('TutorialSystem: show', () => {
    let dom;
    beforeEach(() => { dom = setupDOM(); });

    it('creates overlay element in DOM', () => {
        const t = new TutorialSystem();
        t.show();
        const overlay = document.querySelector('.tutorial-overlay');
        assert.ok(overlay, 'overlay exists');
        teardownDOM(dom);
    });

    it('renders tutorial card with step content', () => {
        const t = new TutorialSystem();
        t.show();
        const card = document.querySelector('.tutorial-card');
        assert.ok(card);
        assert.ok(card.querySelector('h2').textContent.includes('Welcome'));
        teardownDOM(dom);
    });

    it('renders step dots equal to step count', () => {
        const t = new TutorialSystem();
        t.show();
        const dots = document.querySelectorAll('.tutorial-dot');
        assert.strictEqual(dots.length, 5);
        teardownDOM(dom);
    });

    it('first dot is active on initial show', () => {
        const t = new TutorialSystem();
        t.show();
        const dots = document.querySelectorAll('.tutorial-dot');
        assert.ok(dots[0].classList.contains('active'));
        teardownDOM(dom);
    });

    it('shows skip button on first step', () => {
        const t = new TutorialSystem();
        t.show();
        const skip = document.querySelector('[data-action="skip"]');
        assert.ok(skip);
        assert.ok(skip.textContent.includes('Skip'));
        teardownDOM(dom);
    });

    it('shows Next button on first step', () => {
        const t = new TutorialSystem();
        t.show();
        const next = document.querySelector('[data-action="next"]');
        assert.ok(next);
        teardownDOM(dom);
    });

    it('shows step counter', () => {
        const t = new TutorialSystem();
        t.show();
        const card = document.querySelector('.tutorial-card');
        assert.ok(card.textContent.includes('1 / 5'));
        teardownDOM(dom);
    });

    it('sets overlay reference', () => {
        const t = new TutorialSystem();
        t.show();
        assert.ok(t.overlay);
        assert.strictEqual(t.overlay.className, 'tutorial-overlay visible');
        teardownDOM(dom);
    });

    it('resets currentStep to 0 on show', () => {
        const t = new TutorialSystem();
        t.currentStep = 3;
        t.show();
        assert.strictEqual(t.currentStep, 0);
        teardownDOM(dom);
    });
});

// ===== Navigation =====
describe('TutorialSystem: Navigation', () => {
    let dom;
    beforeEach(() => { dom = setupDOM(); });

    it('_next advances to next step', () => {
        const t = new TutorialSystem();
        t.show();
        t._next();
        assert.strictEqual(t.currentStep, 1);
        const h2 = document.querySelector('.tutorial-card h2');
        assert.ok(h2.textContent.includes('Collection'));
        teardownDOM(dom);
    });

    it('_next does not go past last step', () => {
        const t = new TutorialSystem();
        t.show();
        t.currentStep = 4;
        t._next();
        assert.strictEqual(t.currentStep, 4);
        teardownDOM(dom);
    });

    it('_prev goes to previous step', () => {
        const t = new TutorialSystem();
        t.show();
        t._next(); // step 1
        t._prev(); // step 0
        assert.strictEqual(t.currentStep, 0);
        teardownDOM(dom);
    });

    it('_prev does not go below 0', () => {
        const t = new TutorialSystem();
        t.show();
        t._prev();
        assert.strictEqual(t.currentStep, 0);
        teardownDOM(dom);
    });

    it('last step shows Get Started button', () => {
        const t = new TutorialSystem();
        t.show();
        // Navigate to last step
        for (let i = 0; i < 4; i++) t._next();
        const finish = document.querySelector('[data-action="finish"]');
        assert.ok(finish);
        assert.ok(finish.textContent.includes('Get Started'));
        teardownDOM(dom);
    });

    it('last step shows dont-show checkbox', () => {
        const t = new TutorialSystem();
        t.show();
        for (let i = 0; i < 4; i++) t._next();
        const checkbox = document.querySelector('[data-action="dont-show"]');
        assert.ok(checkbox);
        assert.strictEqual(checkbox.checked, true); // checked by default
        teardownDOM(dom);
    });

    it('last step shows Back button', () => {
        const t = new TutorialSystem();
        t.show();
        for (let i = 0; i < 4; i++) t._next();
        const back = document.querySelector('[data-action="prev"]');
        assert.ok(back);
        teardownDOM(dom);
    });

    it('step dots update correctly on navigation', () => {
        const t = new TutorialSystem();
        t.show();
        t._next(); // step 1
        const dots = document.querySelectorAll('.tutorial-dot');
        assert.ok(dots[0].classList.contains('completed'));
        assert.ok(dots[1].classList.contains('active'));
        teardownDOM(dom);
    });
});

// ===== Close / Finish =====
describe('TutorialSystem: Close and Finish', () => {
    let dom;
    beforeEach(() => { dom = setupDOM(); });

    it('_close removes overlay from DOM', (t) => {
        // Use real setTimeout for cleanup
        const tutorial = new TutorialSystem();
        tutorial.show();
        assert.ok(document.querySelector('.tutorial-overlay'));
        tutorial._close(false);
        // Overlay fades out — should be removed after timeout
        // Since JSDOM setTimeout works synchronously in test mode, check immediately
        assert.strictEqual(tutorial.overlay, null);
        teardownDOM(dom);
    });

    it('_close with markCompleted=true sets localStorage', () => {
        const t = new TutorialSystem();
        t.show();
        t._close(true);
        assert.strictEqual(localStorage.getItem('postman-helper-tutorial-completed'), 'true');
        teardownDOM(dom);
    });

    it('_close with markCompleted=false does not set localStorage', () => {
        const t = new TutorialSystem();
        t.show();
        t._close(false);
        assert.strictEqual(localStorage.getItem('postman-helper-tutorial-completed'), null);
        teardownDOM(dom);
    });

    it('_finish marks completed when checkbox is checked', () => {
        const t = new TutorialSystem();
        t.show();
        for (let i = 0; i < 4; i++) t._next(); // go to last step
        const checkbox = document.querySelector('[data-action="dont-show"]');
        checkbox.checked = true;
        t._finish();
        assert.strictEqual(localStorage.getItem('postman-helper-tutorial-completed'), 'true');
        teardownDOM(dom);
    });

    it('_finish does not mark completed when checkbox unchecked', () => {
        const t = new TutorialSystem();
        t.show();
        for (let i = 0; i < 4; i++) t._next();
        const checkbox = document.querySelector('[data-action="dont-show"]');
        checkbox.checked = false;
        t._finish();
        assert.strictEqual(localStorage.getItem('postman-helper-tutorial-completed'), null);
        teardownDOM(dom);
    });

    it('_close calls onComplete callback', () => {
        let called = false;
        const t = new TutorialSystem({ onComplete: () => { called = true; } });
        t.show();
        t._close(false);
        assert.strictEqual(called, true);
        teardownDOM(dom);
    });

    it('skip button closes and marks completed', () => {
        const t = new TutorialSystem();
        t.show();
        const skip = document.querySelector('[data-action="skip"]');
        skip.click();
        assert.strictEqual(localStorage.getItem('postman-helper-tutorial-completed'), 'true');
        teardownDOM(dom);
    });
});

// ===== Keyboard Navigation =====
describe('TutorialSystem: Keyboard Navigation', () => {
    let dom;
    beforeEach(() => { dom = setupDOM(); });

    it('Escape key closes tutorial', () => {
        const t = new TutorialSystem();
        t.show();
        const event = new dom.window.KeyboardEvent('keydown', { key: 'Escape' });
        document.dispatchEvent(event);
        assert.strictEqual(t.overlay, null);
        teardownDOM(dom);
    });

    it('ArrowRight key advances step', () => {
        const t = new TutorialSystem();
        t.show();
        const event = new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight' });
        document.dispatchEvent(event);
        assert.strictEqual(t.currentStep, 1);
        teardownDOM(dom);
    });

    it('ArrowLeft key goes back', () => {
        const t = new TutorialSystem();
        t.show();
        t._next(); // step 1
        const event = new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft' });
        document.dispatchEvent(event);
        assert.strictEqual(t.currentStep, 0);
        teardownDOM(dom);
    });

    it('Enter key advances step', () => {
        const t = new TutorialSystem();
        t.show();
        const event = new dom.window.KeyboardEvent('keydown', { key: 'Enter' });
        document.dispatchEvent(event);
        assert.strictEqual(t.currentStep, 1);
        teardownDOM(dom);
    });

    it('keyboard handler is cleaned up after close', () => {
        const t = new TutorialSystem();
        t.show();
        t._close(false);
        assert.strictEqual(t._keyHandler, null);
        teardownDOM(dom);
    });
});

// ===== Edge Cases =====
describe('TutorialSystem: Edge Cases', () => {
    let dom;
    beforeEach(() => { dom = setupDOM(); });

    it('calling show twice removes first overlay', () => {
        const t = new TutorialSystem();
        t.show();
        const first = t.overlay;
        t.show();
        assert.notStrictEqual(t.overlay, first);
        // Only one overlay in DOM
        const overlays = document.querySelectorAll('.tutorial-overlay');
        assert.strictEqual(overlays.length, 1);
        teardownDOM(dom);
    });

    it('_close when no overlay does not throw', () => {
        const t = new TutorialSystem();
        assert.doesNotThrow(() => t._close(false));
        teardownDOM(dom);
    });

    it('_next when not shown does not throw', () => {
        const t = new TutorialSystem();
        assert.doesNotThrow(() => t._next());
        teardownDOM(dom);
    });

    it('custom steps work', () => {
        const t = new TutorialSystem();
        t.steps = [
            { icon: '1', title: 'One', body: 'First', shortcuts: [] },
            { icon: '2', title: 'Two', body: 'Second', shortcuts: [] }
        ];
        t.show();
        assert.strictEqual(t.getStepCount(), 2);
        const h2 = document.querySelector('.tutorial-card h2');
        assert.ok(h2.textContent.includes('One'));
        teardownDOM(dom);
    });

    it('shortcuts render as kbd-like spans', () => {
        const t = new TutorialSystem();
        t.steps = [
            { icon: 'X', title: 'Test', body: 'Body', shortcuts: ['\u2318S', '\u2318N'] }
        ];
        t.show();
        const shortcuts = document.querySelectorAll('.tutorial-shortcut');
        assert.strictEqual(shortcuts.length, 2);
        teardownDOM(dom);
    });

    it('step with empty shortcuts does not render shortcut spans', () => {
        const t = new TutorialSystem();
        t.show(); // first step has empty shortcuts
        const shortcuts = document.querySelectorAll('.tutorial-shortcut');
        assert.strictEqual(shortcuts.length, 0);
        teardownDOM(dom);
    });
});
