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
