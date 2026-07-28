import { RotoDashboard } from "./roto-dashboard";

/** Temporary: Yahoo Fantasy API access pending approval. Flip to false when restored. */
const MAINTENANCE_MODE = true;

export default function Home() {
  return (
    <div className="min-h-full w-full bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col lg:gap-8 gap-4 px-4 py-10 sm:px-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            THE FRANKINGS
          </h1>
        </header>
        {MAINTENANCE_MODE ? (
          <p className="rounded-lg border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-700">
            Down for maintenance. Check back soon.
          </p>
        ) : (
          <RotoDashboard />
        )}
      </div>
    </div>
  );
}
