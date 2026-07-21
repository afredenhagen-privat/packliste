import { db } from './database.js';

const EXPORT_TYPE = 'packliste-template';
const EXPORT_VERSION = 1;

/**
 * Baut ein selbst-enthaltendes Export-Payload für eine Vorlage.
 * Denormalisiert Items + Kategorien (Namen statt lokaler IDs),
 * ohne usageCount/lastUsedAt. Wirft, wenn die Vorlage fehlt.
 */
export async function buildTemplateExport(templateId) {
  return db.transaction(
    'r',
    db.templates,
    db.template_items,
    db.items,
    db.categories,
    async () => {
      const template = await db.templates.get(templateId);
      if (!template) throw new Error('Vorlage nicht gefunden.');

      const templateItems = await db.template_items
        .where('templateId')
        .equals(templateId)
        .toArray();

      const items = [];
      for (const ti of templateItems) {
        const item = await db.items.get(ti.itemId);
        if (!item) continue; // verwaister Verweis – überspringen
        let category = null;
        if (item.categoryId != null) {
          const cat = await db.categories.get(item.categoryId);
          if (cat) category = { name: cat.name, color: cat.color ?? null };
        }
        items.push({ name: item.name, quantity: ti.quantity ?? 1, category });
      }

      return {
        type: EXPORT_TYPE,
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        template: { name: template.name },
        items
      };
    }
  );
}

/**
 * Validiert ein eingehendes Payload und liefert eine normalisierte
 * Struktur { templateName, items: [{ name, quantity, category }] }.
 * Wirft nutzerfreundliche Fehler bei Struktur-/Versionsproblemen.
 */
export function parseTemplateImport(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Datei ist nicht lesbar.');
  }
  if (payload.type !== EXPORT_TYPE) {
    throw new Error('Das ist keine geteilte Packlisten-Vorlage.');
  }
  if (payload.version !== EXPORT_VERSION) {
    throw new Error(
      `Vorlagen-Version ${payload.version} wird nicht unterstützt (erwartet: ${EXPORT_VERSION}).`
    );
  }
  if (
    !payload.template ||
    typeof payload.template.name !== 'string' ||
    !payload.template.name.trim()
  ) {
    throw new Error('Vorlage hat keinen Namen.');
  }
  if (!Array.isArray(payload.items)) {
    throw new Error('Vorlage enthält keine Item-Liste.');
  }

  const items = payload.items.map((raw, idx) => {
    if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) {
      throw new Error(`Item ${idx + 1} hat keinen Namen.`);
    }
    const quantity = Math.max(1, Number(raw.quantity) || 1);
    let category = null;
    if (
      raw.category &&
      typeof raw.category === 'object' &&
      typeof raw.category.name === 'string' &&
      raw.category.name.trim()
    ) {
      category = {
        name: raw.category.name.trim(),
        color: typeof raw.category.color === 'string' ? raw.category.color : null
      };
    }
    return { name: raw.name.trim(), quantity, category };
  });

  return { templateName: payload.template.name.trim(), items };
}
