const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const { initDatabase, dbService } = require('./database');
const {
  initFileService,
  selectAttachmentFile,
  saveAttachment,
  openAttachment,
  deleteAttachment,
  getAttachments,
  openFolder
} = require('./services/fileService');
const {
  initBackupService,
  createBackup,
  restoreBackup,
  selectBackupFolder
} = require('./services/backupService');

let mainWindow = null;
let storagePaths = null;

// Determine development mode
const isDev = !app.isPackaged && (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV);
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

/**
 * Configure dedicated application data storage paths outside of installation directory
 */
function setupStorageDirectories() {
  const userData = app.getPath('userData');
  const baseDir = path.join(userData, 'FlowDesk');
  const dataDir = path.join(baseDir, 'data');
  const attachmentsDir = path.join(baseDir, 'attachments');
  const backupsDir = path.join(baseDir, 'backups');

  // Ensure directories exist
  [baseDir, dataDir, attachmentsDir, backupsDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  storagePaths = {
    baseDir,
    dataDir,
    attachmentsDir,
    backupsDir,
    dbPath: path.join(dataDir, 'flowdesk.db')
  };

  console.log('[Storage] FlowDesk Data Directory:', dataDir);
  console.log('[Storage] FlowDesk Attachments Directory:', attachmentsDir);
  console.log('[Storage] FlowDesk Backups Directory:', backupsDir);

  // Initialize SQLite and Services
  initDatabase(dataDir);
  initFileService(attachmentsDir, dbService);
  initBackupService(storagePaths, dbService);
}

/**
 * Create primary application window
 */
function createWindow() {
  const iconPath = path.join(__dirname, '../public/icon.png');
  const fallbackIcon = path.join(__dirname, '../public/favicon.svg');
  const windowIcon = fs.existsSync(iconPath) ? iconPath : (fs.existsSync(fallbackIcon) ? fallbackIcon : undefined);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'FlowDesk',
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Node APIs available in preload script
      webSecurity: true
    },
    show: false, // Show once ready-to-show to prevent white flash
    backgroundColor: '#f8faf9'
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Security: Prevent navigation to arbitrary URLs
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsed = new URL(navigationUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      // If it's not the local dev server, open in external browser
      if (!isDev || !navigationUrl.startsWith(devServerUrl)) {
        event.preventDefault();
        shell.openExternal(navigationUrl);
      }
    }
  });

  // Security: Deny window.open and open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Load Vite dev server or production build
  if (isDev && devServerUrl) {
    console.log('[Electron] Loading Vite Dev Server:', devServerUrl);
    mainWindow.loadURL(devServerUrl);
  } else {
    const prodPath = path.join(__dirname, '../dist/index.html');
    console.log('[Electron] Loading packaged build:', prodPath);
    mainWindow.loadFile(prodPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Register secure IPC handlers
 */
function registerIpcHandlers() {
  // --- Database Operations ---
  ipcMain.handle('flowdesk:db:getAll', async (event, table) => {
    return await dbService.getAll(table);
  });

  ipcMain.handle('flowdesk:db:getById', async (event, table, id) => {
    return await dbService.getById(table, id);
  });

  ipcMain.handle('flowdesk:db:insert', async (event, table, data) => {
    return await dbService.insert(table, data);
  });

  ipcMain.handle('flowdesk:db:bulkInsert', async (event, table, items) => {
    return await dbService.bulkInsert(table, items);
  });

  ipcMain.handle('flowdesk:db:update', async (event, table, id, changes) => {
    return await dbService.update(table, id, changes);
  });

  ipcMain.handle('flowdesk:db:delete', async (event, table, id) => {
    return await dbService.delete(table, id);
  });

  ipcMain.handle('flowdesk:db:count', async (event, table, criteria) => {
    return await dbService.count(table, criteria);
  });

  ipcMain.handle('flowdesk:db:where', async (event, table, criteria) => {
    return await dbService.where(table, criteria);
  });

  ipcMain.handle('flowdesk:db:deleteWhere', async (event, table, criteria) => {
    return await dbService.deleteWhere(table, criteria);
  });

  ipcMain.handle('flowdesk:db:migrateFromDexie', async (event, data) => {
    return await dbService.migrateFromDexie(data);
  });

  // --- File & Attachment Operations ---
  ipcMain.handle('flowdesk:files:selectAttachment', async () => {
    return await selectAttachmentFile(mainWindow);
  });

  ipcMain.handle('flowdesk:files:saveAttachment', async (event, opts) => {
    return await saveAttachment(opts);
  });

  ipcMain.handle('flowdesk:files:openAttachment', async (event, relativePath) => {
    return await openAttachment(relativePath);
  });

  ipcMain.handle('flowdesk:files:deleteAttachment', async (event, id) => {
    return await deleteAttachment(id);
  });

  ipcMain.handle('flowdesk:files:getAttachments', async (event, entityType, entityId) => {
    return await getAttachments(entityType, entityId);
  });

  ipcMain.handle('flowdesk:files:openFolder', async (event, type) => {
    let target = storagePaths.baseDir;
    if (type === 'data') target = storagePaths.dataDir;
    if (type === 'attachments') target = storagePaths.attachmentsDir;
    if (type === 'backups') target = storagePaths.backupsDir;
    return await openFolder(target);
  });

  ipcMain.handle('flowdesk:files:getStorageInfo', async () => {
    let dbSize = 0;
    try {
      if (fs.existsSync(storagePaths.dbPath)) {
        dbSize = fs.statSync(storagePaths.dbPath).size;
      }
    } catch (e) {
      // Ignore
    }

    return {
      storagePaths,
      dbSize,
      isDesktop: true
    };
  });

  // --- Backup Operations ---
  ipcMain.handle('flowdesk:backup:create', async (event, destPath) => {
    return await createBackup(destPath);
  });

  ipcMain.handle('flowdesk:backup:restore', async (event, backupPath) => {
    return await restoreBackup(backupPath, () => {
      // Reinitialize database after restore
      initDatabase(storagePaths.dataDir);
      initFileService(storagePaths.attachmentsDir, dbService);
      initBackupService(storagePaths, dbService);
    });
  });

  ipcMain.handle('flowdesk:backup:selectFolder', async () => {
    return await selectBackupFolder(mainWindow);
  });

  // --- Window Controls ---
  ipcMain.handle('flowdesk:app:getVersion', () => app.getVersion());
  ipcMain.handle('flowdesk:app:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });
  ipcMain.handle('flowdesk:app:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });
  ipcMain.handle('flowdesk:app:close', () => {
    if (mainWindow) mainWindow.close();
  });
}

// App lifecycle management
app.whenReady().then(() => {
  setupStorageDirectories();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Gracefully close SQLite connection
  dbService.close();
});
