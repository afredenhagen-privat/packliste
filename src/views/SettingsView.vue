<template>
  <div class="mx-auto max-w-2xl space-y-6 p-4">
    <header>
      <h1 class="text-2xl font-bold">Einstellungen</h1>
    </header>

    <!-- Kategorien -->
    <section class="card space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">Kategorien</h2>
        <button type="button" class="btn-secondary" @click="newCatOpen = true">
          + Neu
        </button>
      </div>

      <ul class="divide-y divide-slate-100 dark:divide-slate-800">
        <li
          v-for="c in categoriesStore.categories"
          :key="c.id"
          class="flex items-center gap-3 py-2"
        >
          <span
            class="inline-block h-4 w-4 rounded-full ring-1 ring-black/10"
            :style="{ backgroundColor: c.color || '#64748b' }"
          />
          <input
            v-model="c.name"
            class="input flex-1"
            @blur="renameCategory(c)"
            @keydown.enter.prevent="renameCategory(c)"
          />
          <input
            type="color"
            :value="c.color || '#64748b'"
            class="h-9 w-12 cursor-pointer rounded border border-slate-200 dark:border-slate-700"
            @change="updateColor(c, $event.target.value)"
          />
          <button
            type="button"
            class="rounded-md p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
            aria-label="Kategorie löschen"
            @click="confirmDelete(c)"
          >🗑</button>
        </li>
      </ul>

      <div v-if="newCatOpen" class="space-y-2 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-slate-500">Name</span>
          <input ref="newCatInput" v-model="newCatName" class="input" placeholder="z. B. Camping" @keydown.enter.prevent="createCategory" />
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-slate-500">Farbe</span>
          <input v-model="newCatColor" type="color" class="h-9 w-16 cursor-pointer rounded border border-slate-200 dark:border-slate-700" />
        </label>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" @click="cancelNew">Abbrechen</button>
          <button type="button" class="btn-primary" :disabled="!newCatName.trim()" @click="createCategory">Anlegen</button>
        </div>
      </div>
    </section>

    <!-- Daten -->
    <section class="card space-y-3">
      <h2 class="text-lg font-semibold">Daten</h2>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        Sicherung als JSON-Datei. Beim Importieren werden alle aktuellen Daten überschrieben.
      </p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-primary" @click="onExport">📤 Backup exportieren</button>
        <button type="button" class="btn-secondary" @click="$refs.fileInput.click()">
          📥 Backup importieren
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="hidden"
          @change="onImport"
        />
      </div>
      <p v-if="status" class="text-sm" :class="statusError ? 'text-red-600' : 'text-emerald-600'">
        {{ status }}
      </p>
    </section>

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
      <p v-if="templateStatus" class="text-sm" :class="templateStatusError ? 'text-red-600' : 'text-emerald-600'">
        {{ templateStatus }}
      </p>
    </section>

    <!-- Info -->
    <section class="card space-y-1 text-sm text-slate-500 dark:text-slate-400">
      <p><strong>Packliste</strong> – PWA, lokale Datenhaltung im Browser.</p>
      <p>
        Tipp: Auf dem Android-Gerät via Chrome → Menü → „Zum Startbildschirm hinzufügen", dann läuft die App im Vollbild und offline.
      </p>
    </section>

    <TemplateImportSheet
      v-model="importSheetOpen"
      :analysis="importAnalysis"
      :busy="importing"
      @confirm="confirmTemplateImport"
    />
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from 'vue';
import { useCategoriesStore } from '../stores/categoriesStore.js';
import { useItemsStore } from '../stores/itemsStore.js';
import { useTemplatesStore } from '../stores/templatesStore.js';
import { useTripsStore } from '../stores/tripsStore.js';
import { useRouter } from 'vue-router';
import {
  exportBackup,
  importBackup,
  downloadBackup
} from '../db/backup.js';
import TemplateImportSheet from '../components/TemplateImportSheet.vue';
import {
  parseTemplateImport,
  analyzeImport
} from '../db/templateShare.js';

const categoriesStore = useCategoriesStore();
const itemsStore = useItemsStore();
const templatesStore = useTemplatesStore();
const tripsStore = useTripsStore();

const router = useRouter();

const importSheetOpen = ref(false);
const importAnalysis = ref(null);
const importParsed = ref(null);
const importing = ref(false);
const templateStatus = ref('');
const templateStatusError = ref(false);

const newCatOpen = ref(false);
const newCatName = ref('');
const newCatColor = ref('#64748b');
const newCatInput = ref(null);

const status = ref('');
const statusError = ref(false);

watch(newCatOpen, async (v) => {
  if (v) {
    await nextTick();
    newCatInput.value?.focus();
  }
});

onMounted(async () => {
  if (!categoriesStore.loaded) await categoriesStore.load();
});

async function renameCategory(c) {
  const trimmed = c.name.trim();
  if (!trimmed) return;
  await categoriesStore.update(c.id, { name: trimmed });
}

async function updateColor(c, color) {
  await categoriesStore.update(c.id, { color });
}

async function createCategory() {
  const trimmed = newCatName.value.trim();
  if (!trimmed) return;
  await categoriesStore.create({ name: trimmed, color: newCatColor.value });
  cancelNew();
}

function cancelNew() {
  newCatOpen.value = false;
  newCatName.value = '';
  newCatColor.value = '#64748b';
}

async function confirmDelete(c) {
  if (
    !window.confirm(
      `Kategorie "${c.name}" löschen? Items dieser Kategorie behalten ihre Daten, verlieren aber die Zuordnung.`
    )
  )
    return;
  await categoriesStore.remove(c.id);
}

function setStatus(msg, isError = false) {
  status.value = msg;
  statusError.value = isError;
  setTimeout(() => {
    if (status.value === msg) status.value = '';
  }, 4000);
}

async function onExport() {
  try {
    const payload = await exportBackup();
    downloadBackup(payload);
    setStatus('Backup heruntergeladen.');
  } catch (e) {
    setStatus(`Fehler beim Export: ${e.message}`, true);
  }
}

async function onImport(event) {
  const file = event.target.files?.[0];
  event.target.value = ''; // reset, damit gleiche Datei nochmal gewählt werden kann
  if (!file) return;
  if (
    !window.confirm(
      'Backup importieren? Alle aktuellen Daten in der App werden überschrieben.'
    )
  )
    return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    await importBackup(payload);
    // alle Stores neu laden
    await Promise.all([
      categoriesStore.load(),
      itemsStore.load(),
      templatesStore.load(),
      tripsStore.load()
    ]);
    setStatus('Backup importiert.');
  } catch (e) {
    setStatus(`Fehler beim Import: ${e.message}`, true);
  }
}

async function onTemplateFile(event) {
  const file = event.target.files?.[0];
  event.target.value = ''; // reset, damit dieselbe Datei erneut wählbar ist
  if (!file) return;
  templateStatus.value = '';
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
    templateStatus.value = `Import fehlgeschlagen: ${e.message}`;
    templateStatusError.value = true;
  }
}

async function confirmTemplateImport() {
  if (importing.value) return;
  importing.value = true;
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
    templateStatus.value = `Import fehlgeschlagen: ${e.message}`;
    templateStatusError.value = true;
    importSheetOpen.value = false;
  } finally {
    importing.value = false;
  }
}
</script>
