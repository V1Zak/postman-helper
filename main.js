const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

// Load environment variables
require('dotenv').config()

// Configuration from environment variables
const config = {
    modelName: process.env.MODEL_NAME || 'postman-helper-v1',
    chatApiKey: process.env.CHAT_API_KEY || '',
    apiBaseUrl: process.env.API_BASE_URL || 'https://api.example.com/v1',
    debugMode: process.env.DEBUG_MODE === 'true',
    logLevel: process.env.LOG_LEVEL || 'info'
}

console.log('🚀 Postman Helper starting with config:', {
    modelName: config.modelName,
    debugMode: config.debugMode,
    logLevel: config.logLevel
})

// Make config available globally for renderer process
let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    }
  })

  mainWindow.loadFile('index.html')
  
  // Open DevTools in development
  // mainWindow.webContents.openDevTools()

  mainWindow.on('closed', function () {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', function () {
  if (mainWindow === null) createWindow()
})

// Handle file operations from renderer process
ipcMain.handle('save-file', async (event, data) => {
  const { defaultPath, filters, content } = data
  
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultPath || 'postman_collection.json',
      filters: filters || [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    })

    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, content)
      return { success: true, path: result.filePath }
    }
    
    return { success: false }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('open-file', async (event, options) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: options.filters || [{ name: 'JSON Files', extensions: ['json'] }]
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const content = fs.readFileSync(result.filePaths[0], 'utf-8')
      return { success: true, path: result.filePaths[0], content: content }
    }
    
    return { success: false }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
