<template>
  <div class="space-y-1">
    <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
      <span>{{ checked }} / {{ total }} gepackt</span>
      <span>{{ percent }}%</span>
    </div>
    <div class="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
      <div
        class="h-full rounded-full bg-accent-600 transition-all duration-300"
        :style="{ width: percent + '%' }"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  checked: { type: Number, required: true },
  total: { type: Number, required: true }
});

const percent = computed(() => {
  if (props.total === 0) return 0;
  return Math.round((props.checked / props.total) * 100);
});
</script>
