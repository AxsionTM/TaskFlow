'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Pause, Play, Plus, RotateCcw, Search, Settings2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type GraphNodeType = 'date' | 'task';
export type GraphEdgeType = 'date' | 'parent' | 'timeline';

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  color: string;
  taskId?: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  startDate?: string | null;
  dateKey?: string;
  dateKeys?: string[];
  isSubtask?: boolean;
  isToday?: boolean;
  dayOffset?: number;
  parentId?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  projectColor?: string | null;
  pageRank?: number;
  clusterId?: number;
  clusterColor?: string;
  subtaskColor?: string | null;
  statusColor?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
}

interface PointNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  fixed?: boolean;
}
interface Camera { x: number; y: number; zoom: number }
export interface SelectedDayInfo { dateKey: string; label: string; color: string; roots: GraphNode[]; descendantCount: number }
interface Props { nodes: GraphNode[]; edges: GraphEdge[]; onOpenTask?: (taskId: string) => void; hideTimeline?: boolean; colorMode?: 'priority' | 'cluster'; onSelectedDay?: (info: SelectedDayInfo | null) => void; embeddedPanel?: boolean }

const PRIORITY_COLOR: Record<string, string> = {
  HIGH: '#ef4444',
  MEDIUM: '#f59e0b',
  LOW: '#3b82f6',
  NONE: '#22a06b',
};
const SUBTASK_COLOR = '#a78bfa';

function truncate(value: string, max = 32) { return value.length > max ? `${value.slice(0, max - 1)}…` : value; }
function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(148,163,184,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16); const g = parseInt(clean.slice(2, 4), 16); const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function ObsidianGraph({ nodes, edges, onOpenTask, hideTimeline, colorMode, onSelectedDay, embeddedPanel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pointsRef = useRef<PointNode[]>([]);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const animationRef = useRef<number | null>(null);
  const dprRef = useRef(1);
  const dragRef = useRef<{ kind: 'node' | 'pan'; nodeId?: string; lastX: number; lastY: number; downX: number; downY: number } | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [running, setRunning] = useState(true);
  const [query, setQuery] = useState('');
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const dateNodes = useMemo(() => nodes.filter(n => n.type === 'date').sort((a,b) => (a.dayOffset ?? 0) - (b.dayOffset ?? 0)), [nodes]);
  const taskNodes = useMemo(() => nodes.filter(n => n.type === 'task'), [nodes]);
  const taskById = useMemo(() => new Map(taskNodes.map(n => [n.taskId!, n])), [taskNodes]);

  // A selected date opens the complete hierarchy. The date is connected only to
  // root tasks; every descendant is connected only to its direct parent.
  const visibleTaskIds = useMemo(() => {
    if (!expandedDate) return new Set<string>();
    const result = new Set<string>();
    const children = new Map<string, GraphNode[]>();
    for (const task of taskNodes) {
      if (!task.parentId) continue;
      const list = children.get(task.parentId) ?? [];
      list.push(task);
      children.set(task.parentId, list);
    }
    const addTree = (id: string) => {
      if (result.has(id)) return;
      result.add(id);
      for (const child of children.get(id) ?? []) if (child.taskId) addTree(child.taskId);
    };
    for (const task of taskNodes) {
      if (task.parentId) continue;
      if (task.dateKeys?.includes(expandedDate) || task.dateKey === expandedDate) addTree(task.taskId!);
    }
    return result;
  }, [expandedDate, taskNodes]);

  const q = query.trim().toLocaleLowerCase();
  const visibleNodes = useMemo(() => {
    const dates = dateNodes;
    const tasks = taskNodes.filter(n => visibleTaskIds.has(n.taskId!) && (!q || n.label.toLocaleLowerCase().includes(q)));
    return [...dates, ...tasks];
  }, [dateNodes, taskNodes, visibleTaskIds, q]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target) && (!hideTimeline || e.type !== 'timeline')), [edges, visibleIds, hideTimeline]);
  const selected = useMemo(() => nodes.find(n => n.id === selectedId) ?? null, [nodes, selectedId]);
  const neighbors = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const result = new Set<string>([selectedId]);
    for (const e of edges) {
      if (e.source === selectedId) result.add(e.target);
      if (e.target === selectedId) result.add(e.source);
    }
    return result;
  }, [edges, selectedId]);

  const syncCanvasSize = () => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dprRef.current = dpr;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
  };

  const fitView = () => {
    const points = pointsRef.current.filter(p => visibleIds.has(p.id));
    const wrap = wrapRef.current;
    if (!points.length || !wrap) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) { minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); }
    const rect = wrap.getBoundingClientRect();
    const width = Math.max(520, maxX-minX+260), height = Math.max(360, maxY-minY+260);
    cameraRef.current.zoom = Math.max(0.34, Math.min(1.65, Math.min(rect.width/width, rect.height/height)));
    cameraRef.current.x = (minX+maxX)/2; cameraRef.current.y=(minY+maxY)/2;
  };

  useEffect(() => {
    const previous = new Map(pointsRef.current.map(p => [p.id,p]));
    const datesByKey = new Map(dateNodes.map(d => [d.dateKey!, d]));
    const next = visibleNodes.map((node, index) => {
      const old = previous.get(node.id);
      if (old) return { ...old, ...node };
      if (node.type === 'date') {
        const i = node.dayOffset ?? index;
        return { ...node, x:(i-(dateNodes.length-1)/2)*150, y:i===0?0:Math.sin(i*1.25)*80, vx:0, vy:0, radius:node.isToday?22:15 };
      }
      const parent = node.parentId ? previous.get(`task:${node.parentId}`) : undefined;
      const date = (node.dateKeys ?? []).map(k => datesByKey.get(k)).find(Boolean);
      const dateBaseX = ((date?.dayOffset ?? 0)-(dateNodes.length-1)/2)*150;
      const angle = (index * 2.3999632297) + (node.isSubtask ? 1.1 : 0);
      const radius = node.isSubtask ? 72 : 105;
      return {
        ...node,
        x:(parent?.x ?? dateBaseX)+Math.cos(angle)*radius,
        y:(parent?.y ?? 0)+Math.sin(angle)*radius,
        vx:0, vy:0,
        radius:node.isSubtask ? 7 : Math.min(14, 8+(node.pageRank ?? 0)*6),
      };
    });
    pointsRef.current = next;
    requestAnimationFrame(fitView);
  }, [visibleNodes, dateNodes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { syncCanvasSize(); const observer = new ResizeObserver(syncCanvasSize); if (wrapRef.current) observer.observe(wrapRef.current); return () => observer.disconnect(); }, []);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const simulate = () => {
      const points = pointsRef.current.filter(p => visibleIds.has(p.id));
      const byId = new Map(points.map(p => [p.id,p]));
      if (running && points.length) {
        // Spatial grid keeps repulsion cheap even when a day has many tasks.
        const cellSize=170, grid=new Map<string,PointNode[]>();
        const key=(x:number,y:number)=>`${Math.floor(x/cellSize)}:${Math.floor(y/cellSize)}`;
        for(const p of points){const k=key(p.x,p.y); const b=grid.get(k); b?b.push(p):grid.set(k,[p]);}
        const repulsion=points.length>500?3400:6200;
        for(const a of points){
          const cx=Math.floor(a.x/cellSize),cy=Math.floor(a.y/cellSize);
          for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++)for(const b of grid.get(`${cx+ox}:${cy+oy}`)??[]){
            if(a===b)continue; let dx=a.x-b.x,dy=a.y-b.y,d2=dx*dx+dy*dy;
            if(d2<49){dx=a.id<b.id?-7:7;dy=a.id<b.id?6:-6;d2=85;}
            const d=Math.sqrt(d2); if(d>cellSize*1.4)continue; const f=repulsion/d2; a.vx+=(dx/d)*f; a.vy+=(dy/d)*f;
          }
        }
        for(const edge of visibleEdges){
          const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b)continue;
          const dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy));
          const target=edge.type==='timeline'?150:edge.type==='date'?175:edge.type==='parent'?105:120;
          const strength=edge.type==='timeline'?0.008:edge.type==='date'?0.004:edge.type==='parent'?0.014:0.006;
          const f=(d-target)*strength,nx=dx/d,ny=dy/d;
          a.vx+=nx*f;a.vy+=ny*f;b.vx-=nx*f;b.vy-=ny*f;
        }
        const today=points.find(p=>p.type==='date'&&p.isToday);
        for(const p of points){
          const center=p.type==='date'?(p.isToday?0.0015:0.00035):0.00012;
          if(today&&p.type==='date'&&!p.isToday){p.vx+=(today.x-p.x)*0.000035;p.vy+=(today.y-p.y)*0.000035;}
          p.vx+=-p.x*center;p.vy+=-p.y*center;p.vx*=0.87;p.vy*=0.87;
          const speed=Math.hypot(p.vx,p.vy);if(speed>7){p.vx=p.vx/speed*7;p.vy=p.vy/speed*7;}
          if(!p.fixed){p.x+=p.vx;p.y+=p.vy;}
        }
      }

      const dpr=dprRef.current,rect=canvas.getBoundingClientRect();
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
      const foreground=getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim()||'#e5e7eb';
      const border=getComputedStyle(document.documentElement).getPropertyValue('--border').trim()||'#334155';
      const camera=cameraRef.current; const toScreen=(x:number,y:number)=>({x:(x-camera.x)*camera.zoom+rect.width/2,y:(y-camera.y)*camera.zoom+rect.height/2});

      for(const edge of visibleEdges){
        const a=byId.get(edge.source),b=byId.get(edge.target);if(!a||!b)continue;
        const s=toScreen(a.x,a.y),e=toScreen(b.x,b.y),highlighted=neighbors.has(edge.source)&&neighbors.has(edge.target);
        ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(e.x,e.y);
        ctx.lineWidth=highlighted?2.5:edge.type==='parent'?1.8:edge.type==='date'?1.9:1;
        ctx.setLineDash(edge.type==='timeline'?[5,7]:[]);
        ctx.strokeStyle=edge.type==='date'?(a.type==='date'?a.color:b.color):edge.type==='parent'?(b.subtaskColor||'#a78bfa'):'#475569';
        ctx.globalAlpha=highlighted?0.98:edge.type==='timeline'?0.35:0.7;ctx.stroke();ctx.setLineDash([]);
      }
      ctx.globalAlpha=1;
      // Parents first, subtasks last so the hierarchy remains readable.
      const drawOrder=[...points].sort((a,b)=>Number(a.isSubtask)-Number(b.isSubtask));
      for(const point of drawOrder){
        const screen=toScreen(point.x,point.y),focus=point.id===selectedRef.current,dimmed=Boolean(selectedRef.current)&&!neighbors.has(point.id);
        const scale=Math.max(.75,Math.min(1.2,camera.zoom));
        const depth=point.type==='date'?1:0.85+(point.pageRank??0)*.35;
        const radius=point.radius*depth*(focus?1.35:1)*scale;
        const clusterColor=colorMode==='cluster'&&point.clusterColor?point.clusterColor:null;
        const color=point.type==='date'?point.color:(point.isSubtask?(point.subtaskColor||SUBTASK_COLOR):(clusterColor||PRIORITY_COLOR[point.priority||'NONE']||PRIORITY_COLOR.NONE));
        if(point.type==='date'){ctx.beginPath();ctx.arc(screen.x,screen.y,radius+(point.isToday?11:6),0,Math.PI*2);ctx.fillStyle=color;ctx.globalAlpha=dimmed?.04:point.isToday?.13:.08;ctx.fill();}
        ctx.save();ctx.shadowBlur=focus?24:14;ctx.shadowColor=hexToRgba(color,dimmed?.08:.45);
        const gradient=ctx.createRadialGradient(screen.x-radius*.35,screen.y-radius*.4,Math.max(1,radius*.08),screen.x,screen.y,Math.max(2,radius));
        gradient.addColorStop(0,'#fff');gradient.addColorStop(.16,color);gradient.addColorStop(1,color);
        ctx.beginPath();ctx.arc(screen.x,screen.y,radius,0,Math.PI*2);ctx.fillStyle=gradient;ctx.globalAlpha=dimmed?.2:.98;ctx.fill();ctx.restore();
        ctx.beginPath();ctx.arc(screen.x,screen.y,radius+(focus?2:1),0,Math.PI*2);ctx.strokeStyle=focus?foreground:(point.type==='task'?(point.isSubtask?color:(point.statusColor||border)):border);ctx.lineWidth=focus?2:point.type==='date'?1.5:point.isSubtask?1.3:1;ctx.globalAlpha=dimmed?.18:.9;ctx.stroke();
        if(point.type==='date'||focus||camera.zoom>.58){ctx.font=`${point.type==='date'?(focus?14:12):(focus?13:10)}px Inter,ui-sans-serif,system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle=foreground;ctx.globalAlpha=dimmed?.2:.94;ctx.fillText(truncate(point.label,point.type==='date'?18:30),screen.x,screen.y+radius+(point.type==='date'?8:5));}
      }
      ctx.globalAlpha=1;animationRef.current=requestAnimationFrame(simulate);
    };
    animationRef.current=requestAnimationFrame(simulate);return()=>{if(animationRef.current)cancelAnimationFrame(animationRef.current);};
  }, [visibleEdges,visibleIds,running,neighbors,colorMode]);

  const screenToWorld=(clientX:number,clientY:number)=>{const canvas=canvasRef.current!;const rect=canvas.getBoundingClientRect(),camera=cameraRef.current;return{x:(clientX-rect.left-rect.width/2)/camera.zoom+camera.x,y:(clientY-rect.top-rect.height/2)/camera.zoom+camera.y};};
  const findNode=(clientX:number,clientY:number)=>{const {x,y}=screenToWorld(clientX,clientY);let closest:PointNode|null=null,closestDistance=Infinity;for(const p of pointsRef.current){if(!visibleIds.has(p.id))continue;const d=Math.hypot(p.x-x,p.y-y),hit=Math.max(14/cameraRef.current.zoom,p.radius+10);if(d<=hit&&d<closestDistance){closest=p;closestDistance=d;}}return closest;};
  const zoomAt=(factor:number,clientX?:number,clientY?:number)=>{const canvas=canvasRef.current;if(!canvas)return;const camera=cameraRef.current,target=Math.max(.28,Math.min(3,camera.zoom*factor));if(clientX!==undefined&&clientY!==undefined){const before=screenToWorld(clientX,clientY);camera.zoom=target;const after=screenToWorld(clientX,clientY);camera.x+=before.x-after.x;camera.y+=before.y-after.y;}else camera.zoom=target;};
  const handlePointerDown=(event:React.PointerEvent<HTMLCanvasElement>)=>{const node=findNode(event.clientX,event.clientY);event.currentTarget.setPointerCapture(event.pointerId);dragRef.current={kind:node?'node':'pan',nodeId:node?.id,lastX:event.clientX,lastY:event.clientY,downX:event.clientX,downY:event.clientY};if(node)node.fixed=true;};
  const handlePointerMove=(event:React.PointerEvent<HTMLCanvasElement>)=>{const drag=dragRef.current;if(!drag)return;const dx=event.clientX-drag.lastX,dy=event.clientY-drag.lastY;drag.lastX=event.clientX;drag.lastY=event.clientY;if(drag.kind==='node'&&drag.nodeId){const p=pointsRef.current.find(x=>x.id===drag.nodeId);if(p){p.x+=dx/cameraRef.current.zoom;p.y+=dy/cameraRef.current.zoom;p.vx=0;p.vy=0;}}else{cameraRef.current.x-=dx/cameraRef.current.zoom;cameraRef.current.y-=dy/cameraRef.current.zoom;}};
  const handlePointerUp=(event:React.PointerEvent<HTMLCanvasElement>)=>{const drag=dragRef.current;if(!drag)return;const moved=Math.hypot(event.clientX-drag.downX,event.clientY-drag.downY);if(drag.kind==='node'&&drag.nodeId){const p=pointsRef.current.find(x=>x.id===drag.nodeId);if(p)p.fixed=false;if(moved<5&&p){setSelectedId(p.id);if(p.type==='date'){setExpandedDate(p.dateKey??null);}else if(p.type==='task'&&p.taskId){onOpenTask?.(p.taskId);}}}dragRef.current=null;};
  const handleWheel=(event:React.WheelEvent<HTMLCanvasElement>)=>{event.preventDefault();zoomAt(event.deltaY>0?.9:1.1,event.clientX,event.clientY);};
  const reset=()=>{for(const p of pointsRef.current){p.vx=0;p.vy=0;p.fixed=false;}cameraRef.current={x:0,y:0,zoom:1};requestAnimationFrame(fitView);setRunning(true);};

  const expandedRoots=useMemo(()=>expandedDate?taskNodes.filter(t=>!t.parentId&&(t.dateKeys?.includes(expandedDate)||t.dateKey===expandedDate)):[],[expandedDate,taskNodes]);
  const expandedDescendantCount=useMemo(()=>{if(!expandedDate)return 0;return Math.max(0,Array.from(visibleTaskIds).length-expandedRoots.length);},[expandedDate,visibleTaskIds,expandedRoots.length]);
  const expandedDateNode=dateNodes.find(n=>n.dateKey===expandedDate);

  // Пробрасываем выбранный день наружу — панель рисуется в правом сайдбаре, а не поверх графа.
  useEffect(() => {
    if (!onSelectedDay) return;
    if (!expandedDateNode) { onSelectedDay(null); return; }
    onSelectedDay({
      dateKey: expandedDateNode.dateKey ?? '',
      label: expandedDateNode.label,
      color: expandedDateNode.color,
      roots: expandedRoots,
      descendantCount: expandedDescendantCount,
    });
  }, [expandedDateNode, expandedRoots, expandedDescendantCount, onSelectedDay]);

  return <div className="graph-view flex min-h-0 flex-1 flex-col">
    <div className="graph-toolbar flex flex-wrap items-center gap-2 border-b px-5 py-3">
      <div className="graph-search min-w-[220px] flex-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск по задачам…" className="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring"/>
          {query&&<button onClick={()=>setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4"/></button>}
        </div>
      </div>
      <button type="button" className="graph-mobile-search-toggle hidden rounded-lg border p-2 hover:bg-accent" title="Поиск" onClick={()=>setMobileSearchOpen(v=>!v)}><Search className="h-4 w-4"/></button>
      <div className="graph-legend flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs"><span className="h-2.5 w-2.5 rounded-full bg-yellow-400"/>Сегодня <span className="h-2.5 w-2.5 rounded-full bg-blue-500"/>Дни <span className="h-2.5 w-2.5 rounded-full bg-red-500"/>Приоритет <span className="h-2.5 w-2.5 rounded-full" style={{background:SUBTASK_COLOR}}/>Подзадача <span className="text-muted-foreground">Размер = PageRank</span></div>
      <div className="graph-zoom-controls ml-auto flex items-center gap-1 rounded-md border p-0.5"><button title="Уменьшить" onClick={()=>zoomAt(.85)} className="rounded p-1.5 hover:bg-accent"><Minus className="h-4 w-4"/></button><button title="Увеличить" onClick={()=>zoomAt(1.18)} className="rounded p-1.5 hover:bg-accent"><Plus className="h-4 w-4"/></button><button title="Вписать граф" onClick={fitView} className="rounded p-1.5 hover:bg-accent"><Maximize2 className="h-4 w-4"/></button><button title="Сбросить" onClick={reset} className="rounded p-1.5 hover:bg-accent"><RotateCcw className="h-4 w-4"/></button><button title={running?'Пауза физики':'Запустить физику'} onClick={()=>setRunning(v=>!v)} className="rounded p-1.5 hover:bg-accent">{running?<Pause className="h-4 w-4"/>:<Play className="h-4 w-4"/>}</button></div>
      <button type="button" className="graph-mobile-settings hidden rounded-lg border p-2 hover:bg-accent" title="Управление графом" onClick={()=>setMobileControlsOpen(v=>!v)}><Settings2 className="h-4 w-4"/></button>
    </div>
    {mobileSearchOpen&&<div className="graph-mobile-search-panel hidden border-b px-3 py-2"><div className="relative"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти задачу…" className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"/>{query&&<button onClick={()=>setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4"/></button>}</div></div>}
    {mobileControlsOpen&&<div className="graph-mobile-controls hidden border-b px-3 py-2"><div className="flex items-center justify-between rounded-xl border bg-card p-1"><button title="Уменьшить" onClick={()=>zoomAt(.85)} className="flex h-10 flex-1 items-center justify-center rounded-lg hover:bg-accent"><Minus className="h-4 w-4"/></button><button title="Увеличить" onClick={()=>zoomAt(1.18)} className="flex h-10 flex-1 items-center justify-center rounded-lg hover:bg-accent"><Plus className="h-4 w-4"/></button><button title="Вписать граф" onClick={fitView} className="flex h-10 flex-1 items-center justify-center rounded-lg hover:bg-accent"><Maximize2 className="h-4 w-4"/></button><button title="Сбросить" onClick={reset} className="flex h-10 flex-1 items-center justify-center rounded-lg hover:bg-accent"><RotateCcw className="h-4 w-4"/></button><button title={running?'Пауза физики':'Запустить физику'} onClick={()=>setRunning(v=>!v)} className="flex h-10 flex-1 items-center justify-center rounded-lg hover:bg-accent">{running?<Pause className="h-4 w-4"/>:<Play className="h-4 w-4"/>}</button></div></div>}
    <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onWheel={handleWheel} onDoubleClick={()=>selected?.taskId&&onOpenTask?.(selected.taskId)}/>
      <div className="graph-date-chips pointer-events-none absolute bottom-4 left-4 flex max-w-[620px] flex-wrap gap-1.5">{dateNodes.map(date=><button key={date.id} onClick={()=>{setSelectedId(date.id);setExpandedDate(date.dateKey??null);}} className={cn('pointer-events-auto rounded-full border px-2.5 py-1 text-[11px] transition-all',expandedDate===date.dateKey?'scale-105 bg-accent':'bg-card/85')}><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{background:date.color}}/>{date.label}</button>)}</div>
      {expandedDateNode&&!embeddedPanel&&<div className="graph-selected-day absolute right-4 top-4 w-80 rounded-2xl border bg-card/95 p-4 shadow-xl backdrop-blur"><div className="flex items-start gap-3"><span className="mt-1 h-4 w-4 shrink-0 rounded-full" style={{background:expandedDateNode.color,boxShadow:`0 0 18px ${hexToRgba(expandedDateNode.color,.45)}`}}/><div className="min-w-0 flex-1"><div className="text-[10px] uppercase tracking-[.18em] text-muted-foreground">Выбранный день</div><div className="mt-1 text-lg font-semibold">{expandedDateNode.label}</div><div className="mt-1 text-xs text-muted-foreground">{expandedRoots.length?`${expandedRoots.length} задач · ${expandedDescendantCount} подзадач раскрыто`:'На этот день открытых задач нет'}</div></div><button onClick={()=>setExpandedDate(null)} className="rounded p-1 hover:bg-accent"><X className="h-4 w-4"/></button></div><div className="mt-4 space-y-1.5 max-h-72 overflow-y-auto">{expandedRoots.map(task=><button key={task.id} onClick={()=>onOpenTask?.(task.taskId!)} className="flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs hover:bg-accent"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{background:PRIORITY_COLOR[task.priority||'NONE']}}/><span className="min-w-0 flex-1 truncate">{task.label}</span><span className="text-[10px] text-muted-foreground">{visibleTaskIds.has(task.taskId!)?'+' :''}</span></button>)}</div></div>}
      {!expandedDate && <div className="graph-empty-hint pointer-events-none absolute inset-0 flex items-center justify-center"><div className="rounded-2xl border bg-card/80 px-5 py-4 text-center shadow-sm backdrop-blur"><div className="text-sm font-semibold">Выберите день</div><p className="mt-1 text-xs text-muted-foreground">Сегодня — жёлтый центральный узел. Нажмите любой день, чтобы сразу увидеть задачи и все их подзадачи.</p></div></div>}
    </div>
  </div>;
}
