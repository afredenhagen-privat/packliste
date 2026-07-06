<template>
  <div class="mx-auto max-w-2xl space-y-4 p-4">
    <header class="flex items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">Reisen</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          Aktive Packlisten.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn-secondary"
          @click="showArchive = !showArchive"
        >{{ showArchive ? 'Archiv aus' : 'Archiv' }}</button>
        <button type="button" class="btn-primary" @click="newOpen = true">+ Neu</button>
      </div>
    </header>

    <ul v-if="tripsStore.activeTrips.length" class="space-y-2">
      <li v-for="t in tripsStore.activeTrips" :key="t.id" class="card">
        <router-link :to="`/trips/${t.id}`" class="block space-y-2">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="font-semibold truncate">{{ t.name }}</div>
              <div class="text-xs text-slate-500">
                {{ formatDate(t.createdAt) }}
                <span v-if="t.templateId">
                  · Vorlage: {{ templatesStore.byId(t.templateId)?.name ?? '–' }}
                </span>
              </div>
            </div>
            <button
              type="button"
              class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Reise archivieren"
              @click.prevent="tripsStore.archive(t.id)"
            >📦</button>
            <button
              type="button"
              class="rounded-md p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
              aria-label="Reise löschen"
              @click.prevent="confirmDelete(t)"
            >🗑</button>
          </div>
          <ProgressBar
            :checked="tripsStore.progressFor(t.id).checked"
            :total="tripsStore.progressFor(t.id).total"
          />
        </router-link>
      </li>
    </ul>
    <div v-else class="card text-center text-slate-500">
      Noch keine Reise. Lege deine erste an, optional aus einer Vorlage.
    </div>

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

    <!-- Neu -->
    <div
      v-if="newOpen"
      class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      @click.self="newOpen = false"
    >
      <div class="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl dark:bg-slate-900 sm:rounded-2xl"
        style="padding-bottom: max(1rem, env(safe-area-inset-bottom))"
      >
        <h2 class="mb-3 text-lg font-semibold">Neue Reise</h2>
        <form class="space-y-3" @submit.prevent="create">
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-slate-500">Name</span>
            <input ref="nameInput" v-model="newName" class="input" placeholder="z. B. Berlin Mai" />
          </label>
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-slate-500">Vorlage (optional)</span>
            <select v-model.number="newTemplateId" class="input">
              <option :value="null">Keine – leere Liste</option>
              <option
                v-for="t in templatesStore.templates"
                :key="t.id"
                :value="t.id"
              >{{ t.name }}</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-slate-500">Reisedatum (optional)</span>
            <input v-model="newTravelDate" type="date" class="input" />
          </label>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="btn-secondary" @click="newOpen = false">Abbrechen</button>
            <button type="submit" class="btn-primary" :disabled="!newName.trim()">Anlegen</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useTripsStore, referenceDateOf } from '../stores/tripsStore.js';
import { useTemplatesStore } from '../stores/templatesStore.js';
import { useItemsStore } from '../stores/itemsStore.js';
import { useCategoriesStore } from '../stores/categoriesStore.js';
import ProgressBar from '../components/ProgressBar.vue';

const tripsStore = useTripsStore();
const templatesStore = useTemplatesStore();
const itemsStore = useItemsStore();
const categoriesStore = useCategoriesStore();
const router = useRouter();

const newOpen = ref(false);
const newName = ref('');
const newTemplateId = ref(null);
const newTravelDate = ref('');
const nameInput = ref(null);
const showArchive = ref(false);

watch(newOpen, async (v) => {
  if (v) {
    newName.value = '';
    newTemplateId.value = null;
    newTravelDate.value = '';
    await nextTick();
    nameInput.value?.focus();
  }
});

onMounted(async () => {
  if (!tripsStore.loaded) await tripsStore.load();
  if (!templatesStore.loaded) await templatesStore.load();
  if (!itemsStore.loaded) await itemsStore.load();
  if (!categoriesStore.loaded) await categoriesStore.load();
});

async function create() {
  const trimmed = newName.value.trim();
  if (!trimmed) return;
  const trip = await tripsStore.create({
    name: trimmed,
    templateId: newTemplateId.value,
    travelDate: newTravelDate.value || null
  });
  newOpen.value = false;
  router.push(`/trips/${trip.id}`);
}

async function confirmDelete(t) {
  if (!window.confirm(`Reise "${t.name}" löschen?`)) return;
  await tripsStore.remove(t.id);
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('de-DE');
  } catch {
    return '';
  }
}
</script>
