import { defineStore } from 'pinia';
import { db } from '../db/database.js';
import { useItemsStore } from './itemsStore.js';
import { useCategoriesStore } from './categoriesStore.js';

/**
 * Templates-Store: Vorlagen + ihre Items.
 *
 * `state.templates` enthält die Template-Stammdaten.
 * `state.templateItems[templateId]` enthält die zugehörigen
 * Items als Array `{ id, templateId, itemId, quantity }`.
 */
export const useTemplatesStore = defineStore('templates', {
  state: () => ({
    templates: [],
    templateItems: {}, // templateId -> Array
    loaded: false
  }),

  getters: {
    byId: (state) => (id) => state.templates.find((t) => t.id === id),
    itemsFor: (state) => (templateId) => state.templateItems[templateId] ?? []
  },

  actions: {
    async load() {
      this.templates = (await db.templates.toArray()).sort(
        (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
      );
      const allItems = await db.template_items.toArray();
      this.templateItems = groupBy(allItems, 'templateId');
      this.loaded = true;
    },

    async create(name) {
      const row = { name: name.trim(), createdAt: new Date().toISOString() };
      const id = await db.templates.add(row);
      const created = { id, ...row };
      this.templates.unshift(created);
      this.templateItems[id] = [];
      return created;
    },

    async rename(id, name) {
      const trimmed = name.trim();
      await db.templates.update(id, { name: trimmed });
      const tpl = this.byId(id);
      if (tpl) tpl.name = trimmed;
    },

    async remove(id) {
      await db.transaction(
        'rw',
        db.templates,
        db.template_items,
        async () => {
          await db.template_items.where('templateId').equals(id).delete();
          await db.templates.delete(id);
        }
      );
      this.templates = this.templates.filter((t) => t.id !== id);
      delete this.templateItems[id];
    },

    /**
     * Item zu einer Vorlage hinzufügen.
     * Erhöht usageCount im Items-Store.
     */
    async addItem(templateId, itemId, quantity = 1) {
      // Doppelte vermeiden – wenn schon drin, nur Menge erhöhen
      const existing = (this.templateItems[templateId] ?? []).find(
        (ti) => ti.itemId === itemId
      );
      if (existing) {
        return this.updateItemQuantity(
          templateId,
          existing.id,
          (existing.quantity ?? 1) + quantity
        );
      }
      const row = { templateId, itemId, quantity };
      const id = await db.template_items.add(row);
      const ti = { id, ...row };
      if (!this.templateItems[templateId]) this.templateItems[templateId] = [];
      this.templateItems[templateId].push(ti);

      const itemsStore = useItemsStore();
      await itemsStore.incrementUsage(itemId);
      return ti;
    },

    async updateItemQuantity(templateId, templateItemId, quantity) {
      const q = Math.max(1, Number(quantity) || 1);
      await db.template_items.update(templateItemId, { quantity: q });
      const ti = (this.templateItems[templateId] ?? []).find(
        (x) => x.id === templateItemId
      );
      if (ti) ti.quantity = q;
      return ti;
    },

    async removeItem(templateId, templateItemId) {
      await db.template_items.delete(templateItemId);
      this.templateItems[templateId] = (
        this.templateItems[templateId] ?? []
      ).filter((ti) => ti.id !== templateItemId);
    },

    /**
     * Importiert eine geteilte Vorlage (bereits via parseTemplateImport
     * normalisiert) als NEUE Vorlage mit Namen `finalName`.
     * Re-verlinkt Items/Kategorien per Name:
     *   - Kategorie: vorhandene wiederverwenden, sonst neu anlegen.
     *   - Item vorhanden (Name): wiederverwenden, Kategorie des Empfängers
     *     bleibt unangetastet.
     *   - Item fehlt: neu anlegen mit aufgelöster Kategorie.
     * Setzt voraus, dass items-/categories-Store geladen sind.
     */
    async importShared(parsed, finalName) {
      const itemsStore = useItemsStore();
      const categoriesStore = useCategoriesStore();

      const tpl = await this.create(finalName);

      for (const it of parsed.items) {
        // 1) Kategorie auflösen (nur wenn geteilt)
        let categoryId = null;
        if (it.category) {
          const cat = await categoriesStore.create({
            name: it.category.name,
            color: it.category.color ?? undefined
          });
          categoryId = cat.id;
        }

        // 2) Item auflösen – vorhandenes NICHT umkategorisieren
        const existing = itemsStore.items.find(
          (i) => i.name.toLowerCase() === it.name.toLowerCase()
        );
        const item = existing
          ? existing
          : await itemsStore.findOrCreateByName(it.name, categoryId);

        // 3) An die Vorlage hängen (addItem erhöht usageCount + merged Mengen)
        await this.addItem(tpl.id, item.id, it.quantity);
      }

      return tpl;
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
