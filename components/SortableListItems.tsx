"use client";

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DEPARTMENT_IDS,
  DEPARTMENT_LABELS,
  type DepartmentId,
} from "@/lib/departments";

type ListItem = {
  id: string;
  name: string;
  addedAt: string;
  note?: string;
  department?: DepartmentId;
};

const LONG_PRESS_MS = 480;

function GripIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="9" cy="7" r="1.5" />
      <circle cx="15" cy="7" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="17" r="1.5" />
      <circle cx="15" cy="17" r="1.5" />
    </svg>
  );
}

function SortableRow({
  item,
  pendingRemove,
  removing,
  entering,
  editingNote,
  onRemove,
  onEditNote,
  onSaveNote,
  onCancelNote,
  onDepartmentChange,
}: {
  item: ListItem;
  pendingRemove: boolean;
  removing: boolean;
  entering: boolean;
  editingNote: boolean;
  onRemove: (id: string) => void;
  onEditNote: (id: string) => void;
  onSaveNote: (id: string, note: string) => void;
  onCancelNote: () => void;
  onDepartmentChange?: (id: string, department: DepartmentId) => void;
}) {
  const [enterVisible, setEnterVisible] = useState(!entering);
  const [draftNote, setDraftNote] = useState(item.note ?? "");
  const noteInputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const skipBlurSaveRef = useRef(false);
  const noteCommittedRef = useRef(false);

  useEffect(() => {
    if (!entering) {
      setEnterVisible(true);
      return;
    }
    setEnterVisible(false);
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setEnterVisible(true));
    });
    return () => window.cancelAnimationFrame(raf);
  }, [entering]);

  useEffect(() => {
    if (!editingNote) return;
    noteCommittedRef.current = false;
    setDraftNote(item.note ?? "");
    queueMicrotask(() => {
      noteInputRef.current?.focus();
      noteInputRef.current?.select();
    });
  }, [editingNote, item.note]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: removing || editingNote });

  const collapsed = removing || (entering && !enterVisible);
  const fadeTransition = "opacity 320ms ease-out, max-height 320ms ease-out";
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition
      ? `${transition}, ${fadeTransition}`
      : fadeTransition,
    zIndex: isDragging ? 2 : undefined,
    opacity: collapsed ? 0 : isDragging ? 0.92 : 1,
    maxHeight: collapsed ? 0 : editingNote || item.note ? "9rem" : "6rem",
  };

  const department = item.department ?? "other";
  const marked = pendingRemove || removing;

  function clearLongPressTimer() {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function onRowPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (removing || editingNote || e.button !== 0) return;
    longPressedRef.current = false;
    pointerIdRef.current = e.pointerId;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressedRef.current = true;
      onCancelNote();
      onRemove(item.id);
    }, LONG_PRESS_MS);
  }

  function onRowPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    clearLongPressTimer();
    if (removing || editingNote) return;
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    if (pendingRemove) {
      onRemove(item.id);
      return;
    }
    onEditNote(item.id);
  }

  function onRowPointerCancel(e: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    clearLongPressTimer();
    longPressedRef.current = false;
  }

  function commitNote() {
    if (noteCommittedRef.current) return;
    noteCommittedRef.current = true;
    onSaveNote(item.id, draftNote);
  }

  function onNoteBlur() {
    if (skipBlurSaveRef.current) {
      skipBlurSaveRef.current = false;
      return;
    }
    commitNote();
  }

  function onNoteKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitNote();
    } else if (e.key === "Escape") {
      e.preventDefault();
      skipBlurSaveRef.current = true;
      onCancelNote();
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      aria-hidden={removing || undefined}
      className={`relative flex items-stretch overflow-hidden border-b border-hairline ${
        isDragging
          ? "bg-accent-soft/50 shadow-sm"
          : marked
            ? "bg-danger/5"
            : "bg-transparent"
      } ${removing ? "pointer-events-none border-b-0" : ""}`}
    >
      <button
        type="button"
        className="flex shrink-0 touch-none items-center px-2.5 text-muted hover:text-foreground"
        aria-label={`${item.name} verschieben`}
        {...attributes}
        {...listeners}
      >
        <GripIcon className="h-5 w-5" />
      </button>
      {editingNote ? (
        <div className="min-w-0 flex-1 px-2 py-2">
          <p className="mb-1 truncate text-base">{item.name}</p>
          <input
            ref={noteInputRef}
            type="text"
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            onBlur={onNoteBlur}
            onKeyDown={onNoteKeyDown}
            maxLength={200}
            placeholder="Notiz (Stückzahl, Gewicht…)"
            aria-label={`Notiz für ${item.name}`}
            className="w-full rounded-lg border border-hairline bg-panel-strong px-2.5 py-1.5 text-sm outline-none ring-accent focus:ring-2"
          />
        </div>
      ) : (
        <div
          role="button"
          tabIndex={removing ? -1 : 0}
          onPointerDown={onRowPointerDown}
          onPointerUp={onRowPointerUp}
          onPointerCancel={onRowPointerCancel}
          onKeyDown={(e) => {
            if (removing) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (pendingRemove) onRemove(item.id);
              else onEditNote(item.id);
            } else if (e.key === "Delete" || e.key === "Backspace") {
              e.preventDefault();
              onRemove(item.id);
            }
          }}
          aria-pressed={pendingRemove}
          aria-label={
            pendingRemove
              ? `${item.name} — Löschen abbrechen`
              : item.note
                ? `${item.name}, ${item.note} — tippen für Notiz, halten zum Löschen`
                : `${item.name} — tippen für Notiz, halten zum Löschen`
          }
          className={`min-w-0 flex-1 cursor-pointer px-2 py-3.5 text-left transition hover:bg-accent-soft/40 active:bg-accent-soft/60 ${
            marked ? "text-muted" : ""
          }`}
        >
          <span className="block text-base">{item.name}</span>
          {item.note ? (
            <span className="mt-0.5 block text-sm text-muted">{item.note}</span>
          ) : null}
        </div>
      )}
      {onDepartmentChange ? (
        <label className="flex shrink-0 items-center pr-2">
          <span className="sr-only">Abteilung für {item.name}</span>
          <select
            value={department}
            onChange={(e) =>
              onDepartmentChange(item.id, e.target.value as DepartmentId)
            }
            onClick={(e) => e.stopPropagation()}
            disabled={removing}
            className="max-w-[7.5rem] truncate rounded-lg border border-hairline bg-panel-strong px-1.5 py-1 text-[11px] text-muted outline-none ring-accent focus:ring-2"
          >
            {DEPARTMENT_IDS.map((id) => (
              <option key={id} value={id}>
                {DEPARTMENT_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {marked ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-2 top-1/2 z-[1] h-px -translate-y-1/2 bg-muted"
        />
      ) : null}
    </li>
  );
}

function departmentOf(item: ListItem): DepartmentId {
  return item.department ?? "other";
}

export function SortableListItems({
  items,
  pendingRemoveIds,
  removingIds,
  enteringIds,
  editingNoteId,
  onReorder,
  onRemove,
  onEditNote,
  onSaveNote,
  onCancelNote,
  onDragStateChange,
  onDepartmentChange,
  departmentsEnabled = false,
}: {
  items: ListItem[];
  pendingRemoveIds?: ReadonlySet<string>;
  removingIds?: ReadonlySet<string>;
  enteringIds?: ReadonlySet<string>;
  editingNoteId?: string | null;
  onReorder: (next: ListItem[]) => void;
  onRemove: (id: string) => void;
  onEditNote: (id: string) => void;
  onSaveNote: (id: string, note: string) => void;
  onCancelNote: () => void;
  onDragStateChange?: (dragging: boolean) => void;
  onDepartmentChange?: (id: string, department: DepartmentId) => void;
  departmentsEnabled?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragStart() {
    onDragStateChange?.(true);
  }

  function handleDragEnd(event: DragEndEvent) {
    onDragStateChange?.(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  function handleDragCancel() {
    onDragStateChange?.(false);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="overflow-hidden rounded-xl bg-panel">
          {items.map((item, index) => {
            const dept = departmentOf(item);
            const prevDept =
              index > 0 ? departmentOf(items[index - 1]!) : null;
            const showHeader =
              departmentsEnabled && prevDept !== dept;
            return (
              <Fragment key={item.id}>
                {showHeader ? (
                  <li className="border-b border-hairline bg-surface/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {DEPARTMENT_LABELS[dept]}
                  </li>
                ) : null}
                <SortableRow
                  item={item}
                  pendingRemove={pendingRemoveIds?.has(item.id) ?? false}
                  removing={removingIds?.has(item.id) ?? false}
                  entering={enteringIds?.has(item.id) ?? false}
                  editingNote={editingNoteId === item.id}
                  onRemove={onRemove}
                  onEditNote={onEditNote}
                  onSaveNote={onSaveNote}
                  onCancelNote={onCancelNote}
                  onDepartmentChange={
                    departmentsEnabled ? onDepartmentChange : undefined
                  }
                />
              </Fragment>
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
