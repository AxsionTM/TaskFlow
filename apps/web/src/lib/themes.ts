export type AppThemeId =
  | 'light'
  | 'dark'
  | 'ocean'
  | 'forest'
  | 'crimson'
  | 'violet';

export interface AppTheme {
  id: AppThemeId;
  label: string;
  description: string;
  /** Tailwind-ish preview colors */
  preview: {
    bg: string;
    sidebar: string;
    primary: string;
    accent: string;
  };
  /**
   * Мини-обои для карточки темы (CSS-сцена в духе дизайна).
   * Если положить файл `apps/web/public/themes/<id>.jpg`, он ляжет
   * поверх градиента автоматически (см. --tf-bg-image в globals.css).
   */
  previewScene: string;
  bgImage: string;
}

export const APP_THEMES: AppTheme[] = [
  {
    id: 'light',
    label: 'Светлая',
    description: 'Воздушные острова',
    preview: { bg: '#f8fafc', sidebar: '#ffffff', primary: '#3b82f6', accent: '#e2e8f0' },
    previewScene:
      'radial-gradient(circle at 70% 20%, #ffffff 0%, transparent 45%), radial-gradient(circle at 20% 80%, #bae6fd 0%, transparent 40%), linear-gradient(180deg, #7dd3fc 0%, #e0f2fe 55%, #f8fafc 100%)',
    bgImage: '/themes/light.jpg',
  },
  {
    id: 'dark',
    label: 'Тёмная',
    description: 'Ночной космос',
    preview: { bg: '#0f172a', sidebar: '#1e293b', primary: '#3b82f6', accent: '#334155' },
    previewScene:
      'radial-gradient(circle at 78% 22%, #c4b5fd 0%, #7c3aed 18%, transparent 42%), radial-gradient(ellipse at 20% 90%, #1e1b4b 0%, transparent 55%), linear-gradient(180deg, #0b0620 0%, #131033 55%, #1e1b4b 100%)',
    bgImage: '/themes/dark.jpg',
  },
  {
    id: 'ocean',
    label: 'Океан',
    description: 'Неоновая глубина',
    preview: { bg: '#020617', sidebar: '#0c1929', primary: '#38bdf8', accent: '#0ea5e9' },
    previewScene:
      'radial-gradient(ellipse at 50% -10%, #a5f3fc 0%, transparent 45%), radial-gradient(circle at 80% 70%, #0ea5e9 0%, transparent 40%), linear-gradient(180deg, #083344 0%, #0c4a6e 50%, #020617 100%)',
    bgImage: '/themes/ocean.jpg',
  },
  {
    id: 'forest',
    label: 'Лес',
    description: 'Зелёные горы',
    preview: { bg: '#052e16', sidebar: '#14532d', primary: '#4ade80', accent: '#22c55e' },
    previewScene:
      'radial-gradient(circle at 75% 15%, #bbf7d0 0%, transparent 35%), radial-gradient(ellipse at 15% 85%, #166534 0%, transparent 55%), linear-gradient(180deg, #052e16 0%, #14532d 55%, #052e16 100%)',
    bgImage: '/themes/forest.jpg',
  },
  {
    id: 'crimson',
    label: 'Энергия',
    description: 'Красное ядро',
    preview: { bg: '#1a0505', sidebar: '#3f0a0a', primary: '#f87171', accent: '#ef4444' },
    previewScene:
      'radial-gradient(circle at 50% 55%, #fca5a5 0%, #ef4444 22%, transparent 55%), radial-gradient(ellipse at 50% 110%, #7f1d1d 0%, transparent 60%), linear-gradient(180deg, #1a0505 0%, #3f0a0a 60%, #0c0202 100%)',
    bgImage: '/themes/crimson.jpg',
  },
  {
    id: 'violet',
    label: 'Неон',
    description: 'Фиолетовый киберпанк',
    preview: { bg: '#0c0118', sidebar: '#1a0a2e', primary: '#c084fc', accent: '#a855f7' },
    previewScene:
      'radial-gradient(circle at 50% 50%, #e9d5ff 0%, #a855f7 20%, transparent 48%), radial-gradient(ellipse at 85% 90%, #6d28d9 0%, transparent 50%), linear-gradient(180deg, #0c0118 0%, #1e1040 60%, #0c0118 100%)',
    bgImage: '/themes/violet.jpg',
  },
];
