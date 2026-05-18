// Next.js renders this immediately while the next dashboard route's
// server component + initial client fetch are in flight. Without it,
// clicking a sidebar link leaves the previous page on screen until the
// new one is ready — feels laggy even when the request is fast.
export default function DashboardLoading() {
  return (
    <div className="flex h-full items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}
