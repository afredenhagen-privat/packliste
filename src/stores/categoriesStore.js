import { defineStore } from 'pinia';
import { db } from '../db/database.js';

const FALLBACK_COLOR = '#64748b'; // slate-500

export const useCategoriesStore = defineStore('categories', {
  state: () => ({
    categories: [],
    loaded: false
  }),

  getters: {
    byId: (state) => (id) => state.categories.find((c) => c.id === id),
    /** Sicheres Lookup für Items ohne Kategorie. */
    nameOf:
      (state) =>
      (id, fallback = 'Ohne Kategorie') => {
        const c = state.categories.find((c) => c.id === id);
        return c ? c.name : fallback;
      },
    colorOf:
      (state) =>
      (id, fallback = FALLBACK_COLOR) => {
        const c = state.categories.find((c) => c.id === id);
        return c?.color ?? fallback;
      }
  },

  actions: {
    async load() {
      const rows = await db.categories.toArray();
      this.categories = rows.sort((a, b) =>
        a.name.localeCompare(b.name, 'de')
      );
      this.loaded = true;
    },

    async create({ name, color }) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Kategoriename darf nicht leer sein.');
      const existing = this.categories.find(
        (c) => c.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) return existing;
      const row = {
        name: trimmed,
        color: color ?? FALLBACK_COLOR,
        isDefault: false
      };
      const id = await db.categories.add(row);
      const created = { id, ...row };
      this.categories.push(created);
      this.categories.sort((a, b) => a.name.localeCompare(b.name, 'de'));
      return created;
    },

    async update(id, patch) {
      await db.categories.update(id, patch);
      const cat = this.byId(id);
      if (cat) Object.assign(cat, patch);
      this.categories.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    },

    /**
     * Kategorie löschen. Items, die noch zur gelöschten Kategorie
     * gehören, werden auf categoryId=null gesetzt (nicht gelöscht).
     */
    async remove(id) {
      await db.transaction('rw', db.categories, db.items, async () => {
        await db.items
          .where('categoryId')
          .equals(id)
          .modify({ categoryId: null });
        await db.categories.delete(id);
      });
      this.categories = this.categories.filter((c) => c.id !== id);
    }
  }
});
