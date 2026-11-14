// Loading, empty and error states. Errors say what failed and offer a retry.
export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-16 text-mute" aria-live="polite">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line2 border-t-off" />
      {label}…
    </div>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div role="alert" className="deck flex flex-col items-start gap-3 p-6">
      <p className="font-semibold">Couldn&apos;t load this data</p>
      <p className="text-sm text-mute">{message}</p>
      {retry && <button className="btn" onClick={retry}>Try again</button>}
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="deck p-6">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-mute">{children}</div>}
    </div>
  );
}
