import { db } from './database.js';

/**
 * Standard-Kategorien gemäß Plan. Reihenfolge bewusst gewählt
 * (häufigste zuerst). Farben in Tailwind-Slate-Palette gehalten,
 * mit einem akzentuierten Lookup-Hue für jede Kategorie.
 */
export const DEFAULT_CATEGORIES = [
  { name: 'Kleidung', color: '#3b82f6', isDefault: true },
  { name: 'Hygiene', color: '#10b981', isDefault: true },
  { name: 'Elektronik', color: '#6366f1', isDefault: true },
  { name: 'Dokumente', color: '#f59e0b', isDefault: true },
  { name: 'Medikamente', color: '#ef4444', isDefault: true },
  { name: 'Sonstiges', color: '#64748b', isDefault: true }
];

/**
 * Legt die Default-Kategorien an, sofern die Tabelle leer ist.
 * Idempotent: bei vorhandenen Einträgen passiert nichts.
 */
export async function seedDefaultCategories() {
  const count = await db.categories.count();
  if (count > 0) return 0;
  await db.categories.bulkAdd(DEFAULT_CATEGORIES.map((c) => ({ ...c })));
  return DEFAULT_CATEGORIES.length;
}
