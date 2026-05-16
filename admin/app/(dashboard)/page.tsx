import { getServerSession } from 'next-auth/next';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';

export default async function DashboardLandingPage() {
  const session = await getServerSession(authOptions);

  if (session?.role !== 'admin') {
    redirect('/sign-in');
  }

  return (
    <div className="rounded-card bg-white p-8 shadow-card">
      <h2 className="text-lg font-semibold text-umber">Welcome to Nafas Admin</h2>
      <p className="mt-2 text-sm text-mocha">
        Use the sidebar to manage chef applications, categories, and verified chefs.
      </p>
    </div>
  );
}
