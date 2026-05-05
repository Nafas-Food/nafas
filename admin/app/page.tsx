export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <main className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-h1 font-bold text-foreground">Nafas Admin</h1>
        <p className="text-body text-muted-foreground">
          Admin panel for the Nafas Egyptian home-cooked food marketplace.
        </p>
      </main>
    </div>
  );
}
