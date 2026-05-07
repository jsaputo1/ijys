import { RotoDashboard } from "./roto-dashboard";

export default function Home() {
  return (
    <div className="min-h-full w-full bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col lg:gap-8 gap-4 px-4 py-10 sm:px-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            THE FRANKINGS
          </h1>
        </header>
        <RotoDashboard />
      </div>
    </div>
  );
}
