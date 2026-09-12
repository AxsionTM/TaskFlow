import { create } from 'zustand';
import { api } from '@/lib/api';

export interface NotePreview {
  id: string;
  taskId: string;
  taskTitle: string;
  preview: string;
  updatedAt: string;
}

export interface PendingTaskNote {
  taskId: string;
  taskTitle: string;
}

interface NotesState {
  notes: NotePreview[];
  isLoading: boolean;
  selectedNoteId: string | null;
  pendingTask: PendingTaskNote | null;
  fetchNotes: (opts?: { silent?: boolean }) => Promise<void>;
  setSelectedNote: (id: string | null) => void;
  openForTask: (taskId: string, taskTitle: string) => void;
  clearPendingTask: () => void;
  removeFromList: (id: string) => void;
  upsertPreview: (note: any) => void;
}

function toPreview(note: any): NotePreview {
  const flat = String(note.content || '').replace(/\s+/g, ' ').trim();
  const preview = flat.length > 160 ? flat.slice(0, 159).trimEnd() + '…' : flat;
  return {
    id: note.id,
    taskId: note.taskId,
    taskTitle: note.task?.title || '',
    preview,
    updatedAt: note.updatedAt,
  };
}

export { toPreview };

export const useNotesStore = create<NotesState>((set) => ({
  notes: [],
  isLoading: false,
  selectedNoteId: null,
  pendingTask: null,

  fetchNotes: async (opts) => {
    const silent = Boolean(opts?.silent);
    if (!silent) set({ isLoading: true });
    try {
      const { notes } = await api.getNotes();
      set({ notes, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  setSelectedNote: (id) => set({ selectedNoteId: id, pendingTask: null }),

  openForTask: (taskId, taskTitle) => set({ pendingTask: { taskId, taskTitle }, selectedNoteId: null }),

  clearPendingTask: () => set({ pendingTask: null }),

  removeFromList: (id) =>
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId,
    })),

  upsertPreview: (note) =>
    set((s) => {
      const p = toPreview(note);
      const idx = s.notes.findIndex((n) => n.id === p.id);
      if (idx >= 0) {
        const next = [...s.notes];
        next[idx] = p;
        next.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
        return { notes: next };
      }
      return { notes: [p, ...s.notes] };
    }),
}));
