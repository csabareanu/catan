import { useEffect, useRef, type ReactNode } from 'react'
import {
  isBoardPreviewPath,
  isPrivatePath,
  useBrowserPathname,
} from '../../lib/navigation'
import type { AuthenticatedUser } from './authApi'

type AccessShellProps = {
  children: ReactNode
  shellClassName?: string
  topbarContent?: ReactNode
  contentClassName?: string
  cardClassName?: string
  authenticatedUser?: AuthenticatedUser
  isLoggingOut?: boolean
  onLogout?: () => void | Promise<void>
}

export function AccessShell({
  children,
  shellClassName,
  topbarContent,
  contentClassName = 'access-content',
  cardClassName = 'access-card',
  authenticatedUser,
  isLoggingOut = false,
  onLogout,
}: AccessShellProps) {
  const shellClasses = ['app-shell', 'access-shell', shellClassName]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={shellClasses}>
      {authenticatedUser && onLogout ? (
        <AuthenticatedHeader
          isLoggingOut={isLoggingOut}
          onLogout={onLogout}
          user={authenticatedUser}
        />
      ) : (
        <PublicHeader topbarContent={topbarContent} />
      )}

      <main className={`page-content ${contentClassName}`}>
        <section className={`${cardClassName} panel`}>{children}</section>
      </main>
    </div>
  )
}

export function AuthenticatedHeader({
  isLoggingOut,
  onLogout,
  user,
}: {
  isLoggingOut: boolean
  onLogout: () => void | Promise<void>
  user: AuthenticatedUser
}) {
  const accountMenuRef = useRef<HTMLDetailsElement>(null)
  const pathname = useBrowserPathname()

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const accountMenu = accountMenuRef.current

      if (accountMenu === null || !accountMenu.open) {
        return
      }

      const target = event.target

      if (target instanceof Node && accountMenu.contains(target)) {
        return
      }

      accountMenu.open = false
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const accountMenu = accountMenuRef.current

      if (event.key === 'Escape' && accountMenu?.open) {
        accountMenu.open = false
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <header className="topbar authenticated-topbar">
      <a className="brand" href="/games" aria-label="Catan, your games">
        <span className="brand-mark" aria-hidden="true">
          <span>C</span>
        </span>
        <span className="brand-copy">
          <strong>Catan</strong>
          <small>Board lab</small>
        </span>
      </a>

      <nav className="primary-nav" aria-label="Main navigation">
        <a
          className="nav-link"
          href="/games"
          aria-current={isPrivatePath(pathname) ? 'page' : undefined}
        >
          My games
        </a>
        <a
          className="nav-link"
          href="/preview"
          aria-current={isBoardPreviewPath(pathname) ? 'page' : undefined}
        >
          Board demo
        </a>
      </nav>

      <details ref={accountMenuRef} className="account-menu">
        <summary className="account-trigger" aria-label={`Account menu for ${user.name}`}>
          <span className="avatar" aria-hidden="true">
            {getUserInitials(user.name)}
          </span>
          <span className="account-name">{user.name}</span>
          <svg className="account-chevron" aria-hidden="true" viewBox="0 0 24 24">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="menu-panel">
          <div className="menu-account">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <button
            className="menu-item"
            type="button"
            disabled={isLoggingOut}
            onClick={() => void onLogout()}
          >
            <svg className="menu-item-icon" aria-hidden="true" viewBox="0 0 24 24">
              <path d="M9 4H5v16h4m5-12 4 4-4 4m-5-4h13" />
            </svg>
            {isLoggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </details>
    </header>
  )
}

export function PublicHeader({ topbarContent }: { topbarContent?: ReactNode }) {
  return (
    <header className="topbar">
      <a className="brand" href="/preview" aria-label="Catan board preview home">
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
  )
}

function getUserInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return initials || '?'
}
