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
    aiBaseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    aiModel: process.env.AI_MODEL || 'gpt-4o-mini',
    debugMode: process.env.DEBUG_MODE === 'true',
    logLevel: process.env.LOG_LEVEL || 'info'
}

console.log('🚀 Postman Helper starting with config:', {
    modelName: config.modelName,
    debugMode: config.debugMode,
    logLevel: config.logLevel
})

// ===== Window State Persistence =====
const WINDOW_STATE_FILE = path.join(require('os').homedir(), '.postman-helper', 'window-state.json')

function loadWindowState() {
  try {
    if (fs.existsSync(WINDOW_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(WINDOW_STATE_FILE, 'utf-8'))
    }
  } catch (e) {
    console.error('Failed to load window state:', e.message)
  }
  return null
}

function saveWindowState(win) {
  try {
    const bounds = win.getBounds()
    const state = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: win.isMaximized(),
      isFullScreen: win.isFullScreen()
    }
    const dir = path.dirname(WINDOW_STATE_FILE)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8')
  } catch (e) {
    console.error('Failed to save window state:', e.message)
  }
}

let mainWindow

function createWindow() {
  const saved = loadWindowState()

  const windowOptions = {
    width: saved ? saved.width : 1200,
    height: saved ? saved.height : 800,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    }
  }

  // Restore position if saved and valid
  if (saved && saved.x != null && saved.y != null) {
    windowOptions.x = saved.x
    windowOptions.y = saved.y
  }

  mainWindow = new BrowserWindow(windowOptions)

  // Maximize by default on first launch, or restore previous state
  if (saved) {
    if (saved.isFullScreen) {
      mainWindow.setFullScreen(true)
    } else if (saved.isMaximized) {
      mainWindow.maximize()
    }
  } else {
    // First launch: maximize for immersive experience
    mainWindow.maximize()
  }

  mainWindow.loadFile('index.html')
  
  // Open DevTools in development
  // mainWindow.webContents.openDevTools()

  // Save window state on resize, move, and close
  const debouncedSave = (() => {
    let timer
    return () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          saveWindowState(mainWindow)
        }
      }, 300)
    }
  })()

  mainWindow.on('resize', debouncedSave)
  mainWindow.on('move', debouncedSave)
  mainWindow.on('close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      saveWindowState(mainWindow)
    }
  })

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

// ===== Feature 17: Plugin System =====
const PLUGINS_DIR = path.join(require('os').homedir(), '.postman-helper', 'plugins')

ipcMain.handle('list-plugins', async () => {
  try {
    if (!fs.existsSync(PLUGINS_DIR)) return { success: true, plugins: [] }
    const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
    const dirs = entries
      .filter(d => d.isDirectory())
      .map(d => path.join(PLUGINS_DIR, d.name))
    return { success: true, plugins: dirs }
  } catch (error) {
    return { success: false, error: error.message, plugins: [] }
  }
})

ipcMain.handle('read-plugin-manifest', async (event, dir) => {
  try {
    const resolved = path.resolve(dir)
    // Security: ensure path is within plugins directory
    if (!resolved.startsWith(path.resolve(PLUGINS_DIR))) {
      return { success: false, error: 'Invalid plugin path' }
    }
    const manifestPath = path.join(resolved, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      return { success: false, error: 'manifest.json not found' }
    }
    const content = fs.readFileSync(manifestPath, 'utf-8')
    const manifest = JSON.parse(content)
    return { success: true, manifest }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('load-plugin', async (event, dir, mainFile) => {
  try {
    const resolved = path.resolve(dir, mainFile)
    // Security: ensure path is within plugins directory
    if (!resolved.startsWith(path.resolve(PLUGINS_DIR))) {
      return { success: false, error: 'Invalid plugin path' }
    }
    if (!fs.existsSync(resolved)) {
      return { success: false, error: 'Plugin main file not found' }
    }
    const source = fs.readFileSync(resolved, 'utf-8')
    return { success: true, source }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// ===== Feature 18: AI-Powered Suggestions =====
// Graceful degradation: if ai.js fails to load, AI features are disabled (#61)
let aiService
try {
  const { AIService } = require('./ai')
  aiService = new AIService({
    chatApiKey: config.chatApiKey,
    aiBaseUrl: config.aiBaseUrl,
    aiModel: config.aiModel
  })
} catch (e) {
  console.error('Failed to load AI service:', e.message)
  aiService = { enabled: false }
}

// Input validation helper for IPC handlers (#60)
function validateAIInput(data) {
  return data && typeof data === 'object'
}

ipcMain.handle('ai-is-enabled', async () => {
  return { enabled: aiService.enabled }
})

ipcMain.handle('ai-suggest-headers', async (event, data) => {
  if (!validateAIInput(data)) return { suggestions: [], error: 'Invalid input' }
  try {
    return await aiService.suggestHeaders(data)
  } catch (error) {
    return { suggestions: [], error: error.message }
  }
})

ipcMain.handle('ai-generate-body', async (event, data) => {
  if (!validateAIInput(data)) return { body: '', error: 'Invalid input' }
  try {
    return await aiService.generateBody(data)
  } catch (error) {
    return { body: '', error: error.message }
  }
})

ipcMain.handle('ai-generate-tests', async (event, data) => {
  if (!validateAIInput(data)) return { tests: '', error: 'Invalid input' }
  try {
    return await aiService.generateTests(data)
  } catch (error) {
    return { tests: '', error: error.message }
  }
})

ipcMain.handle('ai-analyze-error', async (event, data) => {
  if (!validateAIInput(data)) return { analysis: '', error: 'Invalid input' }
  try {
    return await aiService.analyzeError(data)
  } catch (error) {
    return { analysis: '', error: error.message }
  }
})

ipcMain.handle('ai-suggest-url', async (event, data) => {
  if (!validateAIInput(data)) return { suggestions: [], error: 'Invalid input' }
  try {
    return await aiService.suggestUrl(data)
  } catch (error) {
    return { suggestions: [], error: error.message }
  }
})
