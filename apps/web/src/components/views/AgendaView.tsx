"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useTasksStore } from "@/stores/tasks";
import { useBirthdaysStore, isSameMonthDay } from "@/stores/birthdays";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { TagPill } from "@/components/tasks/TagPill";
import { TagIcon } from "@/components/tasks/TagIcon";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import { QuickGlance, MiniCalendar, UpcomingBirthdays } from "@/components/views/SidePanels";
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Cake } from "lucide-react";
import { Button } from "@/components/ui/button";

const PRIORITY_PILL: Record<string, { label: string; color: string }> = {
  HIGH: { label: "Высокий", color: "#ef4444" },
  MEDIUM: { label: "Средний", color: "#3b82f6" },
  LOW: { label: "Низкий", color: "#22c55e" },
};

function PriorityPill({ priority }: { priority?: string | null }) {
  if (!priority || priority === "NONE") return null;
  const p = PRIORITY_PILL[priority];
  if (!p) return null;
  return (
    <span
      className="tf-tag inline-block"
      style={{
        border: `1px solid ${p.color}99`,
        color: p.color,
        backgroundColor: `${p.color}1f`,
        boxShadow: `0 0 10px -3px ${p.color}88`,
        fontWeight: 600,
      }}
    >
      {p.label}
    </span>
  );
}

function subCount(task: any): number {
  if (Array.isArray(task.children)) return task.children.length;
  return task._count?.children ?? 0;
}

function taskColor(task: any): string {
  return task.tags?.[0]?.tag?.color || task.project?.color || "#8b5cf6";
}

const DAYPARTS = [
  { id: "morning", label: "Утро", range: "08:00 – 12:00", icon: "☀️", from: 5, to: 12 },
  { id: "day", label: "День", range: "12:00 – 17:00", icon: "🌤️", from: 12, to: 17 },
  { id: "evening", label: "Вечер", range: "17:00 – 23:00", icon: "🌙", from: 17, to: 23 },
  { id: "night", label: "Поздний вечер", range: "23:00+", icon: "🌙", from: 23, to: 29 },
];

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function AgendaListRow({ task }: { task: any }) {
  const { setSelectedTask, completeTask, selectedTaskId } = useTasksStore();
  const color = taskColor(task);
  const start = task.startDate ? new Date(task.startDate) : task.dueDate ? new Date(task.dueDate) : null;
  const end = task.dueDate ? new Date(task.dueDate) : null;
  const kids = subCount(task);
  return (
    <div
      onClick={() => setSelectedTask(task.id)}
      className={cn(
        "tf-glass rounded-2xl px-3.5 py-3 flex items-center gap-3 cursor-pointer",
        selectedTaskId === task.id && "ring-2 ring-primary/40"
      )}
    >
      <div onClick={(e) => { e.stopPropagation(); completeTask(task.id); }}>
        <Checkbox checked={task.status === "COMPLETED"} priority={task.priority} ghost size="md" className="tf-check-glow" />
      </div>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold"
        style={{ color, background: `${color}1a`, border: `1.5px solid ${color}66`, boxShadow: `0 0 14px -4px ${color}88` }}
      >
        {(task.title || "?").trim().slice(0, 1).toUpperCase()}
      </span>
      <span className="flex-1 min-w-0">
        <span className={cn("block truncate text-[15px] font-medium", task.status === "COMPLETED" && "line-through text-muted-foreground")}>
          {task.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {task.tags?.[0] && <TagPill tag={task.tags[0].tag} />}
          {start && <span>{fmtTime(start)}{end && end.getTime() !== start.getTime() ? ` – ${fmtTime(end)}` : ""}</span>}
          {kids > 0 && <span>· {kids} подзадач</span>}
        </span>
      </span>
      <PriorityPill priority={task.priority} />
    </div>
  );
}

function AgendaListView({ tasks, day }: { tasks: any[]; day: Date }) {
  const timed = tasks.filter((t) => !(t.isAllDay !== false && !t.startDate));
  const allDay = tasks.filter((t) => t.isAllDay !== false && !t.startDate);
  const groups = DAYPARTS.map((p) => ({
    ...p,
    items: timed.filter((t) => {
      const s = t.startDate ? new Date(t.startDate) : t.dueDate ? new Date(t.dueDate) : null;
      if (!s) return false;
      let h = s.getHours();
      if (h < 5) h += 24;
      return h >= p.from && h < p.to;
    }),
  })).filter((g) => g.items.length > 0);
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <CalIcon className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">Нет задач на этот день</p>
      </div>
    );
  }
  return (
    <div className="space-y-4 px-4 py-3">
      {allDay.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <span>📅</span>Весь день
          </div>
          <div className="space-y-2">
            {allDay.map((t) => <AgendaListRow key={t.id} task={t} />)}
          </div>
        </section>
      )}
      {groups.map((g) => (
        <section key={g.id} className="tf-glass rounded-3xl p-3">
          <div className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold">
            <span>{g.icon}</span>{g.label}
            <span className="text-xs font-normal text-muted-foreground">{g.range}</span>
          </div>
          <div className="space-y-2">
            {g.items.map((t) => <AgendaListRow key={t.id} task={t} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

const START_HOUR=7, END_HOUR=22, HOUR_HEIGHT=72;
function startOfDay(d:Date){const x=new Date(d);x.setHours(0,0,0,0);return x;}
function dayLabel(d:Date){const today=startOfDay(new Date()),target=startOfDay(d),diff=Math.round((target.getTime()-today.getTime())/86400000),weekday=d.toLocaleDateString("ru-RU",{weekday:"short"}),day=d.getDate();if(diff===0)return{title:"Сегодня",sub:`${day}, ${weekday}`};if(diff===1)return{title:"Завтра",sub:`${day}, ${weekday}`};if(diff===-1)return{title:"Вчера",sub:`${day}, ${weekday}`};return{title:d.toLocaleDateString("ru-RU",{day:"numeric",month:"long"}),sub:weekday};}
function minuteOfDay(d:Date){return d.getHours()*60+d.getMinutes();}
function overlap(a:number,b:number,c:number,d:number){return a<d&&b>c;}

type Layout={column:number;columns:number};
function buildTimedLayout(tasks:any[], day:Date){
  const dayStart=new Date(day); dayStart.setHours(0,0,0,0);
  const dayEnd=new Date(day); dayEnd.setHours(23,59,59,999);
  const items=tasks.map(task=>{
    const start=task.startDate?new Date(task.startDate):task.dueDate?new Date(task.dueDate):new Date(day);
    const end=task.dueDate?new Date(task.dueDate):new Date(start.getTime()+3600000);
    const from=Math.max(START_HOUR*60, minuteOfDay(new Date(Math.max(start.getTime(),dayStart.getTime()))));
    const to=Math.min(END_HOUR*60, minuteOfDay(new Date(Math.min(end.getTime(),dayEnd.getTime()))));
    return {id:task.id,start,end,from,to:Math.max(from+30,to)};
  }).filter(x=>x.to>x.from);
  const result=new Map<string,Layout>();
  const visited=new Set<string>();
  for(const item of items){
    if(visited.has(item.id)) continue;
    const component:any[]=[item];
    visited.add(item.id);
    for(let i=0;i<component.length;i++){
      const current=component[i];
      for(const other of items){
        if(visited.has(other.id)) continue;
        if(overlap(current.from,current.to,other.from,other.to)){
          visited.add(other.id);
          component.push(other);
        }
      }
    }
    const columns:any[][]=[];
    for(const x of component.sort((a,b)=>a.from-b.from||a.to-b.to)){
      let placed=-1;
      for(let c=0;c<columns.length;c++){
        const last=columns[c][columns[c].length-1];
        if(last.to<=x.from){placed=c;break;}
      }
      if(placed<0){placed=columns.length;columns.push([]);}
      columns[placed].push(x);
    }
    const count=columns.length;
    for(let c=0;c<count;c++) for(const x of columns[c]) result.set(x.id,{column:c,columns:count});
  }
  return result;
}

export function AgendaView(){
  const {tasks,todayTasks,overdueTasks,setSelectedTask,completeTask,selectedTaskId,fetchTasks,fetchToday,fetchOverdue,updateTask}=useTasksStore();
  const [dayOffset,setDayOffset]=useState(0);const [dragOverMinute,setDragOverMinute]=useState<number|null>(null);  const [query,setQuery]=useState("");const [activeTag,setActiveTag]=useState("");const [taskOpen,setTaskOpen]=useState(false);const [agendaMode,setAgendaMode]=useState<"list"|"timeline">("list");
  const { items: birthdays, fetch: fetchBirthdays } = useBirthdaysStore();
  useEffect(()=>{fetchTasks({includeCompleted:"false"});fetchToday();fetchOverdue();fetchBirthdays();},[fetchTasks,fetchToday,fetchOverdue,fetchBirthdays]);
  const day=useMemo(()=>{const d=new Date();d.setDate(d.getDate()+dayOffset);return startOfDay(d);},[dayOffset]);
  const weekStrip=useMemo(()=>{const now=new Date();const dow=(now.getDay()+6)%7;const monday=new Date(now);monday.setDate(now.getDate()-dow);return Array.from({length:7},(_,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);const off=Math.round((startOfDay(d).getTime()-startOfDay(now).getTime())/86400000);return {date:d,offset:off,wd:d.toLocaleDateString("ru-RU",{weekday:"short"}),num:d.getDate()};});},[]);
  const dayKey=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`;
  const dayBirthdays=useMemo(()=>birthdays.filter(b=>isSameMonthDay(b.date,day)),[birthdays,day]);
  const label=dayLabel(day);
  const dayTasksBase=useMemo(()=>{const all=[...tasks,...todayTasks,...overdueTasks],seen=new Set<string>(),list:any[]=[];const dayStart=new Date(day),dayEnd=new Date(day);dayEnd.setHours(23,59,59,999);for(const t of all){if(seen.has(t.id)||t.status==="COMPLETED"||t.parentId)continue;const start=t.startDate?new Date(t.startDate):null,due=t.dueDate?new Date(t.dueDate):null;if(!start&&!due)continue;const visible=(start?start<=dayEnd:true)&&(due?due>=dayStart:true);if(visible){seen.add(t.id);list.push(t);}}return list;},[tasks,todayTasks,overdueTasks,day]);
  const agendaTags=useMemo(()=>{const m=new Map<string,{id:string;name:string;color:string;icon?:string|null}>();for(const t of dayTasksBase){for(const tt of t.tags||[]){const id=tt.tag?.id||tt.tagId;if(!id||m.has(id))continue;m.set(id,{id,name:tt.tag?.name||"Тег",color:tt.tag?.color||"#888888",icon:tt.tag?.icon||null});}}return Array.from(m.values());},[dayTasksBase]);
  const dayTasks=useMemo(()=>{let list=dayTasksBase;const q=query.trim().toLowerCase();if(q){list=list.filter(t=>(t.title||"").toLowerCase().includes(q));}if(activeTag){list=list.filter(t=>(t.tags||[]).some((tt:any)=>tt.tag?.id===activeTag||tt.tagId===activeTag));}return list;},[dayTasksBase,query,activeTag]);
  const allDay=dayTasks.filter(t=>t.isAllDay!==false&&!t.startDate);const timed=dayTasks.filter(t=>!(t.isAllDay!==false&&!t.startDate));
  const layout=useMemo(()=>buildTimedLayout(timed,day),[timed,day]);
  const dropAtMinute=async(e:DragEvent,minute:number)=>{e.preventDefault();setDragOverMinute(null);const id=e.dataTransfer.getData("text/task-id");if(!id)return;const start=new Date(day);start.setHours(Math.floor(minute/60),minute%60,0,0);const end=new Date(start);end.setMinutes(end.getMinutes()+60);await updateTask(id,{startDate:start.toISOString(),dueDate:end.toISOString(),isAllDay:false});};
  const dropAllDay=async(e:DragEvent)=>{e.preventDefault();const id=e.dataTransfer.getData("text/task-id");if(!id)return;const d=new Date(day);d.setHours(12,0,0,0);await updateTask(id,{dueDate:d.toISOString(),isAllDay:true,startDate:null});};
  const onDragStart=(e:DragEvent,id:string)=>{e.dataTransfer.setData("text/task-id",id);e.dataTransfer.effectAllowed="move";};
  return <div className="flex-1 flex flex-col min-h-0">
    <header className="tf-view-header px-4 py-3 border-b flex items-center justify-between gap-3"><div><h1 className="text-lg font-semibold flex items-center gap-2"><CalIcon className="h-5 w-5 text-primary"/>{label.title}</h1><p className="text-xs text-muted-foreground capitalize">{label.sub}</p></div><div className="flex items-center gap-1"><Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={()=>setDayOffset(o=>o-1)}><ChevronLeft className="h-4 w-4"/></Button><Button variant="outline" size="sm" className="h-8 px-3" onClick={()=>setDayOffset(0)}>Сегодня</Button><Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={()=>setDayOffset(o=>o+1)}><ChevronRight className="h-4 w-4"/></Button></div></header>
    <div className="shrink-0 border-b px-4 py-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex rounded-xl border border-border/60 overflow-hidden">
          <button type="button" onClick={()=>setAgendaMode("list")} className={agendaMode==="list"?"tf-chip-active px-3 py-1.5 text-xs font-medium":"px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"}>Список</button>
          <button type="button" onClick={()=>setAgendaMode("timeline")} className={agendaMode==="timeline"?"tf-chip-active px-3 py-1.5 text-xs font-medium":"px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"}>Сетка</button>
        </div>
      </div>
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск задач…" className="h-9 w-full rounded-xl border border-input bg-card/60 px-3 text-sm outline-none backdrop-blur focus:ring-2 focus:ring-ring"/>
      {agendaTags.length>0&&<div className="flex flex-wrap gap-1.5">{["",...agendaTags.map(t=>t.id)].map(id=>{const tag=agendaTags.find(t=>t.id===id);const active=id===""?activeTag==="":activeTag===id;return <button key={id||"all"} type="button" onClick={()=>setActiveTag(id)} className={cn("text-xs px-3 py-1.5 rounded-full border transition-all",active?"tf-chip-active":"tf-chip")}>{tag ? (<span className="inline-flex items-center gap-1"><TagIcon icon={tag.icon} />{tag.name}</span>) : "Все"}</button>;})}</div>}
      <div className="grid grid-cols-7 gap-1.5">
        {weekStrip.map(w=>{const active=startOfDay(w.date).getTime()===day.getTime();const isToday=w.offset===0;return <button key={w.offset} type="button" onClick={()=>setDayOffset(w.offset)} className={cn("rounded-xl border px-1 py-1.5 text-center transition-all",active?"tf-chip-active":"tf-chip")}><span className="block text-[10px] capitalize opacity-80">{w.wd}</span><span className={cn("block text-sm font-semibold tabular-nums",isToday&&!active&&"text-primary")}>{w.num}</span></button>;})}
      </div>
      {dayBirthdays.length>0&&<div className="flex flex-wrap gap-1.5">{dayBirthdays.map(b=><span key={b.id} className="inline-flex items-center gap-1 rounded-full border border-pink-500/40 bg-pink-500/10 px-2.5 py-1 text-[11px] text-pink-300" style={{boxShadow:"0 0 10px -3px #ec489988"}}><Cake className="h-3 w-3" />{b.name}</span>)}</div>}
    </div>
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_300px]">
    <div className="flex min-h-0 min-w-0 flex-col">
    <div className="flex-1 overflow-y-auto">
    {agendaMode==="timeline" ? (<>
      <div className="px-4 py-3 border-b min-h-[64px]" onDragOver={e=>e.preventDefault()} onDrop={dropAllDay}><p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Весь день · перетащите задачу сюда или на время</p><div className="space-y-1.5">{allDay.map(t=><AgendaCard key={t.id} task={t} selected={selectedTaskId===t.id} onSelect={()=>setSelectedTask(t.id)} onComplete={()=>completeTask(t.id)} onDragStart={onDragStart}/>)}</div></div>
      <div className="relative px-2 py-2" style={{height:(END_HOUR-START_HOUR)*HOUR_HEIGHT+16}}>
        <div className="absolute left-2 right-2 top-2" style={{height:(END_HOUR-START_HOUR)*HOUR_HEIGHT}}>
          {Array.from({length:(END_HOUR-START_HOUR)*4+1},(_,i)=>{const minutes=START_HOUR*60+i*15;const isHour=minutes%60===0;const top=((minutes-START_HOUR*60)/60)*HOUR_HEIGHT;return <div key={minutes} className={cn("absolute left-0 right-0",isHour?"border-t border-border/60":"border-t border-border/20")} style={{top}} onDragOver={e=>{e.preventDefault();setDragOverMinute(minutes)}} onDrop={e=>dropAtMinute(e,minutes)}>{isHour&&<div className="absolute left-0 -top-2 w-12 text-right pr-2"><span className="text-[11px] text-muted-foreground tabular-nums">{String(minutes/60).padStart(2,"0")}:00</span></div>}{!isHour&&<div className="absolute left-0 -top-1.5 w-12 text-right pr-2"><span className="text-[8px] text-muted-foreground/50 tabular-nums">:{String(minutes%60).padStart(2,"0")}</span></div>}</div>})}
          {dragOverMinute!==null&&<div className="absolute left-14 right-0 rounded bg-primary/5 pointer-events-none" style={{top:((dragOverMinute-START_HOUR*60)/60)*HOUR_HEIGHT,height:HOUR_HEIGHT/4}}/>}
          <div className="absolute left-14 right-0 top-0" style={{height:(END_HOUR-START_HOUR)*HOUR_HEIGHT}}>{timed.map(t=><TimedAgendaCard key={t.id} task={t} day={day} layout={layout.get(t.id)||{column:0,columns:1}} selected={selectedTaskId===t.id} onSelect={()=>setSelectedTask(t.id)} onComplete={()=>completeTask(t.id)} onDragStart={onDragStart}/>)}</div>
        </div>
      </div>
      {dayTasks.length===0&&agendaMode==="timeline"&&<div className="flex flex-col items-center justify-center py-16 text-muted-foreground"><CalIcon className="h-8 w-8 mb-2 opacity-40"/><p className="text-sm">Нет задач на этот день</p><p className="text-xs mt-1">Назначьте срок задаче, чтобы увидеть её здесь</p></div>}
    </> ) : (
      <AgendaListView tasks={dayTasks} day={day} />
    )}
    </div>
    <div className="shrink-0 border-t px-4 py-2.5">
      <button type="button" onClick={()=>setTaskOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/40 px-3 py-2.5 text-sm text-primary transition-colors hover:bg-primary/10"><span className="text-base leading-none">+</span>Добавить задачу</button>
    </div>
    </div>
    <div className="hidden min-h-0 min-w-0 flex-col gap-4 overflow-y-auto border-l border-border/50 p-4 lg:flex">
      <QuickGlance />
      <MiniCalendar
        value={day}
        onSelect={(d) => { const now=new Date(); setDayOffset(Math.round((startOfDay(d).getTime()-startOfDay(now).getTime())/86400000)); }}
        taskKeys={new Set([...tasks,...todayTasks].flatMap((t:any)=>{const keys:string[]=[];for(const raw of [t.startDate,t.dueDate]){if(!raw)continue;const d=new Date(raw);keys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);}return keys;}))}
        birthdayKeys={new Set(birthdays.map((b:any)=>{const d=new Date(b.date);return `${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}))}
      />
      <UpcomingBirthdays limit={3} />
    </div>
    </div>
    <CreateTaskModal open={taskOpen} onClose={()=>setTaskOpen(false)} initialDate={dayKey} />
  </div>;
}

function TimedAgendaCard({task,day,layout,selected,onSelect,onComplete,onDragStart}:{task:any;day:Date;layout:Layout;selected:boolean;onSelect:()=>void;onComplete:()=>void;onDragStart:(e:DragEvent,id:string)=>void}){
  const start=task.startDate?new Date(task.startDate):task.dueDate?new Date(task.dueDate):new Date(day),end=task.dueDate?new Date(task.dueDate):new Date(start.getTime()+3600000);const dayStart=new Date(day);dayStart.setHours(0,0,0,0);const dayEnd=new Date(day);dayEnd.setHours(23,59,59,999);const visibleStart=new Date(Math.max(start.getTime(),dayStart.getTime())),visibleEnd=new Date(Math.min(end.getTime(),dayEnd.getTime()));const from=Math.max(START_HOUR*60,minuteOfDay(visibleStart)),to=Math.min(END_HOUR*60,minuteOfDay(visibleEnd)),duration=Math.max(30,to-from),top=((from-START_HOUR*60)/60)*HOUR_HEIGHT,height=Math.max(42,(duration/60)*HOUR_HEIGHT-4),time=`${start.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})} – ${end.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}`,gap=6;
  return <div draggable onDragStart={e=>onDragStart(e,task.id)} onClick={onSelect} className={cn("absolute rounded-xl tf-glass overflow-hidden cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow",selected&&"ring-2 ring-primary/40")} style={{top,height,left:`calc(${(layout.column/layout.columns)*100}% + ${gap/2}px)`,width:`calc(${100/layout.columns}% - ${gap}px)`}}><div className="h-full flex"><div className="w-1 shrink-0" style={{backgroundColor:task.project?.color||"#4A90D9"}}/><div className="flex-1 px-3 py-2 min-w-0"><p className="text-[11px] font-medium text-muted-foreground mb-0.5">{time}</p><div className="flex items-center gap-2"><div onClick={e=>{e.stopPropagation();onComplete()}}><Checkbox checked={task.status==="COMPLETED"} priority={task.priority} className="tf-check-glow"/></div><p className="text-sm font-medium truncate">{task.title}</p></div><div className="mt-1 flex items-center gap-1.5 pl-6"><PriorityPill priority={task.priority}/>{subCount(task)>0&&<span className="text-[10px] text-muted-foreground">· {subCount(task)} подзадач</span>}</div>{task.tags?.[0] && <TagPill tag={task.tags[0].tag} className="ml-6 mt-1" />}{task.project&&<p className="text-[11px] text-muted-foreground mt-0.5 truncate pl-6">{task.project.name}</p>}</div></div></div>;
}
function AgendaCard({task,selected,onSelect,onComplete,onDragStart}:{task:any;selected:boolean;onSelect:()=>void;onComplete:()=>void;onDragStart:(e:DragEvent,id:string)=>void}){return <div draggable onDragStart={e=>onDragStart(e,task.id)} onClick={onSelect} className={cn("group flex items-stretch rounded-xl tf-glass overflow-hidden cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md",selected&&"ring-2 ring-primary/40")}><div className="w-1 shrink-0" style={{backgroundColor:task.project?.color||"#4A90D9"}}/><div className="flex-1 px-3 py-2 min-w-0"><div className="flex items-center gap-2"><div onClick={e=>{e.stopPropagation();onComplete()}}><Checkbox checked={task.status==="COMPLETED"} priority={task.priority} className="tf-check-glow"/></div><p className="text-sm font-medium truncate">{task.title}</p></div><div className="mt-1 flex items-center gap-1.5 pl-6"><PriorityPill priority={task.priority}/>{subCount(task)>0&&<span className="text-[10px] text-muted-foreground">· {subCount(task)} подзадач</span>}</div>{task.tags?.[0] && <TagPill tag={task.tags[0].tag} className="ml-6 mt-1" />}</div></div>}
