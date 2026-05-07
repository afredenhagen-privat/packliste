<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90"
    style="padding-bottom: env(safe-area-inset-bottom)"
  >
    <ul class="mx-auto flex max-w-2xl items-stretch justify-around">
      <li v-for="tab in tabs" :key="tab.to" class="flex-1">
        <router-link
          :to="tab.to"
          class="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500 transition active:scale-95 dark:text-slate-400"
          active-class="text-accent-600 dark:text-accent-500"
        >
          <span class="text-2xl leading-none" aria-hidden="true">{{ tab.icon }}</span>
          {{ tab.label }}
        </router-link>
      </li>
    </ul>
  </nav>
</template>

<script setup>
const tabs = [
  { to: '/', label: 'Reisen', icon: '🧳' },
  { to: '/templates', label: 'Vorlagen', icon: '📋' },
  { to: '/library', label: 'Bibliothek', icon: '📚' },
  { to: '/settings', label: 'Einstellungen', icon: '⚙️' }
];
</script>
