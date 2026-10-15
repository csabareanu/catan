import type { ReactNode } from 'react'

type AccessShellProps = {
  children: ReactNode
  topbarContent?: ReactNode
}

export function AccessShell({ children, topbarContent }: AccessShellProps) {
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

      <main className="page-content access-content">
        <section className="access-card panel">{children}</section>
      </main>
    </div>
  )
}
