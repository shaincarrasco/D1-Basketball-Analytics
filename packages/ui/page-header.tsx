export default function PageHeader({ title, children, actions }: { title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 pb-1">
      <div className="max-w-2xl">
        <h1 className="font-display text-[2.75rem] font-black leading-[0.95] sm:text-[3.25rem]">{title}</h1>
        {children && <div className="mt-2 text-[15px] leading-relaxed text-mute">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
