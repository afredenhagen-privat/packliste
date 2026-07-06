<template>
  <div class="mx-auto max-w-2xl space-y-4 p-4">
    <header class="space-y-2">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <router-link to="/" class="text-sm text-slate-500 hover:underline">‹ Reisen</router-link>
          <input
            v-if="trip"
            v-model="editedName"
            class="mt-1 w-full rounded-md bg-transparent text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-accent-500"
            @blur="saveName"
            @keydown.enter.prevent="saveName"
          />
        </div>
        <div class="flex shrink-0 gap-2">
          <button
            type="button"
            class="btn-secondary shrink-0"
            @click="saveTplOpen = true"
          >Als Vorlage</button>
          <button
            v-if="trip?.templateId"
            type="button"
            class="btn-secondary shrink-0"
            @click="syncOpen = true"
          >Abgleich</button>
          <button type="button" class="btn-primary" @click="pickerOpen = true">+ Item</button>
        </div>
      </div>
      <ProgressBar
        v-if="trip"
        :checked="progress.checked"
        :total="progress.total"
      />
    </header>

    <div v-if="!trip" class="card text-center text-slate-500">
      Reise nicht gefunden.
    </div>

    <template v-else>
      <div v-if="grouped.length === 0" class="card text-center text-slate-500">
        Noch keine Items. Tippe auf „+ Item".
      </div>

      <section
        v-for="group in grouped"
        :key="group.categoryId ?? 'none'"
        class="space-y-1"
      >
        <h3 class="px-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          {{ categoriesStore.nameOf(group.categoryId, 'Ohne Kategorie') }}
          <span class="font-normal">({{ group.checkedCount }}/{{ group.items.length }})</span>
        </h3>
        <ul class="card divide-y divide-slate-100 dark:divide-slate-800 p-0">
          <li v-for="ti in group.items" :key="ti.id">
            <ItemRow
              :item="ti.item"
              :quantity="ti.quantity ?? 1"
              :checked="ti.checked"
              :checkable="true"
              :category-name="null"
              @toggle="toggle(ti)"
              @quantity-change="updateQuantity(ti, $event)"
              @remove="removeItem(ti)"
            />
          </li>
        </ul>
      </section>
    </template>

    <ItemPickerSheet v-model="pickerOpen" @pick="onPick" />
    <SaveAsTemplateSheet
      v-model="saveTplOpen"
      :default-name="trip?.name ?? ''"
      @save="onSaveAsTemplate"
    />
    <TemplateSyncSheet
      v-if="trip"
      v-model="syncOpen"
      :trip-id="trip.id"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useTripsStore } from '../stores/tripsStore.js';
import { useTemplatesStore } from '../stores/templatesStore.js';
import { useItemsStore } from '../stores/itemsStore.js';
import { useCategoriesStore } from '../stores/categoriesStore.js';
import ItemRow from '../components/ItemRow.vue';
import ItemPickerSheet from '../components/ItemPickerSheet.vue';
import ProgressBar from '../components/ProgressBar.vue';
import SaveAsTemplateSheet from '../components/SaveAsTemplateSheet.vue';
import TemplateSyncSheet from '../components/TemplateSyncSheet.vue';

const props = defineProps({
  id: { type: Number, required: true }
});

const tripsStore = useTripsStore();
const templatesStore = useTemplatesStore();
const itemsStore = useItemsStore();
const categoriesStore = useCategoriesStore();

const pickerOpen = ref(false);
const saveTplOpen = ref(false);
const syncOpen = ref(false);
const editedName = ref('');

const trip = computed(() => tripsStore.byId(props.id));

const progress = computed(() => {
  if (!trip.value) return { checked: 0, total: 0 };
  return tripsStore.progressFor(trip.value.id);
});

const grouped = computed(() => {
  if (!trip.value) return [];
  const tis = tripsStore.itemsFor(trip.value.id);
  const enriched = tis
    .map((ti) => ({ ...ti, item: itemsStore.byId(ti.itemId) }))
    .filter((ti) => ti.item);
  return groupByCategory(enriched);
});

watch(
  trip,
  (t) => {
    if (t) editedName.value = t.name;
  },
  { immediate: true }
);

onMounted(async () => {
  if (!tripsStore.loaded) await tripsStore.load();
  if (!templatesStore.loaded) await templatesStore.load();
  if (!itemsStore.loaded) await itemsStore.load();
  if (!categoriesStore.loaded) await categoriesStore.load();
});

async function saveName() {
  if (!trip.value) return;
  const trimmed = editedName.value.trim();
  if (!trimmed || trimmed === trip.value.name) {
    editedName.value = trip.value.name;
    return;
  }
  await tripsStore.rename(trip.value.id, trimmed);
}

async function onPick({ item, quantity }) {
  if (!trip.value) return;
  await tripsStore.addItem(trip.value.id, item.id, quantity);
}

async function onSaveAsTemplate(name) {
  if (!trip.value) return;
  await tripsStore.createTemplateFromTrip(trip.value.id, name);
  window.alert(`Vorlage „${name}" gespeichert.`);
}

async function toggle(ti) {
  await tripsStore.toggleChecked(trip.value.id, ti.id);
}

async function updateQuantity(ti, q) {
  await tripsStore.updateItemQuantity(trip.value.id, ti.id, q);
}

async function removeItem(ti) {
  await tripsStore.removeItem(trip.value.id, ti.id);
}

function groupByCategory(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = r.item.categoryId ?? null;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return [...map.entries()]
    .map(([categoryId, items]) => {
      // ungepackte zuerst, dann gepackte; jeweils alphabetisch
      const sorted = [...items].sort((a, b) => {
        if (a.checked !== b.checked) return a.checked ? 1 : -1;
        return a.item.name.localeCompare(b.item.name, 'de');
      });
      return {
        categoryId,
        items: sorted,
        checkedCount: sorted.filter((x) => x.checked).length
      };
    })
    .sort((a, b) => {
      if (a.categoryId === null) return 1;
      if (b.categoryId === null) return -1;
      return categoriesStore
        .nameOf(a.categoryId)
        .localeCompare(categoriesStore.nameOf(b.categoryId), 'de');
    });
}
</script>
