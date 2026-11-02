import './ui/theme.css';
import './ui/shell.css';
import { listCities } from './city/registry.ts';
import { mountDashboard } from './dashboard.ts';
import { createTheme } from './ui/theme.ts';

const app = document.getElementById('app');
if (app) mountDashboard(app, listCities()[0].id, createTheme());
