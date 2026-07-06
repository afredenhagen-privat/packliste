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
  </Teleport>
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

// Beim Öffnen: alle Checkboxen initial UNGECHECKT – der Nutzer entscheidet
// bewusst pro Feld, was übernommen wird. immediate, damit das Seeding auch
// bei einem frisch gemounteten Sheet greift (unabhängig vom Parent).
watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      Object.keys(addSelected).forEach((k) => delete addSelected[k]);
      Object.keys(removeSelected).forEach((k) => delete removeSelected[k]);
      diff.value.added.forEach((a) => (addSelected[a.itemId] = false));
      diff.value.removed.forEach((r) => (removeSelected[r.templateItemId] = false));
    }
  },
  { immediate: true }
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
