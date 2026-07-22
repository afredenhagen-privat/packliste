# Vorlagen teilen & importieren — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use mindCoder:subagent-driven-development (recommended) or mindCoder:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine einzelne Packlisten-Vorlage lässt sich per nativem Teilen-Menü als JSON exportieren und beim Empfänger mit Vorschau in dessen Bibliothek importieren.

**Architecture:** Ein neues reines Modul `templateShare.js` denormalisiert eine Vorlage zu einem selbst-enthaltenden Payload (Namen statt lokaler IDs, ohne Statistiken) und validiert/analysiert eingehende Payloads. Der Import läuft über eine neue Store-Action `importShared`, die per Name in die Bibliothek re-verlinkt (vorhandene wiederverwenden, fehlende anlegen) und dabei die bestehenden dedupe-fähigen Store-Methoden (`findOrCreateByName`, `categoriesStore.create`, `addItem`) wiederverwendet. UI: ein Teilen-Button in `TemplateDetailView` und ein Import-Picker + Vorschau-Sheet in `SettingsView`.

**Tech Stack:** Vue 3 (script setup), Pinia, Dexie (IndexedDB), Vitest + fake-indexeddb, Web Share API.

---

## File Structure

| Datei | Art | Verantwortung |
|---|---|---|
| `src/db/templateShare.js` | neu | Reine/DB-nahe Funktionen: `buildTemplateExport`, `parseTemplateImport`, `suggestTemplateName`, `analyzeImport`, `slugify`, `buildTemplateFilename`, `shareTemplate` |
| `src/__tests__/templateShare.test.js` | neu | Tests für build/parse/analyze/suggest/slugify + Store-Action `importShared` |
| `src/stores/templatesStore.js` | edit | neue Action `importShared(parsed, finalName)` |
| `src/components/TemplateImportSheet.vue` | neu | Vorschau-Sheet (Name + gruppierte Items + neu/vorhanden-Badges) |
| `src/views/TemplateDetailView.vue` | edit | Teilen-Button im Header |
| `src/views/SettingsView.vue` | edit | Sektion „Vorlagen" + Import-Picker + Sheet-Einbindung + Navigation |

**Anmerkung zur Atomarität:** `importShared` nutzt bewusst die bestehenden Store-Actions (mehrere kleine Transaktionen) statt einer einzigen umschließenden Dexie-Transaktion. Das ist DRY (kein Duplizieren der dedupe-Logik) und für eine lokale Personen-PWA ausreichend robust; ein Teilabbruch ist unwahrscheinlich und über erneuten Import korrigierbar.

---

## Task 1: Export- und Parse-Funktionen (`buildTemplateExport`, `parseTemplateImport`)

**Files:**
- Create: `src/db/templateShare.js`
- Test: `src/__tests__/templateShare.test.js`

- [ ] **Step 1: Failing-Test schreiben**

Create `src/__tests__/templateShare.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { initDatabase, clearAllData, db } from '../db/database.js';
import { useItemsStore } from '../stores/itemsStore.js';
import { useCategoriesStore } from '../stores/categoriesStore.js';
import { useTemplatesStore } from '../stores/templatesStore.js';
import {
  buildTemplateExport,
  parseTemplateImport
} from '../db/templateShare.js';

beforeEach(async () => {
  setActivePinia(createPinia());
  await initDatabase();
  await clearAllData();
});

async function seedTemplate() {
  const cats = useCategoriesStore();
  const items = useItemsStore();
  const templates = useTemplatesStore();
  await cats.load();
  await items.load();
  await templates.load();

  const technik = await cats.create({ name: 'Technik', color: '#3b82f6' });
  const laptop = await items.findOrCreateByName('Laptop', technik.id);
  const kabel = await items.findOrCreateByName('Ladekabel', technik.id);
  const socken = await items.findOrCreateByName('Socken', null);
  const tpl = await templates.create('Geschäftsreise');
  await templates.addItem(tpl.id, laptop.id, 1);
  await templates.addItem(tpl.id, kabel.id, 2);
  await templates.addItem(tpl.id, socken.id, 1);
  return { tpl };
}

describe('buildTemplateExport', () => {
  it('denormalisiert Items und Kategorien ohne lokale IDs oder Statistiken', async () => {
    const { tpl } = await seedTemplate();
    const payload = await buildTemplateExport(tpl.id);

    expect(payload.type).toBe('packliste-template');
    expect(payload.version).toBe(1);
    expect(payload.template).toEqual({ name: 'Geschäftsreise' });
    expect(typeof payload.exportedAt).toBe('string');

    const laptop = payload.items.find((i) => i.name === 'Laptop');
    expect(laptop).toEqual({
      name: 'Laptop',
      quantity: 1,
      category: { name: 'Technik', color: '#3b82f6' }
    });
    const socken = payload.items.find((i) => i.name === 'Socken');
    expect(socken.category).toBeNull();

    // Keine lokalen IDs / Statistiken durchgesickert
    const raw = JSON.stringify(payload);
    expect(raw).not.toContain('usageCount');
    expect(raw).not.toContain('itemId');
    expect(raw).not.toContain('categoryId');
  });

  it('wirft bei unbekannter Vorlage', async () => {
    await expect(buildTemplateExport(999)).rejects.toThrow(/nicht gefunden/);
  });
});

describe('parseTemplateImport', () => {
  const valid = {
    type: 'packliste-template',
    version: 1,
    template: { name: 'Reise' },
    items: [
      { name: 'Laptop', quantity: 2, category: { name: 'Technik', color: '#3b82f6' } },
      { name: 'Socken', quantity: 1, category: null }
    ]
  };

  it('normalisiert ein gültiges Payload', () => {
    const parsed = parseTemplateImport(valid);
    expect(parsed.templateName).toBe('Reise');
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toEqual({
      name: 'Laptop',
      quantity: 2,
      category: { name: 'Technik', color: '#3b82f6' }
    });
    expect(parsed.items[1].category).toBeNull();
  });

  it('erzwingt quantity >= 1', () => {
    const parsed = parseTemplateImport({
      ...valid,
      items: [{ name: 'X', quantity: 0, category: null }]
    });
    expect(parsed.items[0].quantity).toBe(1);
  });

  it('wirft bei falschem type', () => {
    expect(() => parseTemplateImport({ ...valid, type: 'irgendwas' })).toThrow(
      /keine geteilte Packlisten-Vorlage/
    );
  });

  it('wirft bei falscher version', () => {
    expect(() => parseTemplateImport({ ...valid, version: 99 })).toThrow(/Version/);
  });

  it('wirft bei fehlendem Vorlagennamen', () => {
    expect(() =>
      parseTemplateImport({ ...valid, template: { name: '  ' } })
    ).toThrow(/keinen Namen/);
  });

  it('wirft bei fehlender Item-Liste', () => {
    expect(() => parseTemplateImport({ ...valid, items: 'nope' })).toThrow(
      /Item-Liste/
    );
  });

  it('wirft bei Item ohne Namen', () => {
    expect(() =>
      parseTemplateImport({ ...valid, items: [{ name: '', quantity: 1 }] })
    ).toThrow(/Item 1 hat keinen Namen/);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `npx vitest run src/__tests__/templateShare.test.js`
Expected: FAIL — `Failed to resolve import "../db/templateShare.js"`.

- [ ] **Step 3: Minimale Implementierung**

Create `src/db/templateShare.js`:

```js
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
```

Note: `db` muss aus `database.js` re-exportiert werden — es ist bereits `export const db`. Der Test importiert `db` aus `../db/database.js`; das existiert schon.

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/__tests__/templateShare.test.js`
Expected: PASS (alle Tests aus Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/db/templateShare.js src/__tests__/templateShare.test.js
git commit -m "feat: Vorlagen-Export/Parse (build/parse) mit Tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Analyse-, Namens- und Datei-Helfer (`suggestTemplateName`, `analyzeImport`, `slugify`, `buildTemplateFilename`)

**Files:**
- Modify: `src/db/templateShare.js`
- Test: `src/__tests__/templateShare.test.js`

- [ ] **Step 1: Failing-Test schreiben**

An `src/__tests__/templateShare.test.js` **anhängen** (nach den bestehenden describe-Blöcken); Import-Zeile oben ergänzen:

Ersetze die bestehende Import-Zeile
```js
import {
  buildTemplateExport,
  parseTemplateImport
} from '../db/templateShare.js';
```
durch
```js
import {
  buildTemplateExport,
  parseTemplateImport,
  suggestTemplateName,
  analyzeImport,
  slugify,
  buildTemplateFilename
} from '../db/templateShare.js';
```

Am Dateiende anhängen:

```js
describe('suggestTemplateName', () => {
  it('lässt einen freien Namen unverändert', () => {
    expect(suggestTemplateName('Reise', ['Urlaub'])).toBe('Reise');
  });

  it('hängt (2) bei Kollision an (case-insensitiv)', () => {
    expect(suggestTemplateName('Reise', ['reise'])).toBe('Reise (2)');
  });

  it('zählt hoch bis ein freier Name gefunden ist', () => {
    expect(suggestTemplateName('Reise', ['Reise', 'Reise (2)'])).toBe(
      'Reise (3)'
    );
  });
});

describe('slugify / buildTemplateFilename', () => {
  it('slugify ersetzt Umlaute und Sonderzeichen', () => {
    expect(slugify('Geschäftsreise')).toBe('geschaeftsreise');
    expect(slugify('Wochenende / Kurz!')).toBe('wochenende-kurz');
  });

  it('slugify fällt auf "vorlage" zurück wenn leer', () => {
    expect(slugify('   ')).toBe('vorlage');
  });

  it('buildTemplateFilename baut den Dateinamen', () => {
    expect(buildTemplateFilename('Geschäftsreise')).toBe(
      'packliste-vorlage-geschaeftsreise.json'
    );
  });
});

describe('analyzeImport', () => {
  const parsed = {
    templateName: 'Reise',
    items: [
      { name: 'Laptop', quantity: 1, category: { name: 'Technik', color: '#3b82f6' } },
      { name: 'Neu-Item', quantity: 2, category: { name: 'Neu-Cat', color: '#111111' } },
      { name: 'Socken', quantity: 1, category: null }
    ]
  };

  it('markiert vorhandene vs. neue Items und Kategorien und schlägt einen Namen vor', () => {
    const analysis = analyzeImport(parsed, {
      items: [{ name: 'Laptop' }, { name: 'Socken' }],
      categories: [{ name: 'Technik' }],
      templateNames: ['Reise']
    });

    expect(analysis.suggestedName).toBe('Reise (2)');

    const laptop = analysis.items.find((i) => i.name === 'Laptop');
    expect(laptop.itemExists).toBe(true);
    expect(laptop.categoryExists).toBe(true);
    expect(laptop.categoryName).toBe('Technik');

    const neu = analysis.items.find((i) => i.name === 'Neu-Item');
    expect(neu.itemExists).toBe(false);
    expect(neu.categoryExists).toBe(false);

    const socken = analysis.items.find((i) => i.name === 'Socken');
    expect(socken.categoryName).toBeNull();
    // Items ohne Kategorie gelten nicht als "neue Kategorie"
    expect(socken.categoryExists).toBe(true);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `npx vitest run src/__tests__/templateShare.test.js`
Expected: FAIL — `suggestTemplateName is not a function` (bzw. Import-Fehler für die neuen Exporte).

- [ ] **Step 3: Minimale Implementierung**

An `src/db/templateShare.js` **anhängen**:

```js
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
```

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/__tests__/templateShare.test.js`
Expected: PASS (alle Tests aus Task 1 + 2).

- [ ] **Step 5: Commit**

```bash
git add src/db/templateShare.js src/__tests__/templateShare.test.js
git commit -m "feat: Import-Analyse + Datei-/Namens-Helfer mit Tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `shareTemplate` (Web Share API + Download-Fallback)

**Files:**
- Modify: `src/db/templateShare.js`

Diese Funktion kapselt die Browser-Share-API und hat einen Download-Fallback. Der navigator-Zweig ist nicht sinnvoll unit-testbar (jsdom/happy-dom ohne echte Share-API); Verifikation erfolgt im späteren Build + manueller Test. Deshalb hier kein neuer Vitest-Test, sondern nur die Implementierung + ein Build-/Lint-Durchlauf.

- [ ] **Step 1: Implementierung anhängen**

An `src/db/templateShare.js` **anhängen**:

```js
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
 * Teilt ein Export-Payload via Web Share API (als .json-Datei).
 * Fällt auf Datei-Download zurück, wenn Sharing nicht verfügbar ist
 * oder der Nutzer nicht abbricht. Liefert 'shared' | 'cancelled' | 'downloaded'.
 */
export async function shareTemplate(payload, filename) {
  const json = JSON.stringify(payload, null, 2);
  const file = new File([json], filename, { type: 'application/json' });

  if (
    typeof navigator !== 'undefined' &&
    navigator.canShare &&
    navigator.canShare({ files: [file] }) &&
    navigator.share
  ) {
    try {
      await navigator.share({ files: [file], title: payload.template.name });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      // sonst: auf Download zurückfallen
    }
  }

  downloadJson(json, filename);
  return 'downloaded';
}
```

- [ ] **Step 2: Bestehende Tests weiterhin grün**

Run: `npx vitest run src/__tests__/templateShare.test.js`
Expected: PASS (unverändert – neue Funktion wird von Tests nicht berührt).

- [ ] **Step 3: Commit**

```bash
git add src/db/templateShare.js
git commit -m "feat: shareTemplate via Web Share API mit Download-Fallback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Store-Action `importShared`

**Files:**
- Modify: `src/stores/templatesStore.js`
- Test: `src/__tests__/templateShare.test.js`

- [ ] **Step 1: Failing-Test schreiben**

An `src/__tests__/templateShare.test.js` am Dateiende **anhängen**:

```js
import { parseTemplateImport as parse2 } from '../db/templateShare.js';

describe('templatesStore.importShared', () => {
  const payload = {
    type: 'packliste-template',
    version: 1,
    template: { name: 'Geschäftsreise' },
    items: [
      { name: 'Laptop', quantity: 1, category: { name: 'Technik', color: '#3b82f6' } },
      { name: 'Ladekabel', quantity: 2, category: { name: 'Technik', color: '#3b82f6' } },
      { name: 'Socken', quantity: 1, category: null }
    ]
  };

  it('legt eine neue Vorlage an und verlinkt Items/Kategorien per Name', async () => {
    const items = useItemsStore();
    const cats = useCategoriesStore();
    const templates = useTemplatesStore();
    await items.load();
    await cats.load();
    await templates.load();

    const parsed = parse2(payload);
    const tpl = await templates.importShared(parsed, 'Geschäftsreise');

    // Vorlage + Items da
    expect(templates.byId(tpl.id).name).toBe('Geschäftsreise');
    const tItems = templates.itemsFor(tpl.id);
    expect(tItems).toHaveLength(3);
    const kabel = tItems.find(
      (ti) => items.byId(ti.itemId).name === 'Ladekabel'
    );
    expect(kabel.quantity).toBe(2);

    // Kategorie "Technik" wurde angelegt
    expect(cats.categories.some((c) => c.name === 'Technik')).toBe(true);
    // Neu angelegtes Item bekommt die geteilte Kategorie
    const laptop = items.items.find((i) => i.name === 'Laptop');
    expect(cats.byId(laptop.categoryId).name).toBe('Technik');
  });

  it('verwendet vorhandene Items wieder und lässt deren Kategorie unangetastet', async () => {
    const items = useItemsStore();
    const cats = useCategoriesStore();
    const templates = useTemplatesStore();
    await items.load();
    await cats.load();
    await templates.load();

    // Empfänger hat "Laptop" bereits in eigener Kategorie "Arbeit"
    const arbeit = await cats.create({ name: 'Arbeit', color: '#999999' });
    const existingLaptop = await items.findOrCreateByName('Laptop', arbeit.id);

    const parsed = parse2(payload);
    const tpl = await templates.importShared(parsed, 'Geschäftsreise');

    // "Laptop" wurde NICHT dupliziert
    expect(items.items.filter((i) => i.name === 'Laptop')).toHaveLength(1);
    // Kategorie des Empfängers bleibt "Arbeit"
    expect(items.byId(existingLaptop.id).categoryId).toBe(arbeit.id);
    // Vorlage referenziert genau dieses Item
    const tItems = templates.itemsFor(tpl.id);
    expect(tItems.some((ti) => ti.itemId === existingLaptop.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag verifizieren**

Run: `npx vitest run src/__tests__/templateShare.test.js`
Expected: FAIL — `templates.importShared is not a function`.

- [ ] **Step 3: Implementierung**

In `src/stores/templatesStore.js`:

Import oben ergänzen (unter dem bestehenden `useItemsStore`-Import):

```js
import { useCategoriesStore } from './categoriesStore.js';
```

Neue Action **innerhalb** des `actions: { … }`-Objekts hinzufügen, direkt nach `removeItem` (vor der schließenden `}` von `actions`), mit vorangestelltem Komma an `removeItem` falls nötig:

```js
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
```

Hinweis: Falls `removeItem` aktuell die letzte Action ohne folgendes Komma ist, ein Komma nach dessen schließender `}` setzen, bevor `importShared` folgt.

- [ ] **Step 4: Test ausführen, Erfolg verifizieren**

Run: `npx vitest run src/__tests__/templateShare.test.js`
Expected: PASS (alle Tests inkl. `importShared`).

- [ ] **Step 5: Commit**

```bash
git add src/stores/templatesStore.js src/__tests__/templateShare.test.js
git commit -m "feat: templatesStore.importShared – geteilte Vorlage importieren

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Vorschau-Sheet `TemplateImportSheet.vue`

**Files:**
- Create: `src/components/TemplateImportSheet.vue`

Kein Unit-Test (konsistent mit den bestehenden Sheets, die keine Tests haben); Verifikation via Build + manueller Test. Das Sheet ist „dumm": es bekommt die fertige `analysis` als Prop und emittiert bei Bestätigung.

- [ ] **Step 1: Komponente erstellen**

Create `src/components/TemplateImportSheet.vue`:

```vue
<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      @click.self="close"
    >
      <div
        class="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-white p-4 shadow-xl dark:bg-slate-900 sm:rounded-2xl"
        style="padding-bottom: max(1rem, env(safe-area-inset-bottom))"
      >
        <h2 class="mb-1 text-lg font-semibold">Vorlage importieren</h2>
        <p class="mb-3 text-sm text-slate-500">
          Wird als neue Vorlage <strong>„{{ analysis?.suggestedName }}"</strong> angelegt.
        </p>

        <div v-if="!analysis" class="card text-center text-sm text-slate-500">
          Keine Daten.
        </div>

        <div v-else class="flex-1 space-y-4 overflow-y-auto">
          <section v-for="group in grouped" :key="group.key">
            <h3 class="mb-1 flex items-center gap-2 px-1 text-sm font-semibold text-slate-500">
              <span
                v-if="group.color"
                class="inline-block h-3 w-3 rounded-full ring-1 ring-black/10"
                :style="{ backgroundColor: group.color }"
              />
              {{ group.name }}
            </h3>
            <ul class="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
              <li
                v-for="it in group.items"
                :key="it.name"
                class="flex items-center gap-2 p-3"
              >
                <span class="flex-1">
                  {{ it.name }}
                  <span v-if="it.quantity > 1" class="text-slate-400">× {{ it.quantity }}</span>
                </span>
                <span
                  class="rounded-full px-2 py-0.5 text-xs"
                  :class="it.itemExists
                    ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'"
                >
                  {{ it.itemExists ? 'vorhanden' : 'neu' }}
                </span>
              </li>
            </ul>
          </section>
        </div>

        <div class="flex justify-end gap-2 pt-3">
          <button type="button" class="btn-secondary" @click="close">Abbrechen</button>
          <button
            type="button"
            class="btn-primary"
            :disabled="!analysis"
            @click="confirm"
          >Importieren</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  analysis: { type: Object, default: null }
});
const emit = defineEmits(['update:modelValue', 'confirm']);

const grouped = computed(() => {
  if (!props.analysis) return [];
  const map = new Map();
  for (const it of props.analysis.items) {
    const key = it.categoryName ?? '__none__';
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: it.categoryName ?? 'Ohne Kategorie',
        color: it.categoryColor,
        items: []
      });
    }
    map.get(key).items.push(it);
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === '__none__') return 1;
    if (b.key === '__none__') return -1;
    return a.name.localeCompare(b.name, 'de');
  });
});

function close() {
  emit('update:modelValue', false);
}

function confirm() {
  emit('confirm');
}
</script>
```

- [ ] **Step 2: Build verifizieren (Komponente kompiliert)**

Run: `npm run build`
Expected: Build erfolgreich, keine Vue-Compile-Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/TemplateImportSheet.vue
git commit -m "feat: TemplateImportSheet – Vorschau vor Vorlagen-Import

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Teilen-Button in `TemplateDetailView.vue`

**Files:**
- Modify: `src/views/TemplateDetailView.vue`

- [ ] **Step 1: Teilen-Button + Handler ergänzen**

In `src/views/TemplateDetailView.vue` den Header-Button-Bereich ersetzen. Aktuell:

```html
      <button type="button" class="btn-primary" @click="pickerOpen = true">+ Item</button>
```

ersetzen durch:

```html
      <div class="flex shrink-0 items-center gap-2">
        <button
          v-if="template"
          type="button"
          class="btn-secondary"
          aria-label="Vorlage teilen"
          @click="onShare"
        >📤 Teilen</button>
        <button type="button" class="btn-primary" @click="pickerOpen = true">+ Item</button>
      </div>
```

Im `<script setup>` den Import ergänzen (bei den bestehenden Imports):

```js
import { buildTemplateExport, buildTemplateFilename, shareTemplate } from '../db/templateShare.js';
```

Und eine Handler-Funktion hinzufügen (z. B. nach `removeItem`):

```js
async function onShare() {
  if (!template.value) return;
  try {
    const payload = await buildTemplateExport(template.value.id);
    const filename = buildTemplateFilename(template.value.name);
    await shareTemplate(payload, filename);
  } catch (e) {
    window.alert(`Teilen fehlgeschlagen: ${e.message}`);
  }
}
```

- [ ] **Step 2: Build verifizieren**

Run: `npm run build`
Expected: Build erfolgreich.

- [ ] **Step 3: Manueller Smoke-Test (optional, wenn Dev-Server läuft)**

Run: `npm run dev`, Vorlage öffnen, „📤 Teilen" antippen.
Expected (Desktop): JSON-Datei `packliste-vorlage-<slug>.json` wird heruntergeladen.

- [ ] **Step 4: Commit**

```bash
git add src/views/TemplateDetailView.vue
git commit -m "feat: Teilen-Button in der Vorlagen-Detailansicht

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Import-Einstieg in `SettingsView.vue`

**Files:**
- Modify: `src/views/SettingsView.vue`

- [ ] **Step 1: UI-Sektion „Vorlagen" ergänzen**

In `src/views/SettingsView.vue` **vor** der `<!-- Info -->`-Sektion (also nach der `<!-- Daten -->`-Section) einfügen:

```html
    <!-- Vorlagen -->
    <section class="card space-y-3">
      <h2 class="text-lg font-semibold">Vorlagen</h2>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        Eine geteilte Vorlage importieren. Items und Kategorien werden per Name in
        deine Bibliothek eingefügt – nichts wird überschrieben.
      </p>
      <button type="button" class="btn-secondary" @click="$refs.templateInput.click()">
        📥 Vorlage importieren
      </button>
      <input
        ref="templateInput"
        type="file"
        accept="application/json,.json"
        class="hidden"
        @change="onTemplateFile"
      />
    </section>
```

Ganz am Ende des `<template>` (vor dem schließenden `</div>` der Root-`div`) das Sheet einbinden:

```html
    <TemplateImportSheet
      v-model="importSheetOpen"
      :analysis="importAnalysis"
      @confirm="confirmTemplateImport"
    />
```

- [ ] **Step 2: Script-Logik ergänzen**

Im `<script setup>` von `SettingsView.vue`:

Imports ergänzen:

```js
import { useRouter } from 'vue-router';
import TemplateImportSheet from '../components/TemplateImportSheet.vue';
import {
  parseTemplateImport,
  analyzeImport
} from '../db/templateShare.js';
```

Nach den bestehenden `const …Store = use…Store()`-Zeilen ergänzen:

```js
const router = useRouter();

const importSheetOpen = ref(false);
const importAnalysis = ref(null);
const importParsed = ref(null);
```

Handler-Funktionen hinzufügen (z. B. nach `onImport`):

```js
async function onTemplateFile(event) {
  const file = event.target.files?.[0];
  event.target.value = ''; // reset, damit dieselbe Datei erneut wählbar ist
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const parsed = parseTemplateImport(payload);

    // Stores sicherstellen (Settings lädt sonst nur categoriesStore)
    if (!itemsStore.loaded) await itemsStore.load();
    if (!templatesStore.loaded) await templatesStore.load();
    if (!categoriesStore.loaded) await categoriesStore.load();

    importParsed.value = parsed;
    importAnalysis.value = analyzeImport(parsed, {
      items: itemsStore.items,
      categories: categoriesStore.categories,
      templateNames: templatesStore.templates.map((t) => t.name)
    });
    importSheetOpen.value = true;
  } catch (e) {
    setStatus(`Import fehlgeschlagen: ${e.message}`, true);
  }
}

async function confirmTemplateImport() {
  try {
    const tpl = await templatesStore.importShared(
      importParsed.value,
      importAnalysis.value.suggestedName
    );
    // Stores neu laden, damit neue Items/Kategorien überall sichtbar sind
    await Promise.all([itemsStore.load(), categoriesStore.load()]);
    importSheetOpen.value = false;
    importParsed.value = null;
    importAnalysis.value = null;
    router.push({ name: 'template-detail', params: { id: tpl.id } });
  } catch (e) {
    setStatus(`Import fehlgeschlagen: ${e.message}`, true);
    importSheetOpen.value = false;
  }
}
```

Hinweis: `itemsStore`, `templatesStore`, `categoriesStore` und `setStatus`/`ref` sind in `SettingsView.vue` bereits vorhanden bzw. importiert.

- [ ] **Step 3: Build verifizieren**

Run: `npm run build`
Expected: Build erfolgreich.

- [ ] **Step 4: Commit**

```bash
git add src/views/SettingsView.vue
git commit -m "feat: Vorlagen-Import mit Vorschau in den Einstellungen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Abschluss — volle Test-Suite + Build

**Files:** keine

- [ ] **Step 1: Komplette Test-Suite**

Run: `npm test`
Expected: Alle Tests PASS (bestehende + neue in `templateShare.test.js`).

- [ ] **Step 2: Produktions-Build**

Run: `npm run build`
Expected: Build ohne Fehler.

- [ ] **Step 3: End-to-End-Smoke-Test (manuell)**

Run: `npm run dev`
1. Vorlage öffnen → „📤 Teilen" → Datei wird heruntergeladen (Desktop) bzw. Teilen-Menü (Mobil).
2. Einstellungen → „📥 Vorlage importieren" → heruntergeladene Datei wählen.
3. Vorschau erscheint mit Name-Vorschlag und neu/vorhanden-Badges.
4. „Importieren" → landet in der neuen Vorlagen-Detailansicht; Items sind vorhanden.

- [ ] **Step 4: Kein Commit nötig** (reiner Verifikationsschritt).

---

## Self-Review-Notiz

- **Spec-Abdeckung:** Format (T1), Export/Share (T3/T6), Import-Vorschau (T5/T7), Re-Verlinkung inkl. „Empfänger-Kategorie bleibt" (T4), Namens-Suffix (T2/T4/T7), getrennter Import-Einstieg (T7), Tests (T1/T2/T4). Web Share Target + Trip-/Library-Sharing bewusst ausgelassen (YAGNI).
- **Typkonsistenz:** `buildTemplateExport`, `parseTemplateImport`, `analyzeImport(parsed,{items,categories,templateNames})`, `suggestTemplateName`, `slugify`, `buildTemplateFilename`, `shareTemplate`, `templatesStore.importShared(parsed, finalName)`, Sheet-Prop `analysis` mit Feldern `suggestedName` + `items[].{name,quantity,categoryName,categoryColor,itemExists,categoryExists}` — über alle Tasks identisch verwendet.
