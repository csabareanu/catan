import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessShell } from '../auth/AuthShell'
import type { AuthenticatedUser } from '../auth/authApi'
import { BoardHelp, BoardSvg } from '../board/BoardSvg'
import {
  readPublicReplayState,
  type PublicReplayState,
} from './publicReplayState'
import type { ReplayResponse } from './replayApi'
import { useReplayNavigation } from './useReplayNavigation'

type GameObserverProps = {
  isLoggingOut: boolean
  user: AuthenticatedUser
  token: string
  gameID: number
  onLogout: () => void | Promise<void>
  onUnauthorized: () => void
}

export function GameObserver({
  isLoggingOut,
  onLogout,
  user,
  token,
  gameID,
  onUnauthorized,
}: GameObserverProps) {
  const {
    errorMessage,
    isFollowingLatest,
    isLoadingMoreEvents,
    loadState,
    loadMoreErrorMessage,
    loadMoreEvents,
    replay,
    retry,
    selectedCommandSequence,
    selectCheckpoint,
    selectLatest,
  } = useReplayNavigation({ gameID, onUnauthorized, token })

  return (
    <AccessShell
      authenticatedUser={user}
      cardClassName="access-card observer-card"
      contentClassName="observer-content"
      shellClassName="observer-shell"
      isLoggingOut={isLoggingOut}
      onLogout={onLogout}
    >
      <header className="observer-header">
        <a className="observer-back-link" href="/games" aria-label="Back to your games">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </a>
        <div className="observer-heading">
          <h1>Game {replay?.context.game.id ?? gameID}</h1>
          {replay && (
            <>
              <span className="observer-heading-divider" aria-hidden="true" />
              <span className="observer-mode">{gameModeLabel(replay.context.game.mode)}</span>
            </>
          )}
        </div>
        <div className="observer-header-actions">
          {replay && (
            <>
              <span className="observer-readonly">
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
                Read-only
              </span>
              <span className={`library-status observer-status-${statusClass(replay.context.game.lifecycle_status)}`}>
                {observerStatusLabel(replay.context.game.lifecycle_status)}
              </span>
            </>
          )}
        </div>
      </header>

      {loadState === 'loading' && replay === null && (
        <div className="observer-state" role="status" aria-live="polite">
          <span className="status-dot" aria-hidden="true" />
          Loading the persisted replay
        </div>
      )}

      {loadState === 'loading' && replay !== null && (
        <div className="observer-state" role="status" aria-live="polite">
          <span className="status-dot" aria-hidden="true" />
          Refreshing the persisted replay
        </div>
      )}

      {loadState === 'error' && errorMessage && (
        <div className="observer-error" role="alert">
          <p>{errorMessage}</p>
          <div className="access-actions">
            <button className="access-secondary-action" type="button" onClick={retry}>
              Try again
            </button>
            <a className="access-secondary-action" href="/games">
              Return to your games
            </a>
          </div>
        </div>
      )}

      {replay && (
        <ObserverContent
          replay={replay}
          isFollowingLatest={isFollowingLatest}
          isLoadingMoreEvents={isLoadingMoreEvents}
          isNavigationLoading={loadState === 'loading'}
          loadMoreErrorMessage={loadMoreErrorMessage}
          loadMoreEvents={loadMoreEvents}
          selectedCommandSequence={selectedCommandSequence}
          selectCheckpoint={selectCheckpoint}
          selectLatest={selectLatest}
        />
      )}
    </AccessShell>
  )
}

type ObserverContentProps = {
  replay: ReplayResponse
  isFollowingLatest: boolean
  isLoadingMoreEvents: boolean
  isNavigationLoading: boolean
  loadMoreErrorMessage: string | null
  loadMoreEvents: () => void
  selectedCommandSequence: string | null
  selectCheckpoint: (commandSequence: string) => void
  selectLatest: () => void
}

function ObserverContent({
  replay,
  isFollowingLatest,
  isLoadingMoreEvents,
  isNavigationLoading,
  loadMoreErrorMessage,
  loadMoreEvents,
  selectedCommandSequence,
  selectCheckpoint,
  selectLatest,
}: ObserverContentProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const sidebarToggleRef = useRef<HTMLButtonElement>(null)
  const sidebarCloseRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const { context, events, event_cursor: eventCursor, frame } = replay
  const game = context.game
  const publicState = readPublicReplayState(frame)

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false)
    sidebarToggleRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!isSidebarOpen) {
      return
    }

    const sidebar = sidebarRef.current

    if (!sidebar) {
      return
    }

    const focusableElements = getFocusableElements(sidebar)
    const closeButton = sidebarCloseRef.current

    if (closeButton && focusableElements.includes(closeButton)) {
      closeButton.focus()
    } else {
      focusableElements[0]?.focus()
    }

    const closeOnEscapeAndTrapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeSidebar()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusableElements = getFocusableElements(sidebar)

      if (focusableElements.length === 0) {
        event.preventDefault()
        return
      }

      const firstFocusableElement = focusableElements[0]
      const lastFocusableElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (!sidebar.contains(activeElement)) {
        event.preventDefault()
        firstFocusableElement.focus()
        return
      }

      if (event.shiftKey && activeElement === firstFocusableElement) {
        event.preventDefault()
        lastFocusableElement.focus()
      } else if (!event.shiftKey && activeElement === lastFocusableElement) {
        event.preventDefault()
        firstFocusableElement.focus()
      }
    }

    document.addEventListener('keydown', closeOnEscapeAndTrapFocus)

    return () => {
      document.removeEventListener('keydown', closeOnEscapeAndTrapFocus)
    }
  }, [closeSidebar, isSidebarOpen])

  return (
    <div className="observer-layout">
      <section className="observer-board" aria-label="Game board">
        <BoardSvg
          board={context.board}
          toolbarStart={(
            <button
              ref={sidebarToggleRef}
              className="observer-sidebar-toggle"
              type="button"
              aria-controls="observer-sidebar"
              aria-expanded={isSidebarOpen}
              onClick={() => {
                if (isSidebarOpen) {
                  closeSidebar()
                  return
                }

                setIsSidebarOpen(true)
              }}
            >
              {isSidebarOpen ? 'Close overview' : 'Overview'}
            </button>
          )}
        />
      </section>

      {isSidebarOpen && (
        <button
          className="observer-sidebar-backdrop"
          type="button"
          tabIndex={-1}
          aria-label="Close game details"
          onClick={closeSidebar}
        />
      )}

      <aside
        ref={sidebarRef}
        id="observer-sidebar"
        className={`observer-sidebar${isSidebarOpen ? ' observer-sidebar-open' : ''}`}
        role={isSidebarOpen ? 'dialog' : undefined}
        aria-modal={isSidebarOpen ? 'true' : undefined}
        aria-label={isSidebarOpen ? 'Game details' : 'Players and game history'}
      >
        <div className="observer-sidebar-header">
          <button
            ref={sidebarCloseRef}
            className="observer-sidebar-close"
            type="button"
            onClick={closeSidebar}
          >
            Close details
          </button>
        </div>
        {frame && (
          <ObserverStatus publicState={publicState} seats={context.seats} />
        )}
        <section className="observer-panel" aria-labelledby="observer-players-title">
          <div className="observer-section-heading">
            <h2 id="observer-players-title">Players</h2>
            <span>{context.seats.length} players</span>
          </div>
          <ul className="observer-player-list" aria-label="Game players">
            {context.seats.map((seat) => {
              const playerAwards = publicState.awards
                .filter((award) => award.seatNumber === seat.seat_number)
                .map((award) => award.label)
              const isActive = publicState.activeSeatNumber === seat.seat_number
              const score = publicState.scores.get(seat.seat_number)

              return (
                <li
                  className={`observer-player${isActive ? ' observer-player-active' : ''}`}
                  key={seat.seat_number}
                >
                  <span
                    className={`observer-player-avatar observer-player-${playerColorClass(seat.seat_number, seat.controller_type)}`}
                    aria-hidden="true"
                  >
                    {playerInitial(seat.label, seat.seat_number)}
                  </span>
                  <span className="observer-player-copy">
                    <strong>{seatDisplayName(seat.label, seat.seat_number)}</strong>
                    <span className="observer-player-meta">
                      <small>{controllerTypeLabel(seat.controller_type)}</small>
                      {score !== undefined && (
                        <small className="observer-player-score">{scoreLabel(score)}</small>
                      )}
                    </span>
                    {playerAwards.length > 0 && (
                      <span className="observer-player-awards">{playerAwards.join(' · ')}</span>
                    )}
                  </span>
                  <span className="observer-player-badges">
                    {isActive && <span className="observer-turn">Turn</span>}
                    {seat.seat_number === game.human_seat_number && (
                      <span className="observer-you">You</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="observer-panel" aria-labelledby="observer-history-title">
          <div className="observer-section-heading">
            <h2 id="observer-history-title">History</h2>
            <span>{eventCountLabel(events.length)}</span>
          </div>
          <ReplayPositionControls
            frame={frame}
            isFollowingLatest={isFollowingLatest}
            isLoading={isNavigationLoading}
            selectedCommandSequence={selectedCommandSequence}
            snapshotIndex={replay.snapshot_index}
            selectCheckpoint={selectCheckpoint}
            selectLatest={selectLatest}
          />
          {events.length > 0 ? (
            <ol className="observer-history-list">
              {events.map((event) => (
                <li className="observer-history-event" key={event.sequence}>
                  <span className="observer-history-marker" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="m5 12 4 4L19 6" />
                    </svg>
                  </span>
                  <div>
                    <strong>{eventLabel(event.event_type)}</strong>
                    <p>{eventDescription(event.event_type)}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="observer-note">No visible history is available yet.</p>
          )}
          {eventCursor.has_more && (
            <div className="observer-history-pagination" aria-live="polite">
              <button
                className="observer-history-more"
                type="button"
                onClick={loadMoreEvents}
                disabled={isLoadingMoreEvents}
              >
                {isLoadingMoreEvents ? 'Loading more history' : 'Load more history'}
              </button>
              {loadMoreErrorMessage && (
                <p className="observer-history-error" role="alert">
                  <span>{loadMoreErrorMessage}</span>
                  <button
                    className="observer-history-retry"
                    type="button"
                    onClick={loadMoreEvents}
                  >
                    Try again
                  </button>
                </p>
              )}
            </div>
          )}
          {frame && (
            <p className="observer-note">The current board view is ready for replay.</p>
          )}
        </section>

        <details className="observer-panel observer-disclosure">
          <summary>Game details</summary>
          <dl className="observer-detail-list">
            <div>
              <dt>Mode</dt>
              <dd>{gameModeLabel(game.mode)}</dd>
            </div>
            <div>
              <dt>Board code</dt>
              <dd><code>{game.seed}</code></dd>
            </div>
            <div>
              <dt>Rules</dt>
              <dd>Base game · Standard map</dd>
            </div>
            <div>
              <dt>Your seat</dt>
              <dd>{game.human_seat_number === null ? 'Spectator' : game.human_seat_number}</dd>
            </div>
          </dl>
        </details>

        <details className="observer-panel observer-disclosure observer-board-help">
          <summary>Board guide</summary>
          <BoardHelp />
        </details>

        <p className="observer-sidebar-footer">History and board data are supplied by the server.</p>
      </aside>
    </div>
  )
}

type ReplayPositionControlsProps = {
  frame: ReplayResponse['frame']
  isFollowingLatest: boolean
  isLoading: boolean
  selectedCommandSequence: string | null
  snapshotIndex: ReplayResponse['snapshot_index']
  selectCheckpoint: (commandSequence: string) => void
  selectLatest: () => void
}

function ReplayPositionControls({
  frame,
  isFollowingLatest,
  isLoading,
  selectedCommandSequence,
  snapshotIndex,
  selectCheckpoint,
  selectLatest,
}: ReplayPositionControlsProps) {
  const frameIndex = frame === null
    ? -1
    : snapshotIndex.findIndex((entry) => entry.command_sequence === frame.command_sequence)
  const selectedIndex = selectedCommandSequence === null
    ? frameIndex
    : snapshotIndex.findIndex((entry) => entry.command_sequence === selectedCommandSequence)
  const currentIndex = isLoading && selectedCommandSequence !== null
    ? selectedIndex
    : frameIndex >= 0
      ? frameIndex
      : selectedIndex
  const latestIndex = snapshotIndex.length - 1
  const hasSnapshots = snapshotIndex.length > 0
  const positionLabel = isLoading
    ? 'Loading saved position'
    : frame === null
      ? 'No board frame is available'
      : isFollowingLatest
        ? 'Latest saved position'
        : `Saved position ${Math.max(currentIndex + 1, 1)} of ${snapshotIndex.length}`
  const frameLabel = frame === null
    ? 'The board frame will appear when a saved position is available.'
    : `Command ${frame.command_sequence} · Event ${frame.event_sequence}`

  if (!hasSnapshots) {
    return (
      <div className="observer-replay-controls observer-replay-empty" aria-labelledby="observer-replay-title">
        <div className="observer-section-heading">
          <h3 id="observer-replay-title">Replay position</h3>
          <span>No saved positions</span>
        </div>
        <p className="observer-note">No saved replay positions are available yet.</p>
      </div>
    )
  }

  return (
    <div
      className="observer-replay-controls"
      aria-labelledby="observer-replay-title"
      aria-busy={isLoading}
    >
      <div className="observer-section-heading">
        <h3 id="observer-replay-title">Replay position</h3>
        <span>{snapshotIndex.length} saved</span>
      </div>
      <div className="observer-replay-position" role="status" aria-live="polite">
        <strong>{positionLabel}</strong>
        <span>{frameLabel}</span>
      </div>
      <div className="observer-replay-actions" role="group" aria-label="Replay position controls">
        <button
          className="observer-replay-button"
          type="button"
          onClick={() => {
            const previous = snapshotIndex[currentIndex - 1]

            if (previous) {
              selectCheckpoint(previous.command_sequence)
            }
          }}
          disabled={currentIndex <= 0}
        >
          Previous
        </button>
        <button
          className="observer-replay-button"
          type="button"
          onClick={() => {
            const next = snapshotIndex[currentIndex + 1]

            if (next) {
              selectCheckpoint(next.command_sequence)
            }
          }}
          disabled={currentIndex < 0 || currentIndex >= latestIndex}
        >
          Next
        </button>
        <button
          className="observer-replay-button observer-replay-latest"
          type="button"
          onClick={selectLatest}
          disabled={isFollowingLatest}
        >
          Latest
        </button>
      </div>
      <div className="observer-replay-checkpoints" aria-label="Saved replay positions">
        {snapshotIndex.map((entry, index) => {
          const isCurrent = isLoading && selectedCommandSequence !== null
            ? entry.command_sequence === selectedCommandSequence
            : index === frameIndex

          return (
            <button
              className="observer-replay-checkpoint"
              type="button"
              key={entry.command_sequence}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`Replay position command ${entry.command_sequence}, event ${entry.event_sequence}`}
              onClick={() => selectCheckpoint(entry.command_sequence)}
            >
              <span>Command {entry.command_sequence}</span>
              <small>Event {entry.event_sequence}</small>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ObserverStatus({
  publicState,
  seats,
}: {
  publicState: PublicReplayState
  seats: ReplayResponse['context']['seats']
}) {
  const activeSeat = publicState.activeSeatNumber === null
    ? null
    : seats.find((seat) => seat.seat_number === publicState.activeSeatNumber) ?? null
  const hasStatus = publicState.phase !== null ||
    publicState.turnPhase !== null ||
    activeSeat !== null ||
    publicState.awards.length > 0

  return (
    <section className="observer-panel observer-status-panel" aria-labelledby="observer-status-title">
      <div className="observer-section-heading">
        <h2 id="observer-status-title">Game status</h2>
        <span>Public view</span>
      </div>
      {hasStatus ? (
        <>
          <dl className="observer-status-list">
            {publicState.phase !== null && (
              <div>
                <dt>Phase</dt>
                <dd>{stateLabel(publicState.phase)}</dd>
              </div>
            )}
            {publicState.turnPhase !== null && (
              <div>
                <dt>Turn</dt>
                <dd>{stateLabel(publicState.turnPhase)}</dd>
              </div>
            )}
            {activeSeat !== null && (
              <div>
                <dt>Playing now</dt>
                <dd>{seatDisplayName(activeSeat.label, activeSeat.seat_number)}</dd>
              </div>
            )}
          </dl>
          {publicState.awards.length > 0 && (
            <div className="observer-awards">
              <span className="observer-status-label">Awards</span>
              <ul className="observer-award-list">
                {publicState.awards.map((award) => {
                  const seat = seats.find((candidate) => candidate.seat_number === award.seatNumber)

                  return (
                    <li key={`${award.label}-${award.seatNumber}`}>
                      <span>{award.label}</span>
                      <strong>{seatDisplayName(seat?.label ?? null, award.seatNumber)}</strong>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="observer-note">Public status is not available yet.</p>
      )}
    </section>
  )
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
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

function lifecycleStatusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function observerStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    completed: 'Run complete',
    failed: 'Run failed',
    queued: 'Run queued',
    running: 'Run in progress',
  }

  return labels[status] ?? lifecycleStatusLabel(status)
}

function statusClass(status: string): string {
  return status.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
}

function gameModeLabel(mode: string): string {
  if (mode === 'human_vs_ai') {
    return 'Human vs AI'
  }

  if (mode === 'ai_only') {
    return 'AI simulation'
  }

  return lifecycleStatusLabel(mode)
}

function controllerTypeLabel(controllerType: string): string {
  if (controllerType === 'human') {
    return 'Human player'
  }

  if (controllerType === 'ai') {
    return 'AI player'
  }

  return lifecycleStatusLabel(controllerType)
}

function stateLabel(value: string): string {
  return lifecycleStatusLabel(value)
}

function seatDisplayName(label: string | null, seatNumber: number): string {
  return label?.trim() || `Seat ${seatNumber}`
}

function scoreLabel(score: number): string {
  return `${score} ${score === 1 ? 'point' : 'points'}`
}

function playerInitial(label: string | null, seatNumber: number): string {
  const initial = label?.trim().charAt(0).toUpperCase()

  return initial || String(seatNumber)
}

function playerColorClass(seatNumber: number, controllerType: string): string {
  if (controllerType === 'human') {
    return 'human'
  }

  const colors = ['sable', 'moss', 'clay']

  return colors[(seatNumber - 2) % colors.length] ?? 'sable'
}

function eventCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'event' : 'events'}`
}

function eventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    'game_initialized.v1': 'Game initialized',
  }

  if (labels[eventType]) {
    return labels[eventType]
  }

  return lifecycleStatusLabel(eventType.replace(/\.v\d+$/, ''))
}

function eventDescription(eventType: string): string {
  if (eventType === 'game_initialized.v1') {
    return 'The board and players are ready.'
  }

  return 'This event is available in the saved history.'
}
