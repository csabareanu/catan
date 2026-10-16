import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../lib/apiClient'
import { AccessShell } from '../auth/AuthShell'
import type { AuthenticatedUser } from '../auth/authApi'
import { GameRunControls } from './GameRunControls'
import {
  deleteGame,
  listGames,
  type GameLifecycleStatus,
  type GameListPagination,
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
  const [pagination, setPagination] = useState<GameListPagination | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [pagesNeedRefresh, setPagesNeedRefresh] = useState(false)
  const moreRequest = useRef<AbortController | null>(null)
  const totalGames = pagination?.total ?? 0
  const hasMore = pagination !== null && games.length < totalGames && (
    pagination.current_page < pagination.last_page || pagesNeedRefresh
  )

  useEffect(() => {
    let isActive = true
    const controller = new AbortController()

    listGames(token, onUnauthorized, 1, controller.signal)
      .then((response) => {
        if (!isActive) {
          return
        }

        setGames(response.data)
        setPagination(response.meta)
        setPagesNeedRefresh(false)
        setLoadState('success')
        setErrorMessage(null)
      })
      .catch((caught: unknown) => {
        if (!isActive || controller.signal.aborted) {
          return
        }

        setLoadState('error')
        setErrorMessage(toLibraryErrorMessage(caught))
      })

    return () => {
      isActive = false
      controller.abort()
      moreRequest.current?.abort()
    }
  }, [onUnauthorized, reloadKey, token])

  const retry = () => {
    setErrorMessage(null)
    setLoadState('loading')
    setReloadKey((currentKey) => currentKey + 1)
  }

  const loadMore = async () => {
    if (
      !hasMore || pagination === null || moreRequest.current !== null ||
      deletingGameId !== null || isLoggingOut
    ) {
      return
    }

    const controller = new AbortController()
    moreRequest.current = controller
    setIsLoadingMore(true)
    setLoadMoreError(null)

    try {
      const targetPage = pagination.current_page + 1
      const refreshPages = pagesNeedRefresh
      let response = await listGames(
        token, onUnauthorized, refreshPages ? 1 : targetPage, controller.signal,
      )
      const incomingGames = [...response.data]

      // Deletion shifts offset pages, so rebuild the loaded range before extending it.
      while (refreshPages && response.meta.current_page < Math.min(targetPage, response.meta.last_page)) {
        response = await listGames(token, onUnauthorized, response.meta.current_page + 1, controller.signal)
        incomingGames.push(...response.data)
      }

      if (controller.signal.aborted) {
        return
      }

      setGames((currentGames) => {
        const gamesById = new Map((refreshPages ? [] : currentGames).map((game) => [game.id, game]))
        for (const game of incomingGames) {
          if (!gamesById.has(game.id)) {
            gamesById.set(game.id, game)
          }
        }
        return [...gamesById.values()]
      })
      setPagination(response.meta)
      setPagesNeedRefresh(false)
    } catch (caught: unknown) {
      if (!controller.signal.aborted) {
        setLoadMoreError(toLibraryErrorMessage(caught))
      }
    } finally {
      if (moreRequest.current === controller) {
        moreRequest.current = null
      }
      if (!controller.signal.aborted) {
        setIsLoadingMore(false)
      }
    }
  }

  const updateLifecycleStatus = useCallback((gameId: number, status: GameLifecycleStatus) => {
    setGames((currentGames) => currentGames.map((game) =>
      game.id === gameId ? { ...game, lifecycle_status: status } : game,
    ))
  }, [])

  const handleDelete = async (game: GameSummary) => {
    if (deletingGameId !== null || moreRequest.current !== null || !window.confirm(`Delete game ${game.id}?`)) {
      return
    }

    setDeletingGameId(game.id)
    setDeleteError(null)

    try {
      await deleteGame(token, game.id, onUnauthorized)
      setPagesNeedRefresh(true)
      setGames((currentGames) => currentGames.filter(({ id }) => id !== game.id))
      setPagination((current) => current === null
        ? null
        : { ...current, total: Math.max(0, current.total - 1) },
      )
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
      authenticatedUser={user}
      cardClassName="access-card library-card"
      contentClassName="library-content"
      isLoggingOut={isLoggingOut}
      onLogout={onLogout}
    >
      <header className="library-header">
        <div className="library-heading">
          <h1>Your games</h1>
          <p className="access-description">
            Create a game or revisit a saved run.
          </p>
        </div>
        <a className="access-primary-action library-new-game-action" href="/games/new">
          <svg className="library-icon" aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New game
        </a>
      </header>

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

      {loadState === 'success' && (
        <section className="library-collection" aria-labelledby="saved-games-title">
          <div className="library-section-heading">
            <h2 id="saved-games-title">
              {totalGames === 0
                ? 'No saved games'
                : `${totalGames} saved game${totalGames === 1 ? '' : 's'}`}
            </h2>
            <span className="library-private-label">
              <svg className="library-icon" aria-hidden="true" viewBox="0 0 24 24">
                <rect x="5" y="10" width="14" height="11" rx="2" />
                <path d="M8 10V6a4 4 0 0 1 8 0v4" />
              </svg>
              Only you
            </span>
          </div>

          {games.length === 0 ? (
            <div className="library-empty" role="status">
              <LibraryBoardEmblem />
              <h3>Your first game awaits</h3>
              <p>Choose a seed and two or three AI opponents to create your first game.</p>
              <a className="access-primary-action" href="/games/new">
                <svg className="library-icon" aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Create a game
              </a>
            </div>
          ) : (
            <ul className="library-list" aria-label="Your games">
              {games.map((game) => (
                <li className="library-item" key={game.id}>
                  <LibraryBoardEmblem />

                  <div className="library-item-body">
                    <div className="library-item-heading">
                      <h3>Game {game.id}</h3>
                      <span className={`library-status library-status-${game.lifecycle_status}`}>
                        {lifecycleStatusLabel(game.lifecycle_status)}
                      </span>
                    </div>

                    <p className="library-item-description">
                      {gameSummaryDescription(game)}
                    </p>
                    <div className="library-item-meta">
                      <span>{mapLabel(game.map.key)}</span>
                      <span>
                        Created{' '}
                        <time dateTime={game.created_at ?? undefined}>
                          {formatGameDate(game.created_at)}
                        </time>
                      </span>
                    </div>
                    <p className="library-item-seed">
                      <span>Seed</span>
                      <code>{game.seed}</code>
                    </p>
                  </div>

                  <div className="library-item-actions">
                    <div className="library-item-run">
                      <GameRunControls
                        compact
                        gameId={game.id}
                        lifecycleStatus={game.lifecycle_status}
                        token={token}
                        disabled={isLoggingOut || deletingGameId === game.id}
                        onStatusChange={updateLifecycleStatus}
                        onUnauthorized={onUnauthorized}
                      />
                      {!canStartRun(game.lifecycle_status) && (
                        <a
                          className="access-secondary-action library-row-action"
                          href={`/games/${game.id}/observe`}
                        >
                          {runActionLabel(game.lifecycle_status)}
                          <svg className="library-icon" aria-hidden="true" viewBox="0 0 24 24">
                            <path d="M5 12h14m-6-6 6 6-6 6" />
                          </svg>
                        </a>
                      )}
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

                    <details className="library-game-menu">
                      <summary
                        className="library-more-trigger"
                        aria-label={`More actions for Game ${game.id}`}
                      >
                        <svg className="library-icon" aria-hidden="true" viewBox="0 0 24 24">
                          <circle cx="12" cy="5" r="1" />
                          <circle cx="12" cy="12" r="1" />
                          <circle cx="12" cy="19" r="1" />
                        </svg>
                      </summary>
                      <div className="menu-panel library-game-menu-panel">
                        <button
                          aria-describedby={
                            deleteError?.gameId === game.id
                              ? `delete-error-${game.id}`
                              : undefined
                          }
                          className="menu-item menu-item-danger"
                          disabled={deletingGameId !== null || isLoadingMore}
                          type="button"
                          onClick={() => void handleDelete(game)}
                        >
                          <svg className="menu-item-icon" aria-hidden="true" viewBox="0 0 24 24">
                            <path d="M4 6h16m-13 0 1 15h8l1-15M9 6V3h6v3m-5 4v7m4-7v7" />
                          </svg>
                          {deletingGameId === game.id
                            ? 'Deleting game'
                            : `Delete game ${game.id}`}
                        </button>
                      </div>
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {hasMore && (
            <div className="library-pagination">
              <p className="library-pagination-summary" role="status" aria-live="polite">
                Showing {games.length} of {totalGames} games
              </p>
              {loadMoreError && <p className="library-pagination-error" role="alert">{loadMoreError}</p>}
              <button
                className="access-secondary-action"
                type="button"
                onClick={() => void loadMore()}
                disabled={isLoadingMore || deletingGameId !== null || isLoggingOut}
                aria-busy={isLoadingMore}
              >
                {isLoadingMore ? 'Loading more games...' : loadMoreError ? 'Try again' : 'Load more'}
              </button>
            </div>
          )}
        </section>
      )}

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

function LibraryBoardEmblem() {
  return (
    <span className="library-emblem" aria-hidden="true">
      <svg className="library-emblem-svg" viewBox="0 0 80 80">
        <polygon className="library-tile library-tile-pasture" points="0,-8 7,-4 7,4 0,8 -7,4 -7,-4" transform="translate(33 28)" />
        <polygon className="library-tile library-tile-fields" points="0,-8 7,-4 7,4 0,8 -7,4 -7,-4" transform="translate(47 28)" />
        <polygon className="library-tile library-tile-forest" points="0,-8 7,-4 7,4 0,8 -7,4 -7,-4" transform="translate(26 40)" />
        <polygon className="library-tile library-tile-fields" points="0,-8 7,-4 7,4 0,8 -7,4 -7,-4" transform="translate(40 40)" />
        <polygon className="library-tile library-tile-hills" points="0,-8 7,-4 7,4 0,8 -7,4 -7,-4" transform="translate(54 40)" />
        <polygon className="library-tile library-tile-mountains" points="0,-8 7,-4 7,4 0,8 -7,4 -7,-4" transform="translate(33 52)" />
        <polygon className="library-tile library-tile-forest" points="0,-8 7,-4 7,4 0,8 -7,4 -7,-4" transform="translate(47 52)" />
      </svg>
    </span>
  )
}

function gameSummaryDescription(game: GameSummary): string {
  const participants = game.mode === 'human_vs_ai'
    ? `You + ${aiOpponentCount(game)} AI opponents`
    : gameModeLabel(game.mode)

  return `${participants} · ${rulesetLabel(game.ruleset.key)}`
}

function aiOpponentCount(game: GameSummary): number {
  const configuredCount = game.configuration.ai_count

  if (typeof configuredCount === 'number' && Number.isInteger(configuredCount)) {
    return configuredCount
  }

  return Math.max(game.seat_count - (game.human_seat_number === null ? 0 : 1), 0)
}

function rulesetLabel(key: string): string {
  return key === 'base' ? 'Base game' : readableLabel(key)
}

function mapLabel(key: string): string {
  const label = readableLabel(key)

  return label.toLowerCase().endsWith('map') ? label : `${label} map`
}

function readableLabel(value: string): string {
  return value
    .split(/[_-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function canStartRun(status: GameLifecycleStatus): boolean {
  return status === 'created' || status === 'failed'
}

function runActionLabel(status: GameLifecycleStatus): string {
  return status === 'completed' ? 'View run' : 'Observe'
}

function gameModeLabel(mode: string): string {
  if (mode === 'human_vs_ai') {
    return 'Human vs AI'
  }

  if (mode === 'ai_only') {
    return 'AI simulation'
  }

  return readableLabel(mode)
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
