import { db, dexieDb } from '../db/database'

/**
 * Determine if running in the Electron desktop environment
 */
export function isDesktopApp() {
  return typeof window !== 'undefined' && Boolean(window.flowdeskAPI?.isDesktop && window.flowdeskAPI?.scanner)
}

/**
 * Check NAPS2 CLI availability and version information
 */
export async function checkScannerAvailability() {
  if (!isDesktopApp()) {
    return {
      available: false,
      isDesktop: false,
      message: 'Physical scanner integration requires the FlowDesk Electron desktop application.'
    }
  }

  try {
    const res = await window.flowdeskAPI.scanner.checkAvailability()
    return {
      ...res,
      isDesktop: true
    }
  } catch (err) {
    return {
      available: false,
      isDesktop: true,
      error: err.message,
      message: 'Error verifying NAPS2 scanner integration: ' + err.message
    }
  }
}

/**
 * Run real scanner device discovery across WIA, TWAIN, and eSCL
 */
export async function discoverScanners() {
  if (!isDesktopApp()) {
    return {
      success: false,
      devices: [],
      error: 'Scanner hardware discovery is only available in FlowDesk Windows Desktop app.'
    }
  }

  return await window.flowdeskAPI.scanner.discoverDevices()
}

/**
 * Start a scanning session
 */
export async function startScanSession(options = {}) {
  if (!isDesktopApp()) {
    throw new Error('Scanning sessions are only supported in Electron desktop mode.')
  }
  return await window.flowdeskAPI.scanner.startSession(options)
}

/**
 * Execute a scan operation
 */
export async function executeScan(options) {
  if (!isDesktopApp()) {
    throw new Error('Physical scanning is only supported in Electron desktop mode.')
  }
  return await window.flowdeskAPI.scanner.scan(options)
}

/**
 * Delete a specific page from a session
 */
export async function deleteScanPage(sessionId, pageNumber) {
  if (!isDesktopApp()) {
    throw new Error('Desktop mode required.')
  }
  return await window.flowdeskAPI.scanner.deletePage(sessionId, pageNumber)
}

/**
 * Get preview data for a scan session
 */
export async function getScanSessionPreview(sessionId) {
  if (!isDesktopApp()) return { pageCount: 0, pages: [], pdfReady: false }
  return await window.flowdeskAPI.scanner.getSessionPreview(sessionId)
}

/**
 * Get the compiled PDF Base64 string for renderer preview
 */
export async function getScanPdfBuffer(sessionId) {
  if (!isDesktopApp()) return null
  return await window.flowdeskAPI.scanner.getPdfBuffer(sessionId)
}

/**
 * Cancel an active scan process
 */
export async function cancelScan(sessionId) {
  if (!isDesktopApp()) return false
  return await window.flowdeskAPI.scanner.cancelScan(sessionId)
}

/**
 * Discard scan session and clean up temp files
 */
export async function discardScanSession(sessionId) {
  if (!isDesktopApp()) return true
  return await window.flowdeskAPI.scanner.discardSession(sessionId)
}

/**
 * Finalize scan: Save PDF locally and/or attach to an Activity Design
 */
export async function finalizeScan(options) {
  if (!isDesktopApp()) {
    throw new Error('Finalizing hardware scans requires Electron desktop mode.')
  }
  return await window.flowdeskAPI.scanner.finalize(options)
}

/**
 * Retrieve saved user scanner preferences
 */
export async function getScannerSettings() {
  if (isDesktopApp()) {
    try {
      const prefs = await window.flowdeskAPI.scanner.getSettings()
      if (prefs) return prefs
    } catch (e) {
      // fallback to localStorage
    }
  }

  try {
    const raw = localStorage.getItem('flowdesk_scanner_settings')
    if (raw) return JSON.parse(raw)
  } catch {}

  return {
    lastDevice: '',
    lastDriver: 'wia',
    source: 'feeder',
    dpi: 300,
    bitdepth: 'color'
  }
}

/**
 * Persist user scanner preferences
 */
export async function saveScannerSettings(settings) {
  try {
    localStorage.setItem('flowdesk_scanner_settings', JSON.stringify(settings))
  } catch {}

  if (isDesktopApp()) {
    try {
      await window.flowdeskAPI.scanner.saveSettings(settings)
    } catch (e) {
      console.warn('Failed to save scanner settings in SQLite:', e)
    }
  }
}

/**
 * Select custom NAPS2 executable path via file dialog
 */
export async function selectNaps2Executable() {
  if (!isDesktopApp()) return null
  return await window.flowdeskAPI.scanner.selectNaps2Path()
}

/**
 * Universal method to fetch attachments for any entity (Activity Design / Finance, Document, Task)
 * Works in both Electron (SQLite) and Browser (Dexie) modes
 */
export async function getEntityAttachments(entityType, entityId) {
  if (!entityId) return []

  if (isDesktopApp() && window.flowdeskAPI?.files?.getAttachments) {
    try {
      return await window.flowdeskAPI.files.getAttachments(entityType, Number(entityId))
    } catch (err) {
      console.warn('Failed to get attachments via Electron:', err)
    }
  }

  // Browser mode fallback via Dexie
  try {
    return await dexieDb.table('attachments').where({
      entityType,
      entityId: Number(entityId)
    }).toArray()
  } catch (err) {
    console.warn('Failed to get attachments via Dexie:', err)
    return []
  }
}

/**
 * Open an attachment using default Windows viewer or browser tab
 */
export async function openAttachment(attachment) {
  if (!attachment) return

  if (isDesktopApp() && window.flowdeskAPI?.files?.openAttachment && attachment.relativePath) {
    return await window.flowdeskAPI.files.openAttachment(attachment.relativePath)
  }

  // Browser mode
  if (attachment.dataUrl) {
    const win = window.open()
    if (win) {
      win.document.write(`<iframe src="${attachment.dataUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`)
    }
  } else {
    alert(`Attachment: "${attachment.fileName}"\nSaved on computer. Run the desktop version to open it directly.`)
  }
}

/**
 * Delete an attachment
 */
export async function deleteEntityAttachment(attachmentId) {
  if (!attachmentId) return false

  if (isDesktopApp() && window.flowdeskAPI?.files?.deleteAttachment) {
    return await window.flowdeskAPI.files.deleteAttachment(Number(attachmentId))
  }

  // Browser mode
  try {
    await dexieDb.table('attachments').delete(Number(attachmentId))
    return true
  } catch (err) {
    console.warn('Failed to delete attachment from Dexie:', err)
    return false
  }
}

/**
 * Attach an uploaded file in Browser mode (for users running in web browser without Electron)
 */
export async function attachFileBrowserMode({ entityType, entityId, file, notes = '' }) {
  const reader = new FileReader()
  return new Promise((resolve, reject) => {
    reader.onload = async () => {
      try {
        const dataUrl = reader.result
        const now = new Date().toISOString()
        const record = {
          entityType,
          entityId: Number(entityId),
          fileName: file.name,
          fileSize: file.size,
          fileType: file.name.split('.').pop()?.toLowerCase() || 'pdf',
          relativePath: `browser_uploads/${Date.now()}_${file.name}`,
          dataUrl,
          notes: notes || 'Uploaded via FlowDesk Web Mode',
          createdAt: now
        }
        const id = await dexieDb.table('attachments').add(record)
        resolve({ id, ...record })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file in browser.'))
    reader.readAsDataURL(file)
  })
}
