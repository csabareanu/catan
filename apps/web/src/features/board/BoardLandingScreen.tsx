import {
  AuthenticatedHeader,
  PublicHeader,
} from '../auth/AuthShell'
import type { AuthenticatedUser } from '../auth/authApi'
import landscape from '../../assets/catan-landscape.webp'

type BoardLandingScreenProps = {
  authenticatedUser?: AuthenticatedUser
  isRestoringSession: boolean
  isLoggingOut: boolean
  onLogout: () => void | Promise<void>
  sessionMessage?: string
}

export function BoardLandingScreen({
  authenticatedUser,
  isRestoringSession,
  isLoggingOut,
  onLogout,
  sessionMessage,
}: BoardLandingScreenProps) {
  const isAuthenticated = authenticatedUser !== undefined

  return (
    <div className="app-shell landing-shell">
      {authenticatedUser !== undefined ? (
        <AuthenticatedHeader
          isLoggingOut={isLoggingOut}
          onLogout={onLogout}
          user={authenticatedUser}
        />
      ) : (
        <PublicHeader isRestoringSession={isRestoringSession} />
      )}

      <main className="page-content landing-content">
        <div className="landing-layout">
          <section className="landing-copy" aria-labelledby="landing-title">
            <p className="eyebrow">Trade. Build. Settle in.</p>
            <h1 id="landing-title">
              Welcome to
              <br />
              <span>Catan.</span>
            </h1>
            <p className="landing-description">
              An island to explore, resources to trade, and a place to make
              your own. Discover the world of Catan.
            </p>
            {sessionMessage && (
              <p className="session-recovery-message" role="alert">
                {sessionMessage}
              </p>
            )}

            <div className="landing-actions">
              {isAuthenticated ? (
                <a className="access-primary-action" href="/games">
                  Open my games
                </a>
              ) : (
                <a className="access-primary-action" href="/register">
                  Create account
                </a>
              )}
              {!isAuthenticated && (
                <a className="access-secondary-action" href="/login">
                  Sign in
                </a>
              )}
            </div>

            <a className="landing-demo-link" href="/preview">
              Take a look at the board
              <span aria-hidden="true">↗</span>
            </a>

            <div className="landing-note">
              <p>
                {isAuthenticated
                  ? 'Your saved games and their history are in your library.'
                  : 'Create an account to create games and follow their history.'}
              </p>
            </div>
          </section>

          <figure className="landing-visual">
            <img
              src={landscape}
              alt="A coastal settlement, golden fields, and distant mountains in the evening sun"
              width={1536}
              height={1024}
              fetchPriority="high"
            />
          </figure>
        </div>

        <footer className="page-footer landing-footer">
          <span className="footer-brand">CATAN · BOARD LAB</span>
        </footer>
      </main>
    </div>
  )
}
