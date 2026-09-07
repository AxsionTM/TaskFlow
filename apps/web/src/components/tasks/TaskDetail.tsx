'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  X,
  Calendar,
  Flag,
  Tag,
  Trash2,
  Plus,
  Check,
  ChevronRight,
  Loader2,
  Sparkles,
  ListTree,
  Archive,
  Clock3,
  FolderKanban,
  ListChecks,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useTasksStore } from '@/stores/tasks';
import { useProjectsStore } from '@/stores/projects';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatDate, priorityLabels } from '@/lib/utils';
import { TAG_COLORS, TAG_ICONS, randomTagColor, tagLabel } from '@/lib/tags';

const PRIORITIES = [
  { value: 'NONE', label: 'Нет', color: 'bg-emerald-600' },
  { value: 'LOW', label: 'Низкий', color: 'bg-blue-500' },
  { value: 'MEDIUM', label: 'Средний', color: 'bg-amber-500' },
  { value: 'HIGH', label: 'Высокий', color: 'bg-red-500' },
];

export function TaskDetail() {
  const { selectedTaskId, setSelectedTask, updateTask, deleteTask, completeTask, createTask } =
    useTasksStore();
  const { projects } = useProjectsStore();

  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('NONE');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [projectId, setProjectId] = useState('');
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [remindMinutes, setRemindMinutes] = useState<number | null>(null);
  const [remindRepeat, setRemindRepeat] = useState<number | ''>('');
  const descRef = useRef<HTMLTextAreaElement>(null);
  const [tags, setTags] = useState<any[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagIcon, setNewTagIcon] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[4]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const isSubtask = Boolean(task?.parentId);
  const childCount = task?.children?.length || 0;
  const completedChildCount = task?.children?.filter((child: any) => child.status === 'COMPLETED').length || 0;
  const formatDateTime = (value?: string | null, allDay = false) => {
    if (!value) return 'Не задано';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Не задано';
    return allDay
      ? d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const loadTask = useCallback(async () => {
    if (!selectedTaskId) {
      setTask(null);
      return;
    }
    setLoading(true);
    try {
      const { task: t } = await api.getTask(selectedTaskId);
      setTask(t);
      setTitle(t.title || '');
      setDescription(t.description || '');
      setPriority(t.priority || 'NONE');
      setDueDate(t.dueDate ? t.dueDate.slice(0, 10) : '');
      setDueTime(t.dueDate && !t.isAllDay ? new Date(t.dueDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
      setStartDate(t.startDate ? t.startDate.slice(0, 10) : '');
      setStartTime(t.startDate && !t.isAllDay ? new Date(t.startDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
      setProjectId(t.projectId || '');
      setSelectedTagIds(t.tags?.map((tt: any) => tt.tag.id) || []);
      if (t.reminders?.length && t.dueDate) {
        const rem = t.reminders[0];
        const diff = Math.round((new Date(t.dueDate).getTime() - new Date(rem.remindAt).getTime()) / 60000);
        setRemindMinutes(diff >= 0 ? diff : 0);
      } else {
        setRemindMinutes(null);
      }
    } catch {
      setSelectedTask(null);
    } finally {
      setLoading(false);
    }
  }, [selectedTaskId, setSelectedTask]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  // Описание растет вместе с текстом вместо 3 строк со скроллом.
  // task/loading в зависимостях: при повторном открытии той же задачи
  // description не меняется, и без этого ресайз не перезапускается,
  // а поле монтируется маленьким (баг из графа).
  useEffect(() => {
    const el = descRef.current;
    if (!el || loading || !task) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 400) + 'px';
  }, [description, selectedTaskId, task, loading]);

  useEffect(() => {
    api.getTags().then(({ tags: t }) => setTags(t)).catch(() => {});
  }, []);

  const save = async (patch: Record<string, any>) => {
    if (!selectedTaskId || saving) return;
    setSaving(true);
    try {
      await updateTask(selectedTaskId, patch);
      await loadTask();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleTitleBlur = () => {
    if (title.trim() && title !== task?.title) {
      save({ title: title.trim() });
    }
  };

  const handleDescriptionBlur = () => {
    if (description !== (task?.description || '')) {
      save({ description: description || null });
    }
  };

  const handlePriorityChange = (p: string) => {
    setPriority(p);
    setShowPriorityMenu(false);
    save({ priority: p });
  };

  
  const saveDates = (sDate: string, sTime: string, dDate: string, dTime: string) => {
    const toIso = (date: string, time: string) => {
      if (!date) return null;
      const t = time || '12:00';
      const d = new Date(`${date}T${t}:00`);
      return isNaN(d.getTime()) ? null : d.toISOString();
    };
    const start = toIso(sDate, sTime);
    const due = toIso(dDate, dTime);
    save({
      startDate: start,
      dueDate: due,
      isAllDay: !sTime && !dTime,
    });
  };

const handleDueDateChange = (value: string) => {
    setDueDate(value);
    if (value) {
      const d = new Date(value);
      d.setHours(12, 0, 0, 0);
      save({ dueDate: d.toISOString() });
    } else {
      save({ dueDate: null });
    }
  };

  const handleProjectChange = (id: string) => {
    setProjectId(id);
    save({ projectId: id || null });
  };

  const handleComplete = async () => {
    if (!selectedTaskId) return;
    await completeTask(selectedTaskId);
    await loadTask();
  };

  const handleDelete = async () => {
    if (!selectedTaskId) return;
    if (!confirm('Удалить задачу?')) return;
    await deleteTask(selectedTaskId);
    setSelectedTask(null);
  };

  const handleAddChecklist = async () => {
    if (!selectedTaskId || !newChecklistTitle.trim()) return;
    await api.addChecklistItem(selectedTaskId, { title: newChecklistTitle.trim() });
    setNewChecklistTitle('');
    await loadTask();
  };

  const handleToggleChecklist = async (itemId: string, isCompleted: boolean) => {
    if (!selectedTaskId) return;
    await api.updateChecklistItem(selectedTaskId, itemId, { isCompleted: !isCompleted });
    await loadTask();
  };

  const handleDeleteChecklist = async (itemId: string) => {
    if (!selectedTaskId) return;
    await api.deleteChecklistItem(selectedTaskId, itemId);
    await loadTask();
  };

  const handleAddSubtask = async () => {
    if (!selectedTaskId || !newSubtaskTitle.trim()) return;
    await createTask({
      title: newSubtaskTitle.trim(),
      parentId: selectedTaskId,
      projectId: task?.projectId || undefined,
    });
    setNewSubtaskTitle('');
    await loadTask();
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    const { tag } = await api.createTag({
      name: newTagName.trim(),
      color: newTagColor || randomTagColor(),
      icon: newTagIcon || null,
    });
    setTags((prev) => [...prev, tag]);
    const next = [...selectedTagIds, tag.id];
    setSelectedTagIds(next);
    setNewTagName('');
    setNewTagIcon('');
    setNewTagColor(TAG_COLORS[4]);
    setShowTagInput(false);
    save({ tagIds: next });
  };

  const toggleTag = (tagId: string) => {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    setSelectedTagIds(next);
    save({ tagIds: next });
  };


  const [aiLoading, setAiLoading] = useState(false);

  const localBreakdown = (title: string, description?: string | null) => {
    const words = `${title} ${description || ''}`.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 3) {
      return [
        { title: `Начать: ${title}`, priority: 'HIGH' },
        { title: `Завершить: ${title}`, priority: 'MEDIUM' },
      ];
    }
    return [
      { title: `Исследовать: ${title}`, priority: 'MEDIUM' },
      { title: `Спланировать: ${title}`, priority: 'HIGH' },
      { title: `Выполнить: ${title}`, priority: 'HIGH' },
      { title: `Проверить результат: ${title}`, priority: 'LOW' },
    ];
  };

  const localPriority = (title: string, description?: string | null) => {
    const t = `${title} ${description || ''}`.toLowerCase();
    if (['срочно', 'asap', 'сегодня', 'критично', 'важно', 'дедлайн'].some((k) => t.includes(k))) {
      return 'HIGH';
    }
    if (['нужно', 'должен', 'необходимо'].some((k) => t.includes(k))) {
      return 'MEDIUM';
    }
    return 'LOW';
  };

  const handleAiBreakdown = async () => {
    if (!selectedTaskId || !task || aiLoading) return;
    setAiLoading(true);
    try {
      let subtasks: { title: string; priority?: string }[] = [];
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/breakdown`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${api.getToken()}`,
            },
            body: JSON.stringify({ title: task.title, description: task.description }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          subtasks = data.subtasks || [];
        }
      } catch {
        /* network — use local */
      }
      if (!subtasks.length) {
        subtasks = localBreakdown(task.title, task.description);
      }
      for (const sub of subtasks) {
        await createTask({
          title: sub.title,
          parentId: selectedTaskId,
          priority: sub.priority || 'NONE',
          projectId: task.projectId || undefined,
        });
      }
      await loadTask();
    } catch (e: any) {
      alert(e.message || 'Не удалось создать подзадачи');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiPriority = async () => {
    if (!selectedTaskId || !task || aiLoading) return;
    setAiLoading(true);
    try {
      let nextPriority: string | null = null;
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/priority`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${api.getToken()}`,
            },
            body: JSON.stringify({ title: task.title, description: task.description }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          nextPriority = data.priority || null;
        }
      } catch {
        /* network — use local */
      }
      if (!nextPriority) {
        nextPriority = localPriority(task.title, task.description);
      }
      setPriority(nextPriority);
      await save({ priority: nextPriority });
    } catch (e: any) {
      alert(e.message || 'Не удалось обновить приоритет');
    } finally {
      setAiLoading(false);
    }
  };

  if (!selectedTaskId) return null;

  return (
    <aside className="task-detail-panel fixed inset-y-0 right-0 z-[80] flex h-[100dvh] w-[min(380px,100vw)] shrink-0 flex-col border-l bg-card shadow-2xl transition-transform duration-200 lg:static lg:z-auto lg:h-full lg:w-[380px] lg:shadow-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm font-medium text-muted-foreground">{isSubtask ? 'Подзадача' : 'Детали задачи'}</span>
        <button
          onClick={() => setSelectedTask(null)}
          className="p-1 rounded hover:bg-accent text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading || !task ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Title + complete */}
          <div className="px-4 pt-4 pb-2 flex items-start gap-3">
            <div className="pt-1" onClick={handleComplete}>
              <Checkbox
                checked={task.status === 'COMPLETED'}
                priority={priority}
              />
            </div>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              rows={2}
              className={cn(
                'flex-1 resize-none bg-transparent text-base font-medium leading-snug outline-none',
                task.status === 'COMPLETED' && 'line-through text-muted-foreground'
              )}
              placeholder="Название задачи"
            />
          </div>

          {/* Compact task summary: important information stays visible even when the panel is scrolled. */}
          <div className="mx-4 mb-3 rounded-xl border bg-background/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Полная информация</span>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", task.status === 'COMPLETED' ? 'bg-emerald-500/15 text-emerald-400' : task.status === 'IN_PROGRESS' ? 'bg-blue-500/15 text-blue-400' : 'bg-muted text-muted-foreground')}>
                {task.status === 'COMPLETED' ? 'Выполнена' : task.status === 'IN_PROGRESS' ? 'В работе' : task.status === 'CANCELLED' ? 'Отменена' : 'К выполнению'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-accent/40 px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />Начало</div>
                <div className="mt-1 font-medium">{formatDateTime(task.startDate, task.isAllDay)}</div>
              </div>
              <div className="rounded-lg bg-accent/40 px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />Окончание</div>
                <div className="mt-1 font-medium">{formatDateTime(task.dueDate, task.isAllDay)}</div>
              </div>
              <div className="rounded-lg bg-accent/40 px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-muted-foreground"><FolderKanban className="h-3.5 w-3.5" />Проект</div>
                <div className="mt-1 truncate font-medium">{task.project?.name || 'Без проекта'}</div>
              </div>
              <div className="rounded-lg bg-accent/40 px-2.5 py-2">
                <div className="flex items-center gap-1.5 text-muted-foreground"><ListChecks className="h-3.5 w-3.5" />Подзадачи</div>
                <div className="mt-1 font-medium">{completedChildCount}/{childCount}</div>
              </div>
            </div>
            {task.parent && (
              <button
                type="button"
                onClick={() => setSelectedTask(task.parent.id)}
                className="mt-2 w-full rounded-lg border px-2.5 py-2 text-left text-xs hover:bg-accent"
              >
                <span className="text-muted-foreground">Родительская задача</span>
                <span className="mt-0.5 block truncate font-medium">{task.parent.title}</span>
              </button>
            )}
          </div>

          {!isSubtask && (
            <>
          {/* Description */}
          <div className="px-4 pb-3">
            <textarea
              ref={descRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              rows={3}
              className="w-full resize-none overflow-hidden bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60"
              placeholder="Описание..."
            />
          </div>

          {/* Meta fields */}
          <div className="px-4 space-y-1 border-t py-3">
            {/* Priority */}
            <div className="relative">
              <button
                onClick={() => setShowPriorityMenu(!showPriorityMenu)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent"
              >
                <Flag className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Приоритет</span>
                <span className="ml-auto flex items-center gap-1.5">
                  <span className={cn('h-2.5 w-2.5 rounded-full', PRIORITIES.find((p) => p.value === priority)?.color)} />
                  {priorityLabels[priority] || 'Нет'}
                </span>
              </button>
              {showPriorityMenu && (
                <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border bg-card shadow-lg py-1">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => handlePriorityChange(p.value)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent',
                        priority === p.value && 'bg-accent'
                      )}
                    >
                      <span className={cn('h-2.5 w-2.5 rounded-full', p.color)} />
                      {p.label}
                      {priority === p.value && <Check className="h-3.5 w-3.5 ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

                        {/* Dates */}
            <div className="rounded-md px-2 py-2 text-sm space-y-2 border border-transparent hover:border-border">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0" />
                <span>Срок</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pl-6">
                <div>
                  <label className="text-[10px] text-muted-foreground">Начало</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (e.target.value && !startTime) setStartTime('09:00');
                      saveDates(e.target.value, startTime, dueDate, dueTime);
                    }}
                    className="mt-0.5 w-full rounded-md border border-input bg-card px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Время</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                      saveDates(startDate, e.target.value, dueDate, dueTime);
                    }}
                    disabled={!startDate}
                    className="mt-0.5 w-full rounded-md border border-input bg-card px-2 py-1 text-sm disabled:opacity-40"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Окончание</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => {
                      setDueDate(e.target.value);
                      if (e.target.value && !dueTime) setDueTime(startTime || '10:00');
                      saveDates(startDate, startTime, e.target.value, dueTime || startTime || '10:00');
                    }}
                    className="mt-0.5 w-full rounded-md border border-input bg-card px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Время</label>
                  <input
                    type="time"
                    value={dueTime}
                    onChange={(e) => {
                      setDueTime(e.target.value);
                      saveDates(startDate, startTime, dueDate, e.target.value);
                    }}
                    disabled={!dueDate}
                    className="mt-0.5 w-full rounded-md border border-input bg-card px-2 py-1 text-sm disabled:opacity-40"
                  />
                </div>
              </div>
            </div>

            {/* Project */}
            <div className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent">
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground shrink-0">Проект</span>
              <select
                value={projectId}
                onChange={(e) => handleProjectChange(e.target.value)}
                className="ml-auto bg-transparent text-sm outline-none text-right max-w-[160px]"
              >
                <option value="">Без проекта</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
            </>
          )}

          {!isSubtask && <div>
          {/* Tags */}
          <div className="px-4 py-3 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Теги</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => {
                const active = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full border transition-colors',
                      active
                        ? 'bg-primary/15 border-primary text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    )}
                  >
                    {tagLabel(tag)}
                  </button>
                );
              })}
              {showTagInput ? (
                <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setNewTagIcon(newTagIcon ? '' : TAG_ICONS[0])}
                      title="Иконка тега"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-input text-sm"
                    >
                      {newTagIcon || '🙂'}
                    </button>
                    <Input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateTag();
                        if (e.key === 'Escape') setShowTagInput(false);
                      }}
                      placeholder="Новый тег"
                      className="h-6 flex-1 text-xs"
                      autoFocus
                    />
                    <button onClick={handleCreateTag} className="text-xs text-primary shrink-0">
                      OK
                    </button>
                  </div>
                  {newTagIcon && (
                    <div className="grid grid-cols-12 gap-1">
                      {TAG_ICONS.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => setNewTagIcon(icon)}
                          className={cn(
                            'flex h-6 items-center justify-center rounded border text-sm',
                            newTagIcon === icon
                              ? 'border-primary bg-primary/15'
                              : 'border-border hover:border-primary/50'
                          )}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {TAG_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewTagColor(c)}
                        className={cn(
                          'h-4 w-4 rounded-full',
                          newTagColor === c && 'ring-2 ring-offset-1 ring-primary'
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowTagInput(true)}
                  className="text-xs px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/50"
                >
                  + тег
                </button>
              )}
            </div>
          </div>
          </div>}

          {!isSubtask && <>
          {/* Checklist */}
          <div className="px-4 py-3 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Чек-лист</span>
              {task.checklist?.length > 0 && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {task.checklist.filter((c: any) => c.isCompleted).length}/{task.checklist.length}
                </span>
              )}
            </div>
            <div className="space-y-1">
              {task.checklist?.map((item: any) => (
                <div key={item.id} className="flex items-center gap-2 group">
                  <button
                    onClick={() => handleToggleChecklist(item.id, item.isCompleted)}
                    className={cn(
                      'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                      item.isCompleted
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-muted-foreground/40'
                    )}
                  >
                    {item.isCompleted && <Check className="h-3 w-3" />}
                  </button>
                  <span
                    className={cn(
                      'text-sm flex-1',
                      item.isCompleted && 'line-through text-muted-foreground'
                    )}
                  >
                    {item.title}
                  </span>
                  <button
                    onClick={() => handleDeleteChecklist(item.id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                value={newChecklistTitle}
                onChange={(e) => setNewChecklistTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddChecklist()}
                placeholder="Добавить пункт..."
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          {/* Subtasks */}
          <div className="px-4 py-3 border-t">
            <div className="flex items-center gap-2 mb-2">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Подзадачи</span>
              {task.children?.length > 0 && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {task.children.filter((c: any) => c.status === 'COMPLETED').length}/
                  {task.children.length}
                </span>
              )}
            </div>
            <div className="space-y-1">
              {task.children?.map((child: any) => (
                <div
                  key={child.id}
                  className="group flex items-center gap-2 py-1.5 cursor-pointer hover:bg-accent/50 rounded px-1.5"
                  onClick={() => setSelectedTask(child.id)}
                >
                  <button
                    type="button"
                    className="shrink-0 rounded-full"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await completeTask(child.id);
                      await loadTask();
                    }}
                    title={child.status === 'COMPLETED' ? 'Вернуть в работу' : 'Отметить выполненной'}
                  >
                    <Checkbox checked={child.status === 'COMPLETED'} priority="NONE" className="border-violet-400 data-[checked]:bg-violet-500" />
                  </button>
                  <span className={cn('text-sm flex-1 min-w-0 truncate', child.status === 'COMPLETED' && 'line-through text-muted-foreground')}>
                    {child.title}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-opacity"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await deleteTask(child.id);
                      await loadTask();
                    }}
                    title="Удалить подзадачу"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask()}
                placeholder="Добавить подзадачу..."
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          </div>
          </>}


          {!isSubtask && <>
          {/* AI */}
          
          {/* Reminder */}
          <div className="px-4 py-3 border-t">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm text-muted-foreground">Напоминание</span>
            </div>
            <select
              className="w-full h-9 rounded-md border border-input bg-card px-2 text-sm disabled:opacity-40"
              value={remindMinutes === null ? '' : String(remindMinutes)}
              disabled={!dueDate}
              onChange={async (e) => {
                const v = e.target.value;
                const mins = v === '' ? null : Number(v);
                setRemindMinutes(mins);
                if (mins === null) setRemindRepeat('');
                if (!selectedTaskId) return;
                if (!dueDate) return;
                try {
                  await api.setTaskReminder(
                    selectedTaskId,
                    mins,
                    mins === null || remindRepeat === '' ? null : Number(remindRepeat)
                  );
                } catch (err: any) {
                  alert(err.message || 'Не удалось сохранить напоминание');
                }
              }}
            >
              <option value="">Нет</option>
              <option value="0">В момент срока</option>
              <option value="5">За 5 минут</option>
              <option value="15">За 15 минут</option>
              <option value="30">За 30 минут</option>
              <option value="60">За 1 час</option>
              <option value="1440">За 1 день</option>
            </select>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Повтор каждых</span>
              <select
                className="h-9 flex-1 rounded-md border border-input bg-card px-2 text-sm disabled:opacity-40"
                value={remindRepeat === '' ? '' : String(remindRepeat)}
                disabled={!dueDate || remindMinutes === null}
                title="Будет напоминать повторно с этим интервалом вплоть до срока"
                onChange={async (e) => {
                  const rep = e.target.value === '' ? '' : Number(e.target.value);
                  setRemindRepeat(rep as number | '');
                  if (!selectedTaskId || !dueDate || remindMinutes === null) return;
                  try {
                    await api.setTaskReminder(
                      selectedTaskId,
                      remindMinutes,
                      rep === '' ? null : Number(rep)
                    );
                  } catch (err: any) {
                    alert(err.message || 'Не удалось сохранить повтор');
                  }
                }}
              >
                <option value="">Не повторять</option>
                <option value="1">1 мин</option>
                <option value="5">5 мин</option>
                <option value="10">10 мин</option>
                <option value="20">20 мин</option>
                <option value="30">30 мин</option>
              </select>
            </div>
            {!dueDate && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Сначала укажите дату окончания (срок).
              </p>
            )}
            {dueDate && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Нужно разрешение уведомлений в браузере. Проверка каждые 30 сек.
              </p>
            )}
          </div>

<div className="px-4 py-3 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">AI-помощник</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="justify-start gap-2 text-xs h-8"
                onClick={handleAiBreakdown}
                disabled={aiLoading}
              >
                <ListTree className="h-3.5 w-3.5" />
                {aiLoading ? 'Обработка...' : 'Разбить на подзадачи'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start gap-2 text-xs h-8"
                onClick={handleAiPriority}
                disabled={aiLoading}
              >
                <Flag className="h-3.5 w-3.5" />
                {aiLoading ? 'Обработка...' : 'Определить приоритет'}
              </Button>
            </div>
          </div>

          </>}

          {/* Delete / Archive */}
          <div className="px-4 py-4 border-t space-y-1">
            {!isSubtask && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={async () => {
                  if (!selectedTaskId) return;
                  await api.archiveTask(selectedTaskId);
                  setSelectedTask(null);
                  await useTasksStore.getState().refreshCurrentView();
                }}
              >
                <Archive className="h-4 w-4" />
                Архивировать
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
              Удалить задачу
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
