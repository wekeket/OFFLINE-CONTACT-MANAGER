import * as SQLite from 'expo-sqlite';

let db;

export async function getDatabase() {
  if (!db) {
    db = await SQLite.openDatabaseAsync('contacts.db');
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        company TEXT NOT NULL DEFAULT '',
        job_title TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        photo_uri TEXT,
        favorite INTEGER NOT NULL DEFAULT 0,
        group_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE TABLE IF NOT EXISTS contact_groups (
        contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES groups_table(id) ON DELETE CASCADE,
        PRIMARY KEY (contact_id, group_id)
      );
      CREATE TABLE IF NOT EXISTS groups_table (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT ''
      );
    `);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS contact_groups (
        contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES groups_table(id) ON DELETE CASCADE,
        PRIMARY KEY (contact_id, group_id)
      );
    `);
    const columns = await db.getAllAsync('PRAGMA table_info(contacts)');
    if (!columns.some(column => column.name === 'photo_uri')) {
      await db.execAsync('ALTER TABLE contacts ADD COLUMN photo_uri TEXT');
    }
    if (!columns.some(column => column.name === 'deleted_at')) {
      await db.execAsync('ALTER TABLE contacts ADD COLUMN deleted_at TEXT');
    }
    await db.runAsync(
      "DELETE FROM contacts WHERE deleted_at IS NOT NULL AND deleted_at <= ?",
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    );
    await db.runAsync(`INSERT OR IGNORE INTO contact_groups (contact_id, group_id)
      SELECT id, group_id FROM contacts WHERE group_id IS NOT NULL`);
    const count = await db.getFirstAsync('SELECT COUNT(*) AS count FROM groups_table');
    if (!count?.count) {
      for (const name of ['Family', 'Friends', 'Work', 'School']) {
        await db.runAsync('INSERT OR IGNORE INTO groups_table (name) VALUES (?)', name);
      }
    }
  }
  return db;
}

export async function listContacts({ search = '', favorite = false, groupId = null } = {}) {
  const database = await getDatabase();
  const query = `SELECT c.*, (SELECT GROUP_CONCAT(g.name, ', ') FROM contact_groups cg JOIN groups_table g ON g.id=cg.group_id WHERE cg.contact_id=c.id) AS group_name, (SELECT GROUP_CONCAT(cg.group_id, ',') FROM contact_groups cg WHERE cg.contact_id=c.id) AS group_ids FROM contacts c
    WHERE c.deleted_at IS NULL AND (? = '' OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)
    AND (? = 0 OR c.favorite = 1)
    AND (? IS NULL OR EXISTS (SELECT 1 FROM contact_groups cg WHERE cg.contact_id=c.id AND cg.group_id=?))
    ORDER BY c.first_name COLLATE NOCASE, c.last_name COLLATE NOCASE`;
  const term = `%${search.trim()}%`;
  return database.getAllAsync(query, search.trim(), term, term, term, term, favorite ? 1 : 0, groupId, groupId);
}

export async function saveContact(contact) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const values = [
    contact.first_name.trim(), contact.last_name.trim(), contact.phone.trim(),
    contact.email.trim(), contact.address.trim(), contact.company.trim(),
    contact.job_title.trim(), contact.notes.trim(), contact.favorite ? 1 : 0,
    null, now, contact.photo_uri || null
  ];
  if (contact.id) {
    await database.runAsync(`UPDATE contacts SET first_name=?, last_name=?, phone=?, email=?,
      address=?, company=?, job_title=?, notes=?, favorite=?, group_id=?, updated_at=?, deleted_at=NULL, photo_uri=? WHERE id=?`,
      ...values, contact.id);
    await database.runAsync('DELETE FROM contact_groups WHERE contact_id=?', contact.id);
    for (const groupId of (contact.group_ids || (contact.group_id ? [contact.group_id] : []))) {
      await database.runAsync('INSERT OR IGNORE INTO contact_groups (contact_id,group_id) VALUES (?,?)', contact.id, Number(groupId));
    }
    return contact.id;
  }
  const result = await database.runAsync(`INSERT INTO contacts
    (first_name,last_name,phone,email,address,company,job_title,notes,favorite,group_id,created_at,updated_at,photo_uri)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    contact.first_name.trim(), contact.last_name.trim(), contact.phone.trim(), contact.email.trim(),
    contact.address.trim(), contact.company.trim(), contact.job_title.trim(), contact.notes.trim(),
    contact.favorite ? 1 : 0, null, now, now, contact.photo_uri || null);
  const contactId = result.lastInsertRowId;
  for (const groupId of (contact.group_ids || (contact.group_id ? [contact.group_id] : []))) {
    await database.runAsync('INSERT OR IGNORE INTO contact_groups (contact_id,group_id) VALUES (?,?)', contactId, Number(groupId));
  }
  return contactId;
}

export async function deleteContact(id) {
  const database = await getDatabase();
  await database.runAsync('UPDATE contacts SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', new Date().toISOString(), id);
}

export async function listRecentlyDeleted() {
  const database = await getDatabase();
  return database.getAllAsync(`SELECT c.*, g.name AS group_name FROM contacts c
    LEFT JOIN groups_table g ON g.id = c.group_id
    WHERE c.deleted_at IS NOT NULL
    ORDER BY c.deleted_at DESC`);
}

export async function restoreContact(id) {
  const database = await getDatabase();
  await database.runAsync('UPDATE contacts SET deleted_at=NULL, updated_at=? WHERE id=?', new Date().toISOString(), id);
}

export async function permanentlyDeleteContact(id) {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM contacts WHERE id=? AND deleted_at IS NOT NULL', id);
}

export async function listGroups() {
  const database = await getDatabase();
  return database.getAllAsync(`SELECT g.*, COUNT(cg.contact_id) AS member_count FROM groups_table g
    LEFT JOIN contact_groups cg ON cg.group_id = g.id GROUP BY g.id ORDER BY g.name COLLATE NOCASE`);
}

export async function saveGroup(name, id = null, description = '') {
  const database = await getDatabase();
  if (id) await database.runAsync('UPDATE groups_table SET name=?, description=? WHERE id=?', name.trim(), description, id);
  else await database.runAsync('INSERT INTO groups_table (name, description) VALUES (?,?)', name.trim(), description);
}

export async function deleteGroup(id) {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM contact_groups WHERE group_id=?', id);
  await database.runAsync('UPDATE contacts SET group_id=NULL WHERE group_id=?', id);
  await database.runAsync('DELETE FROM groups_table WHERE id=?', id);
}

export async function exportData() {
  const database = await getDatabase();
  const contacts = await database.getAllAsync('SELECT * FROM contacts');
  const groups = await database.getAllAsync('SELECT * FROM groups_table');
  const memberships = await database.getAllAsync('SELECT contact_id, group_id FROM contact_groups');
  return { schemaVersion: 3, memberships, exportedAt: new Date().toISOString(), contacts, groups };
}

export async function importData(data) {
  if (!data || ![1, 2, 3].includes(data.schemaVersion) || !Array.isArray(data.contacts) || !Array.isArray(data.groups)) {
    throw new Error('This is not a valid Contact Manager backup.');
  }
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    for (const group of data.groups) {
      if (typeof group.name !== 'string' || !group.name.trim()) continue;
      await database.runAsync('INSERT OR IGNORE INTO groups_table (name, description) VALUES (?,?)', group.name, group.description || '');
    }
    const groups = await database.getAllAsync('SELECT id, name FROM groups_table');
    const groupMap = new Map(groups.map(group => [group.name, group.id]));
    for (const contact of data.contacts) {
      if (typeof contact.first_name !== 'string' || !contact.first_name.trim()) continue;
      const legacyGroup = data.groups.find(group => group.id === contact.group_id);
      const mappedGroup = legacyGroup ? groupMap.get(legacyGroup.name) ?? null : null;
      const duplicate = await database.getFirstAsync(
        'SELECT id FROM contacts WHERE first_name=? AND last_name=? AND phone=? LIMIT 1',
        contact.first_name, contact.last_name || '', contact.phone || ''
      );
      if (duplicate) continue;
      const now = new Date().toISOString();
      const inserted = await database.runAsync(`INSERT INTO contacts
        (first_name,last_name,phone,email,address,company,job_title,notes,favorite,group_id,created_at,updated_at,deleted_at,photo_uri)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        contact.first_name, contact.last_name || '', contact.phone || '', contact.email || '',
        contact.address || '', contact.company || '', contact.job_title || '', contact.notes || '',
        contact.favorite ? 1 : 0, mappedGroup, contact.created_at || now, now, contact.deleted_at || null, contact.photo_uri || null);
      const newContactId = inserted.lastInsertRowId;
      if (mappedGroup) await database.runAsync('INSERT OR IGNORE INTO contact_groups (contact_id,group_id) VALUES (?,?)', newContactId, mappedGroup);
      if (Array.isArray(data.memberships)) {
        const oldContact = data.contacts.find(c => c.id === contact.id);
        for (const membership of data.memberships.filter(m => m.contact_id === oldContact?.id)) {
          const oldGroup = data.groups.find(g => g.id === membership.group_id);
          const newGroup = oldGroup ? groupMap.get(oldGroup.name) : null;
          if (newGroup) await database.runAsync('INSERT OR IGNORE INTO contact_groups (contact_id,group_id) VALUES (?,?)', newContactId, newGroup);
        }
      }
    }
  });
}
