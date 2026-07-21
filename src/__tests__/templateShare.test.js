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
