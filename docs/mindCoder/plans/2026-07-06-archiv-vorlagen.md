# Archiv + Vorlagen-Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use mindCoder:subagent-driven-development (recommended) or mindCoder:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reisen automatisch nach 30 Tagen archivieren (plus manuell archivieren/reaktivieren), aus einer Reise eine neue Vorlage erstellen, und eine Reise feldspezifisch gegen ihre Quell-Vorlage abgleichen.

**Architecture:** Kern-Logik im `tripsStore` (Pinia): drei neue nicht-indexierte Trip-Felder (`travelDate`, `archivedAt`, `keepActive`), eine reine Archiv-Schwellen-Funktion, Auto-Archiv beim `load()`, plus Actions/Getter für Archiv, „Vorlage aus Reise" und Vorlagenabgleich. UI in `TripsView` (Archiv-Toggle, Reisedatum) und `TripDetailView` (Reisedatum, Als-Vorlage-Speichern, Abgleich-Sheet). Kein Dexie-Versionsbump nötig (freie Properties).

**Tech Stack:** Vue 3 (`<script setup>`), Pinia, Dexie/IndexedDB, Vitest, Tailwind. JavaScript-only.

---

## File Structure

- `src/stores/tripsStore.js` — **modify**: neue Felder in `create`, Auto-Archiv in `load`, Getter `activeTrips`/`archivedTrips`/`templateDiffFor`, Actions `archive`/`reactivate`/`setTravelDate`/`createTemplateFromTrip`/`applyTemplateSync`, exportierte Helper `referenceDateOf`/`shouldAutoArchive`.
- `src/__tests__/stores.test.js` — **modify**: neue Test-Blöcke.
- `src/views/TripsView.vue` — **modify**: Reisedatum im Neu-Dialog, Archiv-Toggle, Archivieren/Reaktivieren.
- `src/views/TripDetailView.vue` — **modify**: Reisedatum editierbar, Aktionsmenü „Als Vorlage speichern" + „Vorlagenabgleich".
- `src/components/TemplateSyncSheet.vue` — **create**: Abgleich-Sheet.
- `src/components/SaveAsTemplateSheet.vue` — **create**: Namens-Dialog für „Als Vorlage speichern".

Reihenfolge: erst Store (Tasks 1–5, alle TDD), dann UI (Tasks 6–8, manuell via Preview verifiziert).

---

## Task 1: Archiv-Schwelle + Auto-Archiv beim Laden

**Files:**
- Modify: `src/stores/tripsStore.js`
- Test: `src/__tests__/stores.test.js`

- [ ] **Step 1: Failing test für die reine Schwellen-Funktion**

Am Ende von `src/__tests__/stores.test.js` anfügen. Import oben ergänzen:

```js
import {
  useTripsStore,
  referenceDateOf,
  shouldAutoArchive
} from '../stores/tripsStore.js';
```

(Die bestehende `useTripsStore`-Zeile ersetzen durch diesen Block.)

Neuer Test-Block:

```js
describe('archive: shouldAutoArchive (pure)', () => {
  const now = new Date('2026-07-06T12:00:00.000Z');
  const daysAgo = (n) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  it('nutzt travelDate als Referenz vor createdAt', () => {
    const trip = { createdAt: daysAgo(60), travelDate: daysAgo(1) };
    expect(referenceDateOf(trip)).toBe(trip.travelDate);
    expect(shouldAutoArchive(trip, now)).toBe(false);
  });

  it('fällt auf createdAt zurück wenn travelDate leer', () => {
    const trip = { createdAt: daysAgo(40), travelDate: null };
    expect(referenceDateOf(trip)).toBe(trip.createdAt);
    expect(shouldAutoArchive(trip, now)).toBe(true);
  });

  it('archiviert älter als 30 Tage, aber nicht genau 30 Tage', () => {
    expect(shouldAutoArchive({ createdAt: daysAgo(31) }, now)).toBe(true);
    expect(shouldAutoArchive({ createdAt: daysAgo(30) }, now)).toBe(false);
    expect(shouldAutoArchive({ createdAt: daysAgo(5) }, now)).toBe(false);
  });

  it('archiviert nicht wenn bereits archiviert oder keepActive', () => {
    expect(
      shouldAutoArchive({ createdAt: daysAgo(99), archivedAt: daysAgo(1) }, now)
    ).toBe(false);
    expect(
      shouldAutoArchive({ createdAt: daysAgo(99), keepActive: true }, now)
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag prüfen**

Run: `npm run test -- stores`
Expected: FAIL (`referenceDateOf`/`shouldAutoArchive` sind nicht exportiert).

- [ ] **Step 3: Helper implementieren**

In `src/stores/tripsStore.js` **oben** (nach den Imports, vor `defineStore`) einfügen:

```js
const ARCHIVE_AFTER_DAYS = 30;

/** Referenzdatum einer Reise: Reisedatum, sonst Erstelldatum. */
export function referenceDateOf(trip) {
  return trip.travelDate ?? trip.createdAt ?? null;
}

/**
 * Ob eine Reise automatisch archiviert werden soll.
 * Archiviert nur wenn nicht bereits archiviert, nicht manuell aktiv gehalten,
 * und das Referenzdatum älter als ARCHIVE_AFTER_DAYS ist (strikt älter).
 */
export function shouldAutoArchive(trip, now = new Date()) {
  if (trip.archivedAt) return false;
  if (trip.keepActive) return false;
  const ref = referenceDateOf(trip);
  if (!ref) return false;
  const refMs = new Date(ref).getTime();
  if (Number.isNaN(refMs)) return false;
  const cutoff = now.getTime() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  return refMs < cutoff;
}
```

- [ ] **Step 4: Test ausführen, Erfolg prüfen**

Run: `npm run test -- stores`
Expected: PASS (der neue Block; restliche Tests weiter grün).

- [ ] **Step 5: Auto-Archiv in `load()` integrieren**

In `src/stores/tripsStore.js` die `load`-Action ersetzen:

```js
async load() {
  this.trips = (await db.trips.toArray()).sort(
    (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
  );
  // Auto-Archiv: alte, nicht manuell aktiv gehaltene Reisen stempeln.
  const now = new Date();
  const toArchive = this.trips.filter((t) => shouldAutoArchive(t, now));
  if (toArchive.length) {
    const stamp = now.toISOString();
    await db.transaction('rw', db.trips, async () => {
      for (const t of toArchive) {
        await db.trips.update(t.id, { archivedAt: stamp });
      }
    });
    for (const t of toArchive) t.archivedAt = stamp;
  }
  const allItems = await db.trip_items.toArray();
  this.tripItems = groupBy(allItems, 'tripId');
  this.loaded = true;
}
```

- [ ] **Step 6: Integrationstest fürs Auto-Archiv beim Laden**

Neuer Test-Block in `stores.test.js`:

```js
describe('trips: Auto-Archiv beim load', () => {
  const daysAgo = (n) =>
    new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

  it('archiviert eine alte Reise beim Laden und persistiert', async () => {
    const { db } = await import('../db/database.js');
    await db.trips.add({
      name: 'Alt',
      templateId: null,
      travelDate: null,
      archivedAt: null,
      keepActive: false,
      createdAt: daysAgo(40)
    });
    const trips = useTripsStore();
    await trips.load();
    expect(trips.archivedTrips).toHaveLength(1);
    expect(trips.activeTrips).toHaveLength(0);
    // Persistenz: frischer Store lädt denselben Zustand
    const fresh = useTripsStore();
    fresh.$reset();
    await fresh.load();
    expect(fresh.archivedTrips).toHaveLength(1);
  });

  it('lässt eine junge Reise aktiv', async () => {
    const { db } = await import('../db/database.js');
    await db.trips.add({
      name: 'Neu',
      templateId: null,
      travelDate: null,
      archivedAt: null,
      keepActive: false,
      createdAt: daysAgo(5)
    });
    const trips = useTripsStore();
    await trips.load();
    expect(trips.activeTrips).toHaveLength(1);
    expect(trips.archivedTrips).toHaveLength(0);
  });
});
```

- [ ] **Step 7: Getter `activeTrips`/`archivedTrips` ergänzen**

Im `getters`-Block von `tripsStore.js` ergänzen:

```js
activeTrips: (state) => state.trips.filter((t) => !t.archivedAt),
archivedTrips: (state) => state.trips.filter((t) => t.archivedAt),
```

- [ ] **Step 8: Tests ausführen**

Run: `npm run test -- stores`
Expected: PASS (alle Blöcke grün).

- [ ] **Step 9: Commit**

```bash
git add src/stores/tripsStore.js src/__tests__/stores.test.js
git commit -m "feat(trips): Auto-Archiv nach 30 Tagen mit travelDate-Fallback"
```

---

## Task 2: Neue Trip-Felder + archive/reactivate/setTravelDate

**Files:**
- Modify: `src/stores/tripsStore.js`
- Test: `src/__tests__/stores.test.js`

- [ ] **Step 1: Failing tests**

Neuer Test-Block:

```js
describe('trips: manuelles Archivieren', () => {
  const daysAgo = (n) =>
    new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

  it('archive setzt archivedAt, reactivate setzt keepActive und hält aktiv', async () => {
    const items = useItemsStore();
    const trips = useTripsStore();
    await items.load();
    await trips.load();
    const trip = await trips.create({ name: 'Wien' });

    await trips.archive(trip.id);
    expect(trips.byId(trip.id).archivedAt).toBeTruthy();
    expect(trips.archivedTrips).toHaveLength(1);

    await trips.reactivate(trip.id);
    expect(trips.byId(trip.id).archivedAt).toBeNull();
    expect(trips.byId(trip.id).keepActive).toBe(true);
    expect(trips.activeTrips).toHaveLength(1);
  });

  it('reaktivierte alte Reise wird beim erneuten load NICHT wieder archiviert', async () => {
    const { db } = await import('../db/database.js');
    await db.trips.add({
      name: 'Alt-reaktiviert',
      templateId: null,
      travelDate: null,
      archivedAt: null,
      keepActive: true,
      createdAt: daysAgo(90)
    });
    const trips = useTripsStore();
    await trips.load();
    expect(trips.activeTrips).toHaveLength(1);
    expect(trips.archivedTrips).toHaveLength(0);
  });

  it('setTravelDate speichert und leert das Reisedatum', async () => {
    const trips = useTripsStore();
    await trips.load();
    const trip = await trips.create({ name: 'X' });
    await trips.setTravelDate(trip.id, '2026-05-01');
    expect(trips.byId(trip.id).travelDate).toBe('2026-05-01');
    await trips.setTravelDate(trip.id, '');
    expect(trips.byId(trip.id).travelDate).toBeNull();
  });

  it('create übernimmt travelDate und initialisiert Archiv-Felder', async () => {
    const trips = useTripsStore();
    await trips.load();
    const trip = await trips.create({ name: 'Y', travelDate: '2026-08-01' });
    expect(trip.travelDate).toBe('2026-08-01');
    expect(trip.archivedAt).toBeNull();
    expect(trip.keepActive).toBe(false);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag prüfen**

Run: `npm run test -- stores`
Expected: FAIL (`archive`/`reactivate`/`setTravelDate` fehlen; `create` kennt `travelDate` nicht).

- [ ] **Step 3: `create` erweitern**

In `tripsStore.js` den Kopf der `create`-Action ersetzen (Signatur + `row`):

```js
async create({ name, templateId = null, travelDate = null }) {
  const row = {
    name: name.trim(),
    templateId,
    travelDate: travelDate || null,
    archivedAt: null,
    keepActive: false,
    createdAt: new Date().toISOString()
  };
  const tripId = await db.trips.add(row);
  const created = { id: tripId, ...row };
  this.trips.unshift(created);
  this.tripItems[tripId] = [];
  // ... (restlicher Template-Kopier-Block unverändert)
```

Der bestehende `if (templateId) { ... }`-Block und `return created;` bleiben unverändert.

- [ ] **Step 4: Actions ergänzen**

Im `actions`-Block von `tripsStore.js` (z. B. nach `rename`) einfügen:

```js
async archive(tripId) {
  const stamp = new Date().toISOString();
  await db.trips.update(tripId, { archivedAt: stamp });
  const t = this.byId(tripId);
  if (t) t.archivedAt = stamp;
},

async reactivate(tripId) {
  await db.trips.update(tripId, { archivedAt: null, keepActive: true });
  const t = this.byId(tripId);
  if (t) {
    t.archivedAt = null;
    t.keepActive = true;
  }
},

async setTravelDate(tripId, travelDate) {
  const v = travelDate || null;
  await db.trips.update(tripId, { travelDate: v });
  const t = this.byId(tripId);
  if (t) t.travelDate = v;
},
```

- [ ] **Step 5: Tests ausführen, Erfolg prüfen**

Run: `npm run test -- stores`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/stores/tripsStore.js src/__tests__/stores.test.js
git commit -m "feat(trips): manuelles Archivieren, Reaktivieren und Reisedatum"
```

---

## Task 3: Vorlage aus Reise erstellen

**Files:**
- Modify: `src/stores/tripsStore.js`
- Test: `src/__tests__/stores.test.js`

- [ ] **Step 1: Failing test**

```js
describe('trips: createTemplateFromTrip', () => {
  it('erstellt Vorlage und kopiert Items + Mengen, ignoriert checked', async () => {
    const items = useItemsStore();
    const templates = useTemplatesStore();
    const trips = useTripsStore();
    await items.load();
    await templates.load();
    await trips.load();

    const a = await items.findOrCreateByName('Zahnbürste', 1);
    const b = await items.findOrCreateByName('Socken', 1);
    const trip = await trips.create({ name: 'Rom' });
    await trips.addItem(trip.id, a.id, 1);
    await trips.addItem(trip.id, b.id, 3);
    await trips.toggleChecked(trip.id, trips.itemsFor(trip.id)[0].id);

    const tpl = await trips.createTemplateFromTrip(trip.id, 'Städtereise');
    expect(templates.byId(tpl.id).name).toBe('Städtereise');
    const tItems = templates.itemsFor(tpl.id);
    expect(tItems).toHaveLength(2);
    const socken = tItems.find((ti) => ti.itemId === b.id);
    expect(socken.quantity).toBe(3);
  });

  it('funktioniert auch für eine Reise ohne Quell-Vorlage', async () => {
    const items = useItemsStore();
    const templates = useTemplatesStore();
    const trips = useTripsStore();
    await items.load();
    await templates.load();
    await trips.load();

    const a = await items.findOrCreateByName('Ladegerät', 1);
    const trip = await trips.create({ name: 'Leer' });
    await trips.addItem(trip.id, a.id, 1);
    const tpl = await trips.createTemplateFromTrip(trip.id, 'Neu');
    expect(templates.itemsFor(tpl.id)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag prüfen**

Run: `npm run test -- stores`
Expected: FAIL (`createTemplateFromTrip` ist keine Funktion).

- [ ] **Step 3: Action implementieren**

Im `actions`-Block von `tripsStore.js` ergänzen (nutzt den bereits importierten `useTemplatesStore`):

```js
async createTemplateFromTrip(tripId, name) {
  const templatesStore = useTemplatesStore();
  const tpl = await templatesStore.create(name);
  const sourceItems = this.itemsFor(tripId);
  for (const ti of sourceItems) {
    await templatesStore.addItem(tpl.id, ti.itemId, ti.quantity ?? 1);
  }
  return tpl;
},
```

- [ ] **Step 4: Tests ausführen, Erfolg prüfen**

Run: `npm run test -- stores`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/tripsStore.js src/__tests__/stores.test.js
git commit -m "feat(trips): Vorlage aus Reise erstellen"
```

---

## Task 4: Vorlagenabgleich – Diff-Getter + Anwenden

**Files:**
- Modify: `src/stores/tripsStore.js`
- Test: `src/__tests__/stores.test.js`

- [ ] **Step 1: Failing test**

```js
describe('trips: Vorlagenabgleich', () => {
  async function setup() {
    const items = useItemsStore();
    const templates = useTemplatesStore();
    const trips = useTripsStore();
    await items.load();
    await templates.load();
    await trips.load();

    const gemein = await items.findOrCreateByName('Gemeinsam', 1);
    const nurTrip = await items.findOrCreateByName('NurReise', 1);
    const nurTpl = await items.findOrCreateByName('NurVorlage', 1);

    const tpl = await templates.create('Basis');
    await templates.addItem(tpl.id, gemein.id, 1);
    await templates.addItem(tpl.id, nurTpl.id, 1);

    const trip = await trips.create({ name: 'Abgleich', templateId: tpl.id });
    // create hat gemein + nurTpl kopiert; nurTpl entfernen, nurTrip zufügen
    const nurTplTripItem = trips
      .itemsFor(trip.id)
      .find((ti) => ti.itemId === nurTpl.id);
    await trips.removeItem(trip.id, nurTplTripItem.id);
    await trips.addItem(trip.id, nurTrip.id, 1);

    return { items, templates, trips, tpl, trip, gemein, nurTrip, nurTpl };
  }

  it('templateDiffFor listet added und removed korrekt', async () => {
    const { trips, trip, nurTrip, nurTpl } = await setup();
    const diff = trips.templateDiffFor(trip.id);
    expect(diff.added.map((a) => a.itemId)).toEqual([nurTrip.id]);
    expect(diff.removed.map((r) => r.itemId)).toEqual([nurTpl.id]);
    expect(diff.removed[0].templateItemId).toBeTruthy();
  });

  it('templateDiffFor liefert null ohne Quell-Vorlage', async () => {
    const trips = useTripsStore();
    await trips.load();
    const trip = await trips.create({ name: 'Ohne' });
    expect(trips.templateDiffFor(trip.id)).toBeNull();
  });

  it('applyTemplateSync übernimmt nur ausgewählte Änderungen', async () => {
    const { templates, trips, tpl, trip, nurTrip, nurTpl, gemein } =
      await setup();
    const diff = trips.templateDiffFor(trip.id);
    // Nur das Hinzufügen anwenden, das Entfernen NICHT
    await trips.applyTemplateSync(trip.id, {
      addItemIds: diff.added.map((a) => a.itemId),
      removeTemplateItemIds: []
    });
    const ids = templates.itemsFor(tpl.id).map((ti) => ti.itemId).sort();
    expect(ids).toEqual([gemein.id, nurTpl.id, nurTrip.id].sort());
  });

  it('applyTemplateSync entfernt ausgewählte Vorlagen-Items', async () => {
    const { templates, trips, tpl, trip, nurTpl, gemein } = await setup();
    const diff = trips.templateDiffFor(trip.id);
    await trips.applyTemplateSync(trip.id, {
      addItemIds: [],
      removeTemplateItemIds: diff.removed.map((r) => r.templateItemId)
    });
    const ids = templates.itemsFor(tpl.id).map((ti) => ti.itemId);
    expect(ids).not.toContain(nurTpl.id);
    expect(ids).toContain(gemein.id);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag prüfen**

Run: `npm run test -- stores`
Expected: FAIL (`templateDiffFor`/`applyTemplateSync` fehlen).

- [ ] **Step 3: Getter implementieren**

Im `getters`-Block von `tripsStore.js` ergänzen:

```js
templateDiffFor: (state) => (tripId) => {
  const trip = state.trips.find((t) => t.id === tripId);
  if (!trip || !trip.templateId) return null;
  const templatesStore = useTemplatesStore();
  const tplItems = templatesStore.itemsFor(trip.templateId);
  const tripItems = state.tripItems[tripId] ?? [];
  const tplItemIds = new Set(tplItems.map((ti) => ti.itemId));
  const tripItemIds = new Set(tripItems.map((ti) => ti.itemId));
  const added = tripItems
    .filter((ti) => !tplItemIds.has(ti.itemId))
    .map((ti) => ({ itemId: ti.itemId }));
  const removed = tplItems
    .filter((ti) => !tripItemIds.has(ti.itemId))
    .map((ti) => ({ itemId: ti.itemId, templateItemId: ti.id }));
  return { templateId: trip.templateId, added, removed };
},
```

- [ ] **Step 4: Action implementieren**

Im `actions`-Block von `tripsStore.js` ergänzen:

```js
async applyTemplateSync(tripId, { addItemIds = [], removeTemplateItemIds = [] }) {
  const trip = this.byId(tripId);
  if (!trip || !trip.templateId) return;
  const templatesStore = useTemplatesStore();
  for (const itemId of addItemIds) {
    await templatesStore.addItem(trip.templateId, itemId, 1);
  }
  for (const templateItemId of removeTemplateItemIds) {
    await templatesStore.removeItem(trip.templateId, templateItemId);
  }
},
```

- [ ] **Step 5: Tests ausführen, Erfolg prüfen**

Run: `npm run test -- stores`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/stores/tripsStore.js src/__tests__/stores.test.js
git commit -m "feat(trips): Vorlagenabgleich (Diff + selektives Anwenden)"
```

---

## Task 5: Volle Store-Suite grün

**Files:**
- Test: `src/__tests__/stores.test.js`

- [ ] **Step 1: Gesamte Test-Suite ausführen**

Run: `npm run test`
Expected: PASS — alle Dateien (`stores`, `database`, `backup`) grün. Falls `backup.test.js` fehlschlägt, prüfen ob es feste Feldmengen erwartet; neue Felder sind additiv und sollten den Roundtrip nicht brechen.

- [ ] **Step 2: Commit (nur falls Anpassungen nötig waren)**

```bash
git add -A && git commit -m "test: Gesamt-Suite nach Archiv/Vorlagen-Features grün"
```

---

## Task 6: TripsView – Reisedatum, Archiv-Toggle, Archivieren/Reaktivieren

**Files:**
- Modify: `src/views/TripsView.vue`

- [ ] **Step 1: Reisedatum ins Neu-Formular**

Im `<form>` des Neu-Dialogs nach dem Vorlage-`<label>` einfügen:

```html
<label class="block">
  <span class="mb-1 block text-xs font-medium text-slate-500">Reisedatum (optional)</span>
  <input v-model="newTravelDate" type="date" class="input" />
</label>
```

Im `<script setup>` `const newTravelDate = ref('');` ergänzen. Im `watch(newOpen, ...)`-Reset `newTravelDate.value = '';` ergänzen. In `create()` den Aufruf erweitern:

```js
const trip = await tripsStore.create({
  name: trimmed,
  templateId: newTemplateId.value,
  travelDate: newTravelDate.value || null
});
```

- [ ] **Step 2: Liste auf aktive Reisen umstellen + Archiv-Toggle**

Das `v-for="t in tripsStore.trips"` auf `tripsStore.activeTrips` ändern. Im Header neben „+ Neu" einen Toggle ergänzen:

```html
<button
  type="button"
  class="btn-secondary"
  @click="showArchive = !showArchive"
>{{ showArchive ? 'Archiv aus' : 'Archiv' }}</button>
```

Im `<script setup>`: `const showArchive = ref(false);`

Aktive-Reise-Zeile: neben dem 🗑-Button einen Archivieren-Button ergänzen (innerhalb des `flex`-Containers vor dem Löschen-Button):

```html
<button
  type="button"
  class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
  aria-label="Reise archivieren"
  @click.prevent="tripsStore.archive(t.id)"
>📦</button>
```

- [ ] **Step 3: Archiv-Abschnitt**

Nach der aktiven `<ul>`/`<div v-else>` einfügen:

```html
<section v-if="showArchive" class="space-y-2">
  <h2 class="px-1 pt-2 text-sm font-semibold text-slate-500">Archiv</h2>
  <ul v-if="tripsStore.archivedTrips.length" class="space-y-2">
    <li
      v-for="t in tripsStore.archivedTrips"
      :key="t.id"
      class="card opacity-60"
    >
      <div class="flex items-center justify-between gap-3">
        <router-link :to="`/trips/${t.id}`" class="min-w-0 flex-1">
          <div class="font-semibold truncate">{{ t.name }}</div>
          <div class="text-xs text-slate-500">{{ formatDate(referenceDateOf(t)) }}</div>
        </router-link>
        <button
          type="button"
          class="btn-secondary shrink-0"
          @click.prevent="tripsStore.reactivate(t.id)"
        >Reaktivieren</button>
      </div>
    </li>
  </ul>
  <div v-else class="card text-center text-sm text-slate-500">Archiv ist leer.</div>
</section>
```

Import ergänzen: `import { useTripsStore } ...` bleibt; zusätzlich
`import { referenceDateOf } from '../stores/tripsStore.js';` (oder aus bestehendem Import mitnehmen: `import { useTripsStore, referenceDateOf } from '../stores/tripsStore.js';`).

- [ ] **Step 4: Preview-Verifikation**

App starten (`preview_start`), Reisen-Ansicht öffnen:
- Neue Reise mit Reisedatum anlegen → erscheint aktiv.
- „Archiv"-Toggle zeigt/versteckt den Archiv-Abschnitt.
- 📦 auf einer aktiven Reise → wandert ins Archiv; „Reaktivieren" holt sie zurück.

- [ ] **Step 5: Commit**

```bash
git add src/views/TripsView.vue
git commit -m "feat(ui): Reisedatum, Archiv-Toggle und Archivieren in TripsView"
```

---

## Task 7: SaveAsTemplateSheet + Einbindung in TripDetailView

**Files:**
- Create: `src/components/SaveAsTemplateSheet.vue`
- Modify: `src/views/TripDetailView.vue`

- [ ] **Step 1: Sheet-Komponente erstellen**

`src/components/SaveAsTemplateSheet.vue` (Muster analog Neu-Dialog in TripsView):

```html
<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
    @click.self="close"
  >
    <div
      class="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl dark:bg-slate-900 sm:rounded-2xl"
      style="padding-bottom: max(1rem, env(safe-area-inset-bottom))"
    >
      <h2 class="mb-3 text-lg font-semibold">Als Vorlage speichern</h2>
      <form class="space-y-3" @submit.prevent="submit">
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-slate-500">Name der Vorlage</span>
          <input ref="nameInput" v-model="name" class="input" />
        </label>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" @click="close">Abbrechen</button>
          <button type="submit" class="btn-primary" :disabled="!name.trim()">Speichern</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  defaultName: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue', 'save']);

const name = ref('');
const nameInput = ref(null);

watch(
  () => props.modelValue,
  async (v) => {
    if (v) {
      name.value = props.defaultName;
      await nextTick();
      nameInput.value?.focus();
    }
  }
);

function close() {
  emit('update:modelValue', false);
}
function submit() {
  const trimmed = name.value.trim();
  if (!trimmed) return;
  emit('save', trimmed);
  close();
}
</script>
```

- [ ] **Step 2: In TripDetailView einbinden**

Import + State in `<script setup>` von `TripDetailView.vue`:

```js
import SaveAsTemplateSheet from '../components/SaveAsTemplateSheet.vue';
const saveTplOpen = ref(false);

async function onSaveAsTemplate(name) {
  if (!trip.value) return;
  await tripsStore.createTemplateFromTrip(trip.value.id, name);
  window.alert(`Vorlage „${name}" gespeichert.`);
}
```

Im Header, neben dem „+ Item"-Button, einen Button ergänzen:

```html
<button
  type="button"
  class="btn-secondary shrink-0"
  @click="saveTplOpen = true"
>Als Vorlage</button>
```

Vor `</template>` (neben `ItemPickerSheet`) einfügen:

```html
<SaveAsTemplateSheet
  v-model="saveTplOpen"
  :default-name="trip?.name ?? ''"
  @save="onSaveAsTemplate"
/>
```

- [ ] **Step 3: Preview-Verifikation**

Reise öffnen → „Als Vorlage" → Name bestätigen → in Vorlagen-Ansicht taucht die neue Vorlage mit denselben Items auf.

- [ ] **Step 4: Commit**

```bash
git add src/components/SaveAsTemplateSheet.vue src/views/TripDetailView.vue
git commit -m "feat(ui): Als-Vorlage-speichern in TripDetailView"
```

---

## Task 8: TemplateSyncSheet + Einbindung

**Files:**
- Create: `src/components/TemplateSyncSheet.vue`
- Modify: `src/views/TripDetailView.vue`

- [ ] **Step 1: Sheet-Komponente erstellen**

`src/components/TemplateSyncSheet.vue`:

```html
<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
    @click.self="close"
  >
    <div
      class="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-white p-4 shadow-xl dark:bg-slate-900 sm:rounded-2xl"
      style="padding-bottom: max(1rem, env(safe-area-inset-bottom))"
    >
      <h2 class="mb-3 text-lg font-semibold">Vorlagenabgleich</h2>

      <div v-if="isEmpty" class="card text-center text-sm text-slate-500">
        Vorlage ist aktuell – keine Unterschiede.
      </div>

      <div v-else class="flex-1 space-y-4 overflow-y-auto">
        <section v-if="diff.added.length">
          <h3 class="mb-1 text-sm font-semibold text-slate-500">
            Hinzugefügt (in Vorlage übernehmen)
          </h3>
          <ul class="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
            <li v-for="a in diff.added" :key="`a-${a.itemId}`" class="flex items-center gap-3 p-3">
              <input
                :id="`add-${a.itemId}`"
                v-model="addSelected[a.itemId]"
                type="checkbox"
                class="h-5 w-5"
              />
              <label :for="`add-${a.itemId}`" class="flex-1">{{ nameOf(a.itemId) }}</label>
            </li>
          </ul>
        </section>

        <section v-if="diff.removed.length">
          <h3 class="mb-1 text-sm font-semibold text-slate-500">
            Entfernt (aus Vorlage entfernen)
          </h3>
          <ul class="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
            <li v-for="r in diff.removed" :key="`r-${r.templateItemId}`" class="flex items-center gap-3 p-3">
              <input
                :id="`rm-${r.templateItemId}`"
                v-model="removeSelected[r.templateItemId]"
                type="checkbox"
                class="h-5 w-5"
              />
              <label :for="`rm-${r.templateItemId}`" class="flex-1">{{ nameOf(r.itemId) }}</label>
            </li>
          </ul>
        </section>
      </div>

      <div class="flex justify-end gap-2 pt-3">
        <button type="button" class="btn-secondary" @click="close">Schließen</button>
        <button
          v-if="!isEmpty"
          type="button"
          class="btn-primary"
          @click="apply"
        >Übernehmen</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, watch } from 'vue';
import { useTripsStore } from '../stores/tripsStore.js';
import { useItemsStore } from '../stores/itemsStore.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  tripId: { type: Number, default: null }
});
const emit = defineEmits(['update:modelValue']);

const tripsStore = useTripsStore();
const itemsStore = useItemsStore();

const diff = computed(
  () => tripsStore.templateDiffFor(props.tripId) ?? { added: [], removed: [] }
);
const isEmpty = computed(() => !diff.value.added.length && !diff.value.removed.length);

const addSelected = reactive({});
const removeSelected = reactive({});

// Checkboxen initial ALLE OFFEN (bewusste Entscheidung pro Feld).
watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      Object.keys(addSelected).forEach((k) => delete addSelected[k]);
      Object.keys(removeSelected).forEach((k) => delete removeSelected[k]);
      diff.value.added.forEach((a) => (addSelected[a.itemId] = false));
      diff.value.removed.forEach((r) => (removeSelected[r.templateItemId] = false));
    }
  }
);

function nameOf(itemId) {
  return itemsStore.byId(itemId)?.name ?? '—';
}

function close() {
  emit('update:modelValue', false);
}

async function apply() {
  const addItemIds = diff.value.added
    .filter((a) => addSelected[a.itemId])
    .map((a) => a.itemId);
  const removeTemplateItemIds = diff.value.removed
    .filter((r) => removeSelected[r.templateItemId])
    .map((r) => r.templateItemId);
  await tripsStore.applyTemplateSync(props.tripId, {
    addItemIds,
    removeTemplateItemIds
  });
  close();
}
</script>
```

- [ ] **Step 2: In TripDetailView einbinden (nur bei Quell-Vorlage)**

In `<script setup>` von `TripDetailView.vue`:

```js
import TemplateSyncSheet from '../components/TemplateSyncSheet.vue';
const syncOpen = ref(false);
```

Header-Button, nur sichtbar wenn `trip?.templateId`:

```html
<button
  v-if="trip?.templateId"
  type="button"
  class="btn-secondary shrink-0"
  @click="syncOpen = true"
>Abgleich</button>
```

Vor `</template>` einfügen:

```html
<TemplateSyncSheet
  v-if="trip"
  v-model="syncOpen"
  :trip-id="trip.id"
/>
```

- [ ] **Step 3: Preview-Verifikation**

1. Vorlage mit 2 Items anlegen, Reise daraus erstellen.
2. In der Reise ein Item entfernen und ein neues hinzufügen.
3. „Abgleich" öffnen → „Hinzugefügt" zeigt das neue Item, „Entfernt" das entfernte; Checkboxen initial leer.
4. Nur „Hinzugefügt" ankreuzen, „Übernehmen" → Vorlage hat das neue Item, das entfernte bleibt drin.
5. Erneut „Abgleich" → „Entfernt" ankreuzen, übernehmen → Item verschwindet aus der Vorlage.
6. Reise ohne Vorlage: „Abgleich"-Button ist nicht sichtbar.

- [ ] **Step 4: Commit**

```bash
git add src/components/TemplateSyncSheet.vue src/views/TripDetailView.vue
git commit -m "feat(ui): Vorlagenabgleich-Sheet in TripDetailView"
```

---

## Self-Review-Ergebnis

- **Spec-Abdeckung:** Archiv-Felder/Referenzdatum (T1–T2), Auto-Archiv 30 Tage (T1), manuell + reaktivieren mit keepActive-Vorrang (T2), UI-Toggle (T6), Vorlage aus Reise (T3, T7), Abgleich nur Quell-Vorlage mit added/removed + selektiv + initial offen (T4, T8), Tests (T1–T5). Alle Spec-Punkte haben eine Task.
- **Nicht im Scope** (Mengen-Abweichungen, freie Ziel-Vorlage, Auto-Löschen) bleibt draußen.
- **Typkonsistenz:** `travelDate`/`archivedAt`/`keepActive`, `referenceDateOf`/`shouldAutoArchive`, `templateDiffFor` → `{ templateId, added:[{itemId}], removed:[{itemId,templateItemId}] }`, `applyTemplateSync({addItemIds, removeTemplateItemIds})`, `createTemplateFromTrip(tripId, name)` — durchgängig gleich benannt in Store, Tests und UI.
