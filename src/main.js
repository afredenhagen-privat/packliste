import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router.js';
import { initDatabase } from './db/database.js';
import { seedDefaultCategories } from './db/seed.js';
import './styles/main.css';

async function bootstrap() {
  await initDatabase();
  await seedDefaultCategories();

  const app = createApp(App);
  app.use(createPinia());
  app.use(router);
  app.mount('#app');
}

bootstrap();
