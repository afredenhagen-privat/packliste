import { describe, it, expect, beforeEach } from 'vitest';
import { db, initDatabase, clearAllData } from '../db/database.js';
import {
  exportBackup,
  importBackup,
  buildBackupFilename
} from '../db/backup.js';

beforeEach(async () => {
  await initDatabase();
  await clearAllData();
});

describe('backup roundtrip', () => {
  it('exportiert und importiert alle sechs Stores', async () => {
    const catId = await db.categories.add({
      name: 'Hygiene',
      isDefault: true
    });
    const itemId = await db.items.add({
      name: 'Zahnbürste',
      categoryId: catId,
      usageCount: 3,
      lastUsedAt: '2026-05-01T00:00:00.000Z'
    });
    const tplId = await db.templates.add({
      name: 'Wochenende',
      createdAt: '2026-05-01T00:00:00.000Z'
    });
    await db.template_items.add({
      templateId: tplId,
      itemId,
      quantity: 1
    });
    const tripId = await db.trips.add({
      name: 'Berlin Mai',
      templateId: tplId,
      createdAt: '2026-05-02T00:00:00.000Z'
    });
    await db.trip_items.add({
      tripId,
      itemId,
      quantity: 1,
      checked: false
    });

    const backup = await exportBackup();
    expect(backup.version).toBe(1);
    expect(backup.data.categories).toHaveLength(1);
    expect(backup.data.items).toHaveLength(1);
    expect(backup.data.templates).toHaveLength(1);
    expect(backup.data.template_items).toHaveLength(1);
    expect(backup.data.trips).toHaveLength(1);
    expect(backup.data.trip_items).toHaveLength(1);

    // Daten verändern, dann zurückspielen
    await clearAllData();
    expect(await db.categories.count()).toBe(0);

    await importBackup(backup);
    expect(await db.categories.count()).toBe(1);
    expect(await db.items.count()).toBe(1);
    const restored = await db.items.toArray();
    expect(restored[0].name).toBe('Zahnbürste');
    expect(restored[0].usageCount).toBe(3);
  });

  it('lehnt unbekannte Backup-Versionen ab', async () => {
    await expect(
      importBackup({ version: 99, data: {} })
    ).rejects.toThrow(/Backup-Version 99/);
  });

  it('lehnt fehlende Stores ab', async () => {
    await expect(
      importBackup({ version: 1, data: { categories: [] } })
    ).rejects.toThrow(/Backup-Store/);
  });
});

describe('buildBackupFilename', () => {
  it('formatiert das Datum mit führenden Nullen', () => {
    const fixed = new Date(2026, 0, 7); // Januar = 0
    expect(buildBackupFilename(fixed)).toBe('packliste-backup-2026-01-07.json');
  });
});
