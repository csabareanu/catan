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

type DeleteGameModalProps = {
  game: GameSummary
  isDeleting: boolean
  errorMessage: string | null
  onCancel: () => void
  onConfirm: () => void
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
  const [deleteTarget, setDeleteTarget] = useState<GameSummary | null>(null)
  const [deleteError, setDeleteError] = useState<DeleteError | null>(null)
  const [pagination, setPagination] = useState<GameListPagination | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [pagesNeedRefresh, setPagesNeedRefresh] = useState(false)
  const moreRequest = useRef<AbortController | null>(null)
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null)
  const newGameActionRef = useRef<HTMLAnchorElement | null>(null)
  const libraryCollectionRef = useRef<HTMLElement>(null)
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

  useEffect(() => {
    const closeMenusOutside = (event: PointerEvent) => {
      const collection = libraryCollectionRef.current

      if (collection === null) {
        return
      }

      const target = event.target

      collection.querySelectorAll<HTMLDetailsElement>('.library-game-menu[open]').forEach((menu) => {
        if (target instanceof Node && menu.contains(target)) {
          return
        }

        menu.open = false
      })
    }

    const closeMenusOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      const collection = libraryCollectionRef.current

      if (collection === null) {
        return
      }

      collection.querySelectorAll<HTMLDetailsElement>('.library-game-menu[open]').forEach((menu) => {
        menu.open = false
        menu.querySelector<HTMLElement>('.library-more-trigger')?.focus()
      })
    }

    document.addEventListener('pointerdown', closeMenusOutside)
    document.addEventListener('keydown', closeMenusOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeMenusOutside)
      document.removeEventListener('keydown', closeMenusOnEscape)
    }
  }, [])

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

  const restoreDeleteFocus = useCallback(() => {
    const trigger = deleteTriggerRef.current

    if (trigger?.isConnected) {
      trigger.closest('details')?.setAttribute('open', '')
    }

    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) {
        trigger.focus()
      } else {
        newGameActionRef.current?.focus()
      }

      if (deleteTriggerRef.current === trigger) {
        deleteTriggerRef.current = null
      }
    })
  }, [])

  const closeDeleteConfirmation = useCallback(() => {
    setDeleteTarget(null)
    setDeleteError(null)
    restoreDeleteFocus()
  }, [restoreDeleteFocus])

  const openDeleteConfirmation = (game: GameSummary, trigger: HTMLButtonElement) => {
    if (deletingGameId !== null || moreRequest.current !== null || isLoggingOut) {
      return
    }

    deleteTriggerRef.current = trigger
    trigger.closest('details')?.removeAttribute('open')
    setDeleteError(null)
    setDeleteTarget(game)
  }

  const handleDelete = async () => {
    const game = deleteTarget

    if (game === null || deletingGameId !== null || moreRequest.current !== null || isLoggingOut) {
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
      setDeleteTarget(null)
      restoreDeleteFocus()
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
        <a
          ref={newGameActionRef}
          className="access-primary-action library-new-game-action"
          href="/games/new"
        >
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
        <section
          ref={libraryCollectionRef}
          className="library-collection"
          aria-labelledby="saved-games-title"
        >
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
                      {game.lifecycle_status === 'created' && (
                        <a
                          className="access-secondary-action library-row-action"
                          href={`/games/${game.id}/setup`}
                        >
                          Open setup
                          <svg className="library-icon" aria-hidden="true" viewBox="0 0 24 24">
                            <path d="M5 12h14m-6-6 6 6-6 6" />
                          </svg>
                        </a>
                      )}
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
                          className="menu-item menu-item-danger"
                          disabled={deletingGameId !== null || isLoadingMore}
                          type="button"
                          onClick={(event) => openDeleteConfirmation(game, event.currentTarget)}
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

      {deleteTarget && (
        <DeleteGameModal
          errorMessage={deleteError?.gameId === deleteTarget.id ? deleteError.message : null}
          game={deleteTarget}
          isDeleting={deletingGameId === deleteTarget.id}
          onCancel={closeDeleteConfirmation}
          onConfirm={() => void handleDelete()}
        />
      )}

    </AccessShell>
  )
}

function DeleteGameModal({
  game,
  isDeleting,
  errorMessage,
  onCancel,
  onConfirm,
}: DeleteGameModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const hasFocusedInitialControl = useRef(false)

  useEffect(() => {
    if (!hasFocusedInitialControl.current) {
      cancelButtonRef.current?.focus()
      hasFocusedInitialControl.current = true
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()

        if (!isDeleting) {
          onCancel()
        }

        return
      }

      if (event.key !== 'Tab' || dialogRef.current === null) {
        return
      }

      const focusableElements = getModalFocusableElements(dialogRef.current)

      if (focusableElements.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }

      const firstFocusableElement = focusableElements[0]
      const lastFocusableElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (!dialogRef.current.contains(activeElement)) {
        event.preventDefault()
        firstFocusableElement.focus()
      } else if (event.shiftKey && activeElement === firstFocusableElement) {
        event.preventDefault()
        lastFocusableElement.focus()
      } else if (!event.shiftKey && activeElement === lastFocusableElement) {
        event.preventDefault()
        firstFocusableElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDeleting, onCancel])

  useEffect(() => {
    if (isDeleting) {
      dialogRef.current?.focus()
    }
  }, [isDeleting])

  useEffect(() => {
    if (errorMessage) {
      errorRef.current?.focus()
    }
  }, [errorMessage])

  return (
    <div
      className="delete-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isDeleting) {
          onCancel()
        }
      }}
    >
      <div
        ref={dialogRef}
        aria-busy={isDeleting}
        aria-describedby="delete-game-description"
        aria-labelledby="delete-game-title"
        aria-modal="true"
        className="delete-modal"
        role="dialog"
        tabIndex={-1}
      >
        <div className="delete-modal-heading">
          <span className="delete-modal-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 6h16m-13 0 1 15h8l1-15M9 6V3h6v3m-5 4v7m4-7v7" />
            </svg>
          </span>
          <div>
            <p className="delete-modal-eyebrow">Permanent action</p>
            <h2 id="delete-game-title">Delete Game {game.id}?</h2>
          </div>
        </div>
        <p id="delete-game-description" className="delete-modal-description">
          This will permanently delete the saved game and its history. You cannot undo this action.
        </p>
        {errorMessage && (
          <p
            ref={errorRef}
            className="delete-modal-error"
            role="alert"
            tabIndex={-1}
          >
            {errorMessage}
          </p>
        )}
        <div className="delete-modal-actions">
          <button
            ref={cancelButtonRef}
            className="access-secondary-action"
            disabled={isDeleting}
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="delete-modal-confirm"
            disabled={isDeleting}
            type="button"
            onClick={onConfirm}
          >
            {isDeleting ? 'Deleting game' : 'Delete game'}
          </button>
        </div>
      </div>
    </div>
  )
}

function getModalFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => {
    const styles = window.getComputedStyle(element)

    return (
      styles.display !== 'none' &&
      styles.visibility !== 'hidden' &&
      element.getClientRects().length > 0
    )
  })
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
