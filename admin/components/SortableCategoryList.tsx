'use client';

import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


interface CategoryItem {
  id: string;
  nameEn: string;
  nameAr: string;
  icon: string | null;
}

interface SortableCategoryListProps {
  items: CategoryItem[];
  onReorder: (items: Array<{ id: string; displayOrder: number }>) => Promise<void>;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function SortableItem({
  item,
  onEdit,
  onDelete,
}: {
  item: CategoryItem;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
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
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-card bg-white px-4 py-3 shadow-card border border-border"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab p-1 text-sand hover:text-mocha active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-umber truncate">
          {item.nameEn}
        </p>
        <p className="text-xs text-mocha truncate">{item.nameAr}</p>
      </div>

      {item.icon && (
        <span className="text-xs text-sand capitalize">{item.icon}</span>
      )}

      <button
        onClick={() => onEdit(item.id)}
        className="rounded-lg p-2 text-sm font-medium text-primary hover:bg-primary-light transition"
      >
        Edit
      </button>
      <button
        onClick={() => onDelete(item.id)}
        className="rounded-lg p-2 text-sm font-medium text-destructive hover:bg-red-50 transition"
      >
        Delete
      </button>
    </div>
  );
}

export function SortableCategoryList({
  items,
  onReorder,
  onEdit,
  onDelete,
}: SortableCategoryListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const newItems = arrayMove(items, oldIndex, newIndex);

    const reorderPayload = newItems.map((it, idx) => ({
      id: it.id,
      displayOrder: idx,
    }));

    await onReorder(reorderPayload);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
