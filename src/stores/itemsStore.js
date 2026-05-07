import { defineStore } from 'pinia';
import { db } from '../db/database.js';

/**
 * Items-Store: zentrale Bibliothek aller je benutzten Items.
 *
 * Sortier-Heuristik (für Autocomplete UND Bibliotheks-View):
 *   1. usageCount DESC (häufigste zuerst)
 *   2. lastUsedAt DESC (kürzlich benutzt zuerst)
 *   3. name ASC
 *
 * `state.items` ist immer schon vorsortiert.
 */
export const useItemsStore = defineStore('items', {
  state: () => ({
    items: [],
    loaded: false
  }),

  getters: {
    byId: (state) => (id) => state.items.find((i) => i.id === id),

    /**
     * Volltext-Match auf Namen (case-insensitiv, "contains").
     * Reihenfolge bleibt die der vorsortierten state.items.
     */
    search: (state) => (query) => {
      const q = (query ?? '').trim().toLowerCase();
      if (!q) return state.items;
      return state.items.filter((i) => i.name.toLowerCase().includes(q));
    },

    byCategory: (state) => (categoryId) =>
      state.items.filter((i) => i.categoryId === categoryId)
  },

  actions: {
    async load() {
      const rows = await db.items.toArray();
      this.items = sortItems(rows);
      this.loaded = true;
    },

    /**
     * Findet ein Item per Name (case-insensitiv exakt) oder legt
     * es neu an. Liefert das gespeicherte Item zurück.
     */
    async findOrCreateByName(name, categoryId) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Item-Name darf nicht leer sein.');
      const existing = this.items.find(
        (i) => i.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) {
        // Falls Kategorie geändert wurde: aktualisieren.
        if (categoryId && existing.categoryId !== categoryId) {
          await db.items.update(existing.id, { categoryId });
          existing.categoryId = categoryId;
          this._resort();
        }
        return existing;
      }
      const newItem = {
        name: trimmed,
        categoryId: categoryId ?? null,
        usageCount: 0,
        lastUsedAt: null
      };
      const id = await db.items.add(newItem);
      const created = { id, ...newItem };
      this.items.push(created);
      this._resort();
      return created;
    },

    /**
     * Wird aufgerufen, wenn ein Item zu einem Template oder Trip
     * hinzugefügt wird. Erhöht usageCount, setzt lastUsedAt.
     */
    async incrementUsage(itemId) {
      const item = this.byId(itemId);
      if (!item) return;
      const lastUsedAt = new Date().toISOString();
      const usageCount = (item.usageCount ?? 0) + 1;
      await db.items.update(itemId, { usageCount, lastUsedAt });
      item.usageCount = usageCount;
      item.lastUsedAt = lastUsedAt;
      this._resort();
    },

    /**
     * Item bearbeiten. Erlaubte Patch-Felder: name, categoryId.
     * usageCount/lastUsedAt werden hier NICHT geändert.
     *
     * Wirft, wenn der neue Name leer ist oder zu einem ANDEREN
     * Item kollidiert (case-insensitiv).
     */
    async update(itemId, patch) {
      const target = this.byId(itemId);
      if (!target) throw new Error('Item nicht gefunden.');

      const safePatch = {};
      if (patch.name !== undefined) {
        const trimmed = patch.name.trim();
        if (!trimmed) throw new Error('Item-Name darf nicht leer sein.');
        const collision = this.items.find(
          (i) =>
            i.id !== itemId &&
            i.name.toLowerCase() === trimmed.toLowerCase()
        );
        if (collision) {
          throw new Error(
            `Ein anderes Item hat bereits den Namen "${collision.name}".`
          );
        }
        safePatch.name = trimmed;
      }
      if (patch.categoryId !== undefined) {
        // null ist erlaubt (= "Ohne Kategorie")
        safePatch.categoryId = patch.categoryId;
      }
      if (Object.keys(safePatch).length === 0) return target;

      await db.items.update(itemId, safePatch);
      Object.assign(target, safePatch);
      this._resort();
      return target;
    },

    async remove(itemId) {
      // Cascades: trip_items + template_items, in denen das Item
      // referenziert wird, müssen mit entfernt werden, sonst gibt's
      // verwaiste Einträge.
      await db.transaction(
        'rw',
        db.items,
        db.template_items,
        db.trip_items,
        async () => {
          await db.template_items.where('itemId').equals(itemId).delete();
          await db.trip_items.where('itemId').equals(itemId).delete();
          await db.items.delete(itemId);
        }
      );
      this.items = this.items.filter((i) => i.id !== itemId);
    },

    _resort() {
      this.items = sortItems(this.items);
    }
  }
});

export function sortItems(rows) {
  return [...rows].sort((a, b) => {
    const ua = a.usageCount ?? 0;
    const ub = b.usageCount ?? 0;
    if (ub !== ua) return ub - ua;
    const la = a.lastUsedAt ?? '';
    const lb = b.lastUsedAt ?? '';
    if (la !== lb) return la < lb ? 1 : -1;
    return a.name.localeCompare(b.name, 'de');
  });
}
