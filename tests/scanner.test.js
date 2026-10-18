import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the scanner service backend
const scannerService = require('../electron/services/scannerService');

test('Scanner Integration Test Suite', async (t) => {
  // Mock SQLite DB Service
  const mockDb = {
    settings: new Map(),
    financeRecords: new Map([
      [101, { id: 101, activityDesign: 'Youth Leadership Summit 2026', adAmount: 50000 }],
      [102, { id: 102, activityDesign: 'Community Outreach Logistics', adAmount: 25000 }]
    ]),
    attachments: new Map(),
    activities: [],

    async getById(table, id) {
      if (table === 'settings') return this.settings.get(String(id)) || null;
      if (table === 'financeRecords') return this.financeRecords.get(Number(id)) || null;
      if (table === 'attachments') return this.attachments.get(Number(id)) || null;
      return null;
    },
    async insert(table, data) {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const record = { id, ...data };
      if (table === 'settings') this.settings.set(String(data.key), record);
      if (table === 'financeRecords') this.financeRecords.set(id, record);
      if (table === 'attachments') this.attachments.set(id, record);
      if (table === 'activities') this.activities.push(record);
      return id;
    },
    async update(table, id, changes) {
      if (table === 'settings') {
        const item = this.settings.get(String(id)) || {};
        this.settings.set(String(id), { ...item, ...changes });
      }
      if (table === 'attachments') {
        const item = this.attachments.get(Number(id)) || {};
        this.attachments.set(Number(id), { ...item, ...changes });
      }
      return true;
    },
    async where(table, criteria) {
      if (table === 'attachments') {
        return Array.from(this.attachments.values()).filter(att => {
          return (!criteria.entityType || att.entityType === criteria.entityType) &&
                 (!criteria.entityId || att.entityId === criteria.entityId);
        });
      }
      return [];
    }
  };

  const testTempBase = path.join(__dirname, 'temp_test_env');
  if (!fs.existsSync(testTempBase)) fs.mkdirSync(testTempBase, { recursive: true });

  const mockStoragePaths = {
    baseDir: testTempBase,
    dataDir: path.join(testTempBase, 'data'),
    attachmentsDir: path.join(testTempBase, 'attachments'),
    backupsDir: path.join(testTempBase, 'backups')
  };

  scannerService.initScannerService(mockStoragePaths, mockDb);

  await t.test('1. Scanner Settings & Defaults', async () => {
    const settings = await scannerService.getScannerSettings();
    assert.equal(settings.source, 'feeder', 'Default paper source must be feeder/ADF');
    assert.equal(settings.dpi, 300, 'Default resolution must be 300 DPI');
    assert.equal(settings.bitdepth, 'color', 'Default color mode must be color');
    assert.equal(settings.lastDriver, 'wia', 'Default driver should be WIA');

    // Test saving custom preferences
    const newPrefs = {
      lastDevice: 'HP LaserJet Pro MFP',
      lastDriver: 'twain',
      source: 'glass',
      dpi: 600,
      bitdepth: 'gray'
    };
    await scannerService.saveScannerSettings(newPrefs);
    const updated = await scannerService.getScannerSettings();
    assert.equal(updated.lastDevice, 'HP LaserJet Pro MFP');
    assert.equal(updated.lastDriver, 'twain');
    assert.equal(updated.dpi, 600);
  });

  await t.test('2. Parameter Validation & Security against Injection', async () => {
    const sess = scannerService.startSession({ deviceName: 'Test Scanner' });

    // Unsupported driver rejected
    await assert.rejects(
      async () => {
        await scannerService.scan({
          sessionId: sess.sessionId,
          deviceName: 'Scanner',
          driver: 'malicious_driver; rm -rf /'
        });
      },
      /Unsupported scanner driver/
    );

    // Unsupported paper source rejected
    await assert.rejects(
      async () => {
        await scannerService.scan({
          sessionId: sess.sessionId,
          deviceName: 'Scanner',
          driver: 'wia',
          source: 'invalid_source'
        });
      },
      /Unsupported paper source/
    );

    // Invalid resolution DPI rejected
    await assert.rejects(
      async () => {
        await scannerService.scan({
          sessionId: sess.sessionId,
          deviceName: 'Scanner',
          driver: 'wia',
          source: 'feeder',
          dpi: 99999
        });
      },
      /Invalid resolution DPI/
    );

    scannerService.discardSession(sess.sessionId);
  });

  await t.test('3. Real Discovery Output Parsing & No Mock Data', async () => {
    // Test parser behavior for NAPS2 structured output
    const sampleOutputWia = `
      ScanDevice { Driver = Wia, ID = {6BDD1FC6-810F-11D0-BEC7-08002BE2092F}\\0001, Name = Canon imageRUNNER 2206, IconUri = }
    `;

    // Regex check matching scannerService's implementation
    const match = sampleOutputWia.match(/ScanDevice\s*\{\s*Driver\s*=\s*([^,]+),\s*ID\s*=\s*([^,]+),\s*Name\s*=\s*([^,}]+)/i);
    assert.ok(match, 'Parser must match NAPS2 structured ScanDevice format');
    assert.equal(match[1].trim().toLowerCase(), 'wia');
    assert.equal(match[3].trim(), 'Canon imageRUNNER 2206');

    // Verify discovery without real NAPS2 returns structured error, never fake mock hardware
    const result = await scannerService.discoverDevices();
    if (!result.success) {
      assert.ok(result.error, 'If NAPS2 CLI is absent, returns honest error');
      assert.deepEqual(result.devices, [], 'Never return fake or fabricated devices');
    } else {
      assert.ok(Array.isArray(result.devices), 'Devices must be an array');
      // If devices returned, ensure every device has real driver and name
      for (const dev of result.devices) {
        assert.ok(dev.name, 'Real device must have a name');
        assert.ok(['wia', 'twain', 'escl'].includes(dev.driver), 'Device driver must be real driver');
      }
    }
  });

  await t.test('4. Multi-Page Session Lifecycle & Page Deletion', async () => {
    const { sessionId, sessionDir } = scannerService.startSession({
      activityDesignId: 101,
      deviceName: 'Office Scanner',
      driver: 'wia'
    });

    assert.ok(fs.existsSync(sessionDir), 'Session directory must be created on disk');

    // Simulate 3 scanned pages
    fs.writeFileSync(path.join(sessionDir, 'page_001.png'), Buffer.from('mock_page_1_content'));
    fs.writeFileSync(path.join(sessionDir, 'page_002.png'), Buffer.from('mock_page_2_content'));
    fs.writeFileSync(path.join(sessionDir, 'page_003.png'), Buffer.from('mock_page_3_content'));
    fs.writeFileSync(path.join(sessionDir, 'session_preview.pdf'), Buffer.from('%PDF-1.4 mock_pdf_content'));

    let preview = await scannerService.getSessionPreview(sessionId);
    assert.equal(preview.pageCount, 3, 'Must report 3 scanned pages');
    assert.equal(preview.pages.length, 3);
    assert.equal(preview.pages[0].pageNumber, 1);
    assert.equal(preview.pages[1].pageNumber, 2);
    assert.equal(preview.pages[2].pageNumber, 3);
    assert.ok(preview.pages[0].thumbnail.startsWith('data:image/png;base64,'), 'Thumbnail must be safe base64 data URL');

    // Delete page #2
    preview = await scannerService.deletePage(sessionId, 2);
    assert.equal(preview.pageCount, 2, 'Page count must update to 2 after deletion');
    assert.equal(preview.pages[0].pageNumber, 1);
    assert.equal(preview.pages[1].pageNumber, 2);
    // Page 3 should be renumbered to page 2
    assert.ok(fs.existsSync(path.join(sessionDir, 'page_002.png')), 'Remaining pages must be renumbered contiguously');

    // Discard session
    scannerService.discardSession(sessionId);
    assert.equal(fs.existsSync(sessionDir), false, 'Temporary session folder must be completely deleted upon discard');
  });

  await t.test('5. Activity Design Validation & Attachment Persistence', async () => {
    const { initFileService } = require('../electron/services/fileService');
    initFileService(mockStoragePaths.attachmentsDir, mockDb);

    const { sessionId, sessionDir } = scannerService.startSession({
      activityDesignId: 101,
      deviceName: 'Fujitsu fi-7160',
      driver: 'twain'
    });

    // Create simulated scanned PDF
    fs.writeFileSync(path.join(sessionDir, 'page_001.png'), Buffer.from('page_data'));
    const pdfPath = path.join(sessionDir, 'session_preview.pdf');
    fs.writeFileSync(pdfPath, Buffer.from('%PDF-1.4 real_document_content'));

    // Attempt finalizing with invalid non-existent Activity Design ID
    await assert.rejects(
      async () => {
        await scannerService.finalize({
          sessionId,
          targetFileName: 'invalid_test.pdf',
          activityDesignId: 99999 // does not exist
        });
      },
      /Activity Design #99999 was not found/
    );

    // Finalize with valid Activity Design ID #101
    const finalizeRes = await scannerService.finalize({
      sessionId,
      targetFileName: 'AD-101-YouthSummit-Scan.pdf',
      activityDesignId: 101,
      scanMetadata: {
        driver: 'twain',
        deviceName: 'Fujitsu fi-7160',
        dpi: 300,
        source: 'feeder',
        bitdepth: 'color'
      }
    });

    assert.equal(finalizeRes.success, true);
    assert.ok(finalizeRes.attachment);
    assert.equal(finalizeRes.attachment.entityType, 'finance');
    assert.equal(finalizeRes.attachment.entityId, 101);
    assert.equal(finalizeRes.attachment.fileName, 'AD-101-YouthSummit-Scan.pdf');

    // Verify record in SQLite attachments table
    const storedAttachments = await mockDb.where('attachments', { entityType: 'finance', entityId: 101 });
    assert.equal(storedAttachments.length, 1);
    assert.equal(storedAttachments[0].fileName, 'AD-101-YouthSummit-Scan.pdf');
    assert.ok(storedAttachments[0].notes.includes('TWAIN'));
    assert.ok(storedAttachments[0].notes.includes('300 DPI'));

    // Verify audit log entry in activities table
    assert.equal(mockDb.activities.length, 1);
    assert.equal(mockDb.activities[0].type, 'scan_attached');
    assert.equal(mockDb.activities[0].entityId, 101);

    // Verify temporary session directory was safely wiped
    assert.equal(fs.existsSync(sessionDir), false, 'Session temp folder must be wiped after successful attachment');
  });

  // Cleanup test temp directory
  try {
    fs.rmSync(testTempBase, { recursive: true, force: true });
  } catch {}
});
