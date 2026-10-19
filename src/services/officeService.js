import db from '../db/database'

/**
 * Standard default government office entities to seed the local directory.
 * Matches realistic Philippine government regional office organizational structures.
 */
export const DEFAULT_OFFICE = {
  name: 'TCYSDO OFFICE',
  code: 'TCYSDO',
  type: 'Internal',
  contactPerson: 'Office Administrator',
  room: 'Main Office',
  extension: '',
  email: '',
  isFavorite: true,
  messengerNotes: 'Default primary office for document routing and Activity Designs.'
}

export const DUMMY_OFFICE_NAMES = [
  'Office of the Regional Director',
  'Planning & Policy Management Division',
  'Budget & Finance Management Division',
  'Human Resource Management Division',
  'Central Records & Archives Section',
  'General Services & Procurement Section',
  'Legal & Executive Services Division',
  'Department of Budget & Management (Regional)',
  'Commission on Audit (Regional Resident Office)'
]

// Backwards compatibility export
export const DEFAULT_OFFICES = [DEFAULT_OFFICE]

let defaultOfficeEnsured = false

/**
 * Ensures TCYSDO OFFICE exists in the database and cleans up any old dummy offices
 */
export async function ensureDefaultOffice() {
  try {
    const all = await db.offices.toArray()
    let tcysdo = all.find(
      (o) => (o.name || '').trim().toUpperCase() === 'TCYSDO OFFICE'
    )

    if (!tcysdo) {
      const now = new Date().toISOString()
      const newId = await db.offices.add({
        ...DEFAULT_OFFICE,
        createdAt: now,
        updatedAt: now
      })
      tcysdo = await db.offices.get(newId)
    }

    // Safely remove known dummy offices if they exist and are not user created
    const dummyMatches = all.filter((o) =>
      DUMMY_OFFICE_NAMES.some((dummy) => dummy.toLowerCase() === (o.name || '').trim().toLowerCase())
    )

    if (dummyMatches.length > 0) {
      for (const dummy of dummyMatches) {
        // Reassign any document using this dummy office to TCYSDO OFFICE
        if (tcysdo && tcysdo.id) {
          const docsWithOffice = await db.documents
            .filter((d) => d.currentOfficeId === dummy.id || d.originatingOfficeId === dummy.id)
            .toArray()
          for (const d of docsWithOffice) {
            await db.documents.update(d.id, {
              currentOfficeId: d.currentOfficeId === dummy.id ? tcysdo.id : d.currentOfficeId,
              originatingOfficeId: d.originatingOfficeId === dummy.id ? tcysdo.id : d.originatingOfficeId,
              lastConfirmedOfficeId: d.lastConfirmedOfficeId === dummy.id ? tcysdo.id : d.lastConfirmedOfficeId,
              updatedAt: new Date().toISOString()
            })
          }
        }
        await db.offices.delete(dummy.id)
      }
    }

    return tcysdo
  } catch (err) {
    console.error('Error ensuring default office:', err)
  }
}

/**
 * Automatically seeds default office if table in Dexie is empty
 */
export async function seedDefaultOfficesIfEmpty() {
  if (defaultOfficeEnsured) return
  defaultOfficeEnsured = true
  await ensureDefaultOffice()
}

/**
 * Generate a smart acronym code from an office name
 */
export function generateCodeFromName(name) {
  if (!name || !name.trim()) return 'OFFICE'
  const stopWords = new Set(['OF', 'THE', 'AND', '&', 'FOR', 'IN', 'ON', 'AT', 'TO', 'DEPT', 'SECTION'])
  const words = name
    .trim()
    .toUpperCase()
    .split(/[\s\-_/]+/)
    .filter((w) => w && !stopWords.has(w))
  if (words.length === 0) return 'OFFICE'
  if (words.length === 1) {
    return words[0].slice(0, 6)
  }
  return words.map((w) => w[0]).join('').slice(0, 8)
}

/**
 * Fetch all offices, sorted with favorites first, then alphabetical by name
 */
export async function getOffices(criteria = {}) {
  try {
    await seedDefaultOfficesIfEmpty()
    let list = await db.offices.toArray()

    // Auto-heal any office records missing a code or with blank code
    for (const o of list) {
      if (!o.code || !o.code.trim()) {
        const generated = generateCodeFromName(o.name)
        o.code = generated
        db.offices.update(o.id, {
          code: generated,
          updatedAt: new Date().toISOString()
        }).catch(() => {})
      }
    }

    if (criteria.search && criteria.search.trim()) {
      const q = criteria.search.trim().toLowerCase()
      list = list.filter((o) => {
        return (
          (o.name && o.name.toLowerCase().includes(q)) ||
          (o.code && o.code.toLowerCase().includes(q)) ||
          (o.room && o.room.toLowerCase().includes(q))
        )
      })
    }

    if (criteria.type && criteria.type !== 'all') {
      if (criteria.type === 'favorites') {
        list = list.filter((o) => o.isFavorite)
      } else if (criteria.type === 'internal') {
        list = list.filter((o) => o.type === 'Internal' || o.type === 'Executive')
      } else if (criteria.type === 'external') {
        list = list.filter((o) => o.type === 'External')
      } else {
        list = list.filter((o) => o.type === criteria.type)
      }
    }

    // Sort: favorites first, then alphabetical
    list.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1
      if (!a.isFavorite && b.isFavorite) return 1
      return (a.name || '').localeCompare(b.name || '')
    })

    return list
  } catch (err) {
    console.error('Failed to get offices from Dexie:', err)
    return []
  }
}

/**
 * Fetch a single office by ID
 */
export async function getOfficeById(id) {
  if (!id) return null
  const office = await db.offices.get(Number(id))
  if (office && (!office.code || !office.code.trim())) {
    office.code = generateCodeFromName(office.name)
    db.offices.update(office.id, {
      code: office.code,
      updatedAt: new Date().toISOString()
    }).catch(() => {})
  }
  return office
}

/**
 * Create a new office entry
 */
export async function createOffice(officeData) {
  const now = new Date().toISOString()
  const name = officeData.name?.trim() || 'Unnamed Office'
  const code = officeData.code?.trim().toUpperCase() || generateCodeFromName(name)

  const clean = {
    name,
    code,
    type: officeData.type || 'Internal',
    contactPerson: officeData.contactPerson?.trim() || '',
    room: officeData.room?.trim() || '',
    extension: officeData.extension?.trim() || '',
    email: officeData.email?.trim() || '',
    isFavorite: Boolean(officeData.isFavorite),
    messengerNotes: officeData.messengerNotes?.trim() || '',
    createdAt: now,
    updatedAt: now
  }
  const newId = await db.offices.add(clean)
  return newId
}

/**
 * Update an existing office
 */
export async function updateOffice(id, officeData) {
  const numId = Number(id)
  const existing = await db.offices.get(numId)
  if (!existing) throw new Error(`Office #${id} not found`)

  const now = new Date().toISOString()
  const name = officeData.name !== undefined ? officeData.name.trim() : existing.name
  const code = officeData.code !== undefined
    ? (officeData.code.trim().toUpperCase() || generateCodeFromName(name))
    : (existing.code || generateCodeFromName(name))

  const updated = {
    name,
    code,
    type: officeData.type !== undefined ? officeData.type : existing.type,
    contactPerson: officeData.contactPerson !== undefined ? officeData.contactPerson.trim() : existing.contactPerson,
    room: officeData.room !== undefined ? officeData.room.trim() : existing.room,
    extension: officeData.extension !== undefined ? officeData.extension.trim() : existing.extension,
    email: officeData.email !== undefined ? officeData.email.trim() : existing.email,
    isFavorite: officeData.isFavorite !== undefined ? Boolean(officeData.isFavorite) : existing.isFavorite,
    messengerNotes: officeData.messengerNotes !== undefined ? officeData.messengerNotes.trim() : existing.messengerNotes,
    updatedAt: now
  }
  await db.offices.update(numId, updated)

  // Update associated workflow folder name if changed
  if (officeData.name !== undefined && officeData.name.trim() !== existing.name) {
    try {
      const folder = await db.workflowFolders
        .filter((f) => f.associatedOfficeId === numId)
        .first()
      if (folder) {
        await db.workflowFolders.update(folder.id, {
          name: officeData.name.trim(),
          updatedAt: now
        })
      }
    } catch {}
  }

  return numId
}

/**
 * Toggle favorite status
 */
export async function toggleFavoriteOffice(id) {
  const numId = Number(id)
  const existing = await db.offices.get(numId)
  if (existing) {
    await db.offices.update(numId, {
      isFavorite: !existing.isFavorite,
      updatedAt: new Date().toISOString()
    })
  }
}

/**
 * Delete an office safely
 */
export async function deleteOffice(id) {
  const numId = Number(id)
  try {
    const folders = await db.workflowFolders
      .filter((f) => f.associatedOfficeId === numId)
      .toArray()
    for (const f of folders) {
      await db.workflowFolders.update(f.id, {
        associatedOfficeId: null,
        behavior: 'internal',
        updatedAt: new Date().toISOString()
      })
    }
  } catch {}
  return await db.offices.delete(numId)
}
