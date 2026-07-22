# Vorlagen teilen & importieren — Design

**Datum:** 2026-07-21
**Status:** Freigegeben (Brainstorming)

## Ziel

Nutzer sollen eine Packlisten-**Vorlage exportieren und teilen** können (WhatsApp,
Mail, AirDrop …), und ein Empfänger sie in seine eigene App **importieren** können.
Kernproblem: Vorlagen referenzieren Items und Kategorien nur über **lokale
Auto-Increment-IDs**, die auf einem anderen Gerät bedeutungslos sind. Der Austausch
muss deshalb selbst-enthaltend (denormalisiert) sein und beim Import per **Name**
wieder in die Bibliothek des Empfängers eingehängt werden.

## Getroffene Entscheidungen

- **Transportweg:** Native Share (Web Share API mit Datei), Fallback = JSON-Download.
- **Import-Flow:** Vorschau + Bestätigen (Sheet), nicht direkt schlucken.
- **Namenskonflikt:** Import legt **immer eine neue Vorlage** an; bei gleichem Namen
  automatisch mit Suffix `… (2)`, `… (3)` …

## 1. Austauschformat

Selbst-enthaltend, keine lokalen IDs, keine persönlichen Statistiken.

```json
{
  "type": "packliste-template",
  "version": 1,
  "exportedAt": "2026-07-21T10:00:00.000Z",
  "template": { "name": "Geschäftsreise" },
  "items": [
    { "name": "Laptop",    "quantity": 1, "category": { "name": "Technik", "color": "#3b82f6" } },
    { "name": "Ladekabel", "quantity": 2, "category": null }
  ]
}
```

- `usageCount` / `lastUsedAt` werden **nicht** exportiert (privat, für Empfänger falsch).
- `category: null` = Item ohne Kategorie.
- `type` und `version` dienen der Validierung beim Import.

## 2. Export (Teilen)

- **Teilen-Icon-Button** im Header der `TemplateDetailView`, neben „+ Item".
- Baut das Payload → `navigator.share({ files: [File] })` → natives Teilen-Menü.
- **Fallback** (kein `navigator.share`, z. B. Desktop): stiller `.json`-Download
  (gleiches Muster wie `backup.js` → `downloadBackup`).
- Dateiname: `packliste-vorlage-<slug>.json` (Name slugifiziert, z. B.
  `packliste-vorlage-geschaeftsreise.json`).

## 3. Import (Vorschau + Bestätigen)

- **Eigener Einstieg** in `SettingsView`, neue Sektion „Vorlagen", **getrennt** vom
  destruktiven Backup-Import (der alle Daten überschreibt). Datei-Picker mit
  `accept="application/json,.json"`.
- Ablauf: Datei lesen → `parseTemplateImport` (validieren) → `TemplateImportSheet`
  öffnet sich (Bottom-Sheet im Stil von `TemplateSyncSheet`):
  - Vorlagenname (bereits mit Konflikt-Suffix vorbelegt).
  - Items nach Kategorie gruppiert, jeweils Badge **„neu"** (kommt neu in die
    Bibliothek) oder **„vorhanden"**.
- Button **„Importieren"** → `templatesStore.importShared` → Navigation zur neuen Vorlage.
- Fehlerfälle (falsches Format, kaputtes JSON) → Statusmeldung, kein Sheet.

## 4. Re-Verlinkung beim Import (Kernlogik)

Pro Item, per Name gematcht (case-insensitiv, wie `findOrCreateByName`):

1. **Kategorie:** existiert (Name) → wiederverwenden; sonst mit mitgeliefertem
   Namen + Farbe neu anlegen. `category: null` → Item bleibt ohne Kategorie.
2. **Item existiert** (Name) → wiederverwenden; die **Kategorie-Zuordnung des
   Empfängers bleibt unangetastet** (seine Bibliothek gewinnt).
3. **Item fehlt** → neu anlegen mit der in Schritt 1 aufgelösten `categoryId`.
4. Template anlegen (Name = `finalName` aus der Vorschau) und `template_items` mit
   `quantity` und den **lokalen** Item-IDs des Empfängers aufbauen — alles in einer
   Dexie-Transaktion.

`usageCount` der wiederverwendeten/neuen Items wird über den bestehenden
`addItem`-Pfad hochgezählt (konsistent zum normalen Hinzufügen).

## 5. Neue / geänderte Dateien

| Datei | Art | Inhalt |
|---|---|---|
| `src/db/templateShare.js` | neu | Reine Funktionen: `buildTemplateExport(id)`, `parseTemplateImport(payload)`, `analyzeImport(parsed, { items, categories })`, `shareTemplate(payload, filename)`, `buildTemplateFilename(name)`, `slugify(name)` |
| `src/components/TemplateImportSheet.vue` | neu | Vorschau-Sheet (Name + gruppierte Items + neu/vorhanden-Badges) |
| `src/stores/templatesStore.js` | edit | neue Action `importShared(parsed, finalName)` |
| `src/views/TemplateDetailView.vue` | edit | Teilen-Button im Header |
| `src/views/SettingsView.vue` | edit | Sektion „Vorlagen" + Import-Picker + Sheet-Einbindung |
| `src/__tests__/templateShare.test.js` | neu | Tests |

### Modul-Verantwortlichkeiten (`templateShare.js`)

- `buildTemplateExport(templateId)` → liest Template + `template_items` + `items` +
  `categories` aus der DB (Muster wie `exportBackup`), denormalisiert zum Payload.
- `parseTemplateImport(payload)` → prüft `type === 'packliste-template'`,
  `version === 1`, Struktur (`template.name`, `items[]` mit `name`/`quantity`).
  Wirft nutzerfreundliche Fehler. Liefert normalisiertes
  `{ templateName, items: [{ name, quantity, category }] }`.
- `analyzeImport(parsed, { items, categories })` → **rein**, ohne Schreiben. Liefert
  pro Item `{ name, quantity, categoryName, categoryColor, itemExists, categoryExists }`
  plus den kollisionsfreien Vorlagennamen. Speist die Vorschau.
- `shareTemplate(payload, filename)` → `navigator.share` mit `File`, Fallback Download.
- `slugify(name)` → dateiname-tauglicher Slug.

## 6. Tests

- **`build`**: denormalisiert korrekt, enthält keine IDs / keine Stats, `category:null`
  für Items ohne Kategorie.
- **`parse`**: Validierungsfehler bei falschem `type`, falscher `version`, fehlenden
  Feldern, kaputter Struktur.
- **`analyzeImport`**: neu-vs-vorhanden-Erkennung für Items und Kategorien,
  Namens-Suffixierung bei Kollision.
- **`importShared`** gegen `fake-indexeddb` (wie `stores.test.js`): existierende Items
  werden wiederverwendet und behalten ihre Kategorie; fehlende werden angelegt;
  `template_items` bekommen die richtigen lokalen IDs und Mengen.

## Bewusst weggelassen (YAGNI)

- **Web Share Target** (App erscheint selbst als Ziel im Teilen-Menü, Datei direkt
  öffnen) — braucht Manifest-Änderung + Service-Worker-Handling. Für v1 reicht
  „Datei in den Einstellungen picken". Möglicher späterer Ausbau.
- Kein Teilen ganzer Bibliotheken oder konkreter Trips — nur einzelne Vorlagen.
- Kein Überschreiben bestehender Vorlagen (Entscheidung: immer neu anlegen).
