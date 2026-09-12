'use client';

import { cn } from '@/lib/utils';
import { TagIcon } from '@/components/tasks/TagIcon';

export function TagPill({ tag, className }: { tag: any; className?: string }) {
  if (!tag) return null;
  const color = tag.color || '#888888';
  return (
    <span
      className={cn('tf-tag inline-flex items-center gap-1', className)}
      style={{
        border: `1px solid ${color}cc`,
        color,
        backgroundColor: `${color}26`,
        boxShadow: `0 0 14px -2px ${color}aa, inset 0 0 8px -4px ${color}66`,
        textShadow: `0 0 8px ${color}88`,
        fontWeight: 600,
      }}
    >
      <TagIcon icon={tag.icon} />
      {tag.name}
    </span>
  );
}
