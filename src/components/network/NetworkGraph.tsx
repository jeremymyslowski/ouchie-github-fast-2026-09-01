import { useEffect, useMemo, useRef, useState } from "react";
import { EDGES, PEOPLE, type CategoryId, type Edge, type Person } from "@/data/network-data";
export type Selection = { kind: "person"; id: string } | { kind: "edge"; id: string } | null;
interface Props {
  selection: Selection;
  onSelect: (s: Selection) => void;
  categoryFilter: Set<CategoryId> | null;
  searchQuery: string;
  focusPersonId?: string | null;
}
interface HoverState { kind: "person" | "edge"; id: string; x: number; y: number; }
const CAT_HEX: Record<CategoryId, string> = {
  central: "#e4e4e7", vaccine: "#3d8b6e", origins: "#b54a4a", wh: "#b8860b",
  media: "#5b7a8c", intl: "#4a7c9b", social: "#8a7355", nih: "#4a6fa5", eco: "#c45c26", critic: "#6d5a4a",
};
function resolveCatColor(id: CategoryId): string { return CAT_HEX[id] ?? "#a1a1aa"; }
export function NetworkGraph({ selection, onSelect, categoryFilter, searchQuery, focusPersonId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 400, y: 300, k: 0.9 });
  const [hover, setHover] = useState<HoverState | null>(null);
  const dragRef = useRef<{ mode: "pan" | null; startX: number; startY: number; origX: number; origY: number }>({ mode: null, startX: 0, startY: 0, origX: 0, origY: 0 });
  const [size, setSize] = useState({ w: 800, h: 600 });
  const centeredOnce = useRef(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (w > 0 && h > 0) {
        setSize({ w, h });
        if (!centeredOnce.current) { centeredOnce.current = true; setView({ x: w / 2, y: h / 2, k: 0.9 }); }
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const q = searchQuery.trim().toLowerCase();
  const visiblePeople = useMemo(() => PEOPLE.filter((p) => {
    if (categoryFilter && !categoryFilter.has(p.category) && p.category !== "central") return false;
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q) || p.affiliation.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q);
  }), [categoryFilter, q]);
  const visibleIds = useMemo(() => new Set(visiblePeople.map((p) => p.id)), [visiblePeople]);
  const visibleEdges = useMemo(() => EDGES.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)), [visibleIds]);
  const peopleById = useMemo(() => { const m = new Map<string, Person>(); for (const p of PEOPLE) m.set(p.id, p); return m; }, []);
  useEffect(() => {
    if (!focusPersonId) return;
    const p = peopleById.get(focusPersonId);
    if (!p) return;
    setView((v) => ({ ...v, x: -p.x * v.k + size.w / 2, y: -p.y * v.k + size.h / 2 }));
  }, [focusPersonId, peopleById, size.w, size.h]);
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextK = Math.min(2.8, Math.max(0.35, view.k * factor));
    const wx = (mx - view.x) / view.k, wy = (my - view.y) / view.k;
    setView({ k: nextK, x: mx - wx * nextK, y: my - wy * nextK });
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest("[data-node]") || target.closest("[data-edge]")) return;
    dragRef.current = { mode: "pan", startX: e.clientX, startY: e.clientY, origX: view.x, origY: view.y };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragRef.current.mode === "pan") {
      setView((v) => ({ ...v, x: dragRef.current.origX + e.clientX - dragRef.current.startX, y: dragRef.current.origY + e.clientY - dragRef.current.startY }));
    }
  };
  const selectedPersonId = selection?.kind === "person" ? selection.id : null;
  const selectedEdgeId = selection?.kind === "edge" ? selection.id : null;
  const relatedIds = useMemo(() => {
    if (selectedEdgeId) {
      const e = EDGES.find((x) => x.id === selectedEdgeId);
      return e ? new Set([e.source, e.target]) : new Set<string>();
    }
    if (selectedPersonId) {
      const s = new Set<string>([selectedPersonId]);
      for (const e of EDGES) {
        if (e.source === selectedPersonId) s.add(e.target);
        if (e.target === selectedPersonId) s.add(e.source);
      }
      return s;
    }
    return null;
  }, [selectedPersonId, selectedEdgeId]);
  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-bg">
      <svg ref={svgRef} width={Math.max(size.w, 1)} height={Math.max(size.h, 1)} className="absolute inset-0 touch-none" style={{ width: size.w, height: size.h }} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { dragRef.current.mode = null; }} onPointerLeave={() => { dragRef.current.mode = null; setHover(null); }} role="img" aria-label="Interactive contact network graph">
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {visibleEdges.map((edge) => {
            const a = peopleById.get(edge.source), b = peopleById.get(edge.target);
            if (!a || !b) return null;
            const isSelected = selectedEdgeId === edge.id;
            const isRelated = relatedIds === null || (relatedIds.has(edge.source) && relatedIds.has(edge.target));
            const dimmed = relatedIds !== null && !isRelated && !isSelected;
            const width = 1 + edge.strength * 0.55;
            const stroke = a.category === "eco" || b.category === "eco" ? "#c45c26" : a.category === "origins" || b.category === "origins" ? "#b54a4a" : "#52525b";
            return (
              <g key={edge.id} data-edge={edge.id} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onSelect({ kind: "edge", id: edge.id }); }} onPointerEnter={(ev) => setHover({ kind: "edge", id: edge.id, x: ev.clientX, y: ev.clientY })} onPointerLeave={() => setHover(null)}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16} />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={isSelected ? "#f4f4f5" : stroke} strokeWidth={isSelected ? width + 1.5 : width} strokeOpacity={dimmed ? 0.12 : isSelected ? 0.95 : 0.5} strokeLinecap="round" />
                {edge.diaryQuote && <circle cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r={isSelected ? 5 : 3.5} fill={isSelected ? "#f4f4f5" : resolveCatColor(a.category)} opacity={dimmed ? 0.15 : 0.95} />}
              </g>
            );
          })}
          {visiblePeople.map((person) => {
            const r = person.r ?? 16;
            const color = resolveCatColor(person.category);
            const isSelected = selectedPersonId === person.id;
            const isRelated = relatedIds === null || relatedIds.has(person.id);
            const dimmed = relatedIds !== null && !isRelated;
            const matchSearch = !!q && (person.name.toLowerCase().includes(q) || person.role.toLowerCase().includes(q));
            return (
              <g key={person.id} data-node={person.id} transform={`translate(${person.x},${person.y})`} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onSelect({ kind: "person", id: person.id }); }} onPointerEnter={(ev) => setHover({ kind: "person", id: person.id, x: ev.clientX, y: ev.clientY })} onPointerLeave={() => setHover(null)} opacity={dimmed ? 0.22 : 1}>
                {(isSelected || matchSearch) && <circle r={r + 8} fill="none" stroke="#f4f4f5" strokeWidth={1.5} strokeOpacity={0.55} />}
                <circle r={r + 4} fill={color} opacity={0.18} />
                <circle r={r} fill="#121214" stroke={color} strokeWidth={isSelected ? 3 : 2.25} />
                <circle r={Math.max(4, r * 0.35)} fill={color} />
                <text y={r + 16} textAnchor="middle" fill="#f4f4f5" fontSize={person.category === "central" ? 13 : 11} fontWeight={person.category === "central" ? 600 : 500} style={{ pointerEvents: "none" }}>{person.shortName}</text>
              </g>
            );
          })}
        </g>
      </svg>
      {hover && <HoverTooltip hover={hover} peopleById={peopleById} edges={EDGES} />}
      <div className="absolute bottom-4 left-4 z-10 flex gap-0 overflow-hidden rounded-lg border border-border bg-bg-elevated/95">
        <button type="button" aria-label="Zoom in" className="h-10 w-10 border-r border-border text-lg" onClick={() => setView((v) => ({ ...v, k: Math.min(2.8, v.k * 1.2) }))}>+</button>
        <button type="button" aria-label="Zoom out" className="h-10 w-10 border-r border-border text-lg" onClick={() => setView((v) => ({ ...v, k: Math.max(0.35, v.k / 1.2) }))}>−</button>
        <button type="button" aria-label="Reset view" className="h-10 w-10 text-lg" onClick={() => setView({ x: size.w / 2, y: size.h / 2, k: 0.9 })}>⊙</button>
      </div>
    </div>
  );
}
function HoverTooltip({ hover, peopleById, edges }: { hover: HoverState; peopleById: Map<string, Person>; edges: Edge[] }) {
  if (hover.kind === "person") {
    const p = peopleById.get(hover.id);
    if (!p) return null;
    return <div className="pointer-events-none fixed z-50 max-w-[18rem] rounded-lg border border-border bg-bg-elevated px-3 py-2.5 shadow-xl" style={{ left: Math.min(window.innerWidth - 300, hover.x + 14), top: Math.min(window.innerHeight - 140, hover.y + 14) }}><p className="text-sm font-semibold">{p.name}</p><p className="mt-1 text-xs text-fg-muted">{p.role}</p><p className="mt-2 line-clamp-3 text-xs text-fg-muted">{p.summary}</p></div>;
  }
  const e = edges.find((x) => x.id === hover.id);
  if (!e) return null;
  const a = peopleById.get(e.source), b = peopleById.get(e.target);
  return <div className="pointer-events-none fixed z-50 max-w-[18rem] rounded-lg border border-border bg-bg-elevated px-3 py-2.5 shadow-xl" style={{ left: Math.min(window.innerWidth - 300, hover.x + 14), top: Math.min(window.innerHeight - 120, hover.y + 14) }}><p className="text-xs uppercase text-fg-subtle">Connection</p><p className="mt-1 text-sm font-semibold">{a?.shortName} ↔ {b?.shortName}</p><p className="mt-1 text-xs text-fg-muted">{e.type}</p></div>;
}
