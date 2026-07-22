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

/**
 * Liefert einen kollisionsfreien Vorlagennamen. Bei Kollision
 * (case-insensitiv) wird " (2)", " (3)" … angehängt.
 */
export function suggestTemplateName(desiredName, existingNames) {
  const taken = new Set((existingNames ?? []).map((n) => n.toLowerCase()));
  if (!taken.has(desiredName.toLowerCase())) return desiredName;
  let n = 2;
  while (taken.has(`${desiredName} (${n})`.toLowerCase())) n++;
  return `${desiredName} (${n})`;
}

/**
 * Reine Analyse für die Import-Vorschau. Kein Schreiben.
 * Markiert pro Item, ob Item/Kategorie beim Empfänger schon existieren,
 * und liefert einen kollisionsfreien Vorlagennamen.
 */
export function analyzeImport(parsed, { items, categories, templateNames }) {
  const itemNames = new Set((items ?? []).map((i) => i.name.toLowerCase()));
  const catNames = new Set((categories ?? []).map((c) => c.name.toLowerCase()));

  return {
    suggestedName: suggestTemplateName(parsed.templateName, templateNames),
    items: parsed.items.map((it) => ({
      name: it.name,
      quantity: it.quantity,
      categoryName: it.category?.name ?? null,
      categoryColor: it.category?.color ?? null,
      itemExists: itemNames.has(it.name.toLowerCase()),
      // Ohne Kategorie ist per Definition nichts "neu anzulegen".
      categoryExists: it.category
        ? catNames.has(it.category.name.toLowerCase())
        : true
    }))
  };
}

/** Dateiname-tauglicher Slug (Umlaute ausgeschrieben). */
export function slugify(name) {
  const s = (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'vorlage';
}

export function buildTemplateFilename(name) {
  return `packliste-vorlage-${slugify(name)}.json`;
}

/** Löst einen JSON-Datei-Download im Browser aus (Fallback). */
function downloadJson(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Kandidaten-Dateien für den Share-Versuch, in Reihenfolge der Präferenz.
 *
 * Chrome auf Android lässt beim Datei-Teilen nur bestimmte Endungen/MIME-Typen
 * zu (im Wesentlichen Audio, Bild, Text, Video) – `.json` wird dort abgelehnt,
 * `canShare` liefert dann false. Deshalb als Zweitversuch dieselbe Nutzlast als
 * `.txt`/`text/plain`. Für den Import ist die Endung egal: `parseTemplateImport`
 * validiert über das `type`-Feld im Inhalt, nicht über den Dateinamen.
 */
export function buildShareCandidates(json, filename) {
  const txtName = filename.replace(/\.json$/i, '.txt');
  return [
    new File([json], filename, { type: 'application/json' }),
    new File([json], txtName, { type: 'text/plain' })
  ];
}

/**
 * Teilt ein Export-Payload via Web Share API. Probiert die Kandidaten aus
 * `buildShareCandidates` der Reihe nach und nimmt den ersten, den der Browser
 * akzeptiert. Fällt auf Datei-Download zurück, wenn Sharing nicht verfügbar ist
 * oder alle Kandidaten abgelehnt werden.
 *
 * Liefert 'shared' | 'cancelled' | 'downloaded'.
 */
export async function shareTemplate(payload, filename) {
  const json = JSON.stringify(payload, null, 2);

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    for (const file of buildShareCandidates(json, filename)) {
      if (!navigator.canShare({ files: [file] })) continue;
      try {
        await navigator.share({ files: [file], title: payload.template.name });
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
        break; // echter Fehler – nicht weiterprobieren, sondern herunterladen
      }
    }
  }

  downloadJson(json, filename);
  return 'downloaded';
}
