<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      @click.self="close"
    >
      <div
        class="w-full max-w-2xl rounded-t-2xl bg-white p-4 shadow-xl dark:bg-slate-900 sm:rounded-2xl"
        style="padding-bottom: max(1rem, env(safe-area-inset-bottom))"
      >
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-semibold">Item bearbeiten</h2>
          <button
            type="button"
            class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Schließen"
            @click="close"
          >✕</button>
        </div>

        <form class="space-y-3" @submit.prevent="save">
          <label class="block">
            <span class="mb-1 block text-xs font-medium text-slate-500">Name</span>
            <input
              ref="nameInput"
              v-model="name"
              type="text"
              class="input"
              autocomplete="off"
            />
          </label>

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

          <p
            v-if="error"
            class="text-sm text-red-600"
          >{{ error }}</p>

          <div class="flex justify-between gap-2 pt-2">
            <p class="text-xs text-slate-500 self-center">
              {{ item?.usageCount ?? 0 }}× verwendet
            </p>
            <div class="flex gap-2">
              <button type="button" class="btn-secondary" @click="close">Abbrechen</button>
              <button type="submit" class="btn-primary" :disabled="!name.trim()">Speichern</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';
import { useItemsStore } from '../stores/itemsStore.js';
import { useCategoriesStore } from '../stores/categoriesStore.js';

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  item: { type: Object, default: null }
});
const emit = defineEmits(['update:modelValue', 'saved']);

const itemsStore = useItemsStore();
const categoriesStore = useCategoriesStore();

const name = ref('');
const categoryId = ref(null);
const error = ref('');
const nameInput = ref(null);

watch(
  () => [props.modelValue, props.item],
  async ([open, item]) => {
    if (open && item) {
      name.value = item.name;
      categoryId.value = item.categoryId ?? null;
      error.value = '';
      await nextTick();
      nameInput.value?.focus();
      nameInput.value?.select();
    }
  }
);

function close() {
  emit('update:modelValue', false);
}

async function save() {
  if (!props.item) return;
  error.value = '';
  try {
    await itemsStore.update(props.item.id, {
      name: name.value,
      categoryId: categoryId.value
    });
    emit('saved', props.item);
    close();
  } catch (e) {
    error.value = e.message ?? 'Speichern fehlgeschlagen.';
  }
}
</script>
