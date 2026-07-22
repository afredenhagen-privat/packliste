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
 * Schneidet das Vorlagen-JSON aus einem geteilten Text heraus.
 *
 * Nötig, weil Messenger den Text selten pur weitergeben: WhatsApp hängt gern
 * Zitatzeichen, den Titel oder eine Absenderzeile an. Deshalb wird der Block
 * vom ersten `{` bis zum letzten `}` genommen, statt den ganzen Text zu parsen.
 */
export function extractTemplateJson(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Kein Text erhalten.');
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('In diesem Text steckt keine Vorlage.');
  }
  return raw.slice(start, end + 1);
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

/**
 * Prüft, was der Browser beim Teilen tatsächlich zulässt.
 *
 * Zweck ist Fehlersuche: Wenn „Teilen" nur herunterlädt, sagt das Ergebnis,
 * woran es liegt. `canShare` liefert laut Spezifikation für ALLES false,
 * wenn die Seite die web-share-Berechtigung nicht nutzen darf – deshalb ist
 * `canText` der Indikator: false bedeutet nicht „Dateityp abgelehnt", sondern
 * „Teilen ist auf dieser Seite gar nicht erlaubt".
 */
export function describeShareSupport() {
  const hasNavigator = typeof navigator !== 'undefined';
  const hasShare = hasNavigator && typeof navigator.share === 'function';
  const hasCanShare = hasNavigator && typeof navigator.canShare === 'function';

  const probe = (data) => {
    if (!hasCanShare) return null;
    try {
      return navigator.canShare(data);
    } catch {
      return false;
    }
  };

  return {
    secureContext: typeof window !== 'undefined' && window.isSecureContext,
    hasShare,
    hasCanShare,
    canJson: probe({ files: [new File(['{}'], 't.json', { type: 'application/json' })] }),
    canTxt: probe({ files: [new File(['{}'], 't.txt', { type: 'text/plain' })] }),
    canText: probe({ text: 'test' })
  };
}

/** Kurzfassung des Support-Befunds als kopierbarer Text. */
export function formatShareSupport(s = describeShareSupport()) {
  const ja = (v) => (v === null ? 'n/v' : v ? 'ja' : 'nein');
  return [
    `https: ${ja(s.secureContext)}`,
    `share: ${ja(s.hasShare)}`,
    `canShare: ${ja(s.hasCanShare)}`,
    `.json: ${ja(s.canJson)}`,
    `.txt: ${ja(s.canTxt)}`,
    `text: ${ja(s.canText)}`,
    `browser: ${typeof navigator !== 'undefined' ? navigator.userAgent : '—'}`
  ].join('\n');
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
 * Teilt ein Export-Payload über das native Teilen-Menü.
 *
 * Das Ergebnis ist IMMER eine Datei – entweder über das native Teilen-Menü
 * oder als Download. Bewusst kein Text-Teilen: Geteilter Text lässt sich beim
 * Empfänger nicht öffnen, nur mühsam kopieren.
 *
 * Pro Nutzer-Geste ist nur EIN `navigator.share()`-Aufruf möglich – der erste
 * verbraucht die Geste. Es wird deshalb nie nacheinander probiert; scheitert
 * das native Menü, wird direkt heruntergeladen.
 *
 * Manche Geräte melden beim Datei-Teilen `Permission denied`, obwohl
 * `canShare` true liefert. Das wird gemerkt, damit es beim nächsten Mal ohne
 * Umweg zum Download geht.
 *
 * `payload` muss fertig vorliegen – nicht erst im Klick-Handler laden, sonst
 * verfällt die Geste.
 *
 * Liefert { status } mit 'shared-file' | 'cancelled' | 'downloaded'.
 */
const FILE_SHARE_BLOCKED_KEY = 'packliste:datei-teilen-blockiert';

function fileShareBlocked() {
  try {
    return localStorage.getItem(FILE_SHARE_BLOCKED_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberFileShareBlocked() {
  try {
    localStorage.setItem(FILE_SHARE_BLOCKED_KEY, '1');
  } catch {
    /* ohne localStorage merken wir es uns eben nicht */
  }
}

/** Ersten Kandidaten liefern, den der Browser laut canShare akzeptiert. */
function pickShareableFile(json, filename) {
  if (typeof navigator.canShare !== 'function') return null;
  for (const file of buildShareCandidates(json, filename)) {
    try {
      if (navigator.canShare({ files: [file] })) return file;
    } catch {
      /* nächster Kandidat */
    }
  }
  return null;
}

export async function shareTemplate(payload, filename) {
  const json = JSON.stringify(payload, null, 2);
  const title = payload.template.name;

  // Erst das native Menü mit der Datei versuchen – aber nur, solange dieses
  // Gerät sie nicht schon abgelehnt hat. Scheitert es, wird das gemerkt und
  // ab dann sofort heruntergeladen.
  const nativeMoeglich =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    !fileShareBlocked();

  if (nativeMoeglich) {
    const file = pickShareableFile(json, filename);
    if (file) {
      try {
        await navigator.share({ files: [file], title });
        return { status: 'shared-file' };
      } catch (e) {
        if (e && e.name === 'AbortError') return { status: 'cancelled' };
        rememberFileShareBlocked();
        // Kein zweiter share()-Versuch: Die Geste ist verbraucht, ein weiterer
        // Aufruf scheitert garantiert. Stattdessen direkt die Datei liefern.
      }
    } else {
      rememberFileShareBlocked();
    }
  }

  downloadJson(json, filename);
  return { status: 'downloaded' };
}
