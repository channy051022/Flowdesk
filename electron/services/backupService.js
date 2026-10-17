const path = require('path');
const fs = require('fs');
const { dialog } = require('electron');

let dataDir = null;
let attachmentsDir = null;
let backupsDir = null;
let dbServiceRef = null;

function initBackupService(dirs, dbService) {
  dataDir = dirs.dataDir;
  attachmentsDir = dirs.attachmentsDir;
  backupsDir = dirs.backupsDir;
  dbServiceRef = dbService;

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
}

/**
 * Copy directory recursively
 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Format timestamp for backup naming (e.g. 20261017_180500)
 */
function getTimestampString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const h = pad(now.getHours());
  const mi = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  return `${y}${m}${d}_${h}${mi}${s}`;
}

/**
 * Create a full consistent local backup of SQLite database and attachments
 */
async function createBackup(customDestPath = null) {
  if (!backupsDir) throw new Error('Backup service not initialized');

  const timestamp = getTimestampString();
  const backupFolder = customDestPath
    ? customDestPath
    : path.join(backupsDir, `FlowDesk_Backup_${timestamp}`);

  if (!fs.existsSync(backupFolder)) {
    fs.mkdirSync(backupFolder, { recursive: true });
  }

  // 1. Get database statistics for backup manifest
  const docCount = await dbServiceRef.count('documents');
  const taskCount = await dbServiceRef.count('tasks');
  const financeCount = await dbServiceRef.count('financeRecords');
  const movementCount = await dbServiceRef.count('movements');
  const attachmentCount = await dbServiceRef.count('attachments');

  // 2. Perform a safe backup of the SQLite database
  const targetDbPath = path.join(backupFolder, 'flowdesk.db');
  const rawDb = dbServiceRef.getRawDb();
  
  if (rawDb && typeof rawDb.backup === 'function') {
    // better-sqlite3 native backup API (safe online backup while DB is running)
    await rawDb.backup(targetDbPath);
  } else {
    // Checkpoint WAL journal and copy
    try {
      rawDb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch (e) {
      console.warn('[Backup] Checkpoint warning:', e.message);
    }
    const currentDbPath = dbServiceRef.getDbPath();
    fs.copyFileSync(currentDbPath, targetDbPath);
  }

  // 3. Copy attachments folder
  const targetAttachmentsDir = path.join(backupFolder, 'attachments');
  copyDirRecursive(attachmentsDir, targetAttachmentsDir);

  // 4. Create backup manifest
  const manifest = {
    appName: 'FlowDesk',
    version: '1.0.0',
    backupDate: new Date().toISOString(),
    timestamp,
    statistics: {
      documents: docCount,
      tasks: taskCount,
      financeRecords: financeCount,
      movements: movementCount,
      attachments: attachmentCount
    }
  };

  fs.writeFileSync(
    path.join(backupFolder, 'backup-manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  return {
    success: true,
    backupFolder,
    manifest
  };
}

/**
 * Validate a backup directory before restoring
 */
function validateBackup(backupFolderPath) {
  if (!fs.existsSync(backupFolderPath)) {
    return { valid: false, error: 'Backup folder does not exist' };
  }

  const manifestPath = path.join(backupFolderPath, 'backup-manifest.json');
  const dbPath = path.join(backupFolderPath, 'flowdesk.db');

  if (!fs.existsSync(manifestPath)) {
    return { valid: false, error: 'Invalid backup: missing backup-manifest.json' };
  }

  if (!fs.existsSync(dbPath)) {
    return { valid: false, error: 'Invalid backup: missing flowdesk.db' };
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    if (manifest.appName !== 'FlowDesk') {
      return { valid: false, error: 'Backup is not a FlowDesk backup file' };
    }
    return { valid: true, manifest };
  } catch (err) {
    return { valid: false, error: `Corrupt backup manifest: ${err.message}` };
  }
}

/**
 * Restore database and attachments from a validated backup folder
 */
async function restoreBackup(backupFolderPath, onReopenDb) {
  const validation = validateBackup(backupFolderPath);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // 1. Create safety emergency snapshot of current state before replacing
  const emergencyTime = getTimestampString();
  const emergencyFolder = path.join(backupsDir, `Emergency_PreRestore_${emergencyTime}`);
  try {
    fs.mkdirSync(emergencyFolder, { recursive: true });
    const currentDbPath = dbServiceRef.getDbPath();
    if (fs.existsSync(currentDbPath)) {
      fs.copyFileSync(currentDbPath, path.join(emergencyFolder, 'flowdesk.db'));
    }
    copyDirRecursive(attachmentsDir, path.join(emergencyFolder, 'attachments'));
  } catch (err) {
    console.warn('[Restore] Emergency snapshot warning:', err.message);
  }

  // 2. Close active SQLite connection
  dbServiceRef.close();

  // 3. Overwrite current flowdesk.db
  const currentDbPath = path.join(dataDir, 'flowdesk.db');
  fs.copyFileSync(path.join(backupFolderPath, 'flowdesk.db'), currentDbPath);

  // Clean up any stray WAL/SHM journal files from previous session
  try {
    const walPath = `${currentDbPath}-wal`;
    const shmPath = `${currentDbPath}-shm`;
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  } catch (e) {
    // Ignore journal cleanup error
  }

  // 4. Overwrite attachments if present in backup
  const backupAttachments = path.join(backupFolderPath, 'attachments');
  if (fs.existsSync(backupAttachments)) {
    copyDirRecursive(backupAttachments, attachmentsDir);
  }

  // 5. Reopen database connection
  if (typeof onReopenDb === 'function') {
    onReopenDb();
  }

  // 6. Verify restored record counts
  const newDocs = await dbServiceRef.count('documents');
  const newTasks = await dbServiceRef.count('tasks');
  const newFinance = await dbServiceRef.count('financeRecords');

  return {
    success: true,
    manifest: validation.manifest,
    emergencySnapshot: emergencyFolder,
    currentCounts: {
      documents: newDocs,
      tasks: newTasks,
      financeRecords: newFinance
    }
  };
}

/**
 * File dialog to select a backup directory
 */
async function selectBackupFolder(win) {
  const result = await dialog.showOpenDialog(win, {
    title: 'Select FlowDesk Backup Folder to Restore',
    properties: ['openDirectory']
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
}

module.exports = {
  initBackupService,
  createBackup,
  validateBackup,
  restoreBackup,
  selectBackupFolder
};
