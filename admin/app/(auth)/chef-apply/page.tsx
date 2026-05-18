'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import axios from 'axios';

function getBackendUrl(): string {
  const url = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!url) throw new Error('NEXT_PUBLIC_BACKEND_URL is not set.');
  return url;
}

interface FormState {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  chefName: string;
  bio: string;
  minOrderPrice: string;
}

const INITIAL: FormState = {
  fullName: '',
  phone: '',
  email: '',
  password: '',
  chefName: '',
  bio: '',
  minOrderPrice: '',
};

// Forgive common ways admins paste a phone: spaces, dashes, parens,
// leading "00" instead of "+", or a bare country-code number with no
// "+" at all. Whatever comes out must still be valid E.164.
function normalizePhone(raw: string): string {
  let s = raw.replace(/[\s\-()]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+') && /^\d+$/.test(s)) s = '+' + s;
  return s;
}

const E164 = /^\+[1-9]\d{7,14}$/;

export default function ChefApplyPage() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const update = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const minOrderPrice = Number(form.minOrderPrice);

    if (Number.isNaN(minOrderPrice) || minOrderPrice <= 0) {
      setError('Minimum order price must be a positive number.');
      setLoading(false);
      return;
    }

    const normalizedPhone = normalizePhone(form.phone);
    if (!E164.test(normalizedPhone)) {
      setError(
        'Phone must be in international format, e.g. +201012345678 (country code, no leading 0).',
      );
      setLoading(false);
      return;
    }

    try {
      // Location is intentionally NOT collected here. Verified chefs
      // set it on the mobile app's first sign-in via (chef)/set-location.
      await axios.post(`${getBackendUrl()}/api/v1/chef/web-apply`, {
        fullName: form.fullName.trim(),
        phone: normalizedPhone,
        password: form.password,
        email: form.email.trim() || undefined,
        chefName: form.chefName.trim(),
        bio: form.bio.trim(),
        minOrderPrice,
      });
      setSuccess(true);
      setForm(INITIAL);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const code = err.response?.data?.code;
        if (code === 'PHONE_IN_USE') setError('This phone number is already registered.');
        else if (code === 'EMAIL_IN_USE') setError('This email is already registered.');
        else if (err.response?.status === 400) setError('Please check the form fields and try again.');
        else setError('Submission failed. Please try again later.');
      } else {
        setError('Submission failed. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
        <div className="w-full max-w-md rounded-card bg-white p-8 text-center shadow-card">
          <h1 className="mb-3 text-2xl font-bold text-umber">Application Submitted</h1>
          <p className="mb-6 text-sm text-mocha">
            Thank you. Your application is now pending review. An administrator will verify your
            account shortly. You will be able to sign in once you are verified.
          </p>
          <Link
            href="/sign-in"
            className="inline-block rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary-hover"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-12">
      <div className="w-full max-w-2xl rounded-card bg-white p-8 shadow-card">
        <h1 className="mb-2 text-center text-2xl font-bold text-umber">Become a Nafas Chef</h1>
        <p className="mb-6 text-center text-sm text-mocha">
          Fill in your details below. An administrator will review and verify your application.
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-destructive">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-mocha">Account</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full name *" value={form.fullName} onChange={update('fullName')} required minLength={2} maxLength={80} />
              <Field label="Phone (E.164, e.g. +201234567890) *" value={form.phone} onChange={update('phone')} required inputMode="tel" autoComplete="tel" />
              <Field label="Email (optional)" type="email" value={form.email} onChange={update('email')} />
              <Field label="Password (min 8 chars) *" type="password" value={form.password} onChange={update('password')} required minLength={8} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-mocha">Kitchen</h2>
            <div className="space-y-4">
              <Field label="Chef / Kitchen name *" value={form.chefName} onChange={update('chefName')} required maxLength={80} />
              <TextArea label="Bio *" value={form.bio} onChange={update('bio')} required maxLength={1000} rows={4} />
              <Field label="Min order price (EGP) *" value={form.minOrderPrice} onChange={update('minOrderPrice')} required placeholder="50" />
              <p className="rounded-lg bg-background px-4 py-3 text-xs text-mocha">
                You&apos;ll mark your kitchen&apos;s location on the map the first time
                you sign in to the mobile app after an administrator approves
                your application.
              </p>
            </div>
          </section>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {loading ? 'Submitting...' : 'Submit Application'}
          </button>

          <p className="text-center text-sm text-mocha">
            Already have an account?{' '}
            <Link href="/sign-in" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  id,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const inputId = id ?? React.useId();
  // suppressHydrationWarning on the wrapper covers sibling nodes
  // (e.g. Keeper's <keeper-lock>) injected next to the <input> before
  // React hydrates. Attribute-only suppression on the <input> itself
  // does NOT cover injected siblings.
  return (
    <div suppressHydrationWarning>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-mocha">{label}</label>
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={onChange}
        className="w-full rounded-input border border-border bg-background px-4 py-2.5 text-sm text-umber outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
        suppressHydrationWarning
        {...rest}
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  id,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const inputId = id ?? React.useId();
  return (
    <div suppressHydrationWarning>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-mocha">{label}</label>
      <textarea
        id={inputId}
        value={value}
        onChange={onChange}
        className="w-full rounded-input border border-border bg-background px-4 py-2.5 text-sm text-umber outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
        suppressHydrationWarning
        {...rest}
      />
    </div>
  );
}
