'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { adminApi, setAuthToken } from '@/lib/adminApi';
import { SortableCategoryList } from '@/components/SortableCategoryList';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Category {
  id: string;
  name: { en: string; ar: string };
  icon: string | null;
  displayOrder: number;
}

interface CategoryFormData {
  id?: string;
  nameEn: string;
  nameAr: string;
  icon: string;
  displayOrder: string;
}

export default function CategoriesPage() {
  const { data: session, status } = useSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryFormData>({
    nameEn: '',
    nameAr: '',
    icon: '',
    displayOrder: '',
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      const { data } = await adminApi.get<Category[]>('/categories');
      setCategories(data);
    } catch {
      showToast('Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.accessToken) {
      setAuthToken(session.accessToken);
    }
  }, [session]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchCategories();
    }
  }, [status, fetchCategories]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({
      nameEn: '',
      nameAr: '',
      icon: '',
      displayOrder: String(categories.length),
    });
    setModalOpen(true);
  };

  const openEdit = (id: string) => {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    setEditingId(id);
    setForm({
      nameEn: cat.name.en,
      nameAr: cat.name.ar,
      icon: cat.icon ?? '',
      displayOrder: String(cat.displayOrder),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    // Stricter than parseInt, which silently accepts "5abc" as 5.
    const displayOrder = Number(form.displayOrder);
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      showToast('Display order must be a non-negative integer');
      return;
    }
    const payload = {
      name: { en: form.nameEn.trim(), ar: form.nameAr.trim() },
      icon: form.icon.trim() || undefined,
      displayOrder,
    };

    try {
      if (editingId) {
        await adminApi.patch(`/admin/categories/${editingId}`, payload);
        showToast('Category updated');
      } else {
        await adminApi.post('/admin/categories', payload);
        showToast('Category created');
      }
      setModalOpen(false);
      await fetchCategories();
    } catch {
      showToast('Save failed');
    }
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await adminApi.delete(`/admin/categories/${deletingId}`);
      showToast('Category deleted');
      await fetchCategories();
    } catch {
      showToast('Delete failed');
    } finally {
      setConfirmOpen(false);
      setDeletingId(null);
    }
  };

  const handleReorder = async (
    items: Array<{ id: string; displayOrder: number }>,
  ) => {
    try {
      await adminApi.patch('/admin/categories/reorder', { items });
      showToast('Reorder saved');
      await fetchCategories();
    } catch {
      showToast('Reorder failed');
      await fetchCategories();
    }
  };

  const displayOrderValue = Number(form.displayOrder);
  const canSave =
    form.nameEn.trim().length > 0 &&
    form.nameAr.trim().length > 0 &&
    Number.isInteger(displayOrderValue) &&
    displayOrderValue >= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-umber">Categories</h2>
        <button
          onClick={openCreate}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
        >
          + Add Category
        </button>
      </div>

      {loading ? (
        <p className="text-mocha">Loading...</p>
      ) : categories.length === 0 ? (
        <p className="text-mocha">No categories found.</p>
      ) : (
        <SortableCategoryList
          items={categories.map((c) => ({
            id: c.id,
            nameEn: c.name.en,
            nameAr: c.name.ar,
            icon: c.icon,
          }))}
          onReorder={handleReorder}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-card-md">
            <h3 className="text-lg font-semibold text-umber">
              {editingId ? 'Edit Category' : 'Add Category'}
            </h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-mocha">
                  Name (EN) *
                </label>
                <input
                  type="text"
                  value={form.nameEn}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nameEn: e.target.value }))
                  }
                  className="w-full rounded-input border border-border bg-background px-4 py-2 text-sm text-umber outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                  maxLength={80}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-mocha">
                  Name (AR) *
                </label>
                <input
                  type="text"
                  value={form.nameAr}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nameAr: e.target.value }))
                  }
                  className="w-full rounded-input border border-border bg-background px-4 py-2 text-sm text-umber outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                  maxLength={80}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-mocha">
                  Icon
                </label>
                <input
                  type="text"
                  value={form.icon}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, icon: e.target.value }))
                  }
                  className="w-full rounded-input border border-border bg-background px-4 py-2 text-sm text-umber outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                  maxLength={40}
                  placeholder="e.g. coffee"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-mocha">
                  Display Order *
                </label>
                <input
                  type="number"
                  value={form.displayOrder}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      displayOrder: e.target.value,
                    }))
                  }
                  className="w-full rounded-input border border-border bg-background px-4 py-2 text-sm text-umber outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                  min={0}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-mocha transition hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Category"
        description="Are you sure you want to delete this category?"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onClose={() => {
          setConfirmOpen(false);
          setDeletingId(null);
        }}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-umber px-4 py-2 text-sm text-white shadow-card-md">
          {toast}
        </div>
      )}
    </div>
  );
}
