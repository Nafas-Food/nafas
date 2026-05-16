import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (session?.role !== 'admin') {
    redirect('/sign-in');
  }

  const adminName = session.user?.name ?? 'Admin';

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar adminName={adminName} />
      <main className="flex-1 flex flex-col">
        <header className="flex items-center justify-between border-b border-border bg-white px-8 py-4">
          <h1 className="text-lg font-semibold text-umber">Dashboard</h1>
        </header>
        <div className="flex-1 p-8">{children}</div>
      </main>
    </div>
  );
}
