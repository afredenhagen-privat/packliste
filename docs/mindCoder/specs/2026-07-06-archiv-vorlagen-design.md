# Design: Archiv + Vorlagen-Features für Packliste

Datum: 2026-07-06
Status: Entwurf (freigegeben durch User im Brainstorming)

## Ziel

Drei Erweiterungen der Packliste-App:

1. **Archivfunktion** für Reisen mit automatischer Archivierung nach 30 Tagen.
2. **Vorlage aus Reise erstellen**.
3. **Vorlagenabgleich** – feldspezifisch entscheiden, welche Unterschiede einer
   Reise in ihre Quell-Vorlage übernommen werden.

Stack unverändert: Vue 3 + Pinia + Dexie (IndexedDB), JavaScript-only, TDD mit Vitest.

## 1. Datenmodell (Dexie)

Reisen (`trips`) erhalten **drei neue, nicht-indexierte Felder**. Da es sich um freie
Properties handelt (nicht Teil des `stores()`-Index-Schemas), ist **keine Dexie-Versions-
Migration nötig**. Bestehende Reisen ohne diese Felder werden über Defaults behandelt.

| Feld | Typ | Default (fehlend) | Bedeutung |
|---|---|---|---|
| `travelDate` | ISO-Date-String \| null | `null` | Optionales Reisedatum (Enddatum). Leer → Fallback auf `createdAt`. |
| `archivedAt` | ISO-String \| null | `null` (aktiv) | Gesetzt = archiviert, `null` = aktiv. |
| `keepActive` | boolean | `false` | `true`, sobald der User manuell reaktiviert → Auto-Archiv fasst die Reise nicht mehr an. |

`db/backup.js` exportiert/importiert ganze Tabellenobjekte → neue Felder wandern
automatisch mit. Verifikation: bestehende `backup.test.js` deckt Roundtrip ab.

## 2. Archivierung

**Referenzdatum** einer Reise = `travelDate ?? createdAt`.

**Auto-Archiv** läuft einmalig innerhalb `tripsStore.load()`, nachdem die Trips geladen
sind. Für jede Reise gilt: wenn
`archivedAt == null` **und** `keepActive !== true` **und** Referenzdatum älter als
30 Tage (bezogen auf `now`), dann `archivedAt = now` und in DB persistieren.

- Schwelle: `referenceDate < now - 30 Tage`. Genau 30 Tage = noch aktiv.
- Batch-Persistenz: geänderte Trips in einem `db.transaction('rw', ...)` schreiben.

**Manuelle Aktionen** (Store-Actions):
- `archive(tripId)`: `archivedAt = now`. (`keepActive` bleibt unverändert.)
- `reactivate(tripId)`: `archivedAt = null`, `keepActive = true`.

**Getter:**
- `activeTrips`: alle mit `archivedAt == null`.
- `archivedTrips`: alle mit `archivedAt != null`.

**UI (`TripsView.vue`):**
- Umschalter „Archiv anzeigen" (Toggle) im Header. Standard: aus → nur aktive Reisen.
- Toggle an → zusätzlich Abschnitt mit archivierten Reisen, optisch ausgegraut, mit
  Aktion „Reaktivieren".
- Aktive Reisen erhalten neben 🗑 eine Aktion „Archivieren".
- Neu-Dialog: zusätzliches optionales Feld „Reisedatum" (`<input type="date">`).

**UI (`TripDetailView.vue`):**
- `travelDate` editierbar (optionales Datumsfeld), speichert via neue Action
  `setTravelDate(tripId, dateOrNull)`.

## 3. Vorlage aus Reise erstellen

- Aktion in `TripDetailView.vue`: „Als Vorlage speichern".
- Dialog fragt Namen ab (vorbelegt mit Reisename).
- Neue Action (in `templatesStore` oder `tripsStore`, siehe Plan):
  `createTemplateFromTrip(tripId, name)`:
  1. Neue Vorlage anlegen (`templates.add`).
  2. Alle `trip_items` der Reise als `template_items` kopieren (itemId + quantity).
     `checked` wird ignoriert.
- Verfügbar für **jede** Reise (auch leer angelegte, ohne `templateId`).
- Die Reise wird dabei **nicht** neu verknüpft (bestehende `templateId` bleibt wie sie ist).

## 4. Vorlagenabgleich

- **Verfügbarkeit**: nur für Reisen mit gesetzter `templateId` (Quell-Vorlage). Bei
  leeren Reisen ist die Aktion ausgeblendet.
- **Vergleich** auf Item-Zugehörigkeit (keine Mengen-Abweichungen):
  - **Hinzugefügt**: `itemId` in Reise, nicht in Vorlage → Vorschlag „in Vorlage übernehmen" (add).
  - **Entfernt**: `itemId` in Vorlage, nicht in Reise → Vorschlag „aus Vorlage entfernen" (remove).
- **Diff-Berechnung** als reine Funktion/Getter: liefert
  `{ added: [{itemId}], removed: [{itemId, templateItemId}] }`.
- **UI** (Sheet analog `ItemPickerSheet`): zwei Abschnitte „Hinzugefügt" / „Entfernt",
  jede Zeile mit Item-Name (+ Kategorie) und Checkbox.
  - Checkboxen initial **alle offen** (bewusste Entscheidung pro Feld).
  - Button „Übernehmen" wendet nur angehakte Änderungen auf die Vorlage an
    (via bestehende `templatesStore.addItem` / `removeItem`).
  - Keine Unterschiede → Hinweis „Vorlage ist aktuell".

## 5. Tests (TDD, Vitest)

Erweiterung von `src/__tests__/stores.test.js`:

- Auto-Archiv: Reise mit Referenzdatum > 30 Tage → wird beim `load()` archiviert;
  genau 30 Tage / jünger → bleibt aktiv.
- `travelDate` hat Vorrang vor `createdAt` als Referenzdatum.
- `keepActive`-Vorrang: reaktivierte alte Reise wird bei erneutem `load()` **nicht**
  wieder auto-archiviert.
- `archive` / `reactivate` setzen Felder korrekt; Getter `activeTrips`/`archivedTrips`.
- `createTemplateFromTrip`: kopiert Items+Mengen, ignoriert `checked`, funktioniert auch
  ohne `templateId`.
- Diff-Berechnung: korrektes added/removed bei bekannten Fixtures.
- Selektives Anwenden: nur angehakte Änderungen landen in der Vorlage.

## 6. Betroffene Dateien (Überblick)

- `src/stores/tripsStore.js` – neue Felder, Auto-Archiv, archive/reactivate,
  setTravelDate, createTemplateFromTrip, Diff-Getter, active/archived Getter.
- `src/stores/templatesStore.js` – ggf. Hilfsaction für Abgleich-Anwendung (nutzt
  bestehende add/removeItem).
- `src/views/TripsView.vue` – Archiv-Toggle, Archivieren/Reaktivieren, Reisedatum im Neu-Dialog.
- `src/views/TripDetailView.vue` – Reisedatum editierbar, „Als Vorlage speichern", „Vorlagenabgleich".
- Neue Komponente(n): `TemplateSyncSheet.vue` (Abgleich), evtl. kleiner Save-as-Template-Dialog.
- `src/__tests__/stores.test.js` – neue Tests.

## Nicht im Scope (YAGNI)

- Mengen-Abweichungen im Abgleich.
- Abgleich gegen beliebige (nicht die Quell-)Vorlage.
- Von-/Bis-Datumsbereich (nur ein optionales Enddatum).
- Automatisches Löschen archivierter Reisen.
