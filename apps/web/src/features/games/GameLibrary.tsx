import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../lib/apiClient'
import { AccessShell } from '../auth/AuthShell'
import type { AuthenticatedUser } from '../auth/authApi'
import { GameRunControls } from './GameRunControls'
import {
  deleteGame,
  listGames,
  type GameLifecycleStatus,
  type GameSummary,
} from './gameApi'

type GameLibraryProps = {
  user: AuthenticatedUser
  token: string
  isLoggingOut: boolean
  onLogout: () => void | Promise<void>
  onUnauthorized: () => void
}

type LibraryLoadState = 'loading' | 'success' | 'error'

type DeleteError = {
  gameId: number
  message: string
}

export function GameLibrary({
  user,
  token,
  isLoggingOut,
  onLogout,
  onUnauthorized,
}: GameLibraryProps) {
  const [games, setGames] = useState<GameSummary[]>([])
  const [loadState, setLoadState] = useState<LibraryLoadState>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [deletingGameId, setDeletingGameId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<DeleteError | null>(null)

  useEffect(() => {
    let isActive = true

    listGames(token, onUnauthorized)
      .then((response) => {
        if (!isActive) {
          return
        }

        setGames(response.data)
        setLoadState('success')
        setErrorMessage(null)
      })
      .catch((caught: unknown) => {
        if (!isActive) {
          return
        }

        setLoadState('error')
        setErrorMessage(toLibraryErrorMessage(caught))
      })

    return () => {
      isActive = false
    }
  }, [onUnauthorized, reloadKey, token])

  const retry = () => {
    setErrorMessage(null)
    setLoadState('loading')
    setReloadKey((currentKey) => currentKey + 1)
  }

  const updateLifecycleStatus = useCallback((gameId: number, status: GameLifecycleStatus) => {
    setGames((currentGames) => currentGames.map((game) =>
      game.id === gameId ? { ...game, lifecycle_status: status } : game,
    ))
  }, [])

  const handleDelete = async (game: GameSummary) => {
    if (deletingGameId !== null || !window.confirm(`Delete game ${game.id}?`)) {
      return
    }

    setDeletingGameId(game.id)
    setDeleteError(null)

    try {
      await deleteGame(token, game.id, onUnauthorized)
      setGames((currentGames) => currentGames.filter(({ id }) => id !== game.id))
    } catch (caught: unknown) {
      setDeleteError({
        gameId: game.id,
        message: toDeleteErrorMessage(caught),
      })
    } finally {
      setDeletingGameId(null)
    }
  }

  return (
    <AccessShell
      cardClassName="access-card library-card"
      contentClassName="library-content"
      topbarContent={
        <a className="topbar-status topbar-account-link" href="/games">
          <span className="status-dot" aria-hidden="true" />
          <span>
            Signed in as <strong>{user.name}</strong>
          </span>
        </a>
      }
    >
      <div className="library-header">
        <div>
          <p className="eyebrow">Private game library</p>
          <h1>Your games.</h1>
          <p className="access-description">
            Games owned by <strong>{user.name}</strong> appear here with their
            current lifecycle status.
          </p>
        </div>
        <div className="library-header-actions">
          <a className="access-primary-action" href="/games/new">
            New game
          </a>
          <div className="access-status" role="status">
            <span className="status-dot" aria-hidden="true" />
            Session restored
          </div>
        </div>
      </div>

      {loadState === 'loading' && (
        <div className="library-state" role="status" aria-live="polite">
          <span className="status-dot" aria-hidden="true" />
          Loading your games
        </div>
      )}

      {loadState === 'error' && errorMessage && (
        <div className="library-state library-state-error" role="alert">
          <p>{errorMessage}</p>
          <button className="access-secondary-action" type="button" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {loadState === 'success' && games.length === 0 && (
        <div className="library-empty" role="status">
          <span className="library-empty-mark" aria-hidden="true">
            +
          </span>
          <h2>No games yet.</h2>
          <p>Your created games will appear here.</p>
        </div>
      )}

      {loadState === 'success' && games.length > 0 && (
        <ul className="library-list" aria-label="Your games">
          {games.map((game) => (
            <li className="library-item" key={game.id}>
              <div className="library-item-header">
                <div>
                  <p className="library-item-kicker">Game {game.id}</p>
                  <h2>{gameModeLabel(game.mode)}</h2>
                </div>
                <span className={`library-status library-status-${game.lifecycle_status}`}>
                  {lifecycleStatusLabel(game.lifecycle_status)}
                </span>
              </div>

              <dl className="library-metadata">
                <div>
                  <dt>Seed</dt>
                  <dd><code>{game.seed}</code></dd>
                </div>
                <div>
                  <dt>Seats</dt>
                  <dd>{game.seat_count}</dd>
                </div>
                <div>
                  <dt>Ruleset</dt>
                  <dd>{game.ruleset.key}@{game.ruleset.version}</dd>
                </div>
                <div>
                  <dt>Map</dt>
                  <dd>{game.map.key}@{game.map.version}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatGameDate(game.created_at)}</dd>
                </div>
              </dl>

              <div className="library-item-actions">
                <div className="library-item-run">
                  <GameRunControls
                    gameId={game.id}
                    lifecycleStatus={game.lifecycle_status}
                    token={token}
                    disabled={isLoggingOut || deletingGameId === game.id}
                    onStatusChange={updateLifecycleStatus}
                    onUnauthorized={onUnauthorized}
                  />
                  {deleteError?.gameId === game.id && (
                    <p
                      className="library-delete-error"
                      id={`delete-error-${game.id}`}
                      role="alert"
                    >
                      {deleteError.message}
                    </p>
                  )}
                </div>
                <a
                  className="access-secondary-action library-observe-action"
                  href={`/games/${game.id}/observe`}
                >
                  Observe game {game.id}
                </a>
                <button
                  aria-describedby={
                    deleteError?.gameId === game.id
                      ? `delete-error-${game.id}`
                      : undefined
                  }
                  className="access-secondary-action library-delete-action"
                  disabled={deletingGameId !== null}
                  type="button"
                  onClick={() => void handleDelete(game)}
                >
                  {deletingGameId === game.id
                    ? 'Deleting game'
                    : `Delete game ${game.id}`}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="access-actions library-actions">
        <button
          className="access-secondary-action"
          type="button"
          onClick={() => void onLogout()}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? 'Signing out…' : 'Sign out'}
        </button>
        <a className="access-secondary-action" href="/">
          Return to board preview
        </a>
      </div>
    </AccessShell>
  )
}

function toLibraryErrorMessage(caught: unknown): string {
  if (!(caught instanceof ApiError)) {
    return 'The game library could not be loaded. Please try again.'
  }

  if (caught.status === 404) {
    return 'The game library could not be found. Please try again.'
  }

  if (caught.status === 422) {
    return caught.message
  }

  if (caught.status === 503) {
    return 'The game service is unavailable right now. Please try again.'
  }

  if (caught.status === 0) {
    return 'The game library could not be reached. Check the connection and try again.'
  }

  return caught.message
}

function toDeleteErrorMessage(caught: unknown): string {
  if (!(caught instanceof ApiError)) {
    return 'The game could not be deleted. Please try again.'
  }

  if (caught.status === 404) {
    return 'This game could not be found. Refresh the library and try again.'
  }

  if (caught.status === 422) {
    return caught.message
  }

  if (caught.status === 503) {
    return 'The game service is unavailable right now. Please try again.'
  }

  if (caught.status === 0) {
    return 'The game could not be deleted. Check the connection and try again.'
  }

  return caught.message
}

function gameModeLabel(mode: string): string {
  if (mode === 'human_vs_ai') {
    return 'Human vs AI'
  }

  if (mode === 'ai_only') {
    return 'AI simulation'
  }

  return mode
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function lifecycleStatusLabel(status: GameLifecycleStatus): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatGameDate(value: string | null): string {
  if (value === null) {
    return 'Date unavailable'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable'
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
  }).format(date)
}
