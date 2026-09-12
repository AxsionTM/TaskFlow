'use client';

import { occurrenceBaseId } from '@/lib/recurrence';
import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTasksStore } from '@/stores/tasks';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDate, cn } from '@/lib/utils';
import { TagPill } from '@/components/tasks/TagPill';
import { Calendar, Plus, GripVertical, ChevronRight, ChevronLeft, Flame, Loader, CheckCircle2 } from 'lucide-react';

const COLUMNS = [
  { id: 'TODO', title: 'К выполнению', icon: Flame, tint: '#f43f5e' },
  { id: 'IN_PROGRESS', title: 'В работе', icon: Loader, tint: '#3b82f6' },
  { id: 'COMPLETED', title: 'Готово', icon: CheckCircle2, tint: '#22c55e' },
];

const PRIORITY_DOT: Record<string, string> = {
  HIGH: '#ef4444',
  MEDIUM: '#f59e0b',
  LOW: '#3b82f6',
  NONE: '#22a06b',
};

function KanbanCard({ task, isDragging }: { task: any; isDragging?: boolean }) {
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId);
  const setSelectedTask = useTasksStore.getState().setSelectedTask;
  const completeTask = useTasksStore.getState().completeTask;
  const updateTask = useTasksStore.getState().updateTask;
  const isSelected = selectedTaskId === occurrenceBaseId(task);
  const dot = PRIORITY_DOT[task.priority] || PRIORITY_DOT.NONE;
  const done = task.status === 'COMPLETED';

  const statusOrder = COLUMNS.map((c) => c.id);
  const currentIdx = Math.max(
    0,
    statusOrder.indexOf(task.status === 'CANCELLED' ? 'TODO' : task.status)
  );
  const moveTask = (dir: -1 | 1) => {
    const next = statusOrder[currentIdx + dir];
    if (!next || next === task.status) return;
    void updateTask(task.id, { status: next });
  };

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task.id,
    data: { status: task.status, task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderColor: `${dot}44`, boxShadow: `0 0 18px -10px ${dot}88` }}
      onClick={() => setSelectedTask(task.id)}
      className={cn(
        'group rounded-2xl border bg-card/50 p-3 cursor-pointer backdrop-blur transition-all',
        'hover:brightness-125 hover:-translate-y-[1px]',
        isSelected && 'ring-2 ring-primary/50'
      )}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-0.5 p-0.5 text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          title="Перетащить"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div
          className="pt-0.5"
          onClick={(e) => {
            e.stopPropagation();
            completeTask(task.id);
          }}
        >
          <Checkbox checked={done} priority={task.priority} ghost size="sm" className="tf-check-glow" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1.5">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot, boxShadow: `0 0 8px -1px ${dot}` }} />
            <p className={cn('flex-1 text-[13px] font-medium leading-snug', done && 'line-through text-muted-foreground')}>
              {task.title}
            </p>
            <span className="flex shrink-0 items-center gap-0.5 lg:hidden">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); moveTask(-1); }}
                disabled={currentIdx <= 0}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground disabled:opacity-30"
                aria-label="Переместить назад"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); moveTask(1); }}
                disabled={currentIdx >= statusOrder.length - 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground disabled:opacity-30"
                aria-label="Переместить вперёд"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </span>
            <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground lg:block" />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {task.dueDate && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] tabular-nums',
                  new Date(task.dueDate) < new Date(new Date().setHours(0, 0, 0, 0)) && !done
                    ? 'border-red-500/40 bg-red-500/10 text-red-400'
                    : 'border-border/60 bg-muted/40 text-muted-foreground'
                )}
              >
                <Calendar className="h-2.5 w-2.5" />
                {formatDate(task.dueDate)}
              </span>
            )}
            {Array.isArray(task.tags) && task.tags.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {task.tags.slice(0, 3).map((tt: any, i: number) => (
                  <TagPill key={tt?.tag?.id || tt?.tagId || `${tt?.tag?.name}-${i}`} tag={tt.tag || tt} />
                ))}
                {task.tags.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{task.tags.length - 3}</span>
                )}
              </span>
            )}
            {task.project && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: task.project.color, boxShadow: `0 0 8px -1px ${task.project.color}` }}
                />
                <span className="max-w-[110px] truncate">{task.project.name}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Column({
  col,
  tasks,
  onAdd,
}: {
  col: (typeof COLUMNS)[0];
  tasks: any[];
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const Icon = col.icon;

  return (
    <div
      className={cn(
        'flex w-[272px] shrink-0 flex-col rounded-3xl border tf-glass overflow-hidden',
        isOver && 'ring-2 ring-primary/40'
      )}
      style={{
        borderColor: `${col.tint}45`,
        boxShadow: `0 0 28px -12px ${col.tint}88, inset 0 1px 0 rgba(255,255,255,.05)`,
        background: `linear-gradient(180deg, ${col.tint}14, transparent 32%), hsl(var(--card) / 0.62)`,
        maxHeight: '100%',
      }}
    >
      <div
        className="flex items-center gap-2 px-3.5 pt-3 pb-2.5 border-b"
        style={{ borderColor: `${col.tint}33` }}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
          style={{ color: col.tint, background: `${col.tint}16`, border: `1px solid ${col.tint}55`, boxShadow: `0 0 12px -4px ${col.tint}` }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h3 className="flex-1 truncate text-[13px] font-semibold" style={{ color: col.tint }}>{col.title}</h3>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
          style={{ color: col.tint, background: `${col.tint}16`, border: `1px solid ${col.tint}55` }}
        >
          {tasks.length}
        </span>
        <button
          onClick={onAdd}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Добавить задачу"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div ref={setNodeRef} className="flex-1 min-h-[140px] max-h-[calc(100dvh-360px)] lg:max-h-none overflow-y-auto px-2.5 py-2.5 space-y-2 overscroll-contain">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/60 px-3 py-8 text-center text-xs text-muted-foreground">Перетащите сюда</p>
          ) : (
            tasks.map((task) => <KanbanCard key={task.id} task={task} />)
          )}
        </SortableContext>
      </div>

      <div className="p-2.5 pt-1">
        <button
          onClick={onAdd}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-2 text-xs font-medium transition-all hover:bg-primary/10"
          style={{ borderColor: `${col.tint}55`, color: col.tint }}
        >
          <Plus className="h-3.5 w-3.5" />
          Добавить задачу
        </button>
      </div>
    </div>
  );
}

function KanbanMobileIndicator({ targetId, total }: { targetId: string; total: number }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const onScroll = () => {
      const cards = Array.from(el.querySelectorAll(':scope > div > div'));
      if (!cards.length) return;
      let best = 0;
      let bestDist = Infinity;
      const viewLeft = el.scrollLeft + el.clientWidth / 2;
      cards.forEach((card, i) => {
        const c = card as HTMLElement;
        const center = c.offsetLeft + c.offsetWidth / 2;
        const dist = Math.abs(center - viewLeft);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      setActive(Math.min(best, total - 1));
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [targetId, total]);

  return (
    <div className="flex shrink-0 items-center justify-center gap-2 px-3 pt-2 lg:hidden" aria-hidden>
      <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
        {active + 1} / {total}
      </span>
      <span className="flex items-center gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 rounded-full transition-all',
              i === active ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/30'
            )}
          />
        ))}
      </span>
    </div>
  );
}

export function KanbanBoard() {
  const {
    tasks,
    todayTasks,
    overdueTasks,
    currentView,
    createTask,
    updateTask,
    currentProjectId,
  } = useTasksStore();

  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const allTasks = useMemo(() => {
    if (currentView === 'today') return todayTasks;
    if (currentView === 'overdue') return overdueTasks;
    return tasks;
  }, [currentView, tasks, todayTasks, overdueTasks]);

  const columns = useMemo(() => {
    return COLUMNS.map((col) => ({
      ...col,
      tasks: allTasks.filter((t) => {
        if (col.id === 'TODO') return t.status === 'TODO' || t.status === 'CANCELLED';
        return t.status === col.id;
      }),
    }));
  }, [allTasks]);

  const activeTask = activeId ? allTasks.find((t) => t.id === activeId) : null;

  const handleQuickAdd = async (status: string) => {
    const title = prompt('Название задачи:');
    if (!title?.trim()) return;
    const now = new Date();
    await createTask({
      title: title.trim(),
      status: status === 'COMPLETED' ? 'TODO' : status,
      projectId: currentProjectId || undefined,
      startDate: now.toISOString(),
      dueDate: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      isAllDay: false,
    });
  };

  const onDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;

    let newStatus: string | null = null;

    // Dropped on a column
    const colIds = COLUMNS.map((c) => c.id);
    if (colIds.includes(String(over.id))) {
      newStatus = String(over.id);
    } else {
      // Dropped on another card — use that card's status
      const overTask = allTasks.find((t) => t.id === over.id);
      if (overTask) {
        newStatus = overTask.status === 'CANCELLED' ? 'TODO' : overTask.status;
      }
    }

    if (!newStatus || newStatus === task.status) return;
    if (task.status === 'TODO' && newStatus === 'CANCELLED') return;

    await updateTask(taskId, { status: newStatus });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <KanbanMobileIndicator targetId="tf-kanban-scroll" total={columns.length} />
      <div id="tf-kanban-scroll" className="tf-kanban-scroll flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-3 sm:p-4">
        <div className="flex gap-3 h-full min-w-max items-stretch pb-1">
          {columns.map((col) => (
            <Column
              key={col.id}
              col={col}
              tasks={col.tasks}
              onAdd={() => handleQuickAdd(col.id)}
            />
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="w-72 rounded-2xl border border-primary/40 bg-card p-3 shadow-xl opacity-95">
            <p className="text-sm font-medium">{activeTask.title}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
