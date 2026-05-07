import Dexie from 'dexie';

/**
 * Packliste-Datenbank.
 *
 * Stores:
 *   items          – Bibliothek aller je benutzten Items (Häufigkeitsranking via usageCount).
 *   categories     – Kategorien, inkl. Default-Markierung.
 *   templates      – wiederverwendbare Vorlagen (z. B. "Geschäftsreise").
 *   template_items – M:N zwischen Templates und Items, mit Menge.
 *   trips          – konkrete Reisen, optional aus Vorlage erzeugt.
 *   trip_items     – M:N zwischen Trips und Items, mit Menge + checked.
 *
 * Nur indexierbare Felder stehen im stores()-Schema. Alle weiteren
 * Felder (color, quantity, checked) sind freie Properties am Objekt.
 */
export const db = new Dexie('packliste-db');

db.version(1).stores({
  items: '++id, name, categoryId, usageCount, lastUsedAt',
  categories: '++id, name, isDefault',
  templates: '++id, name, createdAt',
  template_items: '++id, templateId, itemId',
  trips: '++id, name, templateId, createdAt',
  trip_items: '++id, tripId, itemId, checked'
});

/**
 * Datenbank öffnen. Liefert die geöffnete Dexie-Instanz.
 * Wird in tests nicht zwingend benötigt (Dexie öffnet lazily),
 * macht aber das Lifecycle explizit.
 */
export async function initDatabase() {
  if (!db.isOpen()) {
    await db.open();
  }
  return db;
}

/** Alle Daten löschen (für Restore + Tests). */
export async function clearAllData() {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
    }
  });
}
