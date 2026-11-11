export default function PageHeader({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <h1 className="font-display text-[2.6rem] font-black leading-[0.95] tracking-tight sm:text-6xl">{title}</h1>
        {children && <div className="mt-3 text-[15px] leading-relaxed text-mute">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
