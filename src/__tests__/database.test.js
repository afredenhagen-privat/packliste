import { describe, it, expect, beforeEach } from 'vitest';
import { db, initDatabase, clearAllData } from '../db/database.js';
import { seedDefaultCategories, DEFAULT_CATEGORIES } from '../db/seed.js';

beforeEach(async () => {
  await initDatabase();
  await clearAllData();
});

describe('database schema', () => {
  it('hat alle sechs Stores', () => {
    const tableNames = db.tables.map((t) => t.name).sort();
    expect(tableNames).toEqual(
      [
        'categories',
        'items',
        'template_items',
        'templates',
        'trip_items',
        'trips'
      ].sort()
    );
  });

  it('legt Items mit Auto-Inkrement-IDs an', async () => {
    const id1 = await db.items.add({
      name: 'Zahnbürste',
      categoryId: 1,
      usageCount: 0,
      lastUsedAt: null
    });
    const id2 = await db.items.add({
      name: 'Reisepass',
      categoryId: 4,
      usageCount: 0,
      lastUsedAt: null
    });
    expect(id1).toBe(1);
    expect(id2).toBe(2);
  });
});

describe('seedDefaultCategories', () => {
  it('legt alle Default-Kategorien an, wenn leer', async () => {
    const inserted = await seedDefaultCategories();
    expect(inserted).toBe(DEFAULT_CATEGORIES.length);
    const stored = await db.categories.toArray();
    expect(stored).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(stored.every((c) => c.isDefault === true)).toBe(true);
    expect(stored.map((c) => c.name)).toContain('Kleidung');
  });

  it('ist idempotent - macht beim zweiten Aufruf nichts', async () => {
    await seedDefaultCategories();
    const inserted2 = await seedDefaultCategories();
    expect(inserted2).toBe(0);
    const count = await db.categories.count();
    expect(count).toBe(DEFAULT_CATEGORIES.length);
  });
});

describe('clearAllData', () => {
  it('leert alle Stores', async () => {
    await db.categories.add({ name: 'Test', isDefault: false });
    await db.items.add({ name: 'X', categoryId: 1, usageCount: 0 });
    await clearAllData();
    expect(await db.categories.count()).toBe(0);
    expect(await db.items.count()).toBe(0);
  });
});
