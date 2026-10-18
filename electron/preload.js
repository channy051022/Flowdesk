const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure context bridge for FlowDesk desktop application.
 * Exposes strictly validated, scoped IPC channels without raw Node.js or filesystem access.
 */
contextBridge.exposeInMainWorld('flowdeskAPI', {
  isDesktop: true,
  platform: process.platform,

  // Database operations
  db: {
    getAll: (table) => ipcRenderer.invoke('flowdesk:db:getAll', table),
    getById: (table, id) => ipcRenderer.invoke('flowdesk:db:getById', table, id),
    insert: (table, data) => ipcRenderer.invoke('flowdesk:db:insert', table, data),
    bulkInsert: (table, items) => ipcRenderer.invoke('flowdesk:db:bulkInsert', table, items),
    update: (table, id, changes) => ipcRenderer.invoke('flowdesk:db:update', table, id, changes),
    delete: (table, id) => ipcRenderer.invoke('flowdesk:db:delete', table, id),
    count: (table, criteria) => ipcRenderer.invoke('flowdesk:db:count', table, criteria),
    where: (table, criteria) => ipcRenderer.invoke('flowdesk:db:where', table, criteria),
    deleteWhere: (table, criteria) => ipcRenderer.invoke('flowdesk:db:deleteWhere', table, criteria),
    migrateFromDexie: (data) => ipcRenderer.invoke('flowdesk:db:migrateFromDexie', data)
  },

  // Files & Attachments operations
  files: {
    selectAttachment: () => ipcRenderer.invoke('flowdesk:files:selectAttachment'),
    saveAttachment: (opts) => ipcRenderer.invoke('flowdesk:files:saveAttachment', opts),
    openAttachment: (relativePath) => ipcRenderer.invoke('flowdesk:files:openAttachment', relativePath),
    deleteAttachment: (id) => ipcRenderer.invoke('flowdesk:files:deleteAttachment', id),
    getAttachments: (entityType, entityId) => ipcRenderer.invoke('flowdesk:files:getAttachments', entityType, entityId),
    openFolder: (type) => ipcRenderer.invoke('flowdesk:files:openFolder', type),
    getStorageInfo: () => ipcRenderer.invoke('flowdesk:files:getStorageInfo')
  },

  // Backup & Reliability operations
  backup: {
    createBackup: (destPath) => ipcRenderer.invoke('flowdesk:backup:create', destPath),
    restoreBackup: (backupPath) => ipcRenderer.invoke('flowdesk:backup:restore', backupPath),
    selectBackupFolder: () => ipcRenderer.invoke('flowdesk:backup:selectFolder')
  },

  // Hardware Scanner operations (NAPS2 Integration)
  scanner: {
    checkAvailability: () => ipcRenderer.invoke('flowdesk:scanner:checkAvailability'),
    discoverDevices: () => ipcRenderer.invoke('flowdesk:scanner:discoverDevices'),
    startSession: (opts) => ipcRenderer.invoke('flowdesk:scanner:startSession', opts),
    scan: (opts) => ipcRenderer.invoke('flowdesk:scanner:scan', opts),
    deletePage: (sessionId, pageNumber) => ipcRenderer.invoke('flowdesk:scanner:deletePage', sessionId, pageNumber),
    getSessionPreview: (sessionId) => ipcRenderer.invoke('flowdesk:scanner:getSessionPreview', sessionId),
    getPdfBuffer: (sessionId) => ipcRenderer.invoke('flowdesk:scanner:getPdfBuffer', sessionId),
    cancelScan: (sessionId) => ipcRenderer.invoke('flowdesk:scanner:cancelScan', sessionId),
    discardSession: (sessionId) => ipcRenderer.invoke('flowdesk:scanner:discardSession', sessionId),
    finalize: (opts) => ipcRenderer.invoke('flowdesk:scanner:finalize', opts),
    getSettings: () => ipcRenderer.invoke('flowdesk:scanner:getSettings'),
    saveSettings: (settings) => ipcRenderer.invoke('flowdesk:scanner:saveSettings', settings),
    selectNaps2Path: () => ipcRenderer.invoke('flowdesk:scanner:selectNaps2Path')
  },

  // Desktop App Window Control
  app: {
    getVersion: () => ipcRenderer.invoke('flowdesk:app:getVersion'),
    minimize: () => ipcRenderer.invoke('flowdesk:app:minimize'),
    maximize: () => ipcRenderer.invoke('flowdesk:app:maximize'),
    close: () => ipcRenderer.invoke('flowdesk:app:close')
  }
});
