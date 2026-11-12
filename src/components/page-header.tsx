export default function PageHeader({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
      <div className="max-w-2xl">
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.02em] sm:text-[2rem]">{title}</h1>
        {children && <div className="mt-1 text-[14px] leading-relaxed text-mute">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
