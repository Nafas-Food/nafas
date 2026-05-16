'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import { adminApi, setAuthToken } from '@/lib/adminApi';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface VerifiedChef {
  id: string;
  chefName: string;
  bio: string;
  logo: string;
  isOpen: boolean;
  verifiedAt: string;
}

export default function VerifiedChefsPage() {
  const { data: session, status } = useSession();
  const [chefs, setChefs] = useState<VerifiedChef[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [q, setQ] = useState('');

  const [revokeDialog, setRevokeDialog] = useState<{ open: boolean; chefId: string; chefName: string; reason: string }>({
    open: false,
    chefId: '',
    chefName: '',
    reason: '',
  });

  useEffect(() => {
    if (session?.accessToken) {
      setAuthToken(session.accessToken);
    }
  }, [session]);

  const fetchChefs = async () => {
    setRefreshing(true);
    try {
      const { data } = await adminApi.get('/admin/chefs', {
        params: q ? { q } : undefined,
      });
      setChefs(data);
      setError('');
    } catch {
      setError('Failed to load chefs.');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated') {
      fetchChefs();
    }
  }, [status]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (status === 'authenticated') fetchChefs();
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const handleRevoke = async (chefId: string, reason: string) => {
    try {
      await adminApi.delete(`/admin/chefs/${chefId}`, { data: { reason } });
      setToast('Chef revoked successfully.');
      fetchChefs();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setToast('This chef was already revoked by another admin.');
        fetchChefs();
      } else {
        setToast('Failed to revoke chef.');
      }
    } finally {
      setRevokeDialog({ open: false, chefId: '', chefName: '', reason: '' });
    }
  };

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-mocha">Loading chefs...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-umber">Verified Chefs</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chefs..."
            className="rounded-input border border-border bg-white px-4 py-2 text-sm text-umber outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={fetchChefs}
            disabled={refreshing}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-mocha transition hover:bg-muted disabled:opacity-50"
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {toast && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-success">
          {toast}
        </div>
      )}

      {chefs.length === 0 ? (
        <div className="rounded-card bg-white p-12 text-center shadow-card">
          <p className="text-mocha">No verified chefs found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-3 font-semibold text-umber">Chef Name</th>
                <th className="px-6 py-3 font-semibold text-umber">Status</th>
                <th className="px-6 py-3 font-semibold text-umber">Verified</th>
                <th className="px-6 py-3 font-semibold text-umber">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {chefs.map((chef) => (
                <tr key={chef.id} className="hover:bg-background">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {chef.logo && (
                        <img
                          src={chef.logo}
                          alt={chef.chefName}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      )}
                      <span className="font-medium text-umber">{chef.chefName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        chef.isOpen
                          ? 'bg-green-50 text-success'
                          : 'bg-gray-100 text-mocha'
                      }`}
                    >
                      {chef.isOpen ? 'Open' : 'Closed'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-mocha">
                    {new Date(chef.verifiedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() =>
                        setRevokeDialog({ open: true, chefId: chef.id, chefName: chef.chefName, reason: '' })
                      }
                      className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={revokeDialog.open}
        title="Revoke Chef"
        description={`Revoke ${revokeDialog.chefName}'s chef status. This will revert their role to customer and soft-delete their chef profile.`}
        confirmLabel="Revoke"
        onConfirm={async () => handleRevoke(revokeDialog.chefId, revokeDialog.reason)}
        onClose={() => setRevokeDialog({ open: false, chefId: '', chefName: '', reason: '' })}
        reasonRequired
        reason={revokeDialog.reason}
        onReasonChange={(value) => setRevokeDialog((d) => ({ ...d, reason: value }))}
      />
    </div>
  );
}
