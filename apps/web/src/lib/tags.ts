export const TAG_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#22d3ee',
  '#fb7185',
];

/** Ключи lucide-иконок для тегов (контурные, без эмодзи) */
export const TAG_ICONS = [
  'briefcase',
  'dumbbell',
  'sparkles',
  'sprout',
  'home',
  'shopping-cart',
  'book',
  'target',
  'lightbulb',
  'star',
  'flame',
  'heart',
  'music',
  'coffee',
  'car',
  'plane',
  'gift',
  'palette',
  'camera',
  'code',
  'trophy',
  'rocket',
  'bell',
  'tag',
];

export function randomTagColor(): string {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

/** Название тега без иконки (иконка рисуется компонентом TagIcon) */
export function tagLabel(tag: { name?: string } | null | undefined): string {
  return tag?.name || '';
}
