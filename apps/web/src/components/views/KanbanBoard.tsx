'use client';

import { useMemo, useState } from 'react';
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
import { Calendar, Plus, GripVertical } from 'lucide-react';

const COLUMNS = [
  { id: 'TODO', title: 'К выполнению', color: 'border-t-gray-400' },
  { id: 'IN_PROGRESS', title: 'В работе', color: 'border-t-blue-500' },
  { id: 'COMPLETED', title: 'Готово', color: 'border-t-green-500' },
];

function KanbanCard({ task, isDragging }: { task: any; isDragging?: boolean }) {
  const { setSelectedTask, completeTask, selectedTaskId } = useTasksStore();
  const isSelected = selectedTaskId === task.id;

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
      style={style}
      onClick={() => setSelectedTask(task.id)}
      className={cn(
        'rounded-xl tf-glass p-3 cursor-pointer shadow-sm hover:shadow transition-shadow',
        isSelected && 'ring-2 ring-primary/40'
      )}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-0.5 p-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
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
          <Checkbox checked={task.status === 'COMPLETED'} priority={task.priority} ghost size="sm" className="tf-check-glow" />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-sm font-medium leading-snug',
              task.status === 'COMPLETED' && 'line-through text-muted-foreground'
            )}
          >
            {task.title}
          </p>
          {task.dueDate && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs mt-1.5',
                new Date(task.dueDate) < new Date(new Date().setHours(0, 0, 0, 0)) &&
                  task.status !== 'COMPLETED'
                  ? 'text-red-500'
                  : 'text-muted-foreground'
              )}
            >
              <Calendar className="h-3 w-3" />
              {formatDate(task.dueDate)}
            </span>
          )}
          {task.tags?.[0] && (
            <span
              className="tf-tag mt-1.5 inline-block"
              style={{
                border: `1px solid ${(task.tags[0].tag?.color || '#888888')}cc`,
                color: task.tags[0].tag?.color || '#888888',
                backgroundColor: `${task.tags[0].tag?.color || '#888888'}26`,
                boxShadow: `0 0 12px -3px ${(task.tags[0].tag?.color || '#888888')}aa`,
              }}
            >
              {task.tags[0].tag?.name}
            </span>
          )}
          {task.project && (
            <div className="flex items-center gap-1 mt-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: task.project.color, boxShadow: `0 0 8px -1px ${task.project.color}` }}
              />
              <span className="text-xs text-muted-foreground truncate">
                {task.project.name}
              </span>
            </div>
          )}
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

  return (
    <div
      className={cn(
        'w-72 flex flex-col rounded-2xl tf-glass border-t-4',
        col.color,
        isOver && 'ring-2 ring-primary/30'
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{col.title}</h3>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={onAdd}
          className="p-1 rounded hover:bg-accent text-muted-foreground"
          title="Добавить задачу"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div ref={setNodeRef} className="flex-1 overflow-y-auto px-2 pb-3 space-y-2 min-h-[120px]">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Перетащите сюда</p>
          ) : (
            tasks.map((task) => <KanbanCard key={task.id} task={task} />)
          )}
        </SortableContext>
      </div>
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
    completeTask,
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
    if (COLUMNS.some((c) => c.id === over.id)) {
      newStatus = String(over.id);
    } else {
      // Dropped on another card — use that card's status
      const overTask = allTasks.find((t) => t.id === over.id);
      if (overTask) {
        newStatus =
          overTask.status === 'CANCELLED' ? 'TODO' : overTask.status;
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
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-3 h-full min-w-max">
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
          <div className="w-72 rounded-lg border bg-card p-3 shadow-lg opacity-90">
            <p className="text-sm font-medium">{activeTask.title}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
