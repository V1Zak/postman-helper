const { contextBridge, ipcRenderer } = require('electron')

// Load models and expose them to the renderer process
// Note: In Electron's sandboxed preload context, we have limited access to Node.js modules
// The application will use fallback classes defined in app.js if this fails
try {
  const models = require('./models.js');
  
  contextBridge.exposeInMainWorld('models', {
    PostmanRequest: models.PostmanRequest,
    Collection: models.Collection,
    Folder: models.Folder,
    InheritanceManager: models.InheritanceManager
  });
  console.log('✅ Successfully loaded models in preload');
} catch (error) {
  console.log('ℹ️  Models not loaded in preload (using fallback classes):', error.message);
  // This is expected in sandboxed environment - app.js has fallback classes
}

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (data) => ipcRenderer.invoke('save-file', data),
  openFile: (options) => ipcRenderer.invoke('open-file', options),

  // Request execution
  sendRequest: (options) => ipcRenderer.invoke('send-request', options),

  // Auto-save & persistence
  autoSave: (data) => ipcRenderer.invoke('auto-save', data),
  autoLoad: () => ipcRenderer.invoke('auto-load'),
  clearAutosave: () => ipcRenderer.invoke('clear-autosave'),

  // Plugin system
  listPlugins: () => ipcRenderer.invoke('list-plugins'),
  readPluginManifest: (dir) => ipcRenderer.invoke('read-plugin-manifest', dir),
  loadPlugin: (dir, mainFile) => ipcRenderer.invoke('load-plugin', dir, mainFile),

  // Add more API methods as needed
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback)
})
