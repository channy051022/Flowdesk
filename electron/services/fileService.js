const path = require('path');
const fs = require('fs');
const { dialog, shell } = require('electron');

let attachmentsBaseDir = null;
let dbServiceRef = null;

/**
 * Initialize file service with attachments directory and dbService reference
 */
function initFileService(attachmentsDir, dbService) {
  attachmentsBaseDir = attachmentsDir;
  dbServiceRef = dbService;

  if (!fs.existsSync(attachmentsBaseDir)) {
    fs.mkdirSync(attachmentsBaseDir, { recursive: true });
  }
  console.log('[FileService] Attachments directory:', attachmentsBaseDir);
}

/**
 * Prompt user with native Windows file dialog to select an attachment
 * @param {Electron.BrowserWindow} win
 */
async function selectAttachmentFile(win) {
  const result = await dialog.showOpenDialog(win, {
    title: 'Select Attachment — FlowDesk',
    properties: ['openFile'],
    filters: [
      { name: 'Documents & Scans', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  const stats = fs.statSync(selectedPath);
  return {
    filePath: selectedPath,
    fileName: path.basename(selectedPath),
    fileSize: stats.size,
    fileExt: path.extname(selectedPath).toLowerCase()
  };
}

/**
 * Sanitize filename to prevent path traversal or special character issues
 */
function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Save an attachment to the local computer's dedicated attachments folder
 * and store metadata in SQLite
 */
async function saveAttachment({ entityType = 'document', entityId, sourceFilePath, notes = '' }) {
  if (!attachmentsBaseDir) throw new Error('File service not initialized');
  if (!fs.existsSync(sourceFilePath)) {
    throw new Error(`Source file does not exist: ${sourceFilePath}`);
  }

  const stats = fs.statSync(sourceFilePath);
  const originalName = path.basename(sourceFilePath);
  const ext = path.extname(originalName).toLowerCase();
  const safeName = sanitizeFileName(originalName);
  const timestamp = Date.now();
  
  // Create organized subfolder: <attachmentsBaseDir>/<entityType>/<entityId>/
  const targetSubdir = path.join(attachmentsBaseDir, entityType, String(entityId));
  if (!fs.existsSync(targetSubdir)) {
    fs.mkdirSync(targetSubdir, { recursive: true });
  }

  const storedFileName = `${timestamp}_${safeName}`;
  const targetFilePath = path.join(targetSubdir, storedFileName);

  // Copy file safely
  fs.copyFileSync(sourceFilePath, targetFilePath);

  // Store relative path (normalized with forward slashes for cross-platform portability)
  const relativePath = path.relative(attachmentsBaseDir, targetFilePath).replace(/\\/g, '/');

  // Insert metadata into SQLite attachments table
  const now = new Date().toISOString();
  const attachmentRecord = {
    entityType,
    entityId: Number(entityId),
    fileName: originalName,
    fileSize: stats.size,
    fileType: ext.replace('.', ''),
    relativePath,
    notes: notes || '',
    createdAt: now
  };

  const id = await dbServiceRef.insert('attachments', attachmentRecord);
  return {
    id,
    ...attachmentRecord
  };
}

/**
 * Open an attachment using its default Windows application (PDF reader, Word, etc.)
 */
async function openAttachment(relativePath) {
  if (!attachmentsBaseDir) throw new Error('File service not initialized');
  if (!relativePath) throw new Error('Relative path is required');

  // Security check: Guard against path traversal attacks (e.g. "../../../Windows/...")
  const safeRelative = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  const absolutePath = path.resolve(attachmentsBaseDir, safeRelative);

  // Verify that the resolved path is strictly inside attachmentsBaseDir
  if (!absolutePath.startsWith(path.resolve(attachmentsBaseDir))) {
    throw new Error('Access denied: Unauthorized file path traversal attempt.');
  }

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Attachment file not found on disk at: ${absolutePath}`);
  }

  const openResult = await shell.openPath(absolutePath);
  if (openResult) {
    // shell.openPath returns an error string if opening failed
    throw new Error(`Failed to open file: ${openResult}`);
  }

  return { success: true, path: absolutePath };
}

/**
 * Delete an attachment both from disk and SQLite
 */
async function deleteAttachment(attachmentId) {
  if (!dbServiceRef) throw new Error('Database service not available');
  const record = await dbServiceRef.getById('attachments', Number(attachmentId));
  if (!record) return false;

  // Try to delete file from disk
  try {
    const absolutePath = path.resolve(attachmentsBaseDir, record.relativePath);
    if (absolutePath.startsWith(path.resolve(attachmentsBaseDir)) && fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  } catch (err) {
    console.warn('[FileService] Failed to unlink physical file:', err.message);
  }

  // Delete database record
  await dbServiceRef.delete('attachments', Number(attachmentId));
  return true;
}

/**
 * Get all attachments for a specific entity
 */
async function getAttachments(entityType, entityId) {
  if (!dbServiceRef) return [];
  const rows = await dbServiceRef.where('attachments', {
    entityType,
    entityId: Number(entityId)
  });
  
  // Verify disk status for each attachment
  return rows.map((att) => {
    const absolutePath = path.resolve(attachmentsBaseDir, att.relativePath);
    const existsOnDisk = fs.existsSync(absolutePath);
    return {
      ...att,
      existsOnDisk,
      absolutePath: existsOnDisk ? absolutePath : null
    };
  });
}

/**
 * Open storage folder (data, attachments, backups) in Windows File Explorer
 */
async function openFolder(folderPath) {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  return shell.openPath(folderPath);
}

module.exports = {
  initFileService,
  selectAttachmentFile,
  saveAttachment,
  openAttachment,
  deleteAttachment,
  getAttachments,
  openFolder
};
