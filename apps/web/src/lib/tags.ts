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

export const TAG_ICONS = [
  '💼', '💪', '🔮', '🌱', '🏠', '🏡', '📚', '🎯',
  '💡', '❤️', '⭐', '🔥', '🎨', '💰', '✈️', '🎵',
  '📝', '💻', '🏃', '🍎', '📞', '🎬', '🛒', '📌',
];

export function randomTagColor(): string {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

/** "🔮 Личное" — иконка + название везде одинаково */
export function tagLabel(tag: { name?: string; icon?: string | null } | null | undefined): string {
  if (!tag) return '';
  return `${tag.icon ? `${tag.icon} ` : ''}${tag.name || ''}`.trim();
}
