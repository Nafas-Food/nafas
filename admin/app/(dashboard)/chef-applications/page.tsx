'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import { adminApi, setAuthToken } from '@/lib/adminApi';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface PendingApplication {
  id: string;
  chefName: string;
  bio: string;
  minOrderPrice: string;
  createdAt: string;
  user: {
    fullName: string;
    phone: string;
  };
}

export default function ChefApplicationsPage() {
  const { data: session, status } = useSession();
  const [applications, setApplications] = useState<PendingApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [verifyDialog, setVerifyDialog] = useState<{ open: boolean; chefId: string; chefName: string }>({
    open: false,
    chefId: '',
    chefName: '',
  });
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; chefId: string; chefName: string; reason: string }>({
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

  const fetchApplications = async () => {
    setRefreshing(true);
    try {
      const { data } = await adminApi.get('/admin/chefs/pending');
      setApplications(data);
      setError('');
    } catch {
      setError('Failed to load applications.');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated') {
      fetchApplications();
    }
  }, [status]);

  const handleVerify = async (chefId: string) => {
    try {
      await adminApi.patch(`/admin/chefs/${chefId}/verify`);
      setToast('Application verified successfully.');
      fetchApplications();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setToast('This application was already acted on by another admin.');
        fetchApplications();
      } else {
        setToast('Failed to verify application.');
      }
    } finally {
      setVerifyDialog({ open: false, chefId: '', chefName: '' });
    }
  };

  const handleReject = async (chefId: string, reason: string) => {
    try {
      await adminApi.patch(`/admin/chefs/${chefId}/reject`, { reason });
      setToast('Application rejected.');
      fetchApplications();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setToast('This application was already acted on by another admin.');
        fetchApplications();
      } else {
        setToast('Failed to reject application.');
      }
    } finally {
      setRejectDialog({ open: false, chefId: '', chefName: '', reason: '' });
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
        <p className="text-mocha">Loading applications...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-umber">Chef Applications</h2>
        <button
          onClick={fetchApplications}
          disabled={refreshing}
          className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-mocha transition hover:bg-muted disabled:opacity-50"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
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

      {applications.length === 0 ? (
        <div className="rounded-card bg-white p-12 text-center shadow-card">
          <p className="text-mocha">No pending applications.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-3 font-semibold text-umber">Applicant</th>
                <th className="px-6 py-3 font-semibold text-umber">Phone</th>
                <th className="px-6 py-3 font-semibold text-umber">Chef Name</th>
                <th className="px-6 py-3 font-semibold text-umber">Bio</th>
                <th className="px-6 py-3 font-semibold text-umber">Min Order</th>
                <th className="px-6 py-3 font-semibold text-umber">Submitted</th>
                <th className="px-6 py-3 font-semibold text-umber">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {applications.map((app) => (
                <tr key={app.id} className="hover:bg-background">
                  <td className="px-6 py-4 text-umber">{app.user.fullName}</td>
                  <td className="px-6 py-4 text-mocha">{app.user.phone}</td>
                  <td className="px-6 py-4 font-medium text-umber">{app.chefName}</td>
                  <td className="max-w-xs px-6 py-4 text-mocha">
                    <span className="line-clamp-2">{app.bio}</span>
                  </td>
                  <td className="px-6 py-4 text-mocha">{app.minOrderPrice} EGP</td>
                  <td className="px-6 py-4 text-mocha">
                    {new Date(app.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setVerifyDialog({ open: true, chefId: app.id, chefName: app.chefName })
                        }
                        className="rounded-md bg-success px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                      >
                        Verify
                      </button>
                      <button
                        onClick={() =>
                          setRejectDialog({ open: true, chefId: app.id, chefName: app.chefName, reason: '' })
                        }
                        className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={verifyDialog.open}
        title="Verify Application"
        description={`Are you sure you want to verify ${verifyDialog.chefName}? This will make them a chef on the platform.`}
        confirmLabel="Verify"
        onConfirm={async () => handleVerify(verifyDialog.chefId)}
        onClose={() => setVerifyDialog({ open: false, chefId: '', chefName: '' })}
      />

      <ConfirmDialog
        open={rejectDialog.open}
        title="Reject Application"
        description={`Reject ${rejectDialog.chefName}'s application. The applicant will be notified.`}
        confirmLabel="Reject"
        onConfirm={async () => handleReject(rejectDialog.chefId, rejectDialog.reason)}
        onClose={() => setRejectDialog({ open: false, chefId: '', chefName: '', reason: '' })}
        reasonRequired
        reason={rejectDialog.reason}
        onReasonChange={(value) => setRejectDialog((d) => ({ ...d, reason: value }))}
      />
    </div>
  );
}
