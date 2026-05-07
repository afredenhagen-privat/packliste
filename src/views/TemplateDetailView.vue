<template>
  <div class="mx-auto max-w-2xl space-y-4 p-4">
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <router-link to="/templates" class="text-sm text-slate-500 hover:underline">‹ Vorlagen</router-link>
        <input
          v-if="template"
          v-model="editedName"
          class="mt-1 w-full rounded-md bg-transparent text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-accent-500"
          @blur="saveName"
          @keydown.enter.prevent="saveName"
        />
      </div>
      <button type="button" class="btn-primary" @click="pickerOpen = true">+ Item</button>
    </header>

    <div v-if="!template" class="card text-center text-slate-500">
      Vorlage nicht gefunden.
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
        </h3>
        <ul class="card divide-y divide-slate-100 dark:divide-slate-800 p-0">
          <li v-for="ti in group.items" :key="ti.id">
            <ItemRow
              :item="ti.item"
              :quantity="ti.quantity ?? 1"
              :checkable="false"
              :category-name="null"
              @quantity-change="updateQuantity(ti, $event)"
              @remove="removeItem(ti)"
            />
          </li>
        </ul>
      </section>
    </template>

    <ItemPickerSheet v-model="pickerOpen" @pick="onPick" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useTemplatesStore } from '../stores/templatesStore.js';
import { useItemsStore } from '../stores/itemsStore.js';
import { useCategoriesStore } from '../stores/categoriesStore.js';
import ItemRow from '../components/ItemRow.vue';
import ItemPickerSheet from '../components/ItemPickerSheet.vue';

const props = defineProps({
  id: { type: Number, required: true }
});

const templatesStore = useTemplatesStore();
const itemsStore = useItemsStore();
const categoriesStore = useCategoriesStore();

const pickerOpen = ref(false);
const editedName = ref('');

const template = computed(() => templatesStore.byId(props.id));

const grouped = computed(() => {
  if (!template.value) return [];
  const tis = templatesStore.itemsFor(template.value.id);
  // ti -> {ti, item}
  const enriched = tis
    .map((ti) => ({ ...ti, item: itemsStore.byId(ti.itemId) }))
    .filter((ti) => ti.item);
  return groupByCategory(enriched);
});

watch(
  template,
  (t) => {
    if (t) editedName.value = t.name;
  },
  { immediate: true }
);

onMounted(async () => {
  if (!templatesStore.loaded) await templatesStore.load();
  if (!itemsStore.loaded) await itemsStore.load();
  if (!categoriesStore.loaded) await categoriesStore.load();
});

async function saveName() {
  if (!template.value) return;
  const trimmed = editedName.value.trim();
  if (!trimmed || trimmed === template.value.name) {
    editedName.value = template.value.name;
    return;
  }
  await templatesStore.rename(template.value.id, trimmed);
}

async function onPick({ item, quantity }) {
  if (!template.value) return;
  await templatesStore.addItem(template.value.id, item.id, quantity);
}

async function updateQuantity(ti, q) {
  await templatesStore.updateItemQuantity(template.value.id, ti.id, q);
}

async function removeItem(ti) {
  await templatesStore.removeItem(template.value.id, ti.id);
}

function groupByCategory(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = r.item.categoryId ?? null;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  // Kategorien nach Namen sortieren, "ohne" ans Ende
  return [...map.entries()]
    .map(([categoryId, items]) => ({
      categoryId,
      items: items.sort((a, b) => a.item.name.localeCompare(b.item.name, 'de'))
    }))
    .sort((a, b) => {
      if (a.categoryId === null) return 1;
      if (b.categoryId === null) return -1;
      return categoriesStore
        .nameOf(a.categoryId)
        .localeCompare(categoriesStore.nameOf(b.categoryId), 'de');
    });
}
</script>
