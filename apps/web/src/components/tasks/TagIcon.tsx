'use client';

import {
  Briefcase,
  Dumbbell,
  Sparkles,
  Sprout,
  Home,
  ShoppingCart,
  Book,
  Target,
  Lightbulb,
  Star,
  Flame,
  Heart,
  Music,
  Coffee,
  Car,
  Plane,
  Gift,
  Palette,
  Camera,
  Code,
  Trophy,
  Rocket,
  Bell,
  Tag as TagGlyph,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MAP: Record<string, any> = {
  briefcase: Briefcase,
  dumbbell: Dumbbell,
  sparkles: Sparkles,
  sprout: Sprout,
  home: Home,
  'shopping-cart': ShoppingCart,
  book: Book,
  target: Target,
  lightbulb: Lightbulb,
  star: Star,
  flame: Flame,
  heart: Heart,
  music: Music,
  coffee: Coffee,
  car: Car,
  plane: Plane,
  gift: Gift,
  palette: Palette,
  camera: Camera,
  code: Code,
  trophy: Trophy,
  rocket: Rocket,
  bell: Bell,
  tag: TagGlyph,
};

/** Старые эмодзи-значения маппим на контурные SVG — системных эмодзи в UI нет. */
const EMOJI_MAP: Record<string, string> = {
  '💼': 'briefcase',
  '🏋': 'dumbbell',
  '💪': 'dumbbell',
  '✨': 'sparkles',
  '🌱': 'sprout',
  '🌿': 'sprout',
  '🏠': 'home',
  '🛒': 'shopping-cart',
  '📚': 'book',
  '📖': 'book',
  '🎯': 'target',
  '💡': 'lightbulb',
  '⭐': 'star',
  '🔥': 'flame',
  '❤': 'heart',
  '❤️': 'heart',
  '🎵': 'music',
  '🎶': 'music',
  '☕': 'coffee',
  '🚗': 'car',
  '✈': 'plane',
  '🎁': 'gift',
  '🎨': 'palette',
  '📷': 'camera',
  '💻': 'code',
  '🏆': 'trophy',
  '🚀': 'rocket',
  '🔔': 'bell',
};

/** Контурная монохромная SVG-иконка тега (Lucide outline, без фона). Цвет — через CSS currentColor. */
export function TagIcon({ icon, className }: { icon?: string | null; className?: string }) {
  if (!icon) return <TagGlyph className={cn('h-3 w-3', className)} />;
  const key = EMOJI_MAP[icon] || icon;
  const C = MAP[key];
  if (C) return <C className={cn('h-3 w-3', className)} />;
  // Неизвестное значение — аккуратный дефолтный контур, а не сырой эмодзи-текст
  return <TagGlyph className={cn('h-3 w-3', className)} />;
}
