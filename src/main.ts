import './ui/theme.css';
import './ui/shell.css';
import { listCities } from './city/registry.ts';
import { mountDashboard } from './dashboard.ts';
import { mountCityApp } from './ui/citySwitcher.ts';
import { createTheme } from './ui/theme.ts';

const app = document.getElementById('app');
if (app) {
  const theme = createTheme();
  mountCityApp(app, { cities: listCities(), mount: (root, id, extras) => mountDashboard(root, id, theme, extras) });
}
