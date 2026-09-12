'use client';

import { useEffect, useState } from 'react';
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal';

export function GlobalQuickAdd() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const editable =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable;

      // Ctrl+Shift+A always (even in inputs — use meta too)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setOpen(true);
        return;
      }

      // Q when not typing
      if (!editable && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        setOpen(true);
      }
    };

    const onQuickAdd = () => setOpen(true);

    window.addEventListener('keydown', onKey);
    window.addEventListener('tf:quick-add', onQuickAdd);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('tf:quick-add', onQuickAdd);
    };
  }, []);

  return <CreateTaskModal open={open} onClose={() => setOpen(false)} />;
}
