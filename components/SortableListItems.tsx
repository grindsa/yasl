"use client";

import { Fragment, useEffect, useState } from "react";
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
  department?: DepartmentId;
};

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
  onRemove,
  onDepartmentChange,
}: {
  item: ListItem;
  pendingRemove: boolean;
  removing: boolean;
  entering: boolean;
  onRemove: (id: string) => void;
  onDepartmentChange?: (id: string, department: DepartmentId) => void;
}) {
  const [enterVisible, setEnterVisible] = useState(!entering);

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

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: removing });

  const collapsed = removing || (entering && !enterVisible);
  const fadeTransition = "opacity 320ms ease-out, max-height 320ms ease-out";
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition
      ? `${transition}, ${fadeTransition}`
      : fadeTransition,
    zIndex: isDragging ? 2 : undefined,
    opacity: collapsed ? 0 : isDragging ? 0.92 : 1,
    maxHeight: collapsed ? 0 : "6rem",
  };

  const department = item.department ?? "other";
  const marked = pendingRemove || removing;

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
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-pressed={pendingRemove}
        disabled={removing}
        aria-label={
          pendingRemove
            ? `${item.name} — Löschen abbrechen`
            : `${item.name} — zum Löschen vormerken`
        }
        className={`min-w-0 flex-1 px-2 py-3.5 text-left text-base transition hover:bg-accent-soft/40 active:bg-accent-soft/60 ${
          marked ? "text-muted" : ""
        }`}
      >
        {item.name}
      </button>
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
  onReorder,
  onRemove,
  onDragStateChange,
  onDepartmentChange,
  departmentsEnabled = false,
}: {
  items: ListItem[];
  pendingRemoveIds?: ReadonlySet<string>;
  removingIds?: ReadonlySet<string>;
  enteringIds?: ReadonlySet<string>;
  onReorder: (next: ListItem[]) => void;
  onRemove: (id: string) => void;
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
                  onRemove={onRemove}
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
