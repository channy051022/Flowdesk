const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const { dialog, shell } = require('electron');

let storagePathsRef = null;
let dbServiceRef = null;
let tempScansDir = null;

// Track active sessions and running child processes
const activeSessions = new Map();
const activeScanProcesses = new Map();

/**
 * Standard known paths for NAPS2 CLI installation on Windows
 */
const STANDARD_NAPS2_PATHS = [
  'C:\\Program Files\\NAPS2\\NAPS2.Console.exe',
  'C:\\Program Files (x86)\\NAPS2\\NAPS2.Console.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'NAPS2', 'NAPS2.Console.exe'),
  path.join(process.env.APPDATA || '', 'NAPS2', 'NAPS2.Console.exe'),
  'C:\\ProgramData\\chocolatey\\bin\\naps2.console.exe',
  'C:\\tools\\naps2\\NAPS2.Console.exe'
];

/**
 * Initialize scanner service with storage paths and dbService
 */
function initScannerService(storagePaths, dbService) {
  storagePathsRef = storagePaths;
  dbServiceRef = dbService;

  // Dedicated temporary directory for scan sessions
  tempScansDir = path.join(storagePaths.baseDir, 'temp_scans');
  if (!fs.existsSync(tempScansDir)) {
    fs.mkdirSync(tempScansDir, { recursive: true });
  }

  // Clean up any stale leftover temporary scan folders from previous application runs
  cleanStaleTempSessions();

  console.log('[ScannerService] Initialized. Temp scans directory:', tempScansDir);
}

/**
 * Clean up leftover temporary directories from prior crashed or closed sessions
 */
function cleanStaleTempSessions() {
  try {
    if (fs.existsSync(tempScansDir)) {
      const items = fs.readdirSync(tempScansDir);
      for (const item of items) {
        const itemPath = path.join(tempScansDir, item);
        try {
          fs.rmSync(itemPath, { recursive: true, force: true });
        } catch (e) {
          // Ignore
        }
      }
    }
  } catch (err) {
    console.warn('[ScannerService] Warning during temp cleanup:', err.message);
  }
}

/**
 * Detect NAPS2 installed via Windows Package Manager (winget) / MSIX
 */
function findInWindowsApps() {
  try {
    // 1. Direct check of AppX package location via PowerShell
    const { execSync } = require('child_process');
    try {
      const psOut = execSync('powershell.exe -NoProfile "(Get-AppxPackage -Name *NAPS2*).InstallLocation"', {
        windowsHide: true,
        timeout: 3000
      }).toString().trim();
      if (psOut && fs.existsSync(psOut)) {
        const candidate = path.join(psOut, 'NAPS2.Console.exe');
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    } catch (e) {
      // Ignore
    }

    // 2. Scan Program Files\WindowsApps if accessible
    const pfWindowsApps = 'C:\\Program Files\\WindowsApps';
    if (fs.existsSync(pfWindowsApps)) {
      try {
        const entries = fs.readdirSync(pfWindowsApps);
        for (const entry of entries) {
          if (entry.toLowerCase().includes('naps2')) {
            const candidate = path.join(pfWindowsApps, entry, 'NAPS2.Console.exe');
            if (fs.existsSync(candidate)) {
              return candidate;
            }
          }
        }
      } catch (e) {
        // Ignore permission checks
      }
    }

    // 3. Scan LocalAppData\Microsoft\WindowsApps for direct or alias folder
    const localWindowsApps = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps');
    if (fs.existsSync(localWindowsApps)) {
      const entries = fs.readdirSync(localWindowsApps);
      for (const entry of entries) {
        if (entry.toLowerCase().includes('naps2')) {
          const subPath = path.join(localWindowsApps, entry);
          try {
            if (fs.statSync(subPath).isDirectory()) {
              const candidate = path.join(subPath, 'NAPS2.Console.exe');
              if (fs.existsSync(candidate)) {
                return candidate;
              }
            }
          } catch (e) {}
        }
      }
    }
  } catch (err) {
    // Ignore
  }
  return null;
}

/**
 * Find NAPS2 Console executable on the system
 * Searches: Custom configured path in DB -> WindowsApps (winget) -> Bundled/Resource path -> Standard Windows Paths -> PATH env
 */
async function locateNaps2Executable() {
  // 1. Check custom path in settings table if explicitly configured by user
  if (dbServiceRef) {
    try {
      const customSetting = await dbServiceRef.getById('settings', 'naps2_custom_path');
      if (customSetting && customSetting.value && fs.existsSync(customSetting.value)) {
        return customSetting.value;
      }
    } catch (e) {
      // Ignore
    }
  }

  // 2. Check bundled resources in packaged app or local development bin (zero setup on other laptops)
  const candidateBundled = [
    process.resourcesPath ? path.join(process.resourcesPath, 'bin', 'naps2', 'NAPS2.Console.exe') : null,
    path.join(__dirname, '..', '..', 'bin', 'naps2', 'NAPS2.Console.exe'),
    path.join(__dirname, '..', 'bin', 'naps2', 'NAPS2.Console.exe')
  ].filter(Boolean);

  for (const p of candidateBundled) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // 3. Check WindowsApps (WinGet / MSIX installation)
  const winAppsExe = findInWindowsApps();
  if (winAppsExe) {
    return winAppsExe;
  }

  // 4. Check standard installation directories
  for (const p of STANDARD_NAPS2_PATHS) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }

  // 5. Check system PATH via where.exe
  const pathExe = await findOnSystemPath('NAPS2.Console.exe') || await findOnSystemPath('naps2.console.exe');
  if (pathExe) {
    return pathExe;
  }

  return null;
}

/**
 * Probe where.exe to see if executable is in system PATH
 */
function findOnSystemPath(exeName) {
  return new Promise((resolve) => {
    execFile('where.exe', [exeName], (err, stdout) => {
      if (!err && stdout) {
        const firstLine = stdout.split(/\r?\n/)[0]?.trim();
        if (firstLine && fs.existsSync(firstLine)) {
          return resolve(firstLine);
        }
      }
      resolve(null);
    });
  });
}

/**
 * Check NAPS2 CLI availability and version information
 */
async function checkAvailability() {
  const exePath = await locateNaps2Executable();
  if (!exePath) {
    return {
      available: false,
      path: null,
      version: null,
      searchPaths: STANDARD_NAPS2_PATHS,
      message: 'NAPS2 scanner CLI executable not found on this computer. Please install NAPS2 or specify its location.'
    };
  }

  return new Promise((resolve) => {
    // Run --version to verify executable works
    execFile(exePath, ['--version'], { windowsHide: true, timeout: 5000 }, (err, stdout, stderr) => {
      const output = (stderr || stdout || '').trim();
      if (err && !output.includes('NAPS2')) {
        // Fallback: test without arguments if --version fails
        return resolve({
          available: true,
          path: exePath,
          version: 'NAPS2 CLI (Detected)',
          message: 'NAPS2 CLI is available.'
        });
      }

      const versionOutput = output.split(/\r?\n/)[0] || 'NAPS2 CLI';
      resolve({
        available: true,
        path: exePath,
        version: versionOutput,
        message: `NAPS2 CLI is ready (${versionOutput}).`
      });
    });
  });
}

/**
 * Execute device discovery for a specific driver
 * @param {string} naps2Path
 * @param {string} driver - 'wia' | 'twain' | 'escl'
 * @returns {Promise<Array>}
 */
function discoverDevicesForDriver(naps2Path, driver) {
  return new Promise((resolve) => {
    const devices = [];
    let stdoutData = '';
    let stderrData = '';

    const child = spawn(naps2Path, ['--driver', driver, '--listdevices'], {
      windowsHide: true,
      timeout: 20000
    });

    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    child.on('error', (err) => {
      console.warn(`[ScannerService] Discovery error for driver ${driver}:`, err.message);
      resolve([]);
    });

    child.on('close', (code) => {
      const combined = stdoutData + '\n' + stderrData;
      const lines = combined.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      for (const line of lines) {
        // Check for structured NAPS2 output: ScanDevice { Driver = Wia, ID = ..., Name = ... }
        const structuredMatch = line.match(/ScanDevice\s*\{\s*Driver\s*=\s*([^,]+),\s*ID\s*=\s*([^,]+),\s*Name\s*=\s*([^,}]+)/i);
        if (structuredMatch) {
          const rawDriver = structuredMatch[1].trim().toLowerCase();
          const rawId = structuredMatch[2].trim();
          const rawName = structuredMatch[3].trim();
          devices.push({
            id: `${rawDriver}:${rawId}`,
            rawId,
            name: rawName,
            driver: rawDriver === 'wia' ? 'wia' : (rawDriver === 'twain' ? 'twain' : 'escl'),
            driverLabel: formatDriverLabel(rawDriver)
          });
          continue;
        }

        // Check for plain-text device listing (ignoring logs/errors/status messages)
        if (
          !line.startsWith('[') &&
          !line.toLowerCase().startsWith('error') &&
          !line.toLowerCase().startsWith('warning') &&
          !line.toLowerCase().startsWith('info') &&
          !line.toLowerCase().includes('naps2.console') &&
          !line.toLowerCase().includes('copyright') &&
          !line.toLowerCase().includes('version') &&
          line.length > 2
        ) {
          devices.push({
            id: `${driver}:${line}`,
            rawId: line,
            name: line,
            driver,
            driverLabel: formatDriverLabel(driver)
          });
        }
      }

      resolve(devices);
    });
  });
}

function formatDriverLabel(driver) {
  if (driver === 'wia') return 'WIA (Windows Image Acquisition)';
  if (driver === 'twain') return 'TWAIN Driver';
  if (driver === 'escl') return 'eSCL / AirScan (Network)';
  return driver.toUpperCase();
}

/**
 * Discover all real connected scanners across WIA, TWAIN, and eSCL
 */
async function discoverDevices() {
  const exePath = await locateNaps2Executable();
  if (!exePath) {
    return {
      success: false,
      devices: [],
      error: 'NAPS2 CLI is not installed or located. Scanner discovery requires NAPS2.'
    };
  }

  try {
    // Run real discovery against WIA, TWAIN, and eSCL
    const [wiaDevices, twainDevices, esclDevices] = await Promise.all([
      discoverDevicesForDriver(exePath, 'wia').catch(() => []),
      discoverDevicesForDriver(exePath, 'twain').catch(() => []),
      discoverDevicesForDriver(exePath, 'escl').catch(() => [])
    ]);

    const allDiscovered = [...wiaDevices, ...twainDevices, ...esclDevices];

    // Deduplicate identical driver+name pairs
    const seen = new Set();
    const normalizedDevices = [];

    for (const dev of allDiscovered) {
      const key = `${dev.driver}:${dev.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        normalizedDevices.push({
          ...dev,
          isSelectable: true
        });
      }
    }

    console.log(`[ScannerService] Real discovery complete. Found ${normalizedDevices.length} scanner devices.`);
    return {
      success: true,
      devices: normalizedDevices
    };
  } catch (err) {
    console.error('[ScannerService] Device discovery failed:', err);
    return {
      success: false,
      devices: [],
      error: err.message
    };
  }
}

/**
 * Start a new scanning session
 */
function startSession({ activityDesignId = null, deviceName = '', driver = 'wia' }) {
  const sessionId = `scan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const sessionDir = path.join(tempScansDir, sessionId);

  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const session = {
    id: sessionId,
    sessionDir,
    activityDesignId,
    deviceName,
    driver,
    pages: [],
    pdfPath: path.join(sessionDir, 'session_preview.pdf'),
    createdAt: Date.now()
  };

  activeSessions.set(sessionId, session);
  return { sessionId, sessionDir };
}

/**
 * Sanitize filename string for safe file saving
 */
function sanitizeFileName(name) {
  return String(name || 'scan')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Execute scan operation using safe child_process.spawn
 */
async function scan({
  sessionId,
  deviceName,
  driver = 'wia',
  source = 'feeder',
  dpi = 300,
  bitdepth = 'color'
}) {
  let session = activeSessions.get(sessionId);
  if (!session) {
    const newSession = startSession({ deviceName, driver });
    session = activeSessions.get(newSession.sessionId);
  }

  // Validate scan parameters first
  const allowedDrivers = ['wia', 'twain', 'escl'];
  const allowedSources = ['feeder', 'glass', 'duplex'];
  const allowedBitdepths = ['color', 'gray', 'bw'];

  if (!allowedDrivers.includes((driver || '').toLowerCase())) {
    throw new Error(`Unsupported scanner driver: ${driver}`);
  }
  if (!allowedSources.includes((source || '').toLowerCase())) {
    throw new Error(`Unsupported paper source: ${source}`);
  }
  if (!allowedBitdepths.includes((bitdepth || '').toLowerCase())) {
    throw new Error(`Unsupported color mode: ${bitdepth}`);
  }

  const validDpi = parseInt(dpi, 10);
  if (isNaN(validDpi) || validDpi < 75 || validDpi > 1200) {
    throw new Error(`Invalid resolution DPI: ${dpi}`);
  }

  const exePath = await locateNaps2Executable();
  if (!exePath) {
    throw new Error('NAPS2 scanner CLI is not available. Please install NAPS2 to scan.');
  }

  if (activeScanProcesses.has(session.id)) {
    throw new Error('A scanning operation is already in progress. Please wait for it to finish.');
  }

  // Determine current page count offset so new pages don't overwrite existing ones
  const existingFiles = fs.existsSync(session.sessionDir)
    ? fs.readdirSync(session.sessionDir).filter(f => /^page_\d+\.png$/i.test(f))
    : [];
  const offset = existingFiles.length;

  // Pattern for NAPS2 page numbering: page_$(nnn).png
  // When offset > 0, we use a batch folder or rename afterwards
  const batchDir = path.join(session.sessionDir, `batch_${Date.now()}`);
  fs.mkdirSync(batchDir, { recursive: true });
  const outputPattern = path.join(batchDir, 'page_$(nnn).png');

  // Build command-line arguments array strictly without shell expansion
  const args = [
    '-o', outputPattern,
    '--noprofile',
    '--driver', driver.toLowerCase(),
    '--device', deviceName,
    '--source', source.toLowerCase(),
    '--dpi', String(validDpi),
    '--bitdepth', bitdepth.toLowerCase(),
    '-v'
  ];

  console.log('[ScannerService] Spawning NAPS2:', exePath, args);

  return new Promise((resolve, reject) => {
    let stdoutText = '';
    let stderrText = '';

    const child = spawn(exePath, args, {
      windowsHide: true
    });

    activeScanProcesses.set(session.id, child);

    child.stdout.on('data', (d) => {
      stdoutText += d.toString();
    });

    child.stderr.on('data', (d) => {
      stderrText += d.toString();
    });

    child.on('error', (err) => {
      activeScanProcesses.delete(session.id);
      reject(new Error(`Failed to start scanner process: ${err.message}`));
    });

    child.on('close', async (code) => {
      activeScanProcesses.delete(session.id);

      // Collect new scanned page images from batch directory
      const batchPages = fs.existsSync(batchDir)
        ? fs.readdirSync(batchDir).filter(f => /^page_\d+\.png$/i.test(f)).sort()
        : [];

      if (batchPages.length === 0) {
        // Clean up empty batch directory
        try { fs.rmSync(batchDir, { recursive: true, force: true }); } catch {}

        // Format user-friendly error message based on stdout and stderr
        const errLower = (stderrText + ' ' + stdoutText).toLowerCase();

        // 1. Feeder empty or paper missing
        if (
          errLower.includes('feeder') ||
          errLower.includes('paper') ||
          errLower.includes('empty') ||
          (source.toLowerCase() !== 'glass' && (errLower.includes('scanning driver') || errLower.includes('8021000e')))
        ) {
          return reject(new Error('Document feeder (ADF) failed or has no paper loaded. If your document is on the flatbed glass, switch Paper Source to "Flatbed / Glass" and try again.'));
        }

        // 2. Scanner busy or locked
        if (errLower.includes('busy') || errLower.includes('in use') || errLower.includes('locked')) {
          return reject(new Error('Scanner is currently busy or in use by another application. Please wait a moment and retry.'));
        }

        // 3. Scanner disconnected or offline
        if (errLower.includes('not found') || errLower.includes('disconnected') || errLower.includes('offline') || errLower.includes('no device')) {
          return reject(new Error(`Scanner "${deviceName}" could not be reached. Please check the USB/network connection and verify it is turned on.`));
        }

        // 4. General scanning driver failure
        if (errLower.includes('scanning driver') || errLower.includes('wia error') || errLower.includes('twain error')) {
          return reject(new Error(`The scanner driver encountered an issue. Try switching the Driver between WIA and TWAIN in the scanner settings.`));
        }

        // 5. Extract specific error line from stdout or stderr if present
        const combinedLines = (stderrText + '\n' + stdoutText).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const specificError = combinedLines.find(l => 
          l.toLowerCase().includes('error') || 
          l.toLowerCase().includes('exception') || 
          l.toLowerCase().includes('failed')
        );

        return reject(new Error(specificError || stderrText.trim() || stdoutText.trim() || `Scanner process exited with code ${code} without generating pages.`));
      }

      // Move batch pages into main session directory with contiguous numbering
      let currentIdx = offset + 1;
      for (const bPage of batchPages) {
        const paddedIdx = String(currentIdx).padStart(3, '0');
        const targetName = `page_${paddedIdx}.png`;
        fs.renameSync(path.join(batchDir, bPage), path.join(session.sessionDir, targetName));
        currentIdx++;
      }

      try { fs.rmSync(batchDir, { recursive: true, force: true }); } catch {}

      // Regenerate the combined preview PDF from all current pages
      try {
        await regenerateSessionPdf(session, exePath);
      } catch (pdfErr) {
        console.warn('[ScannerService] Notice during session PDF generation:', pdfErr.message);
      }

      const preview = await getSessionPreview(session.id);
      resolve({
        success: true,
        sessionId: session.id,
        pageCount: preview.pageCount,
        pages: preview.pages,
        pdfReady: preview.pdfReady
      });
    });
  });
}

/**
 * Regenerate combined PDF from all active pages in the session
 */
async function regenerateSessionPdf(session, naps2Path) {
  const exePath = naps2Path || await locateNaps2Executable();
  if (!exePath) return;

  const pageFiles = fs.readdirSync(session.sessionDir)
    .filter(f => /^page_\d+\.png$/i.test(f))
    .sort();

  if (pageFiles.length === 0) {
    if (fs.existsSync(session.pdfPath)) {
      try { fs.unlinkSync(session.pdfPath); } catch {}
    }
    return;
  }

  // Construct semicolon-separated input paths for NAPS2
  const inputPaths = pageFiles.map(f => path.join(session.sessionDir, f)).join(';');
  const args = [
    '-i', inputPaths,
    '-n', '0',
    '-o', session.pdfPath,
    '--force'
  ];

  await new Promise((resolve) => {
    execFile(exePath, args, { windowsHide: true, timeout: 30000 }, (err) => {
      if (err) {
        console.warn('[ScannerService] PDF combination notice:', err.message);
      }
      resolve();
    });
  });
}

/**
 * Delete a specific page from a session and re-index remaining pages
 */
async function deletePage(sessionId, pageNumber) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error('Scanning session not found.');
  }

  const num = parseInt(pageNumber, 10);
  const padded = String(num).padStart(3, '0');
  const targetFile = path.join(session.sessionDir, `page_${padded}.png`);

  if (fs.existsSync(targetFile)) {
    fs.unlinkSync(targetFile);
  }

  // Renumber remaining pages contiguously
  const remainingFiles = fs.readdirSync(session.sessionDir)
    .filter(f => /^page_\d+\.png$/i.test(f))
    .sort();

  let idx = 1;
  for (const f of remainingFiles) {
    const newName = `page_${String(idx).padStart(3, '0')}.png`;
    if (f !== newName) {
      const oldPath = path.join(session.sessionDir, f);
      const newPath = path.join(session.sessionDir, newName);
      fs.renameSync(oldPath, newPath);
    }
    idx++;
  }

  // Regenerate PDF
  await regenerateSessionPdf(session);
  return await getSessionPreview(sessionId);
}

/**
 * Get preview data for a scan session (thumbnails, page count, and PDF readiness)
 */
async function getSessionPreview(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session || !fs.existsSync(session.sessionDir)) {
    return { pageCount: 0, pages: [], pdfReady: false };
  }

  const pageFiles = fs.readdirSync(session.sessionDir)
    .filter(f => /^page_\d+\.png$/i.test(f))
    .sort();

  const pages = [];
  for (let i = 0; i < pageFiles.length; i++) {
    const fileName = pageFiles[i];
    const fullPath = path.join(session.sessionDir, fileName);
    const stats = fs.statSync(fullPath);

    // Read image and encode as base64 data URL for secure renderer display
    const buffer = fs.readFileSync(fullPath);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    pages.push({
      pageNumber: i + 1,
      fileName,
      sizeBytes: stats.size,
      thumbnail: dataUrl,
      previewUrl: dataUrl
    });
  }

  const pdfReady = fs.existsSync(session.pdfPath) && fs.statSync(session.pdfPath).size > 0;

  return {
    sessionId,
    pageCount: pages.length,
    pages,
    pdfReady
  };
}

/**
 * Read the session PDF as a Base64 data URL for renderer preview
 */
async function getPdfBuffer(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session || !fs.existsSync(session.pdfPath)) {
    return null;
  }

  const stats = fs.statSync(session.pdfPath);
  if (stats.size === 0) return null;

  const buffer = fs.readFileSync(session.pdfPath);
  return `data:application/pdf;base64,${buffer.toString('base64')}`;
}

/**
 * Cancel an active scan process for a session
 */
function cancelScan(sessionId) {
  const child = activeScanProcesses.get(sessionId);
  if (child) {
    try {
      child.kill('SIGTERM');
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
      }, 1000);
    } catch (e) {
      // Ignore
    }
    activeScanProcesses.delete(sessionId);
    return true;
  }
  return false;
}

/**
 * Discard session and cleanly wipe temporary directory
 */
function discardSession(sessionId) {
  cancelScan(sessionId);
  const session = activeSessions.get(sessionId);
  if (session && fs.existsSync(session.sessionDir)) {
    try {
      fs.rmSync(session.sessionDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('[ScannerService] Could not wipe session dir:', e.message);
    }
  }
  activeSessions.delete(sessionId);
  return true;
}

/**
 * Finalize scan: Save PDF locally and optionally attach directly to an Activity Design
 */
async function finalize({
  sessionId,
  targetFileName,
  activityDesignId = null,
  scanMetadata = {}
}) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error('Scanning session expired or not found.');
  }

  // Ensure PDF is ready
  if (!fs.existsSync(session.pdfPath) || fs.statSync(session.pdfPath).size === 0) {
    await regenerateSessionPdf(session);
  }

  if (!fs.existsSync(session.pdfPath) || fs.statSync(session.pdfPath).size === 0) {
    throw new Error('No scanned pages found to generate PDF.');
  }

  const { saveAttachment } = require('./fileService');

  // Format clean, safe filename
  let cleanName = sanitizeFileName(targetFileName || 'Scanned_Document');
  if (!cleanName.toLowerCase().endsWith('.pdf')) {
    cleanName += '.pdf';
  }

  let attachmentRecord = null;

  // Case 1: Attach directly to selected Activity Design
  if (activityDesignId) {
    const numId = Number(activityDesignId);
    if (isNaN(numId) || numId <= 0) {
      throw new Error(`Invalid Activity Design ID: ${activityDesignId}`);
    }

    // Verify the target Activity Design actually exists in SQLite
    const adRecord = await dbServiceRef.getById('financeRecords', numId);
    if (!adRecord) {
      throw new Error(`Activity Design #${numId} was not found in the database.`);
    }

    const scanNotes = [
      'FlowDesk Hardware Scanner',
      scanMetadata.driver ? `Driver: ${scanMetadata.driver.toUpperCase()}` : null,
      scanMetadata.deviceName ? `Device: ${scanMetadata.deviceName}` : null,
      scanMetadata.dpi ? `${scanMetadata.dpi} DPI` : null,
      scanMetadata.source ? `Source: ${scanMetadata.source}` : null,
      scanMetadata.bitdepth ? `Mode: ${scanMetadata.bitdepth}` : null
    ].filter(Boolean).join(' • ');

    // Save attachment through existing FlowDesk fileService
    attachmentRecord = await saveAttachment({
      entityType: 'finance',
      entityId: numId,
      sourceFilePath: session.pdfPath,
      notes: scanNotes
    });

    // Rename the stored attachment file to user's desired name if needed
    if (attachmentRecord && attachmentRecord.id) {
      await dbServiceRef.update('attachments', attachmentRecord.id, {
        fileName: cleanName
      });
      attachmentRecord.fileName = cleanName;
    }

    // Record audit event in activities table
    try {
      await dbServiceRef.insert('activities', {
        type: 'scan_attached',
        description: `Scanned document "${cleanName}" (${session.pages.length || 1} pages) attached to Activity Design #${numId} (${adRecord.activityDesign || adRecord.columnK || 'Record'})`,
        entityType: 'finance',
        entityId: numId,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.warn('[ScannerService] Activity log notice:', e.message);
    }
  } else {
    // Case 2: Save PDF locally without attaching to an Activity Design
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.getFocusedWindow();
    const saveResult = await dialog.showSaveDialog(win, {
      title: 'Save Scanned Document — FlowDesk',
      defaultPath: cleanName,
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { canceled: true };
    }

    fs.copyFileSync(session.pdfPath, saveResult.filePath);
    attachmentRecord = {
      filePath: saveResult.filePath,
      fileName: path.basename(saveResult.filePath),
      fileSize: fs.statSync(saveResult.filePath).size
    };
  }

  // Clean up session temporary directory after successful finalization
  discardSession(sessionId);

  return {
    success: true,
    attachment: attachmentRecord
  };
}

/**
 * Get user scanner preferences from SQLite settings table
 */
async function getScannerSettings() {
  if (!dbServiceRef) return null;
  try {
    const raw = await dbServiceRef.getById('settings', 'scanner_preferences');
    if (raw && raw.value) {
      return JSON.parse(raw.value);
    }
  } catch (e) {
    // Ignore
  }
  return {
    lastDevice: '',
    lastDriver: 'wia',
    source: 'feeder',
    dpi: 300,
    bitdepth: 'color'
  };
}

/**
 * Save user scanner preferences to SQLite settings table
 */
async function saveScannerSettings(prefs) {
  if (!dbServiceRef) return false;
  try {
    const valueStr = JSON.stringify(prefs);
    const existing = await dbServiceRef.getById('settings', 'scanner_preferences');
    const now = new Date().toISOString();
    if (existing) {
      await dbServiceRef.update('settings', 'scanner_preferences', {
        value: valueStr,
        updatedAt: now
      });
    } else {
      await dbServiceRef.insert('settings', {
        key: 'scanner_preferences',
        value: valueStr,
        updatedAt: now
      });
    }
    return true;
  } catch (err) {
    console.warn('[ScannerService] Failed to save settings:', err.message);
    return false;
  }
}

/**
 * Open native Windows dialog to browse for NAPS2.Console.exe
 */
async function selectNaps2Executable(win = null) {
  const { BrowserWindow } = require('electron');
  const targetWin = win || BrowserWindow.getFocusedWindow() || (BrowserWindow.getAllWindows() ? BrowserWindow.getAllWindows()[0] : null);
  const dialogOptions = {
    title: 'Locate NAPS2 Console Executable (NAPS2.Console.exe)',
    properties: ['openFile'],
    filters: [
      { name: 'NAPS2 Executable (NAPS2.Console.exe)', extensions: ['exe'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  };

  const res = targetWin
    ? await dialog.showOpenDialog(targetWin, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
    return null;
  }

  const selectedPath = res.filePaths[0];
  if (dbServiceRef) {
    try {
      const now = new Date().toISOString();
      const existing = await dbServiceRef.getById('settings', 'naps2_custom_path');
      if (existing) {
        await dbServiceRef.update('settings', 'naps2_custom_path', { value: selectedPath, updatedAt: now });
      } else {
        await dbServiceRef.insert('settings', { key: 'naps2_custom_path', value: selectedPath, updatedAt: now });
      }
    } catch (err) {
      console.warn('[ScannerService] Failed to save custom path:', err.message);
    }
  }

  return selectedPath;
}

module.exports = {
  initScannerService,
  checkAvailability,
  discoverDevices,
  startSession,
  scan,
  deletePage,
  getSessionPreview,
  getPdfBuffer,
  cancelScan,
  discardSession,
  finalize,
  getScannerSettings,
  saveScannerSettings,
  selectNaps2Executable,
  locateNaps2Executable
};
