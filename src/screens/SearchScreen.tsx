export function SearchScreen() {
  // Phase 2 builds type-ahead search over address + building name, plus recents.
  return (
    <div className="flex h-full min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-ash-300">
        Search
      </h2>
      <p className="mt-2 max-w-sm text-ash-500">
        Address and building-name search lands in Phase 2.
      </p>
    </div>
  )
}
