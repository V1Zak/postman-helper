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

// ===== Feature 3: HTTP Request Execution =====
ipcMain.handle('send-request', async (event, options) => {
  const { method, url, headers, body } = options
  const startTime = Date.now()

  try {
    const parsedUrl = new URL(url)
    const httpModule = parsedUrl.protocol === 'https:' ? require('https') : require('http')

    return new Promise((resolve) => {
      const reqOptions = {
        method: method || 'GET',
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        headers: headers || {},
        timeout: 30000
      }

      const req = httpModule.request(reqOptions, (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const elapsed = Date.now() - startTime
          const bodyStr = Buffer.concat(chunks).toString('utf-8')
          const responseHeaders = {}
          for (const [key, value] of Object.entries(res.headers)) {
            responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value
          }
          resolve({
            success: true,
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: responseHeaders,
            body: bodyStr,
            time: elapsed
          })
        })
      })

      req.on('timeout', () => {
        req.destroy()
        resolve({ success: false, error: 'Request timed out after 30 seconds', time: Date.now() - startTime })
      })

      req.on('error', (error) => {
        resolve({ success: false, error: error.message, time: Date.now() - startTime })
      })

      if (body && method !== 'GET' && method !== 'HEAD') {
        req.write(body)
      }
      req.end()
    })
  } catch (error) {
    return { success: false, error: error.message, time: Date.now() - startTime }
  }
})

// ===== Feature 4: Auto-save & Persistence =====
const AUTOSAVE_DIR = path.join(require('os').homedir(), '.postman-helper')
const AUTOSAVE_FILE = path.join(AUTOSAVE_DIR, 'autosave.json')

ipcMain.handle('auto-save', async (event, data) => {
  try {
    fs.mkdirSync(AUTOSAVE_DIR, { recursive: true })
    fs.writeFileSync(AUTOSAVE_FILE, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('auto-load', async () => {
  try {
    if (!fs.existsSync(AUTOSAVE_FILE)) return { success: false }
    const content = fs.readFileSync(AUTOSAVE_FILE, 'utf-8')
    const data = JSON.parse(content)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('clear-autosave', async () => {
  try {
    if (fs.existsSync(AUTOSAVE_FILE)) fs.unlinkSync(AUTOSAVE_FILE)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
