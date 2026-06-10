export function MapScreen() {
  // Phase 3 builds the MapLibre map here (preplan pins, clustering, hydrant layer).
  return (
    <div className="flex h-full min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-ash-300">
        Map
      </h2>
      <p className="mt-2 max-w-sm text-ash-500">
        The district map with preplan pins and the hydrant layer lands in Phase 3.
      </p>
    </div>
  )
}
