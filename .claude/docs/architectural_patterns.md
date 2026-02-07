# Architectural Patterns

Patterns found in 2+ files across the codebase. Each includes file:line references.

---

## 1. Constructor-Based State Injection

The main `PostmanHelperApp` class holds state and passes it to internal methods. `AppState` is injected into the app at construction time.

- `app.js` — `AppState` constructor initializes all state properties
- `app.js` — `PostmanHelperApp` receives state via `this.state = new AppState()`

---

## 2. Factory/Serialization Pattern (toJSON + fromJSON)

All model classes implement `toJSON()` for serialization and static `fromJSON()` for deserialization, enabling round-trip persistence.

- `models.js:23-48` — `PostmanRequest.toJSON()` / `PostmanRequest.fromJSON()`
- `models.js:75-97` — `Collection.toJSON()` / `Collection.fromJSON()`
- `models.js:135-157` — `Folder.toJSON()` / `Folder.fromJSON()`
- `models.js:199-215` — `InheritanceManager.toJSON()` / `InheritanceManager.fromJSON()`

---

## 3. Centralized State with Dirty Tracking

Singleton `AppState` holds all mutable application state. Any mutation calls `markAsChanged()`, which sets `unsavedChanges = true` and updates the status bar.

- `app.js` — `AppState` class: `currentCollection`, `currentRequest`, `currentFolder`, `unsavedChanges`
- `app.js` — `markAsChanged()` sets flag and calls `updateStatusBar()`

---

## 4. Electron Security: Context Isolation with Fallback

`preload.js` attempts to load `models.js` and expose classes via `contextBridge.exposeInMainWorld()`. If that fails, `app.js` defines built-in model classes that are always available.

- `preload.js:6-19` — Try/catch around `require('./models.js')` + `contextBridge.exposeInMainWorld('models', ...)`
- `app.js` — Built-in Request, Collection, Folder, InheritanceManager classes
- `app.js` — `window.models` override: uses preload models if available

---

## 5. Dual Module Export Guard

Models export for both Node.js (CommonJS) and browser (`window`) contexts using runtime environment detection.

```js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PostmanRequest, Collection, Folder, InheritanceManager };
}
if (typeof window !== 'undefined') {
    window.models = { PostmanRequest, Collection, Folder, InheritanceManager };
}
```

- `models.js:219-235` — Full dual export for all model classes

---

## 6. Adapter Pattern for Postman v2.1 Format

Import and export operations convert between Postman Collection v2.1 JSON schema and internal model representation.

**Import** (Postman v2.1 -> internal models):
- `app.js` — `Collection.importFromJSON()` detects `info` property to identify Postman format
- `app.js` — `processPostmanItems()` converts `item[]` array to internal requests/folders
- `app.js` — `createRequestFromPostmanItem()` / `createFolderFromPostmanItem()`

**Export** (internal models -> Postman v2.1):
- `app.js` — `Collection.toPostmanJSON()` builds Postman schema with `info.schema`, `item[]`

---

## 7. Empty State UI Pattern

UI methods check for null/undefined state and render placeholder messages with optional action buttons instead of crashing.

- `app.js` — `updateRequestTab()` shows "Select or create a request" placeholder
- `app.js` — `updateTestsTab()` shows "Select a request to view and edit tests" placeholder

---

## 8. Try-Catch with User Alert

Error handling pattern: wrap operation in try-catch, log with `console.error()`, show user-facing `alert()`.

- `app.js` — Multiple methods use `try { ... } catch { console.error + alert }` pattern
- `main.js` — IPC handlers use try-catch with error logging

---

## 9. Event Listener Teardown/Rebuild

UI methods re-render entire HTML sections via `innerHTML`, then immediately reattach event listeners. No virtual DOM or diffing — full teardown on every update.

- `app.js` — `updateCollectionTree()` rebuilds tree HTML + calls `setupTreeClickHandlers()`
- `app.js` — `updateRequestTab()` renders form HTML + reattaches handlers
