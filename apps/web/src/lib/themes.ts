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
  /** CSS-сцена-заглушка, пока грузится картинка */
  previewScene: string;
  /** Большие обои темы: apps/web/public/themes/<id>.png */
  bgImage: string;
  /** Миниатюра для выбора темы: apps/web/public/themes/mini/<id>.png */
  previewImage: string;
}

function theme(
  id: AppThemeId,
  label: string,
  description: string,
  preview: AppTheme['preview'],
  previewScene: string
): AppTheme {
  return {
    id,
    label,
    description,
    preview,
    previewScene,
    bgImage: `/themes/${id}.png`,
    previewImage: `/themes/mini/${id}.png`,
  };
}

export const APP_THEMES: AppTheme[] = [
  theme(
    'light',
    'Светлая',
    'Воздушные острова',
    { bg: '#f8fafc', sidebar: '#ffffff', primary: '#3b82f6', accent: '#e2e8f0' },
    'radial-gradient(circle at 70% 20%, #ffffff 0%, transparent 45%), radial-gradient(circle at 20% 80%, #bae6fd 0%, transparent 40%), linear-gradient(180deg, #7dd3fc 0%, #e0f2fe 55%, #f8fafc 100%)'
  ),
  theme(
    'dark',
    'Тёмная',
    'Ночной космос',
    { bg: '#0f172a', sidebar: '#1e293b', primary: '#3b82f6', accent: '#334155' },
    'radial-gradient(circle at 78% 22%, #c4b5fd 0%, #7c3aed 18%, transparent 42%), radial-gradient(ellipse at 20% 90%, #1e1b4b 0%, transparent 55%), linear-gradient(180deg, #0b0620 0%, #131033 55%, #1e1b4b 100%)'
  ),
  theme(
    'ocean',
    'Океан',
    'Неоновая глубина',
    { bg: '#020617', sidebar: '#0c1929', primary: '#38bdf8', accent: '#0ea5e9' },
    'radial-gradient(ellipse at 50% -10%, #a5f3fc 0%, transparent 45%), radial-gradient(circle at 80% 70%, #0ea5e9 0%, transparent 40%), linear-gradient(180deg, #083344 0%, #0c4a6e 50%, #020617 100%)'
  ),
  theme(
    'forest',
    'Лес',
    'Зелёные горы',
    { bg: '#052e16', sidebar: '#14532d', primary: '#4ade80', accent: '#22c55e' },
    'radial-gradient(circle at 75% 15%, #bbf7d0 0%, transparent 35%), radial-gradient(ellipse at 15% 85%, #166534 0%, transparent 55%), linear-gradient(180deg, #052e16 0%, #14532d 55%, #052e16 100%)'
  ),
  theme(
    'crimson',
    'Энергия',
    'Красное ядро',
    { bg: '#1a0505', sidebar: '#3f0a0a', primary: '#f87171', accent: '#ef4444' },
    'radial-gradient(circle at 50% 55%, #fca5a5 0%, #ef4444 22%, transparent 55%), radial-gradient(ellipse at 50% 110%, #7f1d1d 0%, transparent 60%), linear-gradient(180deg, #1a0505 0%, #3f0a0a 60%, #0c0202 100%)'
  ),
  theme(
    'violet',
    'Неон',
    'Фиолетовый киберпанк',
    { bg: '#0c0118', sidebar: '#1a0a2e', primary: '#c084fc', accent: '#a855f7' },
    'radial-gradient(circle at 50% 50%, #e9d5ff 0%, #a855f7 20%, transparent 48%), radial-gradient(ellipse at 85% 90%, #6d28d9 0%, transparent 50%), linear-gradient(180deg, #0c0118 0%, #1e1040 60%, #0c0118 100%)'
  ),
];
