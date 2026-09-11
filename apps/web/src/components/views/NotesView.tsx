'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Trash2, Check, Loader2, StickyNote, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useNotesStore } from '@/stores/notes';
import { cn } from '@/lib/utils';

function fmtNoteDate(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function NoteEditor({
  noteId,
  taskId,
  taskTitle,
  onClose,
  onSaved,
  onDeleted,
}: {
  noteId: string | null;
  taskId?: string;
  taskTitle: string;
  onClose: () => void;
  onSaved: (note: any) => void;
  onDeleted: (id: string) => void;
}) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [existingId, setExistingId] = useState<string | null>(noteId);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const load = async () => {
      try {
        if (noteId) {
          const { note } = await api.getNote(noteId);
          if (alive) {
            setContent(note.content || '');
            setExistingId(note.id);
          }
        } else if (taskId) {
          const { note } = await api.getNoteByTask(taskId);
          if (alive) {
            setContent(note?.content || '');
            setExistingId(note?.id || null);
          }
        }
      } catch (e: any) {
        if (alive) setError(e.message || 'Не удалось загрузить заметку');
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [noteId, taskId]);

  const save = async () => {
    const text = content.trim();
    if (!text) {
      setError('Заметка не может быть пустой');
      return;
    }
    if (text.length > 20000) {
      setError('Заметка слишком большая (максимум 20000 символов)');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let note: any;
      if (existingId) {
        note = (await api.updateNote(existingId, text)).note;
      } else if (taskId) {
        note = (await api.createNote({ taskId, content: text })).note;
        setExistingId(note.id);
      }
      if (note) onSaved(note);
    } catch (e: any) {
      setError(e.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existingId) return;
    if (!confirm('Удалить заметку? Задача останется без изменений.')) return;
    setSaving(true);
    try {
      await api.deleteNote(existingId);
      onDeleted(existingId);
    } catch (e: any) {
      setError(e.message || 'Не удалось удалить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tf-note-editor flex min-h-0 flex-1 flex-col">
      <div className="tf-note-editor-head flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Отмена
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-sm font-semibold">Редактирование</span>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
          className="flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Сохранить'}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-xl bg-gradient-to-r from-violet-600 to-indigo-500 px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_4px_18px_-4px_rgba(139,92,246,.6)]">
            <StickyNote className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{taskTitle}</span>
          </span>
        </div>

        {error && (
          <div className="shrink-0 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Текст заметки…"
            rows={14}
            maxLength={20000}
            className="min-h-[280px] w-full flex-1 resize-none rounded-2xl border border-border/60 bg-card/50 p-3.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
          />
        )}
        <div className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
          {content.length} / 20000
        </div>
      </div>

      <div className="tf-note-editor-foot grid shrink-0 grid-cols-2 gap-2.5 border-t border-border/50 p-3 sm:p-4">
        <button
          type="button"
          onClick={() => void remove()}
          disabled={saving || loading || !existingId}
          className="flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-red-500/40 bg-red-500/10 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
          Удалить
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
          className="tf-btn-violet flex h-12 items-center justify-center gap-1.5 rounded-2xl text-sm font-semibold disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Сохранить
        </button>
      </div>
    </div>
  );
}

export function NotesView() {
  const {
    notes,
    isLoading,
    fetchNotes,
    setSelectedNote,
    selectedNoteId,
    pendingTask,
    clearPendingTask,
    upsertPreview,
    removeFromList,
  } = useNotesStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) => n.taskTitle.toLowerCase().includes(q) || n.preview.toLowerCase().includes(q)
    );
  }, [notes, query]);

  const editorOpen = Boolean(selectedNoteId || pendingTask);
  const activeNote = selectedNoteId ? notes.find((n) => n.id === selectedNoteId) : null;
  const editorTitle = activeNote?.taskTitle || pendingTask?.taskTitle || '';

  return (
    <div className="flex min-h-0 flex-1">
      {/* Список */}
      <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col', editorOpen && 'hidden lg:flex')}>
        <div className="tf-view-header flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <h1 className="mr-auto text-lg font-semibold">Мои заметки</h1>
          <span className="text-xs tabular-nums text-muted-foreground">{notes.length}</span>
        </div>
        <div className="shrink-0 px-4 pt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск заметок…"
              className="h-10 w-full rounded-xl border border-input bg-card/60 pl-9 pr-3 text-sm outline-none backdrop-blur focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 ? (
            <div className="tf-glass flex flex-col items-center justify-center rounded-2xl py-14 text-muted-foreground">
              <StickyNote className="mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">{query ? 'Ничего не найдено' : 'Заметок пока нет'}</p>
              {!query && (
                <p className="mt-1 px-6 text-center text-xs">Откройте задачу и нажмите «Заметка», чтобы создать первую</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {visible.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setSelectedNote(n.id)}
                  className={cn(
                    'group rounded-2xl border border-primary/20 bg-card/50 p-3.5 text-left backdrop-blur transition-all hover:border-primary/50 hover:brightness-110',
                    selectedNoteId === n.id && 'border-primary/60 ring-1 ring-primary/50'
                  )}
                  style={{ boxShadow: '0 0 18px -10px var(--tf-glow)' }}
                >
                  <span className="mb-2 inline-flex max-w-full items-center gap-1.5 truncate rounded-lg bg-gradient-to-r from-violet-600/90 to-indigo-500/90 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="truncate">{n.taskTitle}</span>
                  </span>
                  <span className="line-clamp-3 block min-h-[54px] text-[13px] leading-relaxed text-foreground/90">
                    {n.preview}
                  </span>
                  <span className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{fmtNoteDate(n.updatedAt)}</span>
                    <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Редактор: справа на десктопе, отдельным экраном на мобильном */}
      {editorOpen && (
        <div className="tf-note-panel flex min-h-0 min-w-0 flex-1 flex-col border-border/50 bg-card/40 backdrop-blur lg:max-w-md lg:border-l">
          <NoteEditor
            noteId={selectedNoteId}
            taskId={pendingTask?.taskId}
            taskTitle={editorTitle}
            onClose={() => {
              setSelectedNote(null);
              clearPendingTask();
            }}
            onSaved={(note) => {
              upsertPreview(note);
              setSelectedNote(note.id);
              clearPendingTask();
            }}
            onDeleted={(id) => {
              removeFromList(id);
              setSelectedNote(null);
              clearPendingTask();
            }}
          />
        </div>
      )}
    </div>
  );
}
