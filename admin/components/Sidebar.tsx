'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

interface SidebarProps {
  adminName: string;
}

const NAV = [
  { label: 'Chef Applications', href: '/chef-applications' },
  { label: 'Categories', href: '/categories' },
  { label: 'Chefs', href: '/chefs' },
];

export function Sidebar({ adminName }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-white">
      <div className="px-6 py-8">
        <h2 className="text-xl font-bold text-primary">Nafas</h2>
        <p className="mt-1 text-sm text-mocha">Admin Dashboard</p>
      </div>

      <nav className="flex-1 px-4">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block rounded-lg px-4 py-3 text-sm font-medium transition ${
                    active
                      ? 'bg-primary-light text-primary'
                      : 'text-mocha hover:bg-muted hover:text-umber'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border px-6 py-4">
        <p className="text-sm font-medium text-umber">{adminName}</p>
        <p className="text-xs text-sand">Admin</p>
        <button
          onClick={() => signOut({ callbackUrl: '/sign-in' })}
          className="mt-3 w-full rounded-md border border-border px-3 py-2 text-xs font-medium text-mocha transition hover:bg-muted hover:text-destructive"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
