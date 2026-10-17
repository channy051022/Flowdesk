const path = require('path');
const fs = require('fs');

let db = null;
let dbPath = null;

/**
 * Initialize SQLite database connection and create tables
 * @param {string} storageDir - The directory where flowdesk.db is stored
 */
function initDatabase(storageDir) {
  if (db) return db;

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  dbPath = path.join(storageDir, 'flowdesk.db');
  console.log('[SQLite] Initializing database at:', dbPath);

  // Load better-sqlite3 with fallback to node:sqlite
  try {
    const Database = require('better-sqlite3');
    db = new Database(dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : null
    });
    console.log('[SQLite] Connected via better-sqlite3');
  } catch (err) {
    console.warn('[SQLite] better-sqlite3 failed, attempting node:sqlite fallback...', err.message);
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(dbPath);
    console.log('[SQLite] Connected via node:sqlite');
  }

  // Configure SQLite PRAGMAs for safety and high performance
  runPragma('PRAGMA foreign_keys = ON;');
  runPragma('PRAGMA journal_mode = WAL;');
  createTables();
  runMigrations();
  return db;
}

function runMigrations() {
  try {
    const tableInfo = db.prepare("PRAGMA table_info(financeRecords)").all();
    const hasActivityDesign = tableInfo.some((col) => col.name === 'activityDesign');
    if (!hasActivityDesign) {
      console.log('[SQLite Migration] Adding activityDesign column to financeRecords...');
      db.exec("ALTER TABLE financeRecords ADD COLUMN activityDesign TEXT;");
      db.exec("UPDATE financeRecords SET activityDesign = columnK WHERE (activityDesign IS NULL OR activityDesign = '') AND columnK IS NOT NULL;");
      console.log('[SQLite Migration] activityDesign column added and historical values mapped successfully.');
    }

    // Ensure status and supplier columns exist in budgetUtilizations
    try {
      const budgetInfo = db.prepare("PRAGMA table_info(budgetUtilizations)").all();
      const hasStatus = budgetInfo.some((col) => col.name === 'status');
      if (!hasStatus) {
        console.log('[SQLite Migration] Adding status column to budgetUtilizations...');
        db.exec("ALTER TABLE budgetUtilizations ADD COLUMN status TEXT NOT NULL DEFAULT 'Unpaid';");
        console.log('[SQLite Migration] status column added to budgetUtilizations successfully.');
      }
      const hasSupplier = budgetInfo.some((col) => col.name === 'supplier');
      if (!hasSupplier) {
        console.log('[SQLite Migration] Adding supplier column to budgetUtilizations...');
        db.exec("ALTER TABLE budgetUtilizations ADD COLUMN supplier TEXT;");
        console.log('[SQLite Migration] supplier column added to budgetUtilizations successfully.');
      }
    } catch (err) {
      console.warn('[SQLite Migration] Notice checking budgetUtilizations columns:', err.message);
    }

    // Ensure financeRecordCharges exists and backfill from legacy chargedTo
    db.exec(`
      CREATE TABLE IF NOT EXISTS financeRecordCharges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        financeRecordId INTEGER NOT NULL,
        chargeName TEXT NOT NULL,
        chargeCategory TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (financeRecordId) REFERENCES financeRecords(id) ON DELETE CASCADE,
        UNIQUE(financeRecordId, chargeName)
      );
      CREATE INDEX IF NOT EXISTS idx_charges_record ON financeRecordCharges(financeRecordId);
      CREATE INDEX IF NOT EXISTS idx_charges_name ON financeRecordCharges(chargeName);
    `);

    // Create compatibility view if not exists
    try {
      db.exec("CREATE VIEW IF NOT EXISTS finance_record_charges AS SELECT * FROM financeRecordCharges;");
    } catch {}

    const countCharges = db.prepare("SELECT COUNT(*) as count FROM financeRecordCharges").get();
    if (countCharges && countCharges.count === 0) {
      const recordsWithCharges = db.prepare("SELECT id, chargedTo, createdAt FROM financeRecords WHERE chargedTo IS NOT NULL AND chargedTo != ''").all();
      if (recordsWithCharges.length > 0) {
        console.log(`[SQLite Migration] Backfilling ${recordsWithCharges.length} historical chargedTo records into financeRecordCharges...`);
        const insertChargeStmt = db.prepare("INSERT OR IGNORE INTO financeRecordCharges (financeRecordId, chargeName, chargeCategory, createdAt) VALUES (?, ?, ?, ?)");
        const backfillTx = db.transaction(() => {
          for (const rec of recordsWithCharges) {
            let list = [];
            if (typeof rec.chargedTo === 'string') {
              const trimmed = rec.chargedTo.trim();
              if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                try { list = JSON.parse(trimmed); } catch { list = [trimmed]; }
              } else if (trimmed) {
                list = [trimmed];
              }
            } else if (Array.isArray(rec.chargedTo)) {
              list = rec.chargedTo;
            }
            for (const ch of list) {
              if (typeof ch === 'string' && ch.trim()) {
                const cat = ch.startsWith('MOOE-') ? 'MOOE' : (ch.startsWith('LFP-') ? 'LFP' : 'Custom');
                insertChargeStmt.run(rec.id, ch.trim(), cat, rec.createdAt || new Date().toISOString());
              }
            }
          }
        });
        backfillTx();
        console.log('[SQLite Migration] Successfully backfilled historical charges.');
      }
    }

    // 1. Ensure relatedFinanceRecordId exists on tasks table
    try {
      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all();
      const hasRelatedFinance = tasksInfo.some((col) => col.name === 'relatedFinanceRecordId');
      if (!hasRelatedFinance) {
        console.log('[SQLite Migration] Adding relatedFinanceRecordId to tasks...');
        db.exec("ALTER TABLE tasks ADD COLUMN relatedFinanceRecordId INTEGER;");
        console.log('[SQLite Migration] relatedFinanceRecordId added to tasks successfully.');
      }
      db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_finance ON tasks(relatedFinanceRecordId);");
    } catch (err) {
      console.warn('[SQLite Migration] Notice checking tasks relatedFinanceRecordId column:', err.message);
    }

    // 2. Ensure default TCYSDO OFFICE exists and remove dummy sample data
    try {
      const now = new Date().toISOString();
      let tcysdoOffice = db.prepare("SELECT * FROM offices WHERE UPPER(name) = 'TCYSDO OFFICE'").get();
      if (!tcysdoOffice) {
        const stmt = db.prepare("INSERT INTO offices (name, code, type, contactPerson, location, room, extension, email, isFavorite, messengerNotes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        const info = stmt.run('TCYSDO OFFICE', 'TCYSDO', 'Internal', 'Desk Officer', 'Ground Floor', 'Room 101', '', 'tcysdo@tagumcity.gov', 1, 'Default primary physical location and receiving office', now, now);
        tcysdoOffice = { id: Number(info.lastInsertRowid) };
        console.log('[SQLite Migration] TCYSDO OFFICE created with ID #' + tcysdoOffice.id);
      }

      // Ensure default workflowFolder TCYSDO OFFICE exists
      let tcysdoFolder = db.prepare("SELECT * FROM workflowFolders WHERE UPPER(name) = 'TCYSDO OFFICE'").get();
      if (!tcysdoFolder) {
        const fStmt = db.prepare("INSERT INTO workflowFolders (name, description, behavior, associatedOfficeId, sortOrder, color, isDefaultRegistration, isCompletedFolder, isArchived, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        const fInfo = fStmt.run('TCYSDO OFFICE', 'Default physical location and receiving office for Activity Designs and paperwork', 'destination', tcysdoOffice.id, 1, 'forest', 1, 0, 0, now, now);
        tcysdoFolder = { id: Number(fInfo.lastInsertRowid) };
        console.log('[SQLite Migration] TCYSDO OFFICE workflowFolder created with ID #' + tcysdoFolder.id);
      }

      // Clean up known dummy sample folders and auto-generated office folders to keep 1 default TCYSDO OFFICE folder
      const dummyFolderNames = [
        'New Documents', 'For Processing', 'For Signature/Approval',
        'For Dispatch', 'In Transit', 'Returned for Revision', 'Completed / Released'
      ];
      const placeholders = dummyFolderNames.map(() => '?').join(', ');
      const extraFolders = db.prepare(`SELECT id, name FROM workflowFolders WHERE id != ? AND (name IN (${placeholders}) OR description LIKE 'Routing location for %' OR description LIKE 'Physical routing destination for %')`).all(tcysdoFolder.id, ...dummyFolderNames);
      if (extraFolders.length > 0) {
        const extraFolderIds = extraFolders.map(f => f.id);
        const idPlaceholders = extraFolderIds.map(() => '?').join(', ');
        db.prepare(`UPDATE documents SET workflowFolderId = ? WHERE workflowFolderId IN (${idPlaceholders})`).run(tcysdoFolder.id, ...extraFolderIds);
        db.prepare(`DELETE FROM workflowFolders WHERE id IN (${idPlaceholders})`).run(...extraFolderIds);
        console.log(`[SQLite Migration] Removed ${extraFolders.length} extra/dummy workflow folders and consolidated into 1 default TCYSDO OFFICE folder.`);
      }

      // Clean up known dummy sample offices
      const dummyOfficeNames = [
        'Office of the Regional Director', 'Planning & Policy Management Division',
        'Budget & Finance Management Division', 'Human Resource Management Division',
        'Central Records & Archives Section', 'General Services & Procurement Section',
        'Legal & Executive Services Division', 'Department of Budget & Management (Regional)',
        'Commission on Audit (Regional Resident Office)'
      ];
      const offPlaceholders = dummyOfficeNames.map(() => '?').join(', ');
      const dummyOffices = db.prepare(`SELECT id, name FROM offices WHERE name IN (${offPlaceholders})`).all(...dummyOfficeNames);
      if (dummyOffices.length > 0) {
        const dummyOfficeIds = dummyOffices.map(o => o.id);
        const offIdPlaceholders = dummyOfficeIds.map(() => '?').join(', ');
        db.prepare(`UPDATE documents SET currentOfficeId = ? WHERE currentOfficeId IN (${offIdPlaceholders})`).run(tcysdoOffice.id, ...dummyOfficeIds);
        db.prepare(`UPDATE documents SET originatingOfficeId = ? WHERE originatingOfficeId IN (${offIdPlaceholders})`).run(tcysdoOffice.id, ...dummyOfficeIds);
        db.prepare(`UPDATE documents SET lastConfirmedOfficeId = ? WHERE lastConfirmedOfficeId IN (${offIdPlaceholders})`).run(tcysdoOffice.id, ...dummyOfficeIds);
        db.prepare(`UPDATE movements SET fromOfficeId = ? WHERE fromOfficeId IN (${offIdPlaceholders})`).run(tcysdoOffice.id, ...dummyOfficeIds);
        db.prepare(`UPDATE movements SET toOfficeId = ? WHERE toOfficeId IN (${offIdPlaceholders})`).run(tcysdoOffice.id, ...dummyOfficeIds);
        db.prepare(`DELETE FROM offices WHERE id IN (${offIdPlaceholders})`).run(...dummyOfficeIds);
        console.log(`[SQLite Migration] Removed ${dummyOffices.length} dummy government offices safely.`);
      }

      // Purge all sample/dummy records across SQLite tables
      try {
        db.exec("DELETE FROM movements WHERE documentId IN (SELECT id FROM documents WHERE isSample = 1 OR trackingNumber LIKE 'FD-%-00010%');");
        const delDocs = db.prepare("DELETE FROM documents WHERE isSample = 1 OR trackingNumber LIKE 'FD-%-00010%'").run();
        const delTasks = db.prepare("DELETE FROM tasks WHERE isSample = 1").run();
        db.exec("DELETE FROM budgetUtilizations WHERE financeRecordId IN (SELECT id FROM financeRecords WHERE isSample = 1);");
        db.exec("DELETE FROM financeRecordCharges WHERE financeRecordId IN (SELECT id FROM financeRecords WHERE isSample = 1);");
        const delFin = db.prepare("DELETE FROM financeRecords WHERE isSample = 1").run();
        console.log(`[SQLite Migration] Sample data purge completed: ${delDocs.changes} documents, ${delTasks.changes} tasks, ${delFin.changes} finance records removed.`);
      } catch (err) {
        console.warn('[SQLite Migration] Notice purging sample records:', err.message);
      }
    } catch (err) {
      console.warn('[SQLite Migration] Notice initializing TCYSDO OFFICE and cleaning dummy data:', err.message);
    }
  } catch (err) {
    console.warn('[SQLite Migration] Notice checking migrations:', err.message);
  }
}

function runPragma(pragmaSql) {
  try {
    if (db.pragma) {
      db.pragma(pragmaSql.replace('PRAGMA ', '').replace(';', ''));
    } else {
      db.exec(pragmaSql);
    }
  } catch (err) {
    console.warn('[SQLite] Pragma warning:', pragmaSql, err.message);
  }
}

function createTables() {
  const schema = `
    -- Documents table
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trackingNumber TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      documentType TEXT NOT NULL,
      referenceNumber TEXT,
      description TEXT,
      dateRegistered TEXT,
      dateReceived TEXT,
      originatingOfficeId INTEGER,
      currentOfficeId INTEGER,
      lastConfirmedOfficeId INTEGER,
      workflowFolderId INTEGER,
      status TEXT NOT NULL DEFAULT 'registered',
      priority TEXT NOT NULL DEFAULT 'Routine',
      dueDate TEXT,
      relatedFinanceRecordId INTEGER,
      isArchived INTEGER NOT NULL DEFAULT 0,
      syncStatus TEXT DEFAULT 'local',
      isSample INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      archivedAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_docs_tracking ON documents(trackingNumber);
    CREATE INDEX IF NOT EXISTS idx_docs_status ON documents(status);
    CREATE INDEX IF NOT EXISTS idx_docs_folder ON documents(workflowFolderId);
    CREATE INDEX IF NOT EXISTS idx_docs_currentOffice ON documents(currentOfficeId);

    -- Tasks table
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      priority TEXT DEFAULT 'Medium',
      status TEXT DEFAULT 'To Do',
      dueDate TEXT,
      startDate TEXT,
      notes TEXT,
      checklist TEXT, -- JSON string array
      isCompleted INTEGER NOT NULL DEFAULT 0,
      relatedDocumentId INTEGER,
      relatedFinanceRecordId INTEGER,
      syncStatus TEXT DEFAULT 'local',
      isSample INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      completedAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(dueDate);

    -- Offices table
    CREATE TABLE IF NOT EXISTS offices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT DEFAULT '',
      type TEXT NOT NULL DEFAULT 'Internal',
      contactPerson TEXT,
      location TEXT,
      room TEXT,
      extension TEXT,
      email TEXT,
      isFavorite INTEGER NOT NULL DEFAULT 0,
      messengerNotes TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_offices_code ON offices(code);

    -- Document Movements / Transfers table
    CREATE TABLE IF NOT EXISTS movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      documentId INTEGER NOT NULL,
      fromOfficeId INTEGER,
      toOfficeId INTEGER NOT NULL,
      dispatchDate TEXT NOT NULL,
      receiptDate TEXT,
      status TEXT NOT NULL DEFAULT 'in_transit',
      senderName TEXT,
      receivingPersonName TEXT,
      notes TEXT,
      cancellationReason TEXT,
      correctionNote TEXT,
      syncStatus TEXT DEFAULT 'local',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (documentId) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_movements_doc ON movements(documentId);
    CREATE INDEX IF NOT EXISTS idx_movements_status ON movements(status);

    -- Workflow folders table
    CREATE TABLE IF NOT EXISTS workflowFolders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      behavior TEXT NOT NULL DEFAULT 'internal',
      associatedOfficeId INTEGER,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      color TEXT DEFAULT 'forest',
      isDefaultRegistration INTEGER NOT NULL DEFAULT 0,
      isCompletedFolder INTEGER NOT NULL DEFAULT 0,
      isArchived INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT
    );

    -- Finance records table
    CREATE TABLE IF NOT EXISTS financeRecords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplierName TEXT NOT NULL,
      particulars TEXT,
      paymentStatus TEXT NOT NULL DEFAULT 'Pending Payment',
      ppmpNumber TEXT,
      prNumber TEXT,
      poNumber TEXT,
      adStatus TEXT DEFAULT 'Pending AD',
      chargedTo TEXT,
      adAmount REAL DEFAULT 0,
      eventDate TEXT,
      internalArrangement TEXT,
      activityDesign TEXT,
      columnK TEXT,
      isSample INTEGER NOT NULL DEFAULT 0,
      syncStatus TEXT DEFAULT 'local',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_finance_supplier ON financeRecords(supplierName);
    CREATE INDEX IF NOT EXISTS idx_finance_status ON financeRecords(paymentStatus);
    CREATE INDEX IF NOT EXISTS idx_finance_adStatus ON financeRecords(adStatus);

    -- Normalized Finance Record Charges table
    CREATE TABLE IF NOT EXISTS financeRecordCharges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      financeRecordId INTEGER NOT NULL,
      chargeName TEXT NOT NULL,
      chargeCategory TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (financeRecordId) REFERENCES financeRecords(id) ON DELETE CASCADE,
      UNIQUE(financeRecordId, chargeName)
    );

    CREATE INDEX IF NOT EXISTS idx_charges_record ON financeRecordCharges(financeRecordId);
    CREATE INDEX IF NOT EXISTS idx_charges_name ON financeRecordCharges(chargeName);

    -- Budget Utilization repeatable entries table
    CREATE TABLE IF NOT EXISTS budgetUtilizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      financeRecordId INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      supplier TEXT,
      status TEXT NOT NULL DEFAULT 'Unpaid',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (financeRecordId) REFERENCES financeRecords(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_budget_record ON budgetUtilizations(financeRecordId);

    -- Activities audit log table
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      entityType TEXT,
      entityId INTEGER,
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_activities_time ON activities(timestamp);
    CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(entityType, entityId);

    -- Attachments table (local files in userData/attachments)
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entityType TEXT NOT NULL, -- 'document', 'task', 'finance', etc.
      entityId INTEGER NOT NULL,
      fileName TEXT NOT NULL,
      fileSize INTEGER NOT NULL DEFAULT 0,
      fileType TEXT,
      relativePath TEXT NOT NULL,
      notes TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entityType, entityId);

    -- Application Settings table
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `;

  if (db.exec) {
    db.exec(schema);
    try {
      db.exec("CREATE VIEW IF NOT EXISTS finance_record_charges AS SELECT * FROM financeRecordCharges;");
    } catch {}
  }
}

/**
 * Standard table columns mapping for parameterized operations
 */
const TABLE_COLUMNS = {
  documents: [
    'trackingNumber', 'title', 'documentType', 'referenceNumber', 'description',
    'dateRegistered', 'dateReceived', 'originatingOfficeId', 'currentOfficeId',
    'lastConfirmedOfficeId', 'workflowFolderId', 'status', 'priority', 'dueDate',
    'relatedFinanceRecordId', 'isArchived', 'syncStatus', 'isSample', 'createdAt',
    'updatedAt', 'archivedAt'
  ],
  tasks: [
    'title', 'description', 'category', 'priority', 'status', 'dueDate',
    'startDate', 'notes', 'checklist', 'isCompleted', 'relatedDocumentId',
    'relatedFinanceRecordId',
    'syncStatus', 'isSample', 'createdAt', 'updatedAt', 'completedAt'
  ],
  offices: [
    'name', 'code', 'type', 'contactPerson', 'location', 'room',
    'extension', 'email', 'isFavorite', 'messengerNotes', 'createdAt', 'updatedAt'
  ],
  movements: [
    'documentId', 'fromOfficeId', 'toOfficeId', 'dispatchDate', 'receiptDate',
    'status', 'senderName', 'receivingPersonName', 'notes', 'cancellationReason',
    'correctionNote', 'syncStatus', 'createdAt', 'updatedAt'
  ],
  workflowFolders: [
    'name', 'description', 'behavior', 'associatedOfficeId', 'sortOrder',
    'color', 'isDefaultRegistration', 'isCompletedFolder', 'isArchived',
    'createdAt', 'updatedAt'
  ],
  financeRecords: [
    'supplierName', 'particulars', 'paymentStatus', 'ppmpNumber', 'prNumber',
    'poNumber', 'adStatus', 'chargedTo', 'adAmount', 'eventDate',
    'internalArrangement', 'activityDesign', 'columnK', 'isSample', 'syncStatus', 'createdAt', 'updatedAt'
  ],
  financeRecordCharges: [
    'financeRecordId', 'chargeName', 'chargeCategory', 'createdAt'
  ],
  finance_record_charges: [
    'financeRecordId', 'chargeName', 'chargeCategory', 'createdAt'
  ],
  budgetUtilizations: [
    'financeRecordId', 'name', 'amount', 'supplier', 'status', 'createdAt', 'updatedAt'
  ],
  activities: [
    'type', 'description', 'entityType', 'entityId', 'timestamp'
  ],
  attachments: [
    'entityType', 'entityId', 'fileName', 'fileSize', 'fileType',
    'relativePath', 'notes', 'createdAt'
  ],
  settings: [
    'key', 'value', 'updatedAt'
  ]
};

// Boolean column lists for converting 0/1 back to boolean on output
const BOOLEAN_COLUMNS = {
  documents: ['isArchived', 'isSample'],
  tasks: ['isCompleted', 'isSample'],
  offices: ['isFavorite'],
  workflowFolders: ['isDefaultRegistration', 'isCompletedFolder', 'isArchived'],
  financeRecords: ['isSample']
};

/**
 * Format a database row for the frontend (handling booleans and JSON)
 */
function formatRow(tableName, row) {
  if (!row) return row;
  const item = { ...row };
  const boolCols = BOOLEAN_COLUMNS[tableName] || [];
  for (const col of boolCols) {
    if (item[col] !== undefined && item[col] !== null) {
      item[col] = Boolean(item[col]);
    }
  }
  if (tableName === 'tasks' && typeof item.checklist === 'string') {
    try {
      item.checklist = JSON.parse(item.checklist);
    } catch {
      item.checklist = [];
    }
  }
  if (tableName === 'budgetUtilizations') {
    if (!item.status) {
      item.status = 'Unpaid';
    }
  }
  if (tableName === 'financeRecords') {
    if (typeof item.chargedTo === 'string') {
      const trimmed = item.chargedTo.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          item.chargedTo = JSON.parse(trimmed);
        } catch {
          item.chargedTo = trimmed ? [trimmed] : [];
        }
      } else {
        item.chargedTo = trimmed ? [trimmed] : [];
      }
    } else if (!Array.isArray(item.chargedTo)) {
      item.chargedTo = [];
    }
  }
  return item;
}

/**
 * Format payload item before inserting or updating into SQLite
 */
function sanitizeInput(tableName, data) {
  const item = { ...data };
  const boolCols = BOOLEAN_COLUMNS[tableName] || [];
  for (const col of boolCols) {
    if (item[col] !== undefined) {
      item[col] = item[col] ? 1 : 0;
    }
  }
  if (tableName === 'tasks' && item.checklist && typeof item.checklist !== 'string') {
    item.checklist = JSON.stringify(item.checklist);
  }
  if (tableName === 'financeRecords' && Array.isArray(item.chargedTo)) {
    item.chargedTo = JSON.stringify(item.chargedTo);
  }
  if (tableName === 'budgetUtilizations') {
    if (!item.status) {
      item.status = 'Unpaid';
    }
    if (item.supplier === undefined) {
      item.supplier = '';
    }
  }
  if (tableName === 'offices' && item.code === undefined) {
    item.code = '';
  }
  return item;
}

/**
 * Execute parameterized query helper
 */
const dbService = {
  /**
   * Get all rows from a table
   */
  async getAll(tableName) {
    if (!TABLE_COLUMNS[tableName]) throw new Error(`Unknown table: ${tableName}`);
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
    return rows.map((r) => formatRow(tableName, r));
  },

  /**
   * Get row by primary key
   */
  async getById(tableName, id) {
    if (!TABLE_COLUMNS[tableName]) throw new Error(`Unknown table: ${tableName}`);
    const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(Number(id));
    return formatRow(tableName, row);
  },

  /**
   * Insert a new row using robust named parameter binding
   */
  async insert(tableName, data) {
    if (!TABLE_COLUMNS[tableName]) throw new Error(`Unknown table: ${tableName}`);
    const sanitized = sanitizeInput(tableName, data);
    const validCols = TABLE_COLUMNS[tableName].filter((c) => sanitized[c] !== undefined);
    
    if (validCols.length === 0) {
      throw new Error(`No valid columns provided for table ${tableName}`);
    }

    const colNames = validCols.join(', ');
    const namedPlaceholders = validCols.map((c) => `@${c}`).join(', ');
    const paramObj = {};
    for (const c of validCols) {
      paramObj[c] = sanitized[c];
    }

    const stmt = db.prepare(`INSERT INTO ${tableName} (${colNames}) VALUES (${namedPlaceholders})`);
    const info = stmt.run(paramObj);
    return Number(info.lastInsertRowid);
  },

  /**
   * Bulk insert multiple rows in a single SQLite transaction
   */
  async bulkInsert(tableName, items) {
    if (!TABLE_COLUMNS[tableName]) throw new Error(`Unknown table: ${tableName}`);
    if (!items || items.length === 0) return [];

    const insertTx = db.transaction((records) => {
      const ids = [];
      for (const data of records) {
        const sanitized = sanitizeInput(tableName, data);
        const validCols = TABLE_COLUMNS[tableName].filter((c) => sanitized[c] !== undefined);
        if (validCols.length === 0) continue;
        const colNames = validCols.join(', ');
        const namedPlaceholders = validCols.map((c) => `@${c}`).join(', ');
        const paramObj = {};
        for (const c of validCols) {
          paramObj[c] = sanitized[c];
        }
        const stmt = db.prepare(`INSERT INTO ${tableName} (${colNames}) VALUES (${namedPlaceholders})`);
        const info = stmt.run(paramObj);
        ids.push(Number(info.lastInsertRowid));
      }
      return ids;
    });

    return insertTx(items);
  },

  /**
   * Update row by primary key using named parameters
   */
  async update(tableName, id, changes) {
    if (!TABLE_COLUMNS[tableName]) throw new Error(`Unknown table: ${tableName}`);
    const sanitized = sanitizeInput(tableName, changes);
    const validCols = TABLE_COLUMNS[tableName].filter((c) => sanitized[c] !== undefined);
    
    if (validCols.length === 0) return 0;

    const setClauses = validCols.map((c) => `${c} = @${c}`).join(', ');
    const paramObj = { _id: Number(id) };
    for (const c of validCols) {
      paramObj[c] = sanitized[c];
    }

    const stmt = db.prepare(`UPDATE ${tableName} SET ${setClauses} WHERE id = @_id`);
    const info = stmt.run(paramObj);
    return info.changes;
  },

  /**
   * Delete row by primary key
   */
  async delete(tableName, id) {
    if (!TABLE_COLUMNS[tableName]) throw new Error(`Unknown table: ${tableName}`);
    if (tableName === 'financeRecords') {
      try {
        db.prepare(`DELETE FROM financeRecordCharges WHERE financeRecordId = ?`).run(Number(id));
      } catch {}
      try {
        db.prepare(`DELETE FROM budgetUtilizations WHERE financeRecordId = ?`).run(Number(id));
      } catch {}
    }
    const stmt = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`);
    stmt.run(Number(id));
    return true;
  },

  /**
   * Count rows matching optional criteria
   */
  async count(tableName, criteria = {}) {
    if (!TABLE_COLUMNS[tableName]) throw new Error(`Unknown table: ${tableName}`);
    const keys = Object.keys(criteria).filter((k) => TABLE_COLUMNS[tableName].includes(k));
    
    if (keys.length === 0) {
      const row = db.prepare(`SELECT COUNT(*) as total FROM ${tableName}`).get();
      return row ? row.total : 0;
    }

    const whereClauses = keys.map((k) => `${k} = ?`).join(' AND ');
    const values = keys.map((k) => criteria[k]);
    const stmt = db.prepare(`SELECT COUNT(*) as total FROM ${tableName} WHERE ${whereClauses}`);
    const row = stmt.get(...values);
    return row ? row.total : 0;
  },

  /**
   * Query rows matching key/value filter object
   */
  async where(tableName, criteria = {}) {
    if (!TABLE_COLUMNS[tableName]) throw new Error(`Unknown table: ${tableName}`);
    const keys = Object.keys(criteria).filter((k) => TABLE_COLUMNS[tableName].includes(k));
    
    if (keys.length === 0) {
      return this.getAll(tableName);
    }

    const whereClauses = keys.map((k) => `${k} = ?`).join(' AND ');
    const values = keys.map((k) => {
      if (typeof criteria[k] === 'boolean') return criteria[k] ? 1 : 0;
      return criteria[k];
    });

    const stmt = db.prepare(`SELECT * FROM ${tableName} WHERE ${whereClauses}`);
    const rows = stmt.all(...values);
    return rows.map((r) => formatRow(tableName, r));
  },

  /**
   * Delete rows matching criteria
   */
  async deleteWhere(tableName, criteria = {}) {
    if (!TABLE_COLUMNS[tableName]) throw new Error(`Unknown table: ${tableName}`);
    const keys = Object.keys(criteria).filter((k) => TABLE_COLUMNS[tableName].includes(k));
    if (keys.length === 0) return 0;

    const whereClauses = keys.map((k) => `${k} = ?`).join(' AND ');
    const values = keys.map((k) => {
      if (typeof criteria[k] === 'boolean') return criteria[k] ? 1 : 0;
      return criteria[k];
    });

    const stmt = db.prepare(`DELETE FROM ${tableName} WHERE ${whereClauses}`);
    const info = stmt.run(...values);
    return info.changes;
  },

  /**
   * Safe migration/import from Dexie records
   */
  async migrateFromDexie(exportedData) {
    if (!exportedData || typeof exportedData !== 'object') {
      throw new Error('Invalid export data for migration');
    }

    const results = {};
    const tables = [
      'offices', 'workflowFolders', 'documents', 'movements',
      'tasks', 'financeRecords', 'financeRecordCharges', 'budgetUtilizations', 'activities'
    ];

    const migrationTx = db.transaction(() => {
      for (const table of tables) {
        const records = exportedData[table];
        if (Array.isArray(records) && records.length > 0) {
          let count = 0;
          for (const item of records) {
            // Check if record already exists by ID
            let exists = false;
            if (item.id) {
              const check = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(item.id);
              if (check) exists = true;
            }
            if (!exists && table === 'documents' && item.trackingNumber) {
              const check = db.prepare(`SELECT id FROM documents WHERE trackingNumber = ?`).get(item.trackingNumber);
              if (check) exists = true;
            }

            if (!exists) {
              const sanitized = sanitizeInput(table, item);
              const validCols = TABLE_COLUMNS[table].filter((c) => sanitized[c] !== undefined);
              if (validCols.length > 0) {
                // If item has ID, include ID
                const colsToUse = item.id ? ['id', ...validCols] : validCols;
                const placeholders = colsToUse.map(() => '?').join(', ');
                const values = colsToUse.map((c) => (c === 'id' ? item.id : sanitized[c]));
                db.prepare(`INSERT INTO ${table} (${colsToUse.join(', ')}) VALUES (${placeholders})`).run(...values);
                count++;
              }
            }
          }
          results[table] = count;
        } else {
          results[table] = 0;
        }
      }
    });

    migrationTx();
    return results;
  },

  /**
   * Get underlying database instance
   */
  getRawDb() {
    return db;
  },

  /**
   * Get current database file path
   */
  getDbPath() {
    return dbPath;
  },

  /**
   * Safely close database connection (for shutdown or restore)
   */
  close() {
    if (db) {
      try {
        db.close();
      } catch (err) {
        console.error('[SQLite] Error closing database:', err);
      }
      db = null;
    }
  }
};

module.exports = {
  initDatabase,
  dbService
};
