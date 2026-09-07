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

/** Контурная иконка тега. Старые эмодзи-значения показывает текстом. */
export function TagIcon({ icon, className }: { icon?: string | null; className?: string }) {
  if (!icon) return null;
  const C = MAP[icon];
  if (C) return <C className={cn('h-3 w-3', className)} />;
  return <span className={className}>{icon}</span>;
}
