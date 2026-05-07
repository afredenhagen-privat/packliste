<template>
  <div
    class="flex items-center gap-3 rounded-lg p-3 transition"
    :class="checked ? 'opacity-50' : ''"
  >
    <button
      v-if="checkable"
      type="button"
      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition"
      :class="checked ? 'border-accent-600 bg-accent-600 text-white' : 'border-slate-300 dark:border-slate-700'"
      :aria-label="checked ? 'Erledigt – abhaken rückgängig' : 'Als gepackt markieren'"
      @click="$emit('toggle')"
    >
      <span v-if="checked" aria-hidden="true">✓</span>
    </button>

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <span
          class="font-medium"
          :class="checked ? 'line-through text-slate-500' : 'text-slate-900 dark:text-slate-100'"
        >
          {{ item.name }}
        </span>
        <span v-if="quantity > 1" class="text-xs text-slate-500">×{{ quantity }}</span>
        <CategoryChip
          v-if="categoryName"
          :name="categoryName"
          :color="categoryColor"
        />
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-1">
      <button
        v-if="quantityEditable"
        type="button"
        class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        :aria-label="'Menge verringern'"
        @click="$emit('quantity-change', Math.max(1, quantity - 1))"
      >−</button>
      <button
        v-if="quantityEditable"
        type="button"
        class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        :aria-label="'Menge erhöhen'"
        @click="$emit('quantity-change', quantity + 1)"
      >+</button>
      <button
        v-if="removable"
        type="button"
        class="rounded-md p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
        aria-label="Entfernen"
        @click="$emit('remove')"
      >🗑</button>
    </div>
  </div>
</template>

<script setup>
import CategoryChip from './CategoryChip.vue';

defineProps({
  item: { type: Object, required: true }, // {id, name, ...}
  quantity: { type: Number, default: 1 },
  checked: { type: Boolean, default: false },
  checkable: { type: Boolean, default: false },
  quantityEditable: { type: Boolean, default: true },
  removable: { type: Boolean, default: true },
  categoryName: { type: String, default: null },
  categoryColor: { type: String, default: '#64748b' }
});

defineEmits(['toggle', 'quantity-change', 'remove']);
</script>
