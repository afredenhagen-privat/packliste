import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { initDatabase, clearAllData } from '../db/database.js';
import { useItemsStore, sortItems } from '../stores/itemsStore.js';
import { useCategoriesStore } from '../stores/categoriesStore.js';
import { useTemplatesStore } from '../stores/templatesStore.js';
import { useTripsStore } from '../stores/tripsStore.js';

beforeEach(async () => {
  setActivePinia(createPinia());
  await initDatabase();
  await clearAllData();
});

describe('sortItems', () => {
  it('sortiert nach usageCount, dann lastUsedAt, dann name', () => {
    const sorted = sortItems([
      { id: 1, name: 'A', usageCount: 1, lastUsedAt: '2026-01-01' },
      { id: 2, name: 'B', usageCount: 5, lastUsedAt: '2026-01-01' },
      { id: 3, name: 'C', usageCount: 5, lastUsedAt: '2026-02-01' },
      { id: 4, name: 'D', usageCount: 5, lastUsedAt: '2026-02-01' }
    ]);
    expect(sorted.map((i) => i.id)).toEqual([3, 4, 2, 1]);
  });
});

describe('itemsStore', () => {
  it('legt neue Items an und vermeidet Duplikate per Namen', async () => {
    const items = useItemsStore();
    await items.load();
    const a = await items.findOrCreateByName('Zahnbürste', 1);
    const b = await items.findOrCreateByName('zahnbürste', 1);
    expect(a.id).toBe(b.id);
    expect(items.items).toHaveLength(1);
  });

  it('incrementUsage erhöht den Zähler und resortiert', async () => {
    const items = useItemsStore();
    await items.load();
    const a = await items.findOrCreateByName('A', 1);
    const b = await items.findOrCreateByName('B', 1);
    await items.incrementUsage(b.id);
    await items.incrementUsage(b.id);
    await items.incrementUsage(a.id);
    expect(items.items[0].id).toBe(b.id); // 2 > 1
  });

  it('search filtert case-insensitiv', async () => {
    const items = useItemsStore();
    await items.load();
    await items.findOrCreateByName('Zahnbürste', 1);
    await items.findOrCreateByName('Reisepass', 4);
    expect(items.search('zah').map((i) => i.name)).toEqual(['Zahnbürste']);
  });
});

describe('categoriesStore', () => {
  it('legt Kategorie an und ignoriert Duplikate', async () => {
    const cats = useCategoriesStore();
    await cats.load();
    const a = await cats.create({ name: 'Hygiene' });
    const b = await cats.create({ name: 'hygiene' });
    expect(a.id).toBe(b.id);
  });

  it('Löschen setzt Items auf categoryId=null statt sie zu löschen', async () => {
    const cats = useCategoriesStore();
    const items = useItemsStore();
    await cats.load();
    await items.load();
    const c = await cats.create({ name: 'Temp' });
    const it = await items.findOrCreateByName('X', c.id);
    await cats.remove(c.id);
    await items.load();
    const reloaded = items.byId(it.id);
    expect(reloaded.categoryId).toBeNull();
  });
});

describe('templates + items integration', () => {
  it('addItem erhöht usageCount im itemsStore', async () => {
    const cats = useCategoriesStore();
    const items = useItemsStore();
    const templates = useTemplatesStore();
    await cats.load();
    await items.load();
    await templates.load();

    const cat = await cats.create({ name: 'Hygiene' });
    const item = await items.findOrCreateByName('Zahnbürste', cat.id);
    const tpl = await templates.create('Geschäftsreise');

    await templates.addItem(tpl.id, item.id, 1);
    const updated = items.byId(item.id);
    expect(updated.usageCount).toBe(1);
    expect(templates.itemsFor(tpl.id)).toHaveLength(1);
  });

  it('addItem mit existierendem Item erhöht nur die Menge', async () => {
    const items = useItemsStore();
    const templates = useTemplatesStore();
    await items.load();
    await templates.load();

    const item = await items.findOrCreateByName('Socken', 1);
    const tpl = await templates.create('Wochenende');
    await templates.addItem(tpl.id, item.id, 2);
    await templates.addItem(tpl.id, item.id, 3);

    const ti = templates.itemsFor(tpl.id);
    expect(ti).toHaveLength(1);
    expect(ti[0].quantity).toBe(5);
  });
});

describe('trips: createTripFromTemplate', () => {
  it('kopiert Template-Items beim Anlegen einer Reise', async () => {
    const items = useItemsStore();
    const templates = useTemplatesStore();
    const trips = useTripsStore();
    await items.load();
    await templates.load();
    await trips.load();

    const a = await items.findOrCreateByName('Zahnbürste', 1);
    const b = await items.findOrCreateByName('Notebook', 1);
    const tpl = await templates.create('Geschäftsreise');
    await templates.addItem(tpl.id, a.id, 1);
    await templates.addItem(tpl.id, b.id, 1);

    const trip = await trips.create({
      name: 'Berlin Mai',
      templateId: tpl.id
    });

    const tripItems = trips.itemsFor(trip.id);
    expect(tripItems).toHaveLength(2);
    expect(tripItems.every((ti) => ti.checked === false)).toBe(true);
    // usageCount wurde noch einmal erhöht (war 1 von addItem, jetzt 2)
    expect(items.byId(a.id).usageCount).toBe(2);
  });

  it('toggleChecked schaltet den Status um', async () => {
    const items = useItemsStore();
    const trips = useTripsStore();
    await items.load();
    await trips.load();

    const a = await items.findOrCreateByName('Reisepass', 1);
    const trip = await trips.create({ name: 'Test' });
    await trips.addItem(trip.id, a.id, 1);
    const ti = trips.itemsFor(trip.id)[0];
    expect(ti.checked).toBe(false);
    await trips.toggleChecked(trip.id, ti.id);
    expect(ti.checked).toBe(true);
    await trips.toggleChecked(trip.id, ti.id);
    expect(ti.checked).toBe(false);
  });

  it('progressFor liefert checked/total', async () => {
    const items = useItemsStore();
    const trips = useTripsStore();
    await items.load();
    await trips.load();

    const a = await items.findOrCreateByName('A', 1);
    const b = await items.findOrCreateByName('B', 1);
    const trip = await trips.create({ name: 'T' });
    await trips.addItem(trip.id, a.id);
    await trips.addItem(trip.id, b.id);
    await trips.toggleChecked(trip.id, trips.itemsFor(trip.id)[0].id);

    expect(trips.progressFor(trip.id)).toEqual({ checked: 1, total: 2 });
  });
});
