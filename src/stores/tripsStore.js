import { defineStore } from 'pinia';
import { db } from '../db/database.js';
import { useItemsStore } from './itemsStore.js';
import { useTemplatesStore } from './templatesStore.js';

const ARCHIVE_AFTER_DAYS = 30;

/** Referenzdatum einer Reise: Reisedatum, sonst Erstelldatum. */
export function referenceDateOf(trip) {
  return trip.travelDate ?? trip.createdAt ?? null;
}

/**
 * Ob eine Reise automatisch archiviert werden soll.
 * Archiviert nur wenn nicht bereits archiviert, nicht manuell aktiv gehalten,
 * und das Referenzdatum älter als ARCHIVE_AFTER_DAYS ist (strikt älter).
 */
export function shouldAutoArchive(trip, now = new Date()) {
  if (trip.archivedAt) return false;
  if (trip.keepActive) return false;
  const ref = referenceDateOf(trip);
  if (!ref) return false;
  const refMs = new Date(ref).getTime();
  if (Number.isNaN(refMs)) return false;
  const cutoff = now.getTime() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  return refMs < cutoff;
}

/**
 * Trips-Store: konkrete Reisen + ihre Items.
 *
 * `state.trips` enthält die Reise-Stammdaten.
 * `state.tripItems[tripId]` enthält die Items
 * als Array `{ id, tripId, itemId, quantity, checked }`.
 */
export const useTripsStore = defineStore('trips', {
  state: () => ({
    trips: [],
    tripItems: {},
    loaded: false
  }),

  getters: {
    byId: (state) => (id) => state.trips.find((t) => t.id === id),
    activeTrips: (state) => state.trips.filter((t) => !t.archivedAt),
    archivedTrips: (state) => state.trips.filter((t) => t.archivedAt),
    itemsFor: (state) => (tripId) => state.tripItems[tripId] ?? [],
    progressFor: (state) => (tripId) => {
      const items = state.tripItems[tripId] ?? [];
      const checked = items.filter((i) => i.checked).length;
      return { checked, total: items.length };
    },
    templateDiffFor: (state) => (tripId) => {
      const trip = state.trips.find((t) => t.id === tripId);
      if (!trip || !trip.templateId) return null;
      const templatesStore = useTemplatesStore();
      if (!templatesStore.byId(trip.templateId)) return null;
      const tplItems = templatesStore.itemsFor(trip.templateId);
      const tripItems = state.tripItems[tripId] ?? [];
      const tplItemIds = new Set(tplItems.map((ti) => ti.itemId));
      const tripItemIds = new Set(tripItems.map((ti) => ti.itemId));
      const added = tripItems
        .filter((ti) => !tplItemIds.has(ti.itemId))
        .map((ti) => ({ itemId: ti.itemId }));
      const removed = tplItems
        .filter((ti) => !tripItemIds.has(ti.itemId))
        .map((ti) => ({ itemId: ti.itemId, templateItemId: ti.id }));
      return { templateId: trip.templateId, added, removed };
    }
  },

  actions: {
    async load() {
      this.trips = (await db.trips.toArray()).sort(
        (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
      );
      // Auto-Archiv: alte, nicht manuell aktiv gehaltene Reisen stempeln.
      const now = new Date();
      const toArchive = this.trips.filter((t) => shouldAutoArchive(t, now));
      if (toArchive.length) {
        const stamp = now.toISOString();
        await db.transaction('rw', db.trips, async () => {
          for (const t of toArchive) {
            await db.trips.update(t.id, { archivedAt: stamp });
          }
        });
        for (const t of toArchive) t.archivedAt = stamp;
      }
      const allItems = await db.trip_items.toArray();
      this.tripItems = groupBy(allItems, 'tripId');
      this.loaded = true;
    },

    /**
     * Erzeugt eine Reise. Wenn templateId gegeben ist, werden alle
     * Template-Items in trip_items kopiert (mit checked=false).
     */
    async create({ name, templateId = null, travelDate = null }) {
      const row = {
        name: name.trim(),
        templateId,
        travelDate: travelDate || null,
        archivedAt: null,
        keepActive: false,
        createdAt: new Date().toISOString()
      };
      const tripId = await db.trips.add(row);
      const created = { id: tripId, ...row };
      this.trips.unshift(created);
      this.tripItems[tripId] = [];

      if (templateId) {
        const templatesStore = useTemplatesStore();
        const itemsStore = useItemsStore();
        const sourceItems = templatesStore.itemsFor(templateId);
        for (const ti of sourceItems) {
          const tripItem = {
            tripId,
            itemId: ti.itemId,
            quantity: ti.quantity ?? 1,
            checked: false
          };
          const id = await db.trip_items.add(tripItem);
          this.tripItems[tripId].push({ id, ...tripItem });
          // usageCount erhöhen, weil das Item erneut "gebraucht" wird
          await itemsStore.incrementUsage(ti.itemId);
        }
      }
      return created;
    },

    async rename(tripId, name) {
      const trimmed = name.trim();
      await db.trips.update(tripId, { name: trimmed });
      const trip = this.byId(tripId);
      if (trip) trip.name = trimmed;
    },

    async archive(tripId) {
      const stamp = new Date().toISOString();
      await db.trips.update(tripId, { archivedAt: stamp });
      const t = this.byId(tripId);
      if (t) t.archivedAt = stamp;
    },

    async reactivate(tripId) {
      await db.trips.update(tripId, { archivedAt: null, keepActive: true });
      const t = this.byId(tripId);
      if (t) {
        t.archivedAt = null;
        t.keepActive = true;
      }
    },

    async setTravelDate(tripId, travelDate) {
      const v = travelDate || null;
      await db.trips.update(tripId, { travelDate: v });
      const t = this.byId(tripId);
      if (t) t.travelDate = v;
    },

    async remove(tripId) {
      await db.transaction('rw', db.trips, db.trip_items, async () => {
        await db.trip_items.where('tripId').equals(tripId).delete();
        await db.trips.delete(tripId);
      });
      this.trips = this.trips.filter((t) => t.id !== tripId);
      delete this.tripItems[tripId];
    },

    async addItem(tripId, itemId, quantity = 1) {
      const existing = (this.tripItems[tripId] ?? []).find(
        (ti) => ti.itemId === itemId
      );
      if (existing) {
        return this.updateItemQuantity(
          tripId,
          existing.id,
          (existing.quantity ?? 1) + quantity
        );
      }
      const row = { tripId, itemId, quantity, checked: false };
      const id = await db.trip_items.add(row);
      const ti = { id, ...row };
      if (!this.tripItems[tripId]) this.tripItems[tripId] = [];
      this.tripItems[tripId].push(ti);

      const itemsStore = useItemsStore();
      await itemsStore.incrementUsage(itemId);
      return ti;
    },

    async updateItemQuantity(tripId, tripItemId, quantity) {
      const q = Math.max(1, Number(quantity) || 1);
      await db.trip_items.update(tripItemId, { quantity: q });
      const ti = (this.tripItems[tripId] ?? []).find(
        (x) => x.id === tripItemId
      );
      if (ti) ti.quantity = q;
      return ti;
    },

    async toggleChecked(tripId, tripItemId) {
      const ti = (this.tripItems[tripId] ?? []).find(
        (x) => x.id === tripItemId
      );
      if (!ti) return;
      const next = !ti.checked;
      await db.trip_items.update(tripItemId, { checked: next });
      ti.checked = next;
    },

    async removeItem(tripId, tripItemId) {
      await db.trip_items.delete(tripItemId);
      this.tripItems[tripId] = (this.tripItems[tripId] ?? []).filter(
        (ti) => ti.id !== tripItemId
      );
    },

    /**
     * Erstellt eine neue Vorlage aus einer Reise (kopiert Items + Mengen,
     * ignoriert checked). Erhöht dabei den usageCount der kopierten Items.
     */
    async createTemplateFromTrip(tripId, name) {
      const templatesStore = useTemplatesStore();
      const tpl = await templatesStore.create(name);
      const sourceItems = this.itemsFor(tripId);
      for (const ti of sourceItems) {
        await templatesStore.addItem(tpl.id, ti.itemId, ti.quantity ?? 1);
      }
      return tpl;
    },

    async applyTemplateSync(tripId, { addItemIds = [], removeTemplateItemIds = [] }) {
      const trip = this.byId(tripId);
      if (!trip || !trip.templateId) return;
      const templatesStore = useTemplatesStore();
      if (!templatesStore.byId(trip.templateId)) return;
      for (const itemId of addItemIds) {
        await templatesStore.addItem(trip.templateId, itemId, 1);
      }
      for (const templateItemId of removeTemplateItemIds) {
        await templatesStore.removeItem(trip.templateId, templateItemId);
      }
    }
  }
});

function groupBy(rows, key) {
  return rows.reduce((acc, row) => {
    const k = row[key];
    if (!acc[k]) acc[k] = [];
    acc[k].push(row);
    return acc;
  }, {});
}
