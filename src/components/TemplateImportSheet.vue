<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      @click.self="close"
    >
      <div
        class="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-white p-4 shadow-xl dark:bg-slate-900 sm:rounded-2xl"
        style="padding-bottom: max(1rem, env(safe-area-inset-bottom))"
      >
        <h2 class="mb-1 text-lg font-semibold">Vorlage importieren</h2>
        <p class="mb-3 text-sm text-slate-500">
          Wird als neue Vorlage <strong>„{{ analysis?.suggestedName }}"</strong> angelegt.
        </p>

        <div v-if="!analysis" class="card text-center text-sm text-slate-500">
          Keine Daten.
        </div>

        <div v-else class="flex-1 space-y-4 overflow-y-auto">
          <section v-for="group in grouped" :key="group.key">
            <h3 class="mb-1 flex items-center gap-2 px-1 text-sm font-semibold text-slate-500">
              <span
                v-if="group.color"
                class="inline-block h-3 w-3 rounded-full ring-1 ring-black/10"
                :style="{ backgroundColor: group.color }"
              />
              {{ group.name }}
              <span
                v-if="group.isNewCategory"
                class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-normal text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              >neue Kategorie</span>
            </h3>
            <ul class="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
              <li
                v-for="it in group.items"
                :key="it.name"
                class="flex items-center gap-2 p-3"
              >
                <span class="flex-1">
                  {{ it.name }}
                  <span v-if="it.quantity > 1" class="text-slate-400">× {{ it.quantity }}</span>
                </span>
                <span
                  class="rounded-full px-2 py-0.5 text-xs"
                  :class="it.itemExists
                    ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'"
                >
                  {{ it.itemExists ? 'vorhanden' : 'neu' }}
                </span>
              </li>
            </ul>
          </section>
        </div>

        <div class="flex justify-end gap-2 pt-3">
          <button type="button" class="btn-secondary" @click="close">Abbrechen</button>
          <button
            type="button"
            class="btn-primary"
            :disabled="!analysis || busy"
            @click="confirm"
          >{{ busy ? 'Importiere…' : 'Importieren' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  analysis: { type: Object, default: null },
  busy: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue', 'confirm']);

const grouped = computed(() => {
  if (!props.analysis) return [];
  const map = new Map();
  for (const it of props.analysis.items) {
    const key = it.categoryName ?? '__none__';
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: it.categoryName ?? 'Ohne Kategorie',
        color: it.categoryColor,
        // Kategorie ist neu, wenn sie einen Namen hat und beim Empfänger noch fehlt.
        isNewCategory: it.categoryName != null && !it.categoryExists,
        items: []
      });
    }
    map.get(key).items.push(it);
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === '__none__') return 1;
    if (b.key === '__none__') return -1;
    return a.name.localeCompare(b.name, 'de');
  });
});

function close() {
  emit('update:modelValue', false);
}

function confirm() {
  emit('confirm');
}
</script>
