import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { initDatabase, clearAllData } from '../db/database.js';
import { useItemsStore, sortItems } from '../stores/itemsStore.js';
import { useCategoriesStore } from '../stores/categoriesStore.js';
import { useTemplatesStore } from '../stores/templatesStore.js';
import {
  useTripsStore,
  referenceDateOf,
  shouldAutoArchive
} from '../stores/tripsStore.js';

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

  describe('update (Edit)', () => {
    it('benennt Item um und behält usageCount', async () => {
      const items = useItemsStore();
      await items.load();
      const a = await items.findOrCreateByName('Zahnbürsste', 1);
      await items.incrementUsage(a.id);
      await items.incrementUsage(a.id);
      await items.update(a.id, { name: 'Zahnbürste' });
      const updated = items.byId(a.id);
      expect(updated.name).toBe('Zahnbürste');
      expect(updated.usageCount).toBe(2); // unverändert
    });

    it('ändert die Kategorie', async () => {
      const items = useItemsStore();
      await items.load();
      const a = await items.findOrCreateByName('X', 1);
      await items.update(a.id, { categoryId: 2 });
      expect(items.byId(a.id).categoryId).toBe(2);
    });

    it('lehnt Kollision mit anderem Item ab', async () => {
      const items = useItemsStore();
      await items.load();
      const a = await items.findOrCreateByName('Zahnbürste', 1);
      const b = await items.findOrCreateByName('Reisepass', 4);
      await expect(
        items.update(b.id, { name: 'zahnbürste' })
      ).rejects.toThrow(/bereits den Namen/);
      // unverändert
      expect(items.byId(b.id).name).toBe('Reisepass');
      expect(items.byId(a.id).name).toBe('Zahnbürste');
    });

    it('lehnt leeren Namen ab', async () => {
      const items = useItemsStore();
      await items.load();
      const a = await items.findOrCreateByName('Z', 1);
      await expect(
        items.update(a.id, { name: '   ' })
      ).rejects.toThrow(/leer/);
    });

    it('akzeptiert Umbenennen auf gleichen Namen mit anderer Schreibweise', async () => {
      const items = useItemsStore();
      await items.load();
      const a = await items.findOrCreateByName('zahnbürste', 1);
      // gleiches Item, neue Groß-/Kleinschreibung → erlaubt
      await items.update(a.id, { name: 'Zahnbürste' });
      expect(items.byId(a.id).name).toBe('Zahnbürste');
    });
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

describe('archive: shouldAutoArchive (pure)', () => {
  const now = new Date('2026-07-06T12:00:00.000Z');
  const daysAgo = (n) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  it('nutzt travelDate als Referenz vor createdAt', () => {
    const trip = { createdAt: daysAgo(60), travelDate: daysAgo(1) };
    expect(referenceDateOf(trip)).toBe(trip.travelDate);
    expect(shouldAutoArchive(trip, now)).toBe(false);
  });

  it('fällt auf createdAt zurück wenn travelDate leer', () => {
    const trip = { createdAt: daysAgo(40), travelDate: null };
    expect(referenceDateOf(trip)).toBe(trip.createdAt);
    expect(shouldAutoArchive(trip, now)).toBe(true);
  });

  it('archiviert älter als 30 Tage, aber nicht genau 30 Tage', () => {
    expect(shouldAutoArchive({ createdAt: daysAgo(31) }, now)).toBe(true);
    expect(shouldAutoArchive({ createdAt: daysAgo(30) }, now)).toBe(false);
    expect(shouldAutoArchive({ createdAt: daysAgo(5) }, now)).toBe(false);
  });

  it('archiviert nicht wenn bereits archiviert oder keepActive', () => {
    expect(
      shouldAutoArchive({ createdAt: daysAgo(99), archivedAt: daysAgo(1) }, now)
    ).toBe(false);
    expect(
      shouldAutoArchive({ createdAt: daysAgo(99), keepActive: true }, now)
    ).toBe(false);
  });
});

describe('trips: Auto-Archiv beim load', () => {
  const daysAgo = (n) =>
    new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

  it('archiviert eine alte Reise beim Laden und persistiert', async () => {
    const { db } = await import('../db/database.js');
    await db.trips.add({
      name: 'Alt',
      templateId: null,
      travelDate: null,
      archivedAt: null,
      keepActive: false,
      createdAt: daysAgo(40)
    });
    const trips = useTripsStore();
    await trips.load();
    expect(trips.archivedTrips).toHaveLength(1);
    expect(trips.activeTrips).toHaveLength(0);
    // Persistenz: frischer Store lädt denselben Zustand
    const fresh = useTripsStore();
    fresh.$reset();
    await fresh.load();
    expect(fresh.archivedTrips).toHaveLength(1);
  });

  it('lässt eine junge Reise aktiv', async () => {
    const { db } = await import('../db/database.js');
    await db.trips.add({
      name: 'Neu',
      templateId: null,
      travelDate: null,
      archivedAt: null,
      keepActive: false,
      createdAt: daysAgo(5)
    });
    const trips = useTripsStore();
    await trips.load();
    expect(trips.activeTrips).toHaveLength(1);
    expect(trips.archivedTrips).toHaveLength(0);
  });
});

describe('trips: manuelles Archivieren', () => {
  const daysAgo = (n) =>
    new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

  it('archive setzt archivedAt, reactivate setzt keepActive und hält aktiv', async () => {
    const items = useItemsStore();
    const trips = useTripsStore();
    await items.load();
    await trips.load();
    const trip = await trips.create({ name: 'Wien' });

    await trips.archive(trip.id);
    expect(trips.byId(trip.id).archivedAt).toBeTruthy();
    expect(trips.archivedTrips).toHaveLength(1);

    await trips.reactivate(trip.id);
    expect(trips.byId(trip.id).archivedAt).toBeNull();
    expect(trips.byId(trip.id).keepActive).toBe(true);
    expect(trips.activeTrips).toHaveLength(1);
  });

  it('reaktivierte alte Reise wird beim erneuten load NICHT wieder archiviert', async () => {
    const { db } = await import('../db/database.js');
    await db.trips.add({
      name: 'Alt-reaktiviert',
      templateId: null,
      travelDate: null,
      archivedAt: null,
      keepActive: true,
      createdAt: daysAgo(90)
    });
    const trips = useTripsStore();
    await trips.load();
    expect(trips.activeTrips).toHaveLength(1);
    expect(trips.archivedTrips).toHaveLength(0);
  });

  it('setTravelDate speichert und leert das Reisedatum', async () => {
    const trips = useTripsStore();
    await trips.load();
    const trip = await trips.create({ name: 'X' });
    await trips.setTravelDate(trip.id, '2026-05-01');
    expect(trips.byId(trip.id).travelDate).toBe('2026-05-01');
    await trips.setTravelDate(trip.id, '');
    expect(trips.byId(trip.id).travelDate).toBeNull();
  });

  it('create übernimmt travelDate und initialisiert Archiv-Felder', async () => {
    const trips = useTripsStore();
    await trips.load();
    const trip = await trips.create({ name: 'Y', travelDate: '2026-08-01' });
    expect(trip.travelDate).toBe('2026-08-01');
    expect(trip.archivedAt).toBeNull();
    expect(trip.keepActive).toBe(false);
  });
});

describe('trips: createTemplateFromTrip', () => {
  it('erstellt Vorlage und kopiert Items + Mengen, ignoriert checked', async () => {
    const items = useItemsStore();
    const templates = useTemplatesStore();
    const trips = useTripsStore();
    await items.load();
    await templates.load();
    await trips.load();

    const a = await items.findOrCreateByName('Zahnbürste', 1);
    const b = await items.findOrCreateByName('Socken', 1);
    const trip = await trips.create({ name: 'Rom' });
    await trips.addItem(trip.id, a.id, 1);
    await trips.addItem(trip.id, b.id, 3);
    await trips.toggleChecked(trip.id, trips.itemsFor(trip.id)[0].id);

    const tpl = await trips.createTemplateFromTrip(trip.id, 'Städtereise');
    expect(templates.byId(tpl.id).name).toBe('Städtereise');
    const tItems = templates.itemsFor(tpl.id);
    expect(tItems).toHaveLength(2);
    const socken = tItems.find((ti) => ti.itemId === b.id);
    expect(socken.quantity).toBe(3);
  });

  it('funktioniert auch für eine Reise ohne Quell-Vorlage', async () => {
    const items = useItemsStore();
    const templates = useTemplatesStore();
    const trips = useTripsStore();
    await items.load();
    await templates.load();
    await trips.load();

    const a = await items.findOrCreateByName('Ladegerät', 1);
    const trip = await trips.create({ name: 'Leer' });
    await trips.addItem(trip.id, a.id, 1);
    const tpl = await trips.createTemplateFromTrip(trip.id, 'Neu');
    expect(templates.itemsFor(tpl.id)).toHaveLength(1);
  });
});
