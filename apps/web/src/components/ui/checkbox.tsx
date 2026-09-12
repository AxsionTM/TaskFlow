'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface CheckboxProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  priority?: string;
  ghost?: boolean;
  size?: 'sm' | 'md';
}

export function Checkbox({ checked, onCheckedChange, className, priority, ghost, size }: CheckboxProps) {
  const colorMap: Record<string, string> = {
    HIGH: 'border-red-500 data-[checked]:bg-red-500',
    MEDIUM: 'border-amber-500 data-[checked]:bg-amber-500',
    LOW: 'border-blue-500 data-[checked]:bg-blue-500',
    NONE: 'border-emerald-600 data-[checked]:bg-emerald-600',
  };
  const checkColorMap: Record<string, string> = {
    HIGH: 'text-red-500',
    MEDIUM: 'text-amber-500',
    LOW: 'text-blue-500',
    NONE: 'text-emerald-500',
  };
  const key = priority || 'NONE';
  const md = size === 'md';

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      data-checked={checked || undefined}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'shrink-0 rounded-full border-2 transition-colors flex items-center justify-center bg-transparent',
        md ? 'h-[22px] w-[22px]' : 'h-4 w-4',
        ghost
          ? cn(colorMap[key].split(' ')[0], checked && checkColorMap[key])
          : cn(colorMap[key], checked && 'text-white data-[checked]:text-white'),
        className
      )}
    >
      {checked && <Check className={md ? 'h-3.5 w-3.5' : 'h-3 w-3'} strokeWidth={3.5} />}
    </button>
  );
}
