import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { initDatabase, clearAllData, db } from '../db/database.js';
import { useItemsStore } from '../stores/itemsStore.js';
import { useCategoriesStore } from '../stores/categoriesStore.js';
import { useTemplatesStore } from '../stores/templatesStore.js';
import {
  buildTemplateExport,
  parseTemplateImport,
  suggestTemplateName,
  analyzeImport,
  slugify,
  buildTemplateFilename
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
    expect(socken.categoryExists).toBe(true);
  });
});

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

    expect(templates.byId(tpl.id).name).toBe('Geschäftsreise');
    const tItems = templates.itemsFor(tpl.id);
    expect(tItems).toHaveLength(3);
    const kabel = tItems.find(
      (ti) => items.byId(ti.itemId).name === 'Ladekabel'
    );
    expect(kabel.quantity).toBe(2);

    expect(cats.categories.some((c) => c.name === 'Technik')).toBe(true);
    const laptop = items.items.find((i) => i.name === 'Laptop');
    expect(cats.byId(laptop.categoryId).name).toBe('Technik');

    const socken = items.items.find((i) => i.name === 'Socken');
    expect(socken.categoryId).toBeNull();
  });

  it('verwendet vorhandene Items wieder und lässt deren Kategorie unangetastet', async () => {
    const items = useItemsStore();
    const cats = useCategoriesStore();
    const templates = useTemplatesStore();
    await items.load();
    await cats.load();
    await templates.load();

    const arbeit = await cats.create({ name: 'Arbeit', color: '#999999' });
    const existingLaptop = await items.findOrCreateByName('Laptop', arbeit.id);

    const parsed = parse2(payload);
    const tpl = await templates.importShared(parsed, 'Geschäftsreise');

    expect(items.items.filter((i) => i.name === 'Laptop')).toHaveLength(1);
    expect(items.byId(existingLaptop.id).categoryId).toBe(arbeit.id);
    const tItems = templates.itemsFor(tpl.id);
    expect(tItems.some((ti) => ti.itemId === existingLaptop.id)).toBe(true);
  });
});

describe('buildShareCandidates', () => {
  it('bietet .json zuerst und .txt als Fallback für Android-Chrome an', async () => {
    const { buildShareCandidates } = await import('../db/templateShare.js');
    const files = buildShareCandidates('{"a":1}', 'packliste-vorlage-reise.json');

    expect(files).toHaveLength(2);
    expect(files[0].name).toBe('packliste-vorlage-reise.json');
    expect(files[0].type).toBe('application/json');
    expect(files[1].name).toBe('packliste-vorlage-reise.txt');
    expect(files[1].type).toBe('text/plain');
  });

  it('beide Kandidaten tragen denselben Inhalt', async () => {
    const { buildShareCandidates } = await import('../db/templateShare.js');
    const json = '{"type":"packliste-template"}';
    const files = buildShareCandidates(json, 'x.json');
    expect(await files[0].text()).toBe(json);
    expect(await files[1].text()).toBe(json);
  });
});

describe('extractTemplateJson', () => {
  const json = '{"type":"packliste-template","version":1}';

  it('nimmt puren JSON-Text unveraendert', async () => {
    const { extractTemplateJson } = await import('../db/templateShare.js');
    expect(extractTemplateJson(json)).toBe(json);
  });

  it('schneidet aus einer WhatsApp-Nachricht mit Zitat und Absender heraus', async () => {
    const { extractTemplateJson } = await import('../db/templateShare.js');
    const nachricht = `Adrian: "Geschäftsreise"\n${json}\n– gesendet via Packliste`;
    expect(extractTemplateJson(nachricht)).toBe(json);
  });

  it('wirft bei Text ohne Vorlage', async () => {
    const { extractTemplateJson } = await import('../db/templateShare.js');
    expect(() => extractTemplateJson('nur ein Gruss')).toThrow(/keine Vorlage/);
  });

  it('wirft bei leerem Text', async () => {
    const { extractTemplateJson } = await import('../db/templateShare.js');
    expect(() => extractTemplateJson('   ')).toThrow(/Kein Text/);
  });
});
