<template>
  <div class="mx-auto max-w-2xl space-y-4 p-4">
    <header class="flex items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">Vorlagen</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400">
          Wiederverwendbare Pack-Vorlagen.
        </p>
      </div>
      <button type="button" class="btn-primary" @click="newOpen = true">+ Neu</button>
    </header>

    <ul v-if="templatesStore.templates.length" class="space-y-2">
      <li v-for="t in templatesStore.templates" :key="t.id" class="card flex items-center justify-between">
        <router-link :to="`/templates/${t.id}`" class="flex-1 min-w-0">
          <div class="font-semibold truncate">{{ t.name }}</div>
          <div class="text-xs text-slate-500">
            {{ templatesStore.itemsFor(t.id).length }} Item(s)
          </div>
        </router-link>
        <div class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            class="rounded-md p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
            aria-label="Vorlage löschen"
            @click="confirmDelete(t)"
          >🗑</button>
          <router-link
            :to="`/templates/${t.id}`"
            class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Öffnen"
          >›</router-link>
        </div>
      </li>
    </ul>
    <div v-else class="card text-center text-slate-500">
      Noch keine Vorlage. Lege deine erste Pack-Vorlage an.
    </div>

    <!-- Neu -->
    <div
      v-if="newOpen"
      class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      @click.self="newOpen = false"
    >
      <div class="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl dark:bg-slate-900 sm:rounded-2xl"
        style="padding-bottom: max(1rem, env(safe-area-inset-bottom))"
      >
        <h2 class="mb-3 text-lg font-semibold">Neue Vorlage</h2>
        <form @submit.prevent="create">
          <input ref="nameInput" v-model="newName" class="input" placeholder="z. B. Geschäftsreise" />
          <div class="mt-3 flex justify-end gap-2">
            <button type="button" class="btn-secondary" @click="newOpen = false">Abbrechen</button>
            <button type="submit" class="btn-primary" :disabled="!newName.trim()">Anlegen</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useTemplatesStore } from '../stores/templatesStore.js';
import { useItemsStore } from '../stores/itemsStore.js';
import { useCategoriesStore } from '../stores/categoriesStore.js';

const templatesStore = useTemplatesStore();
const itemsStore = useItemsStore();
const categoriesStore = useCategoriesStore();
const router = useRouter();

const newOpen = ref(false);
const newName = ref('');
const nameInput = ref(null);

watch(newOpen, async (v) => {
  if (v) {
    newName.value = '';
    await nextTick();
    nameInput.value?.focus();
  }
});

onMounted(async () => {
  if (!templatesStore.loaded) await templatesStore.load();
  if (!itemsStore.loaded) await itemsStore.load();
  if (!categoriesStore.loaded) await categoriesStore.load();
});

async function create() {
  const trimmed = newName.value.trim();
  if (!trimmed) return;
  const tpl = await templatesStore.create(trimmed);
  newOpen.value = false;
  router.push(`/templates/${tpl.id}`);
}

async function confirmDelete(t) {
  if (!window.confirm(`Vorlage "${t.name}" löschen?`)) return;
  await templatesStore.remove(t.id);
}
</script>
