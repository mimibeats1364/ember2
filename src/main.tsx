import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/jetbrains-mono';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/components.css';
import './ui/styles/layout.css';
import './ui/styles/screens.css';
import { App } from './app/App';
import { windowLabel } from './platform/native';
import { setLocale } from './i18n';

// Aplica tema e idioma guardados antes del primer render (sin destellos).
try {
  const theme = localStorage.getItem('ember_theme');
  if (theme) document.documentElement.dataset.theme = theme;
  const locale = localStorage.getItem('ember_locale');
  setLocale(locale === 'en' ? 'en' : 'es');
} catch {
  setLocale('es');
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <App window={windowLabel()} />
  </StrictMode>,
);
