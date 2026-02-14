# Postman Helper

Electron desktop app for creating and managing Postman API requests and collections.
macOS-focused, single-window UI with sidebar collection tree and tabbed request editor.

## Tech Stack

- **Electron 30.0.0** — main process (`main.js`), preload bridge (`preload.js`), renderer (`app.js`)
- **Vanilla JS** — no framework, CommonJS modules, DOM manipulation
- **HTML/CSS** — single `index.html` with embedded styles
- **Python** — test scripts (`test_project.py`, `test_features.py`)
- **Dependencies** — dotenv, jsdom, semver; devDep: electron-packager

## Project Structure

```
main.js              — Electron main process, IPC handlers, window creation (~437 lines)
preload.js           — Context bridge, exposes models + electronAPI to renderer (~53 lines)
app.js               — Core renderer logic (~7516 lines), fallback model classes, all app logic
models.js            — Data models: PostmanRequest, Collection, Folder, InheritanceManager (~486 lines)
ai.js                — AIService: provider-agnostic AI suggestions + test connection (~352 lines)
runner.js            — CollectionRunner: CI/CD test execution engine (~278 lines)
reporters.js         — ConsoleReporter, JUnitReporter, JSONReporter (~132 lines)
cli.js               — CLI entry point with arg parsing for headless runs (~213 lines)
index.html           — UI structure with embedded CSS (~2795 lines)
package.json         — Electron 30.0.0, v1.98.0, scripts, dependencies

plugins/             — Plugin directory
  request-logger/    — Example plugin (manifest.json + main.js)

tests/               — Node.js test suite (node:test + node:assert) — 1176 tests
  helpers/           — Test utilities (dom_setup.js, app_class_extractor.js)
  test_ai.js         — AIService tests (testConnection, reconfigure, suggestions, sanitization)
  test_analytics.js  — AnalyticsCollector tests
  test_app_models.js — app.js fallback class tests
  test_appstate.js   — AppState tests
  test_aria.js       — ARIA attributes, keyboard nav, contrast tests
  test_change_tracking.js — Dirty state tracking tests
  test_dialog_enhancements.js — DangerConfirm, multiselect, animations
  test_dialog_system.js — DialogSystem tests
  test_doc_claims.js — Documentation verification tests
  test_doc_generator.js — DocGenerator markdown/HTML tests
  test_environments.js — Environment import/export/substitution tests
  test_format_parsers.js — FormatParser (cURL, OpenAPI, Swagger, HAR, Insomnia)
  test_import_export.js — Import/export integration tests
  test_keyboard_shortcuts.js — Keyboard shortcut tests
  test_main_ipc.js   — main.js IPC handler tests
  test_models.js     — models.js unit tests
  test_plugins.js    — PluginAPI + PluginManager tests
  test_response_viewer.js — Response viewer highlighting tests
  test_responsive.js — Responsive layout tests
  test_runner.js     — CollectionRunner + reporters tests
  test_sample_data.js — Sample data loading tests
  test_search.js     — Deep text filter tests
  test_settings.js   — AppState settings + AI provider settings tests
  test_toast.js      — Toast notification tests
  test_tree_performance.js — Tree collapse state, scroll, delegation tests
  test_tutorial.js   — TutorialSystem tests
  test_ui.js         — DOM/UI structure tests
  test_version_history.js — Version history/snapshot tests
```

## Essential Commands

```bash
npm start                    # Run the app (electron . --no-sandbox)
npm test                     # Run Node.js test suite (1176 tests)
python3 test_project.py      # Comprehensive tests: syntax, linting, function checks
python3 test_features.py     # Feature verification tests
npm run package              # Build macOS binary to dist/
```

## Key Conventions

### Module Exports
CommonJS with dual-environment guard:
```js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ClassName };
}
```
Some files also set `window.models` for browser context (`models.js:228-235`).

### State Management
- All state lives in `AppState` (singleton): `collections[]`, `currentCollection`, `currentRequest`, `currentFolder`, `unsavedChanges`
- Multiple collections supported: `addCollection()`, `removeCollection()`, `setCurrentCollection()` (auto-adds)
- Mutations must call `state.markAsChanged()` to trigger dirty tracking and status bar updates
- Manager classes receive `state` (or `app`) via constructor injection
- UI classes use `init(state)` pattern instead of constructor injection

### Error Handling
Try-catch with `console.error()` + `alert()` for user-facing operations.

### Context Isolation
`preload.js` exposes models via `contextBridge`. `app.js` always defines built-in
Request/Collection/Folder/InheritanceManager classes, then overrides them with
`window.models` from preload if available.

### Postman v2.1 Support
- **Import**: `Collection.importFromJSON()` auto-detects format via `dataObj.info` presence
- **Export**: `Collection.toPostmanJSON()` produces `{info: {name, schema: "v2.1.0"}, item: [...]}`
- Both `models.js` and `app.js` Collections support v2.1 import/export
- `PostmanRequest.toPostmanJSON()` (models.js) converts to Postman item format

### InheritanceManager API
- `addGlobalHeader()`, `removeGlobalHeader()`, `addBaseEndpoint()`, `removeBaseEndpoint()`
- `addBodyTemplate()`, `removeBodyTemplate()`, `addTestTemplate()`, `removeTestTemplate()`
- `addRule(target, source, properties)`, `getRules()`
- `toJSON()`, `fromJSON()` for serialization

### Inheritance Tab UI (PostmanHelperApp methods)
- `applyBodyTemplateToRequest(name)`, `applyTestTemplateToRequest(name)` — apply to current request
- `applyBodyTemplateToAll(name)`, `applyTestTemplateToAll(name)` — bulk apply with confirm dialog
- `createRequestFromTemplate(name)` — create POST request from body template
- `addBearerTokenPreset()`, `addApiKeyPreset()`, `addBasicAuthPreset()` — auth presets as global headers

### Settings System
- Settings persist to `localStorage` independently via `AppState.saveSettings()` / `loadSettings()`
- `AppState.SETTINGS_KEY = 'postman-helper-settings'`
- `AppState.DEFAULT_SETTINGS` contains 15 keys: `autoSave`, `darkMode` (true), `autoFormat`, `showLineNumbers`, `inheritGlobally`, `defaultMethod` ('GET'), `requestTimeout` (30), `editorFontSize` (13), `maxHistoryDepth` (20), `toastDuration` (2000), `confirmBeforeDelete` (true), `aiProvider` ('openai'), `aiApiKey` (''), `aiBaseUrl` (''), `aiModel` ('')
- `darkMode` defaults to `true` (matching HTML `data-theme="dark"`)

### AI Provider Settings
- `AppState.AI_PROVIDERS` — static presets for OpenAI, Anthropic, Google Gemini
- Each provider has: `name`, `baseUrl`, `models[]`, `keyUrl`, `keyLabel`
- Provider picker in Settings auto-fills base URL and model dropdown
- API key stored in `localStorage` via AppState (password-masked in UI)
- `.env` `CHAT_API_KEY` serves as fallback when no UI key is configured
- On save, AI config is pushed to main process via `ai-update-config` IPC
- On startup/restore, saved AI config is pushed to main process automatically
- `AIService.testConnection()` validates key with a minimal API call
- `AIService.reconfigure(config)` updates key/URL/model without recreating the service

### Auto-save Format
- **v2** (current): `{version: 2, collections: [...], activeCollectionIndex, ...}`
- **v1** (legacy): `{version: 1, collection: {...}, ...}` — auto-restore handles both
- Settings block in auto-save includes all 15 settings keys + `sidebarWidth`

### Key Class/Comment Markers in app.js
- **Request class**: starts ~line 9
- **Collection class**: starts ~line 70
- **Folder class**: starts ~line 212
- **InheritanceManager**: starts ~line 232
- **DialogSystem**: `// Custom Dialog System`
- **DocGenerator**: `// Documentation Generator`
- **DiffUtil**: `// DiffUtil`
- **FormatParser**: `// FormatParser`
- **AnalyticsCollector**: `// AnalyticsCollector`
- **PluginAPI**: `// PluginAPI`
- **PluginManager**: `// PluginManager`
- **TutorialSystem**: `// TutorialSystem`
- **AppState class**: `// AppState class`
- **PostmanHelperApp class**: `// Main application class`

### CSS Custom Properties
- Dark theme uses GitHub-inspired palette: `--bg-primary: #0d1117`, `--bg-secondary: #161b22`, `--bg-tertiary: #1c2333`
- Light theme `--text-muted: #737387`, Dark theme `--text-muted: #848d97`
- Responsive breakpoints: `<=900px` (vertical stack), `<=1200px` (compact header)

### Testing Conventions
- Test framework: `node:test` + `node:assert/strict`
- `tests/helpers/app_class_extractor.js` extracts classes from `app.js` by scanning from `Request = class {` to `// Custom Dialog System`
- New standalone classes outside that range need their own extraction: scan between comment markers using `Module._compile()` (see `tests/test_analytics.js`, `tests/test_version_history.js`, `tests/test_plugins.js`, `tests/test_tutorial.js`)
- Standalone modules (`runner.js`, `reporters.js`, `cli.js`, `ai.js`) can be `require()`'d directly
- `showToast` signature: `(message, duration, type = 'info')` — duration defaults to `this.state.toastDuration || 2000`
- **IMPORTANT**: Do NOT use ES2015 `\u{XXXXX}` unicode escapes (curly brace syntax) in `app.js` — use surrogate pair escapes like `\uD83D\uDC4B` instead. The test extractors compile code snippets with `Module._compile()` which fails on curly-brace unicode escapes.

## Additional Documentation

- [Architectural Patterns](.claude/docs/architectural_patterns.md) — Detailed pattern catalog with file:line references

---

## Core Features

| Feature | Description | Status |
|---------|-------------|--------|
| **Request Creation** | Create API requests with method, URL, headers, body | Implemented |
| **Request Management** | Organize requests in collections and folders | Implemented |
| **JSON Import/Export** | Import/export Postman collections + cURL, OpenAPI, Swagger, HAR | Implemented |
| **Test Automation** | Create and run test scripts | Implemented |
| **Inheritance System** | Inherit headers, endpoints, and templates | Implemented |
| **Environment Config** | Manage environments with variable substitution | Implemented |
| **Dialog System** | Custom dialogs (prompt, confirm, alert, select, multiselect, danger) | Implemented |
| **Model Fallback** | Graceful degradation when models fail | Implemented |
| **Postman v2.1 Support** | Full Postman Collection format support | Implemented |
| **Drag and Drop** | Move requests and folders between collections | Implemented |
| **Multi-Collection** | Multiple collections in sidebar, auto-switch, delete | Implemented |
| **Inheritance UI** | Apply/bulk-apply body/test templates, auth presets | Implemented |
| **Deep Text Filter** | Search across name, URL, body, and tests fields | Implemented |
| **API Documentation** | Generate Markdown and HTML docs from collections | Implemented |
| **Version History** | Request snapshots with diff and restore | Implemented |
| **Change Tracking** | Dirty state tracking per request with status bar indicator | Implemented |
| **Sample Data** | Load sample collection with inheritance examples | Implemented |
| **Format Parsers** | Import cURL, OpenAPI 3.x, Swagger 2.0, HAR, Insomnia | Implemented |
| **Analytics** | Usage metrics: requests sent, response times, success rates | Implemented |
| **CI/CD Runner** | Headless collection runner with JUnit/JSON/console reporters | Implemented |
| **Plugin System** | Extensible plugin architecture with manifest, hooks, sandboxed API | Implemented |
| **AI Suggestions** | AI-powered header, body, test, URL suggestions | Implemented |
| **AI Provider Settings** | Configure Anthropic/OpenAI/Gemini in Settings UI with test connection | Implemented |
| **Tutorial System** | First-launch guided walkthrough | Implemented |
| **Keyboard Shortcuts** | Full shortcut set (Cmd+S, Cmd+N, Cmd+O, Cmd+Enter, etc.) | Implemented |
| **Toast Notifications** | Rate-limited, typed (info/success/error/warning), dismissible | Implemented |
| **Response Viewer** | Syntax highlighting, copy, save, status badges | Implemented |
| **Responsive Layout** | Sidebar resize, vertical stack at narrow widths, compact header | Implemented |
| **ARIA Accessibility** | Semantic roles, keyboard tree nav, contrast compliance | Implemented |
| **Tree Performance** | Persist collapse state, scroll position, event delegation | Implemented |
| **Dark/Light Mode** | Theme toggle with CSS custom properties | Implemented |
| **Window State** | Persist/restore window position, size, maximized state | Implemented |
| **Enterprise SSO** | SSO and team management | Planned (needs backend) |
| **Cloud Sync** | Cross-device synchronization | Planned (needs backend) |

## AI Provider Settings

Configure AI providers directly in the Settings panel (no `.env` editing required).

**Supported Providers:**

| Provider | Base URL | Models | API Key Page |
|----------|----------|--------|--------------|
| **OpenAI** | `https://api.openai.com/v1` | gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo, o1, o1-mini, o3-mini | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Anthropic** | `https://api.anthropic.com/v1` | claude-sonnet-4-20250514, claude-opus-4-20250514, claude-3-5-haiku, claude-3-5-sonnet, claude-3-haiku | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta` | gemini-2.0-flash, gemini-2.0-flash-lite, gemini-1.5-pro, gemini-1.5-flash, gemini-1.5-flash-8b | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

**How it works:**
1. Open Settings (gear icon or Cmd+,)
2. Scroll to "AI Provider" section
3. Select provider — base URL and model list auto-fill
4. Enter API key (password-masked, stored locally in `localStorage`)
5. Click "Test Connection" to validate
6. Click "Save Settings" — config is pushed to the main process via IPC

**Fallback:** `.env` file with `CHAT_API_KEY`, `AI_BASE_URL`, `AI_MODEL` still works when no UI key is set.

## Import System

### Supported Import Formats
| Format | Detection | Parser |
|--------|-----------|--------|
| **Postman v2.1** | `info.schema` contains `v2.1` | `Collection.importFromJSON()` |
| **Simple JSON** | Has `requests` array | `Collection.importFromJSON()` |
| **cURL** | Starts with `curl ` | `FormatParser.parseCurl()` |
| **OpenAPI 3.x** | Has `openapi: "3.x"` | `FormatParser.parseOpenAPI3()` |
| **Swagger 2.0** | Has `swagger: "2.0"` | `FormatParser.parseSwagger2()` |
| **HAR** | Has `log.entries` | `FormatParser.parseHAR()` |
| **Insomnia** | Has `_type: "export"` | Detected, import planned |

## CI/CD Runner

Headless collection runner for CI/CD pipelines:

```bash
# Run collection with console output
node cli.js run collection.json

# Generate JUnit XML report
node cli.js run collection.json --reporter junit --output results.xml

# JSON report
node cli.js run collection.json --reporter json --output results.json
```

## Plugin System

Extensible plugin architecture:

```
~/.postman-helper/plugins/
  my-plugin/
    manifest.json    — name, version, main, hooks[], description
    main.js          — module with hook handlers + activate/deactivate
```

**Available hooks:** `onRequestSend`, `onResponseReceive`, `onCollectionExport`, `onCollectionImport`, `onAppReady`

**PluginAPI** provides: `getCurrentCollection()`, `getCurrentRequest()`, `getCollections()`, `setStorage()`, `getStorage()`, `showToast()`, `log()`, `error()`

## Dialog System

Custom DialogSystem replacing browser prompts with themed dialogs:

| Method | Description |
|--------|-------------|
| `showPrompt(title, default, cb)` | Input dialog |
| `showConfirm(message, cb)` | Yes/No confirmation |
| `showAlert(message, cb)` | Information alert |
| `showSelect(title, options, selected, cb)` | Single select dropdown |
| `showMultiSelect(title, options, selected, cb)` | Multi-select with checkboxes + Select All |
| `showDangerConfirm(message, confirmText, cb)` | Red destructive action confirmation |

All dialogs support Promise API (omit callback) and have animated open/close, focus trapping, and ARIA attributes.

## Data Flow

```
User Interaction → UI Components → Event Handlers → State Management
                          ↓
                    Data Models → Business Logic
                          ↓
                    Export/Import → File System
                          ↓
                    Postman Integration → API Testing
```

### Core Component Responsibilities

**Data Models (`models.js`):**
- `PostmanRequest` — request data with `toPostmanJSON()` export, version history
- `Collection` — collection management with `importFromJSON()` / `toPostmanJSON()`
- `Folder` — folder grouping with `addRequest()`, `addFolder()`
- `InheritanceManager` — rule-based property inheritance with `addRule()` / `applyInheritance()`

**Core Logic (`app.js`):**
- `AppState` — singleton state with settings persistence, dirty tracking
- `PostmanHelperApp` — main app class with all UI logic
- `DialogSystem` — custom dialog overlays
- `DocGenerator` — Markdown/HTML documentation generation
- `DiffUtil` — request diff computation
- `FormatParser` — multi-format import (cURL, OpenAPI, Swagger, HAR)
- `AnalyticsCollector` — usage metrics tracking
- `PluginAPI` / `PluginManager` — plugin system
- `TutorialSystem` — guided first-launch walkthrough

**AI Service (`ai.js`):**
- `AIService` — provider-agnostic AI suggestions (headers, body, tests, URL, error analysis)
- `testConnection()` — validate API key with minimal request
- `reconfigure(config)` — update key/URL/model at runtime
- Input sanitization with `INPUT_LIMITS`, rate limiting, deadline timeouts

**Electron Integration (`main.js`):**
- Window management with state persistence
- IPC handlers: file ops, HTTP requests, auto-save, plugins, AI suggestions
- `ai-update-config` / `ai-test-connection` IPC for runtime AI configuration
- Environment configuration via `.env` file loading (fallback for AI keys)

## Security Considerations

### Security Features
- **Environment Variable Protection** — `.env` files excluded via `.gitignore`
- **API Key Management** — keys stored as non-enumerable properties, password-masked in UI
- **Data Validation** — input sanitization on all user inputs and AI prompts
- **Error Handling** — no sensitive data exposed in error messages
- **Plugin Sandboxing** — plugins run through validated manifest + sandboxed API
- **IPC Security** — input validation on all IPC handlers
- **Rate Limiting** — AI requests capped at 3 concurrent, toast notifications at 5 visible

### Security Best Practices
- Never commit `.env` files to version control
- API keys in Settings are stored in `localStorage` (local to the machine)
- Rotate API keys regularly
- Validate all inputs before processing
- Use HTTPS for all API communications

## Development Roadmap

### Phase 1: Foundation (Complete)
- Core request management — create, edit, delete requests
- Collection system — organize requests in collections
- JSON import/export — Postman Collection v2.1 support
- Basic UI — functional user interface
- Environment config — .env file support
- Error handling — comprehensive error management

### Phase 2: Advanced Features (Complete)
- Request inheritance — header and template inheritance
- Test automation — test script creation and execution
- UI improvements — centered dialogs, better UX
- Export fixes — proper test script export
- Dialog system — custom dialogs replacing browser prompts
- Import system — enhanced import with Postman v2.1 support
- Model loading — intelligent fallback when models fail to load

### Phase 3: Enhancements (Complete — Issues #5-#12, PRs #33-#40)
- Drag and drop — move requests and folders between collections
- Advanced search — deep text filter across name, URL, body, tests
- API documentation — generate Markdown/HTML from collections
- Version history — request snapshots with diff and restore
- Change tracking — dirty state tracking per request
- Sample data — sample collection with inheritance examples
- Format parsers — import cURL, OpenAPI, Swagger, HAR
- Environment management — import/export/substitution of environments

### Phase 4: Enterprise Features (Complete — Issues #14-#19, PRs #49-#54)
- Analytics — usage metrics: requests, response times, success rates, top endpoints
- CI/CD runner — headless collection runner with JUnit/JSON/console reporters
- Plugin system — extensible architecture with manifest, hooks, sandboxed API
- AI suggestions — AI-powered header, body, test, URL, error analysis suggestions
- Import/export plugins — cURL export, format detection
- Enterprise SSO (#13) — planned, needs backend
- Cloud sync (#16) — planned, needs backend

### Phase 5: UI Usability & Polish (Complete — Issues #41-#48, #70-#72, PRs #73-#74, #89-#97)
- Modern UI overhaul — GitHub-inspired dark theme, CSS custom properties
- Settings panel — slide-out panel with 15+ configurable options
- Toast notifications — rate-limited, typed, animated, dismissible
- Keyboard shortcuts — full shortcut set with help modal
- Response viewer — syntax highlighting, copy, save
- Dialog animations — slide/fade transitions, danger confirm, Select All
- Responsive layout — sidebar resize, vertical stack at narrow widths
- Tree performance — persist collapse state, scroll position, event delegation
- Tutorial system — first-launch guided walkthrough
- ARIA accessibility — semantic roles, keyboard tree nav, contrast compliance

### Phase 6: AI Provider Settings (Complete — Issue #98, PR #99)
- AI provider configuration UI in Settings panel
- Provider picker: OpenAI, Anthropic, Google Gemini with auto-filled base URLs
- API key input with password masking and show/hide toggle
- Model dropdown pre-populated per provider
- Test Connection button with inline success/error feedback
- Direct links to provider API key pages
- Runtime AI reconfiguration via IPC (no app restart needed)
- `.env` fallback preserved for backward compatibility

### Open: Code Review #2 Fixes (Issues #75-#88)
14 issues from second code review, not yet started:
- **Critical (security/data-integrity):** #77 XSS innerHTML, #78 tests/events data loss, #79 header format inconsistency, #80 IPC security, #81 test runner code exec
- **Bugs:** #75 deleteRequest folders, #76 showPrompt keyboard, #82 saveRequest rename, #83 dirty tracking collision, #84 importFromJSON append
- **Quality:** #85 AI prompt injection, #86 dead CSS, #87 reporter bugs, #88 test coverage gaps

## Issue/PR History

| Phase | Issues | PRs | Status |
|-------|--------|-----|--------|
| Phase 3 | #5-#12 | #33-#40 | All merged |
| Phase 4 | #14, #15, #17, #18, #19 | #49-#54 | All merged |
| Phase 4 | #13, #16 | — | On hold (need backend) |
| AI Review #1 | #55-#68 | #69 | All fixed & closed |
| Phase 5 | #41-#48, #70-#72 | #73-#74, #89-#97 | All merged |
| Code Review #2 | #75-#88 | — | Open, not started |
| AI Settings | #98 | #99 | Merged |
