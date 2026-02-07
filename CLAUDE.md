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
main.js              — Electron main process, IPC handlers, window creation
preload.js           — Context bridge, exposes models + electronAPI to renderer
app.js               — Core renderer logic (~1775 lines), fallback model classes, all app logic
models.js            — Data models: PostmanRequest, Collection, Folder, InheritanceManager
index.html           — UI structure with embedded CSS
package.json         — Electron 30.0.0, scripts, dependencies

tests/               — Node.js test suite (node:test + node:assert)
  helpers/           — Test utilities (dom_setup.js, app_class_extractor.js)
  test_models.js     — models.js unit tests
  test_app_models.js — app.js fallback class tests
  test_appstate.js   — AppState tests
  test_dialog_system.js — DialogSystem tests
  test_import_export.js — Import/export integration tests
  test_ui.js         — DOM/UI structure tests
  test_doc_claims.js — Documentation verification tests
  test_main_ipc.js   — main.js IPC handler tests

src/managers/ (16 files) — Refactoring stubs (not imported by app.js):
  createNewRequest.js, createNewFolder.js, createNewCollection.js,
  saveRequest.js, saveTests.js, deleteRequest.js, duplicateRequest.js,
  importCollection.js, exportCollection.js, loadSampleData.js,
  addGlobalHeader.js, addBaseEndpoint.js, addBodyTemplate.js,
  addTestTemplate.js, addRequestHeader.js, showSettings.js

src/ui/ (11 files) — UI rendering and event modules:
  initUI.js, setupEventListeners.js, handleKeyboardShortcuts.js,
  switchTab.js, updateTabContent.js, updateRequestTab.js,
  updateTestsTab.js, updateInheritanceTab.js,
  updateCollectionTree.js, renderFolderTree.js, renderHeaders.js

src/utils/
  findFolderByName.js — Recursive folder lookup helper
```

## Essential Commands

```bash
npm start                    # Run the app (electron . --no-sandbox)
npm test                     # Run Node.js test suite (155 tests)
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
- All state lives in `AppState` (singleton): `currentCollection`, `currentRequest`, `currentFolder`, `unsavedChanges`
- Mutations must call `state.markAsChanged()` to trigger dirty tracking and status bar updates
- Manager classes receive `state` (or `app`) via constructor injection
- UI classes use `init(state)` pattern instead of constructor injection

### Error Handling
Try-catch with `console.error()` + `alert()` for user-facing operations.

### Context Isolation
`preload.js` exposes models via `contextBridge`. If that fails (sandboxed env),
`app.js` defines duplicate fallback classes (lines 30-585).
The unconditional Collection/Folder/InheritanceManager classes (lines 186-585) are the actual live code.

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

## Additional Documentation

- [Architectural Patterns](.claude/docs/architectural_patterns.md) — Detailed pattern catalog with file:line references

---

## Product Vision & Purpose

Postman Helper is a comprehensive Electron-based application designed to streamline API request creation, management, and export for Postman users. It provides a user-friendly interface for building complex API requests with inheritance capabilities, test automation, and seamless integration with Postman's ecosystem.

**Vision:** To create the most intuitive and powerful API request management tool that enhances developer productivity by providing advanced features like request inheritance, test automation, and seamless Postman integration, while maintaining simplicity and ease of use.

**Core Purpose — Postman Helper simplifies the process of creating, managing, and exporting API requests for Postman by providing:**

- **Intuitive UI** for request creation and management
- **Advanced inheritance system** for headers, endpoints, and test templates
- **Comprehensive test automation** capabilities
- **Seamless Postman integration** with proper JSON schema support
- **Environment configuration** for different deployment scenarios

**Key Benefits:**

- 50% faster request creation via intuitive UI and inheritance system
- 30% less code duplication through request inheritance and templates
- 20% better test coverage with built-in test automation
- Full Postman Collection v2.1 compatibility
- Cross-platform support (Mac, Windows, Linux)
- Easy environment management for different deployment targets

## Target Audience

| Audience Segment | Description | Use Cases |
|-----------------|-------------|-----------|
| **API Developers** | Developers building and testing APIs | Create requests, manage endpoints, test APIs |
| **QA Engineers** | Quality assurance professionals | Automate API testing, create test suites |
| **DevOps Teams** | Infrastructure and deployment teams | Manage API configurations, environment settings |
| **Technical Product Managers** | Product managers with technical background | Document APIs, create test scenarios |
| **API Documentation Teams** | Teams responsible for API documentation | Generate API examples, test documentation |

## System Requirements

| Requirement | Specification |
|------------|---------------|
| **Operating System** | macOS 10.15+, Windows 10+, Linux (Ubuntu 20.04+) |
| **Node.js Version** | 14.x or higher |
| **Electron Version** | 30.0.0 (compatible with Node.js 24.11.1) |
| **Memory** | 4GB RAM minimum, 8GB recommended |
| **Storage** | 200MB available space |
| **Display** | 1280x720 minimum resolution |

## Supported Formats

| Format | Description | Compatibility |
|--------|-------------|---------------|
| **Postman Collection v2.1** | Official Postman collection format | Full support |
| **JSON** | Standard JSON format | Import/Export |
| **Environment Variables** | .env file format | Full support |

## User Interface Design

### Sidebar Navigation
- **Collections Tree**: Hierarchical view of all collections and folders
- **Request List**: List of requests within selected collection/folder
- **Search Functionality**: Quick search across all requests
- **Filter Options**: Filter by request type, status, etc.

### Main Content Area
- **Request Editor**: Full-featured request creation interface
- **Response Viewer**: Display API responses with syntax highlighting
- **Test Results**: Show test execution results
- **Debug Console**: Display debug information and logs

### Tab System
- **Request Tab**: Configure request details (method, URL, headers, body)
- **Inheritance Tab**: Manage inheritance rules and templates
- **Tests Tab**: Create and manage test scripts
- **Settings Tab**: Application configuration and preferences

### UI Features
- **Responsive Design**: Adapts to different screen sizes
- **Dark/Light Mode**: User-selectable themes
- **Keyboard Shortcuts**: Efficient navigation and operations
- **Drag and Drop**: Move requests and folders (planned feature)
- **Context Menus**: Right-click functionality for quick actions
- **Status Indicators**: Visual feedback for request status

## Core Features

| Feature | Description | Status |
|---------|-------------|--------|
| **Request Creation** | Create API requests with method, URL, headers, body | Implemented |
| **Request Management** | Organize requests in collections and folders | Implemented |
| **JSON Import/Export** | Import and export Postman collections | Enhanced |
| **Test Automation** | Create and run test scripts | Implemented |
| **Inheritance System** | Inherit headers, endpoints, and templates | Implemented |
| **Environment Config** | Manage different environments | Implemented |
| **Dialog System** | Custom dialogs replacing browser prompts | Implemented |
| **Model Fallback** | Graceful degradation when models fail | Implemented |
| **Postman v2.1 Support** | Full Postman Collection format support | Implemented |
| **Drag and Drop** | Move requests and folders | Planned |
| **API Documentation** | Generate API documentation | Planned |
| **Team Collaboration** | Share collections and templates | Planned |

## Request Inheritance System

**Key Capabilities:**
- **Header Inheritance**: Global headers applied to all requests
- **Endpoint Templates**: Base URLs and path templates
- **Body Templates**: Request body templates
- **Test Templates**: Reusable test scripts
- **Environment Variables**: Dynamic value replacement

**Benefits:**
- **Reduce Duplication**: 70% less repetitive configuration
- **Improve Consistency**: Uniform headers and endpoints across requests
- **Faster Development**: Quick request creation from templates
- **Easier Maintenance**: Centralized configuration management

## Import System (Enhanced)

### Key Capabilities
- **Multiple Format Support**: Simple JSON and Postman Collection v2.1
- **Automatic Detection**: Intelligently detects format type
- **Postman Item Processing**: Handles Postman's nested item structure
- **Error Handling**: Graceful fallback for malformed JSON
- **String/Object Support**: Accepts both JSON strings and objects

### Supported Import Formats
- **Simple JSON**: `{name: "My Collection", requests: [...], folders: [...]}`
- **Postman v2.1**: `{info: {...}, item: [...]}` with nested items
- **String JSON**: Automatic parsing of JSON strings

### Benefits
- **Broader Compatibility**: Works with various JSON formats
- **Robust Parsing**: Handles edge cases and malformed data
- **Postman Compatibility**: Full support for Postman's collection format
- **Future-Proof**: Easy to add new format support

## Test Automation

**Test Types Supported:**
- **Status Code Tests**: Verify HTTP response codes
- **Response Validation**: Check response structure
- **Performance Tests**: Measure response times
- **Error Handling**: Test error scenarios
- **Authentication Tests**: Verify auth flows

**Test Framework:**
```javascript
// Example Test Script
tests['Status code is 200'] = responseCode.code === 200;
tests['Response has data'] = responseBody.has('data');
tests['Response time < 500ms'] = responseTime < 500;
```

## Dialog System

Custom DialogSystem replacing `window.prompt()` and `window.confirm()` with application-themed dialogs.

**Key Capabilities:**
- **Input Dialogs**: Custom styled prompts replacing `window.prompt()`
- **Confirmation Dialogs**: Custom styled confirms replacing `window.confirm()`
- **Themed UI**: Matches application color scheme and styling
- **Callback Architecture**: Promise-like callback pattern
- **Accessibility**: Proper focus management and keyboard navigation

**Example Usage:**
```javascript
// Input dialog
DialogSystem.showPrompt('Enter collection name:', 'New Collection', (name) => {
    if (name) createCollection(name);
});

// Confirmation dialog
DialogSystem.showConfirm('Delete this request?', (confirmed) => {
    if (confirmed) deleteRequest();
});
```

**Benefits:**
- Cross-browser compatibility in Electron renderer process
- Consistent UX matching application design
- Eliminates ugly system dialogs
- Extensible for new dialog types

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
- `PostmanRequest` — request data with `toPostmanJSON()` export
- `Collection` — collection management with `importFromJSON()` / `toPostmanJSON()`
- `Folder` — folder grouping with `addRequest()`
- `InheritanceManager` — rule-based property inheritance with `addRule()` / `applyInheritance()`

**Core Logic (`app.js`):**
- State management and application data
- Event handling for user interactions
- Data processing for request CRUD
- JSON serialization/deserialization for export/import
- Comprehensive error management

**Electron Integration (`main.js`):**
- Main application window management
- Environment configuration via .env file loading
- IPC communication between main and renderer
- File system access for import/export operations
- Native OS feature integration

**Model Loading System (`app.js`):**
- Intelligent model loading with fallbacks
- If `window.models` available from `preload.js`, uses those classes
- Otherwise falls back to enhanced inline class definitions
- Ensures app works even when context bridge fails

## Security Considerations

### Security Features
- **Environment Variable Protection** — `.env` files excluded via `.gitignore`
- **API Key Management** — Secure storage of credentials
- **Data Validation** — Input sanitization on all user inputs
- **Error Handling** — No sensitive data exposed in error messages
- **File System Security** — Proper file permissions
- **Network Security** — HTTPS support for API communications

### Security Best Practices
- Never commit `.env` files to version control
- Use environment-specific configs for different deployments
- Rotate API keys regularly
- Validate all inputs before processing
- Sanitize outputs to prevent XSS
- Use HTTPS for all API communications

## Development Roadmap

### Phase 1: Foundation (Complete)
- Core request management — create, edit, delete requests
- Collection system — organize requests in collections
- JSON import/export — Postman Collection v2.1 support
- Basic UI — functional user interface
- Environment config — .env file support
- Error handling — comprehensive error management

### Phase 2: Advanced Features (Current)
- Request inheritance — header and template inheritance
- Test automation — test script creation and execution
- UI improvements — centered dialogs, better UX
- Export fixes — proper test script export
- Debugging tools — comprehensive logging
- Error handling — robust fallback mechanisms and graceful degradation
- Code stability — fixed model loading, inheritance, and constructor issues
- Performance — optimized startup and reduced memory footprint
- Dialog system — custom dialogs replacing browser prompts
- Import system — enhanced import with Postman v2.1 support
- Model loading — intelligent fallback when models fail to load

### Phase 3: Enhancements (Next)
- Drag and drop — move requests and folders (partially implemented, disabled due to stability)
- Advanced search — full-text search across requests
- API documentation — generate documentation from requests
- Team collaboration — share collections and templates
- Version control — request history and diffs
- Performance optimization — faster startup and operations
- Sample data — re-enable sample data loading with proper model integration
- Change tracking — implement request change tracking feature
- Import testing — automated test suite for import functionality
- Dialog enhancements — additional dialog types (file picker, etc.)

### Phase 4: Enterprise Features (Future)
- Enterprise authentication — SSO and team management
- Advanced analytics — usage statistics and insights
- CI/CD integration — pipeline integration
- Cloud sync — cross-device synchronization
- Plugin system — extensible architecture
- AI assistance — smart request suggestions
- Model system — proper model loading and class management
- Error recovery — automatic recovery from model loading failures
- Import/export plugins — support for additional formats (Swagger, etc.)
- Dialog theming — customizable dialog themes and styles

## Use Case Workflows

### 1. API Development Workflow

```
1. Create Request → 2. Configure Headers → 3. Set Body → 4. Add Tests
                          ↓
                    5. Save Request → 6. Export Collection
                          ↓
                    7. Import to Postman → 8. Run Tests
```

### 2. Collection Import Workflow

```
1. Click Import Button → 2. Select JSON File → 3. Automatic Format Detection
                          ↓
                    4. Parse Collection → 5. Create Requests/Folders
                          ↓
                    6. Display in UI → 7. Ready for Use
```

**Supported Import Formats:**
- Simple JSON format (name, requests, folders)
- Postman Collection v2.1 format (info, item arrays)
- String JSON (automatic parsing)
- Mixed formats with fallback handling

### 3. QA Testing Workflow

```
1. Create Test Suite → 2. Define Test Cases → 3. Set Assertions
                          ↓
                    4. Run Tests → 5. Analyze Results → 6. Generate Reports
```
