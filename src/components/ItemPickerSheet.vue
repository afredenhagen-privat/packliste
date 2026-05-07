<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      @click.self="$emit('update:modelValue', false)"
    >
      <div
        class="w-full max-w-2xl rounded-t-2xl bg-white p-4 shadow-xl dark:bg-slate-900 sm:rounded-2xl"
        style="padding-bottom: max(1rem, env(safe-area-inset-bottom))"
      >
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-semibold">Item hinzufügen</h2>
          <button
            type="button"
            class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Schließen"
            @click="$emit('update:modelValue', false)"
          >✕</button>
        </div>

        <form class="space-y-3" @submit.prevent="submit">
          <div class="relative">
            <input
              ref="nameInput"
              v-model="name"
              type="text"
              class="input"
              placeholder="z. B. Zahnbürste"
              autocomplete="off"
              @focus="showSuggestions = true"
              @input="onInput"
              @keydown.down.prevent="moveSelection(1)"
              @keydown.up.prevent="moveSelection(-1)"
              @keydown.enter.exact.prevent="acceptSelection"
            />
            <ul
              v-if="showSuggestions && suggestions.length"
              class="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900"
            >
              <li
                v-for="(s, idx) in suggestions"
                :key="s.id"
                class="cursor-pointer px-3 py-2 text-sm"
                :class="idx === selectedIndex ? 'bg-accent-50 dark:bg-accent-700/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800'"
                @mousedown.prevent="pickSuggestion(s)"
              >
                <div class="flex items-center justify-between">
                  <span>{{ s.name }}</span>
                  <span class="text-xs text-slate-500">
                    {{ categoriesStore.nameOf(s.categoryId, '–') }} · {{ s.usageCount ?? 0 }}×
                  </span>
                </div>
              </li>
            </ul>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="mb-1 block text-xs font-medium text-slate-500">Kategorie</span>
              <select v-model.number="categoryId" class="input">
                <option :value="null">Ohne Kategorie</option>
                <option
                  v-for="c in categoriesStore.categories"
                  :key="c.id"
                  :value="c.id"
                >{{ c.name }}</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-medium text-slate-500">Menge</span>
              <input v-model.number="quantity" type="number" min="1" class="input" />
            </label>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="btn-secondary"
              @click="$emit('update:modelValue', false)"
            >Abbrechen</button>
            <button type="submit" class="btn-primary" :disabled="!name.trim()">Übernehmen</button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import { useItemsStore } from '../stores/itemsStore.js';
import { useCategoriesStore } from '../stores/categoriesStore.js';

const props = defineProps({
  modelValue: { type: Boolean, required: true }
});
const emit = defineEmits(['update:modelValue', 'pick']);

const itemsStore = useItemsStore();
const categoriesStore = useCategoriesStore();

const name = ref('');
const categoryId = ref(null);
const quantity = ref(1);
const showSuggestions = ref(false);
const selectedIndex = ref(0);
const nameInput = ref(null);

const suggestions = computed(() => {
  return itemsStore.search(name.value).slice(0, 8);
});

watch(
  () => props.modelValue,
  async (v) => {
    if (v) {
      name.value = '';
      categoryId.value = null;
      quantity.value = 1;
      showSuggestions.value = false;
      selectedIndex.value = 0;
      await nextTick();
      nameInput.value?.focus();
    }
  }
);

function onInput() {
  showSuggestions.value = true;
  selectedIndex.value = 0;
}

function moveSelection(delta) {
  showSuggestions.value = true;
  if (suggestions.value.length === 0) return;
  selectedIndex.value =
    (selectedIndex.value + delta + suggestions.value.length) %
    suggestions.value.length;
}

function acceptSelection() {
  if (showSuggestions.value && suggestions.value.length > 0) {
    pickSuggestion(suggestions.value[selectedIndex.value]);
    return;
  }
  submit();
}

function pickSuggestion(s) {
  name.value = s.name;
  if (s.categoryId) categoryId.value = s.categoryId;
  showSuggestions.value = false;
}

async function submit() {
  if (!name.value.trim()) return;
  const item = await itemsStore.findOrCreateByName(
    name.value,
    categoryId.value
  );
  emit('pick', { item, quantity: Math.max(1, Number(quantity.value) || 1) });
  emit('update:modelValue', false);
}
</script>
