import type { ReactNode } from 'react'

type AccessShellProps = {
  children: ReactNode
  topbarContent?: ReactNode
  contentClassName?: string
  cardClassName?: string
}

export function AccessShell({
  children,
  topbarContent,
  contentClassName = 'access-content',
  cardClassName = 'access-card',
}: AccessShellProps) {
  return (
    <div className="app-shell access-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Catan board preview home">
          <span className="brand-mark" aria-hidden="true">
            <span>C</span>
          </span>
          <span className="brand-copy">
            <strong>Catan</strong>
            <small>Board lab</small>
          </span>
        </a>

        {topbarContent ?? (
          <div className="topbar-status">
            <span className="status-dot" aria-hidden="true" />
            <span>Browser access</span>
          </div>
        )}
      </header>

      <main className={`page-content ${contentClassName}`}>
        <section className={`${cardClassName} panel`}>{children}</section>
      </main>
    </div>
  )
}
