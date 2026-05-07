import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'trips',
    component: () => import('./views/TripsView.vue')
  },
  {
    path: '/trips/:id',
    name: 'trip-detail',
    component: () => import('./views/TripDetailView.vue'),
    props: (r) => ({ id: Number(r.params.id) })
  },
  {
    path: '/templates',
    name: 'templates',
    component: () => import('./views/TemplatesView.vue')
  },
  {
    path: '/templates/:id',
    name: 'template-detail',
    component: () => import('./views/TemplateDetailView.vue'),
    props: (r) => ({ id: Number(r.params.id) })
  },
  {
    path: '/library',
    name: 'library',
    component: () => import('./views/LibraryView.vue')
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('./views/SettingsView.vue')
  }
];

export default createRouter({
  // BASE_URL kommt aus vite.config.js (lokal '/', auf GitHub Pages '/packliste/')
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior() {
    return { top: 0 };
  }
});
