import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ApiError } from '../../lib/apiClient'
import { AccessShell } from '../auth/AuthShell'
import type { AuthenticatedUser } from '../auth/authApi'
import { DeleteGameModal } from './DeleteGameModal'
import { GameLibraryCard } from './GameLibraryCard'
import { deleteGame, type GameLibraryView, type GameSummary } from './gameApi'
import { useGameLibrary } from './useGameLibrary'

type GameLibraryProps = {
  user: AuthenticatedUser
  token: string
  isLoggingOut: boolean
  onLogout: () => void | Promise<void>
  onUnauthorized: () => void
}

type LibraryViewOption = {
  value: GameLibraryView
  label: string
  heading: string
  emptyHeading: string
  emptyDescription: string
}

const LIBRARY_VIEW_OPTIONS: readonly LibraryViewOption[] = [
  {
    value: 'all',
    label: 'All games',
    heading: 'All games',
    emptyHeading: 'Your library is empty',
    emptyDescription: 'Create a game to see your saved boards and matches here.',
  },
  {
    value: 'saved_setups',
    label: 'Saved setups',
    heading: 'Saved setups',
    emptyHeading: 'No saved setups',
    emptyDescription: 'Create a board and save it here when you want to start later.',
  },
  {
    value: 'in_progress',
    label: 'In progress',
    heading: 'Games in progress',
    emptyHeading: 'No games in progress',
    emptyDescription: 'Started games will appear here while they are running or need attention.',
  },
  {
    value: 'history',
    label: 'History',
    heading: 'Game history',
    emptyHeading: 'No finished games yet',
    emptyDescription: 'Completed games will appear here so you can revisit them later.',
  },
]

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
  const [deletingGameId, setDeletingGameId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<GameSummary | null>(null)
  const [deleteError, setDeleteError] = useState<DeleteError | null>(null)
  const {
    games,
    loadState,
    errorMessage,
    activeView,
    counts,
    totalGames,
    hasMore,
    isLoadingMore,
    loadMoreError,
    retry,
    selectView,
    loadMore,
    updateLifecycleStatus,
    removeGameFromLibrary,
  } = useGameLibrary({
    token,
    onUnauthorized,
    isLoadingDisabled: deletingGameId !== null || isLoggingOut,
  })
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null)
  const newGameActionRef = useRef<HTMLAnchorElement | null>(null)
  const libraryCollectionRef = useRef<HTMLElement>(null)
  const activeViewOption = getLibraryViewOption(activeView)

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

  const handleViewKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % LIBRARY_VIEW_OPTIONS.length
        break
      case 'ArrowLeft':
        nextIndex = (index - 1 + LIBRARY_VIEW_OPTIONS.length) % LIBRARY_VIEW_OPTIONS.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = LIBRARY_VIEW_OPTIONS.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabs?.[nextIndex].focus()
    selectView(LIBRARY_VIEW_OPTIONS[nextIndex].value)
  }

  const restoreDeleteFocus = useCallback((focusMenuTrigger: boolean) => {
    const trigger = deleteTriggerRef.current
    const menuTrigger = trigger
      ?.closest('details')
      ?.querySelector<HTMLElement>('.library-more-trigger')

    trigger?.closest('details')?.removeAttribute('open')

    window.requestAnimationFrame(() => {
      if (focusMenuTrigger && menuTrigger?.isConnected) {
        menuTrigger.focus()
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
    restoreDeleteFocus(true)
  }, [restoreDeleteFocus])

  const openDeleteConfirmation = (game: GameSummary, trigger: HTMLButtonElement) => {
    if (deletingGameId !== null || isLoadingMore || isLoggingOut) {
      return
    }

    deleteTriggerRef.current = trigger
    trigger.closest('details')?.removeAttribute('open')
    setDeleteError(null)
    setDeleteTarget(game)
  }

  const handleDelete = async () => {
    const game = deleteTarget

    if (game === null || deletingGameId !== null || isLoadingMore || isLoggingOut) {
      return
    }

    setDeletingGameId(game.id)
    setDeleteError(null)

    try {
      await deleteGame(token, game.id, onUnauthorized)
      removeGameFromLibrary(game)
      setDeleteTarget(null)
      restoreDeleteFocus(false)
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
            Pick up a game, prepare a board, or revisit a match.
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

      <section ref={libraryCollectionRef} className="library-collection">
        <nav className="library-view-tabs" aria-label="Game library views" role="tablist">
          {LIBRARY_VIEW_OPTIONS.map((view, index) => {
            const viewCount = counts?.[view.value]

            return (
              <button
                aria-controls="game-library-panel"
                aria-selected={activeView === view.value}
                className="library-view-tab"
                id={`library-tab-${view.value}`}
                key={view.value}
                role="tab"
                tabIndex={activeView === view.value ? 0 : -1}
                type="button"
                onClick={() => selectView(view.value)}
                onKeyDown={(event) => handleViewKeyDown(event, index)}
              >
                <span>{view.label}</span>
                <span className="library-view-tab-count" aria-label={`${view.label} count`}>
                  {viewCount ?? '...'}
                </span>
              </button>
            )
          })}
        </nav>

        <div
          id="game-library-panel"
          role="tabpanel"
          aria-busy={loadState === 'loading'}
          aria-labelledby={`library-tab-${activeView}`}
        >
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
            <>
              <div className="library-section-heading">
                <h2>{libraryCountHeading(activeViewOption, totalGames)}</h2>
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
                  <h3>{activeViewOption.emptyHeading}</h3>
                  <p>{activeViewOption.emptyDescription}</p>
                  {activeView === 'in_progress' && (counts?.saved_setups ?? 0) > 0 ? (
                    <button
                      className="access-secondary-action"
                      type="button"
                      onClick={() => selectView('saved_setups')}
                    >
                      View saved setups
                    </button>
                  ) : (
                    <a className="access-primary-action" href="/games/new">
                      <svg className="library-icon" aria-hidden="true" viewBox="0 0 24 24">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Create a game
                    </a>
                  )}
                </div>
              ) : (
                <ul className="library-list" aria-label={activeViewOption.label}>
                  {games.map((game) => (
                    <GameLibraryCard
                      key={game.id}
                      game={game}
                      token={token}
                      isLoggingOut={isLoggingOut}
                      isDeleting={deletingGameId === game.id}
                      isAnyGameDeleting={deletingGameId !== null}
                      isLoadingMore={isLoadingMore}
                      onDeleteRequest={openDeleteConfirmation}
                      onStatusChange={updateLifecycleStatus}
                      onUnauthorized={onUnauthorized}
                    />
                  ))}
                </ul>
              )}

              {hasMore && (
                <div className="library-pagination">
                  <p className="library-pagination-summary" role="status" aria-live="polite">
                    Showing {games.length} of {totalGames} {activeViewOption.label.toLowerCase()}
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
            </>
          )}
        </div>
      </section>

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

function getLibraryViewOption(view: GameLibraryView): LibraryViewOption {
  return LIBRARY_VIEW_OPTIONS.find((option) => option.value === view) ?? LIBRARY_VIEW_OPTIONS[0]
}

function libraryCountHeading(option: LibraryViewOption, total: number): string {
  if (total === 0) {
    return option.heading
  }

  if (option.value === 'saved_setups') {
    return `${total} saved setup${total === 1 ? '' : 's'}`
  }

  if (option.value === 'in_progress') {
    return `${total} game${total === 1 ? '' : 's'} in progress`
  }

  if (option.value === 'history') {
    return `${total} finished game${total === 1 ? '' : 's'}`
  }

  return `${total} game${total === 1 ? '' : 's'}`
}
