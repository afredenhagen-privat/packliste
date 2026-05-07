<template>
  <span
    class="chip"
    :style="{
      backgroundColor: backgroundColor,
      color: textColor
    }"
  >
    {{ name ?? 'Ohne Kategorie' }}
  </span>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  name: { type: String, default: null },
  color: { type: String, default: '#64748b' }
});

const backgroundColor = computed(() => withAlpha(props.color, 0.18));
const textColor = computed(() => props.color);

function withAlpha(hex, alpha) {
  const c = hex.replace('#', '');
  const bigint = parseInt(
    c.length === 3
      ? c
          .split('')
          .map((x) => x + x)
          .join('')
      : c,
    16
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
</script>
