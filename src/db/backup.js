import { db, clearAllData } from './database.js';

const STORE_NAMES = [
  'items',
  'categories',
  'templates',
  'template_items',
  'trips',
  'trip_items'
];

const BACKUP_VERSION = 1;

/**
 * Exportiert alle Stores als ein Plain-Object.
 * Für Filedownload via JSON.stringify()-Zwischenschritt.
 */
export async function exportBackup() {
  const payload = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {}
  };
  await db.transaction('r', db.tables, async () => {
    for (const name of STORE_NAMES) {
      payload.data[name] = await db.table(name).toArray();
    }
  });
  return payload;
}

/**
 * Importiert ein Backup. ÜBERSCHREIBT alle vorhandenen Daten.
 * Wirft bei strukturellen Fehlern.
 */
export async function importBackup(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Backup-Datei ist nicht lesbar.');
  }
  if (payload.version !== BACKUP_VERSION) {
    throw new Error(
      `Backup-Version ${payload.version} wird nicht unterstützt (erwartet: ${BACKUP_VERSION}).`
    );
  }
  if (!payload.data || typeof payload.data !== 'object') {
    throw new Error('Backup enthält keine Daten.');
  }
  for (const name of STORE_NAMES) {
    if (!Array.isArray(payload.data[name])) {
      throw new Error(`Backup-Store "${name}" fehlt oder ist kein Array.`);
    }
  }

  await clearAllData();
  await db.transaction('rw', db.tables, async () => {
    for (const name of STORE_NAMES) {
      const rows = payload.data[name];
      if (rows.length > 0) {
        await db.table(name).bulkAdd(rows);
      }
    }
  });
}

/** Datei-Download im Browser auslösen. */
export function downloadBackup(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? buildBackupFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function buildBackupFilename(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `packliste-backup-${yyyy}-${mm}-${dd}.json`;
}
