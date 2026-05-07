<template>
  <div class="mx-auto max-w-2xl space-y-4 p-4">
    <header>
      <h1 class="text-2xl font-bold">Bibliothek</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        Alle je benutzten Items, sortiert nach Häufigkeit.
      </p>
    </header>

    <div class="space-y-2">
      <input
        v-model="query"
        type="search"
        class="input"
        placeholder="Items suchen…"
      />
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="chip border"
          :class="
            categoryFilter === null
              ? 'border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-700/20 dark:text-accent-300'
              : 'border-slate-300 bg-transparent text-slate-700 dark:border-slate-700 dark:text-slate-300'
          "
          @click="categoryFilter = null"
        >Alle</button>
        <button
          v-for="c in categoriesStore.categories"
          :key="c.id"
          type="button"
          class="chip border"
          :class="
            categoryFilter === c.id
              ? 'border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-700/20 dark:text-accent-300'
              : 'border-slate-300 bg-transparent text-slate-700 dark:border-slate-700 dark:text-slate-300'
          "
          @click="categoryFilter = c.id"
        >{{ c.name }}</button>
      </div>
    </div>

    <div v-if="filtered.length === 0" class="card text-center text-slate-500">
      <p v-if="itemsStore.items.length === 0">
        Noch keine Items. Lege eine Vorlage oder Reise an und füge dort welche hinzu.
      </p>
      <p v-else>Keine Treffer.</p>
    </div>

    <ul v-else class="card divide-y divide-slate-100 dark:divide-slate-800 p-0">
      <li v-for="item in filtered" :key="item.id">
        <ItemRow
          :item="item"
          :quantity="1"
          :checkable="false"
          :quantity-editable="false"
          :editable="true"
          :removable="true"
          :category-name="categoriesStore.nameOf(item.categoryId, null)"
          :category-color="categoriesStore.colorOf(item.categoryId)"
          @edit="openEdit(item)"
          @remove="confirmDelete(item)"
        />
        <div class="px-3 pb-2 text-xs text-slate-400">
          {{ item.usageCount ?? 0 }}× verwendet
          <span v-if="item.lastUsedAt"> · zuletzt {{ formatDate(item.lastUsedAt) }}</span>
        </div>
      </li>
    </ul>

    <ItemEditSheet v-model="editOpen" :item="editingItem" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useItemsStore } from '../stores/itemsStore.js';
import { useCategoriesStore } from '../stores/categoriesStore.js';
import ItemRow from '../components/ItemRow.vue';
import ItemEditSheet from '../components/ItemEditSheet.vue';

const itemsStore = useItemsStore();
const categoriesStore = useCategoriesStore();

const query = ref('');
const categoryFilter = ref(null);
const editOpen = ref(false);
const editingItem = ref(null);

function openEdit(item) {
  editingItem.value = item;
  editOpen.value = true;
}

onMounted(async () => {
  if (!itemsStore.loaded) await itemsStore.load();
  if (!categoriesStore.loaded) await categoriesStore.load();
});

const filtered = computed(() => {
  let list = itemsStore.search(query.value);
  if (categoryFilter.value !== null) {
    list = list.filter((i) => i.categoryId === categoryFilter.value);
  }
  return list;
});

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('de-DE');
  } catch {
    return '';
  }
}

async function confirmDelete(item) {
  if (
    !window.confirm(
      `"${item.name}" aus der Bibliothek löschen? Es wird auch aus allen Vorlagen und Reisen entfernt.`
    )
  )
    return;
  await itemsStore.remove(item.id);
}
</script>
