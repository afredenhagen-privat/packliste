<template>
  <div class="flex h-full flex-col">
    <main class="flex-1 overflow-y-auto pb-20">
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </main>
    <BottomNav />
  </div>
</template>

<script setup>
import BottomNav from './components/BottomNav.vue';
</script>
