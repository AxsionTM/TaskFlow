'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Flag, Calendar, Tag, Folder, AlignLeft, Clock3, AlertTriangle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTasksStore } from '@/stores/tasks';
import { useProjectsStore } from '@/stores/projects';
import { api } from '@/lib/api';
import { cn, priorityLabels } from '@/lib/utils';
import { TAG_COLORS, TAG_ICONS, randomTagColor } from '@/lib/tags';
import { TagIcon } from '@/components/tasks/TagIcon';

const PRIORITIES = [
  { value: 'NONE', label: 'Нет', color: 'text-emerald-500', bg: 'bg-emerald-600' },
  { value: 'LOW', label: 'Низкий', color: 'text-blue-500', bg: 'bg-blue-500' },
  { value: 'MEDIUM', label: 'Средний', color: 'text-amber-500', bg: 'bg-amber-500' },
  { value: 'HIGH', label: 'Высокий', color: 'text-red-500', bg: 'bg-red-500' },
];

function toIso(date: string, time: string) {
  if (!date) return null;
  const t = time || '12:00';
  const d = new Date(`${date}T${t}:00`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Дата YYYY-MM-DD для предзаполнения срока (календарь, повестка) */
  initialDate?: string;
}

export function CreateTaskModal({ open, onClose, initialDate }: Props) {
  const { createTask, currentProjectId, refreshCurrentView } = useTasksStore();
  const { projects, fetchProjects } = useProjectsStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('NONE');
  const [projectId, setProjectId] = useState('');
  const [startDate, setStartDate] = useState(initialDate || '');
  const [startTime, setStartTime] = useState('');
  const [dueDate, setDueDate] = useState(initialDate || '');
  const [dueTime, setDueTime] = useState('');
  const [tags, setTags] = useState<any[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [newTagIcon, setNewTagIcon] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[4]);
  const [remindMinutes, setRemindMinutes] = useState<number | ''>('');
  const [remindRepeat, setRemindRepeat] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [timeConflict, setTimeConflict] = useState('');
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [pendingData, setPendingData] = useState<any | null>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    fetchProjects();
    setProjectId(currentProjectId || '');
    setStartDate(initialDate || '');
    setDueDate(initialDate || '');
    api.getTags().then(({ tags: t }) => setTags(t)).catch(() => {});
  }, [open, currentProjectId, fetchProjects, initialDate]);

  // Поле описания растет вместе с текстом вместо 2 строк со скроллом.
  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 320) + 'px';
  }, [description, open]);

  const reset = () => {
    setTitle('');
    setDescription('');
    setPriority('NONE');
    setProjectId(currentProjectId || '');
    setStartDate(initialDate || '');
    setStartTime('');
    setDueDate(initialDate || '');
    setDueTime('');
    setSelectedTagIds([]);
    setNewTag('');
    setNewTagIcon('');
    setNewTagColor(TAG_COLORS[4]);
    setRemindMinutes('');
    setRemindRepeat('');
    setError('');
    setTimeConflict('');
    setConflicts([]);
    setPendingData(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const addTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    try {
      const { tag } = await api.createTag({
        name,
        color: newTagColor || randomTagColor(),
        icon: newTagIcon || null,
      });
      setTags((prev) => [...prev, tag]);
      setSelectedTagIds((prev) => [...prev, tag.id]);
      setNewTag('');
      setNewTagIcon('');
      setNewTagColor(TAG_COLORS[4]);
    } catch {}
  };

  const performCreate = async (data: any) => {
    await createTask(data);
    handleClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      let startIso = toIso(startDate, startTime);
      let dueIso = toIso(dueDate, dueTime || (dueDate && startTime ? startTime : ''));
      // Если время не указали — стартуем прямо сейчас (+1 час на выполнение),
      // чтобы задача не падала холостой во Входящие.
      const autoDates = !startIso && !dueIso;
      if (autoDates) {
        const now = new Date();
        startIso = now.toISOString();
        dueIso = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      }
      const data: any = {
        title: title.trim(),
        description: description.trim() || undefined,
        priority: priority !== 'NONE' ? priority : 'NONE',
        projectId: projectId || undefined,
        isAllDay: autoDates ? false : !startTime && !dueTime,
        tagIds: selectedTagIds.length ? selectedTagIds : undefined,
      };
      if (startIso) data.startDate = startIso;
      if (dueIso) data.dueDate = dueIso;
      if (dueIso && remindMinutes !== '') data.remindMinutes = Number(remindMinutes);
      if (dueIso && remindMinutes !== '' && remindRepeat !== '') {
        data.remindRepeatMinutes = Number(remindRepeat);
      }

      // Автодаты не проверяем на пересечения — они служебные.
      if (startIso && dueIso && !autoDates) {
        try {
          const { tasks: existing } = await api.getTasks({ includeCompleted: 'false' });
          const startMs = new Date(startIso).getTime();
          const dueMs = new Date(dueIso).getTime();
          const found = existing.filter((t: any) => {
            if (!t.startDate || !t.dueDate || t.status === 'COMPLETED' || t.parentId) return false;
            return new Date(t.startDate).getTime() < dueMs && new Date(t.dueDate).getTime() > startMs;
          });
          if (found.length) {
            setConflicts(found);
            setPendingData(data);
            setTimeConflict('');
            return;
          }
        } catch {
          // Conflict checking is advisory. Creation must still work if the list cannot be loaded.
        }
      }
      await performCreate(data);
    } catch (err: any) {
      setError(err.message || 'Не удалось создать задачу');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmCreateDespiteConflict = async () => {
    if (!pendingData || submitting) return;
    setSubmitting(true);
    try {
      await performCreate(pendingData);
    } catch (err: any) {
      setError(err.message || 'Не удалось создать задачу');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelConflict = () => {
    setConflicts([]);
    setPendingData(null);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={handleClose} />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-2xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {conflicts.length > 0 && (
          <div className="absolute inset-x-0 top-0 z-20 flex max-h-[80vh] flex-col rounded-2xl border bg-card shadow-2xl">
            <div className="flex items-start gap-3 border-b px-5 py-4">
              <div className="mt-0.5 rounded-full bg-amber-500/10 p-2 text-amber-500"><AlertTriangle className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">Пересечение времени</h3>
                <p className="mt-1 text-xs text-muted-foreground">На выбранный период уже запланированы задачи. Создание не блокируется.</p>
              </div>
              <button type="button" onClick={cancelConflict} className="rounded-lg p-1.5 hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-[46vh] overflow-y-auto p-4 space-y-2">
              {conflicts.map((conflict: any) => (
                <div key={conflict.id} className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{conflict.title}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock3 className="h-3 w-3" />{new Date(conflict.startDate).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })} — {new Date(conflict.dueDate).toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' })}</div>
                      {conflict.description && <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{conflict.description}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 border-t bg-muted/10 px-4 py-3">
              <Button type="button" variant="ghost" size="sm" onClick={cancelConflict}>Отменить</Button>
              <Button type="button" size="sm" onClick={confirmCreateDespiteConflict} disabled={submitting}><Check className="mr-1.5 h-4 w-4" />Подтвердить время</Button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between px-5 py-3.5 border-b">
          <h2 className="text-sm font-semibold">Новая задача</h2>
          <button type="button" onClick={handleClose} className="p-1 rounded-lg hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <Input
            placeholder="Название задачи"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            className="text-base font-medium h-10"
          />

          <div className="flex items-start gap-2">
            <AlignLeft className="h-4 w-4 mt-2.5 text-muted-foreground shrink-0" />
            <textarea
              ref={descRef}
              placeholder="Описание"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Priority flags */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
              <Flag className="h-3.5 w-3.5" />
              Приоритет
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={cn(
                    'inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-colors',
                    priority === p.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  )}
                >
                  <Flag className={cn('h-3.5 w-3.5 fill-current', p.color)} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Project */}
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Входящие (без проекта)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Calendar className="h-3.5 w-3.5" />
              Срок
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground">Начало</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (e.target.value && !startTime) setStartTime('09:00');
                  }}
                  className="mt-0.5 flex h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Время начала</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={!startDate}
                  className="mt-0.5 flex h-9 w-full rounded-md border border-input bg-card px-2 text-sm disabled:opacity-40"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Окончание</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    if (e.target.value && !dueTime) setDueTime(startTime || '10:00');
                  }}
                  className="mt-0.5 flex h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Время окончания</label>
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  disabled={!dueDate}
                  className="mt-0.5 flex h-9 w-full rounded-md border border-input bg-card px-2 text-sm disabled:opacity-40"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Без даты время подставится само: начало — сейчас, конец — через час.
            </p>
          </div>

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
              <Tag className="h-3.5 w-3.5" />
              Теги
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag) => {
                const active = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-full border transition-colors',
                      active
                        ? 'bg-primary/15 border-primary text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    )}
                    style={
                      active && tag.color
                        ? { borderColor: tag.color, color: tag.color, backgroundColor: tag.color + '18' }
                        : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      <TagIcon icon={tag.icon} />
                      {tag.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNewTagIcon(newTagIcon ? '' : TAG_ICONS[0])}
                title="Иконка тега"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input bg-card text-muted-foreground"
              >
                {newTagIcon ? <TagIcon icon={newTagIcon} className="h-4 w-4" /> : <TagIcon icon="tag" className="h-4 w-4" />}
              </button>
              <span
                className="h-8 w-8 shrink-0 rounded-full border-2"
                title="Цвет тега"
                style={{
                  backgroundColor: newTagColor,
                  borderColor: `${newTagColor}66`,
                  boxShadow: `0 0 10px -2px ${newTagColor}`,
                }}
              />
              <Input
                placeholder="Новый тег"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={addTag}>
                +
              </Button>
            </div>
            {newTagIcon && (
              <div className="mt-2 grid grid-cols-12 gap-1">
                {TAG_ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setNewTagIcon(icon)}
                    title={icon}
                    className={cn(
                      'flex h-7 items-center justify-center rounded-md border text-muted-foreground transition-all',
                      newTagIcon === icon
                        ? 'border-primary bg-primary/15 scale-110 text-primary'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    <TagIcon icon={icon} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewTagColor(c)}
                  title={c}
                  className={cn(
                    'h-5 w-5 rounded-full transition-transform',
                    newTagColor === c && 'ring-2 ring-offset-2 ring-primary scale-110'
                  )}
                  style={{ backgroundColor: c, boxShadow: `0 0 8px -2px ${c}` }}
                />
              ))}
            </div>
          </div>

          
          {/* Reminder + repeat */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground">Напоминание</label>
              <select
                value={remindMinutes === '' ? '' : String(remindMinutes)}
                onChange={(e) => {
                  const v = e.target.value === '' ? '' : Number(e.target.value);
                  setRemindMinutes(v);
                  if (v === '') setRemindRepeat('');
                }}
                className="mt-0.5 flex h-9 w-full rounded-md border border-input bg-card px-2 text-sm disabled:opacity-40"
              >
                <option value="">Нет</option>
                <option value="0">В момент срока</option>
                <option value="5">За 5 минут</option>
                <option value="15">За 15 минут</option>
                <option value="30">За 30 минут</option>
                <option value="60">За 1 час</option>
                <option value="1440">За 1 день</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Повтор каждых</label>
              <select
                value={remindRepeat === '' ? '' : String(remindRepeat)}
                onChange={(e) =>
                  setRemindRepeat(e.target.value === '' ? '' : Number(e.target.value))
                }
                disabled={remindMinutes === ''}
                title="Будет напоминать повторно с этим интервалом вплоть до срока"
                className="mt-0.5 flex h-9 w-full rounded-md border border-input bg-card px-2 text-sm disabled:opacity-40"
              >
                <option value="">Не повторять</option>
                <option value="1">1 мин</option>
                <option value="5">5 мин</option>
                <option value="10">10 мин</option>
                <option value="20">20 мин</option>
                <option value="30">30 мин</option>
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-muted/20">
          <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
            Отмена
          </Button>
          <Button type="submit" size="sm" disabled={submitting || !title.trim()} className="tf-btn-violet">
            {submitting ? 'Создание...' : 'Создать'}
          </Button>
        </div>
      </form>
    </div>
  );
}
