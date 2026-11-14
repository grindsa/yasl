"use client";

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

type ListItem = { id: string; name: string; addedAt: string };

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
  onRemove,
}: {
  item: ListItem;
  onRemove: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : undefined,
    opacity: isDragging ? 0.92 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-stretch border-b border-hairline last:border-b-0 ${
        isDragging ? "bg-accent-soft/50 shadow-sm" : "bg-transparent"
      }`}
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
        className="min-w-0 flex-1 px-2 py-3.5 pr-4 text-left text-base transition hover:bg-accent-soft/40 active:bg-accent-soft/60"
      >
        {item.name}
      </button>
    </li>
  );
}

export function SortableListItems({
  items,
  onReorder,
  onRemove,
  onDragStateChange,
}: {
  items: ListItem[];
  onReorder: (next: ListItem[]) => void;
  onRemove: (id: string) => void;
  onDragStateChange?: (dragging: boolean) => void;
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
          {items.map((item) => (
            <SortableRow key={item.id} item={item} onRemove={onRemove} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
