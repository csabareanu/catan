import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessShell } from '../auth/AuthShell'
import type { AuthenticatedUser } from '../auth/authApi'
import {
  BoardHelp,
  BoardSvg,
  type BoardPieceColor,
  type BoardPlayerStructures,
} from '../board/BoardSvg'
import type { ResourceType } from '../board/boardApi'
import {
  readSetupPlaybackEvents,
  readPublicReplayState,
  type PublicReplayState,
  type SetupPlaybackEvent,
  type SetupPlayerStructures,
} from './publicReplayState'
import type { ReplayResponse } from './replayApi'
import { useReplayNavigation } from './useReplayNavigation'
import { consumeObserverAutoplayIntent } from './observerAutoplayIntent'

const RESOURCE_LABELS: Record<ResourceType, string> = {
  lumber: 'Lumber',
  wool: 'Wool',
  grain: 'Grain',
  brick: 'Brick',
  ore: 'Ore',
}

const SETUP_PLAYBACK_INTERVAL_MS = 850

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
  const observerKey = `${user.id}:${gameID}`
  const [autoplayIntentKey, setAutoplayIntentKey] = useState<string | null>(null)
  const checkedObserverKeyRef = useRef<string | null>(null)
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

  useEffect(() => {
    if (checkedObserverKeyRef.current === observerKey) {
      return
    }

    checkedObserverKeyRef.current = observerKey
    setAutoplayIntentKey(consumeObserverAutoplayIntent(user.id, gameID) ? observerKey : null)
  }, [gameID, observerKey, user.id])

  const shouldAutoplaySetup = autoplayIntentKey === observerKey

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
              <span
                className={`observer-refresh-indicator${loadState === 'loading' ? ' observer-refresh-indicator-active' : ''}`}
                role={loadState === 'loading' ? 'status' : undefined}
                aria-live={loadState === 'loading' ? 'polite' : undefined}
                aria-label={loadState === 'loading' ? 'Refreshing the persisted replay' : undefined}
                aria-hidden={loadState !== 'loading'}
              >
                <span className="status-dot" aria-hidden="true" />
                <span className="observer-refresh-label">Refreshing</span>
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
          key={gameID}
          replay={replay}
          shouldAutoplaySetup={shouldAutoplaySetup}
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
  shouldAutoplaySetup: boolean
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
  shouldAutoplaySetup,
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
  const publicState = readPublicReplayState(frame, game.human_seat_number)
  const setupPlaybackEvents = readSetupPlaybackEvents(events)
  const [setupPlaybackCount, setSetupPlaybackCount] = useState<number | null>(null)
  const [isSetupPlaying, setIsSetupPlaying] = useState(false)
  const hasStartedArrivalAutoplayRef = useRef(false)
  const selectReplayCheckpoint = useCallback((commandSequence: string) => {
    setSetupPlaybackCount(null)
    setIsSetupPlaying(false)
    selectCheckpoint(commandSequence)
  }, [selectCheckpoint])
  const selectReplayLatest = useCallback(() => {
    setSetupPlaybackCount(null)
    setIsSetupPlaying(false)
    selectLatest()
  }, [selectLatest])
  const visibleSetupPlaybackCount = setupPlaybackCount === null
    ? null
    : Math.min(setupPlaybackCount, setupPlaybackEvents.length)
  const latestSetupEvent = visibleSetupPlaybackCount === null || visibleSetupPlaybackCount === 0
    ? null
    : setupPlaybackEvents[visibleSetupPlaybackCount - 1] ?? null
  const completionEventIndex = setupPlaybackEvents.findIndex((event) => event.kind === 'completed')
  const hasPresentedCompletion = completionEventIndex >= 0 &&
    visibleSetupPlaybackCount !== null &&
    visibleSetupPlaybackCount > completionEventIndex
  const isAtSetupPlaybackEnd = setupPlaybackCount !== null &&
    setupPlaybackCount >= setupPlaybackEvents.length &&
    !eventCursor.has_more &&
    !isLoadingMoreEvents
  const expectedHumanSeat = publicState.phase === 'initial_placement' &&
    game.human_seat_number !== null &&
    publicState.activeSeatNumber === game.human_seat_number
    ? context.seats.find((seat) => seat.seat_number === game.human_seat_number) ?? null
    : null
  const isAtHumanInputBoundary = isAtSetupPlaybackEnd && expectedHumanSeat !== null
  const hasFinishedSetup = hasPresentedCompletion || (
    isAtSetupPlaybackEnd && publicState.phase === 'turn_ready'
  )
  const isSetupPlaybackTerminal =
    hasPresentedCompletion ||
    isAtHumanInputBoundary ||
    (isAtSetupPlaybackEnd && publicState.phase === 'turn_ready')
  const isSetupPlaybackRunning = isSetupPlaying &&
    !isSetupPlaybackTerminal &&
    loadMoreErrorMessage === null
  const setupPlaybackStatus = getSetupPlaybackStatus({
    currentEvent: latestSetupEvent,
    expectedHumanSeat,
    hasFinishedSetup,
    isAtHumanInputBoundary,
    isPlaying: isSetupPlaybackRunning,
    isPaused: setupPlaybackCount !== null &&
      !isSetupPlaybackRunning &&
      !isSetupPlaybackTerminal &&
      loadMoreErrorMessage === null,
    loadMoreErrorMessage,
    playbackCount: setupPlaybackCount,
    playbackEventCount: setupPlaybackEvents.length,
    seats: context.seats,
    isLoadingMoreEvents,
  })
  const setupPlaybackEventBySequence = new Map(
    setupPlaybackEvents.map((event) => [event.sequence, event]),
  )
  const visibleSetupPlayers = setupPlaybackCount === null
    ? publicState.setup?.players ?? []
    : getSetupPlayersAtPlaybackPosition(setupPlaybackEvents, visibleSetupPlaybackCount ?? 0)
  const mostRecentPlacementEvent = latestSetupEvent?.kind === 'settlement' || latestSetupEvent?.kind === 'road'
    ? latestSetupEvent
    : null
  const playerStructures: BoardPlayerStructures[] = visibleSetupPlayers
    .flatMap((player): BoardPlayerStructures[] => {
      const seat = context.seats.find((candidate) => candidate.seat_number === player.seatNumber)

      if (!seat) {
        return []
      }

      return [{
        seatNumber: seat.seat_number,
        ownerLabel: seatDisplayName(seat.label, seat.seat_number),
        color: playerColorClass(seat.seat_number, seat.controller_type),
        settlementVertexIDs: player.settlements,
        roadEdgeIDs: player.roads,
        recentSettlementVertexIDs: mostRecentPlacementEvent?.kind === 'settlement' &&
          mostRecentPlacementEvent.seatNumber === player.seatNumber &&
          mostRecentPlacementEvent.settlementVertexID !== null
          ? [mostRecentPlacementEvent.settlementVertexID]
          : [],
        recentRoadEdgeIDs: mostRecentPlacementEvent?.kind === 'road' &&
          mostRecentPlacementEvent.seatNumber === player.seatNumber &&
          mostRecentPlacementEvent.roadEdgeID !== null
          ? [mostRecentPlacementEvent.roadEdgeID]
          : [],
      }]
    })

  useEffect(() => {
    if (
      !shouldAutoplaySetup ||
      hasStartedArrivalAutoplayRef.current ||
      setupPlaybackEvents.length === 0
    ) {
      return
    }

    hasStartedArrivalAutoplayRef.current = true
    setSetupPlaybackCount(0)
    setIsSetupPlaying(true)
  }, [setupPlaybackEvents.length, shouldAutoplaySetup])

  useEffect(() => {
    if (
      isSetupPlaybackTerminal ||
      setupPlaybackCount === null ||
      setupPlaybackCount <= setupPlaybackEvents.length ||
      !eventCursor.has_more ||
      isLoadingMoreEvents ||
      loadMoreErrorMessage !== null
    ) {
      return
    }

    loadMoreEvents()
  }, [
    eventCursor.has_more,
    isSetupPlaybackTerminal,
    isLoadingMoreEvents,
    loadMoreErrorMessage,
    loadMoreEvents,
    setupPlaybackCount,
    setupPlaybackEvents.length,
  ])

  useEffect(() => {
    if (!isSetupPlaybackRunning) {
      return
    }

    if (setupPlaybackCount === null) {
      return
    }

    if (setupPlaybackCount < setupPlaybackEvents.length) {
      const timeoutID = window.setTimeout(() => {
        setSetupPlaybackCount((currentCount) => currentCount === null ? 1 : currentCount + 1)
      }, SETUP_PLAYBACK_INTERVAL_MS)

      return () => window.clearTimeout(timeoutID)
    }

    if (eventCursor.has_more) {
      if (!isLoadingMoreEvents) {
        loadMoreEvents()
      }

      return
    }
  }, [
    eventCursor.has_more,
    isLoadingMoreEvents,
    isSetupPlaybackRunning,
    loadMoreEvents,
    setupPlaybackCount,
    setupPlaybackEvents.length,
  ])

  const startOrResumeSetupPlayback = () => {
    if (isSetupPlaybackRunning) {
      setIsSetupPlaying(false)
      return
    }

    if (
      setupPlaybackCount === null ||
      hasFinishedSetup ||
      isAtHumanInputBoundary ||
      (isAtSetupPlaybackEnd && !eventCursor.has_more)
    ) {
      setSetupPlaybackCount(0)
    }

    setIsSetupPlaying(true)
  }

  const stepSetupPlayback = () => {
    setIsSetupPlaying(false)
    const nextCount = (setupPlaybackCount ?? 0) + 1
    setSetupPlaybackCount(nextCount)
  }

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
          playerStructures={playerStructures}
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
            selectCheckpoint={selectReplayCheckpoint}
            selectLatest={selectReplayLatest}
          />
          {(setupPlaybackEvents.length > 0 || publicState.phase === 'initial_placement') && (
            <section className="observer-setup-playback" aria-labelledby="observer-setup-playback-title">
              <div className="observer-setup-playback-heading">
                <h3 id="observer-setup-playback-title">Setup playback</h3>
                <span>
                  {setupPlaybackCount === null
                    ? 'Latest state'
                    : setupPlaybackCount > setupPlaybackEvents.length
                      ? 'Loading next event'
                      : `${visibleSetupPlaybackCount ?? 0} of ${setupPlaybackEvents.length} events`}
                </span>
              </div>
              <div className="observer-setup-playback-actions">
                <button
                  className="observer-setup-playback-primary"
                  type="button"
                  onClick={startOrResumeSetupPlayback}
                >
                  {isSetupPlaybackRunning
                    ? 'Pause setup'
                    : (hasFinishedSetup || isAtHumanInputBoundary || isAtSetupPlaybackEnd)
                      ? 'Replay setup'
                      : setupPlaybackCount === null
                        ? 'Play setup'
                        : 'Resume setup'}
                </button>
                <button
                  className="observer-setup-playback-step"
                  type="button"
                  onClick={stepSetupPlayback}
                  disabled={
                    isLoadingMoreEvents ||
                    ((setupPlaybackCount ?? 0) >= setupPlaybackEvents.length && !eventCursor.has_more)
                  }
                >
                  Next event
                </button>
              </div>
              <p
                className="observer-setup-playback-status"
                role="status"
                aria-live="polite"
                data-setup-playback-status
              >
                {setupPlaybackStatus}
              </p>
            </section>
          )}
          {events.length > 0 ? (
            <ol className="observer-history-list">
              {events.map((event) => (
                <li
                  className="observer-history-event"
                  aria-current={latestSetupEvent?.sequence === event.sequence ? 'step' : undefined}
                  data-event-sequence={event.sequence}
                  key={event.sequence}
                >
                  <span className="observer-history-marker" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="m5 12 4 4L19 6" />
                    </svg>
                  </span>
                  <div>
                    <strong>{eventLabel(event.event_type)}</strong>
                    <p>{eventDescription(
                      event.event_type,
                      setupPlaybackEventBySequence.get(event.sequence) ?? null,
                      context.seats,
                    )}</p>
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
  const setupOrder = publicState.setup?.seatOrder.flatMap((seatNumber) => {
    const seat = seats.find((candidate) => candidate.seat_number === seatNumber)

    return seat ? [seatDisplayName(seat.label, seat.seat_number)] : []
  }) ?? []
  const hasStatus = publicState.phase !== null ||
    publicState.turnPhase !== null ||
    activeSeat !== null ||
    publicState.awards.length > 0 ||
    publicState.setup?.round !== null && publicState.setup?.round !== undefined ||
    publicState.setup?.step !== null && publicState.setup?.step !== undefined ||
    setupOrder.length > 0 ||
    publicState.viewerResources !== null

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
            {publicState.setup?.round !== null && publicState.setup?.round !== undefined && (
              <div>
                <dt>Setup round</dt>
                <dd>{publicState.setup.round}</dd>
              </div>
            )}
            {publicState.setup?.step !== null && publicState.setup?.step !== undefined && (
              <div>
                <dt>Setup step</dt>
                <dd>{stateLabel(publicState.setup.step)}</dd>
              </div>
            )}
            {setupOrder.length > 0 && (
              <div>
                <dt>Setup order</dt>
                <dd className="observer-setup-order">{setupOrder.join(' → ')}</dd>
              </div>
            )}
            {activeSeat !== null && (
              <div>
                <dt>{publicState.phase === 'initial_placement' ? 'Placing now' : 'Playing now'}</dt>
                <dd>{seatDisplayName(activeSeat.label, activeSeat.seat_number)}</dd>
              </div>
            )}
          </dl>
          {publicState.viewerResources !== null && (
            <section className="observer-setup-resources" aria-labelledby="observer-setup-resources-title">
              <h3 id="observer-setup-resources-title">Your resources</h3>
              <dl className="observer-resource-grid">
                {(Object.keys(RESOURCE_LABELS) as ResourceType[]).map((resource) => (
                  <div data-resource={resource} data-resource-count key={resource}>
                    <dt>{RESOURCE_LABELS[resource]}</dt>
                    <dd>{publicState.viewerResources?.[resource]}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
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

function getSetupPlayersAtPlaybackPosition(
  events: SetupPlaybackEvent[],
  playbackCount: number,
): SetupPlayerStructures[] {
  const players = new Map<number, SetupPlayerStructures>()

  for (const event of events.slice(0, playbackCount)) {
    if (event.seatNumber === null) {
      continue
    }

    const player = players.get(event.seatNumber) ?? {
      seatNumber: event.seatNumber,
      settlements: [],
      roads: [],
    }

    if (
      event.kind === 'settlement' &&
      event.settlementVertexID !== null &&
      !player.settlements.includes(event.settlementVertexID)
    ) {
      player.settlements.push(event.settlementVertexID)
    }

    if (
      event.kind === 'road' &&
      event.roadEdgeID !== null &&
      !player.roads.includes(event.roadEdgeID)
    ) {
      player.roads.push(event.roadEdgeID)
    }

    players.set(event.seatNumber, player)
  }

  return [...players.values()]
}

function getSetupPlaybackStatus({
  currentEvent,
  expectedHumanSeat,
  hasFinishedSetup,
  isAtHumanInputBoundary,
  isPlaying,
  isPaused,
  loadMoreErrorMessage,
  isLoadingMoreEvents,
  playbackCount,
  playbackEventCount,
  seats,
}: {
  currentEvent: SetupPlaybackEvent | null
  expectedHumanSeat: ReplayResponse['context']['seats'][number] | null
  hasFinishedSetup: boolean
  isAtHumanInputBoundary: boolean
  isPlaying: boolean
  isPaused: boolean
  loadMoreErrorMessage: string | null
  isLoadingMoreEvents: boolean
  playbackCount: number | null
  playbackEventCount: number
  seats: ReplayResponse['context']['seats']
}): string {
  if (isAtHumanInputBoundary && expectedHumanSeat !== null) {
    return `Setup playback stopped. Waiting for ${seatDisplayName(expectedHumanSeat.label, expectedHumanSeat.seat_number)} to place a settlement and road.`
  }

  if (hasFinishedSetup) {
    return 'Setup complete. The game is ready for turns.'
  }

  if (loadMoreErrorMessage !== null) {
    return 'Playback paused because more setup history could not be loaded. Retry loading history to continue.'
  }

  if (playbackCount !== null && playbackCount > playbackEventCount) {
    return isLoadingMoreEvents
      ? 'Loading the next setup event.'
      : 'No additional setup events are available.'
  }

  if (isPlaying) {
    if (playbackCount !== null && playbackCount >= playbackEventCount && !isLoadingMoreEvents) {
      return 'Waiting for the next setup event.'
    }

    return currentEvent === null
      ? 'Loading the next setup event.'
      : `Playing: ${describeSetupPlaybackEvent(currentEvent, seats)}`
  }

  if (isPaused) {
    return playbackCount === 0
      ? 'Paused before the first setup event.'
      : `Paused after ${playbackCount} of ${playbackEventCount} setup events.${currentEvent === null ? '' : ` ${describeSetupPlaybackEvent(currentEvent, seats)}`}`
  }

  return 'Showing the latest saved setup state. Play setup to watch the public events in order.'
}

function describeSetupPlaybackEvent(
  event: SetupPlaybackEvent,
  seats: ReplayResponse['context']['seats'],
): string {
  const seat = event.seatNumber === null
    ? null
    : seats.find((candidate) => candidate.seat_number === event.seatNumber) ?? null
  const seatName = seat === null
    ? event.seatNumber === null ? 'A player' : `Seat ${event.seatNumber}`
    : seatDisplayName(seat.label, seat.seat_number)

  switch (event.kind) {
    case 'started': {
      const order = event.seatOrder.map((seatNumber) => {
        const orderedSeat = seats.find((candidate) => candidate.seat_number === seatNumber)

        return orderedSeat === undefined
          ? `Seat ${seatNumber}`
          : seatDisplayName(orderedSeat.label, orderedSeat.seat_number)
      })

      return order.length === 0
        ? 'Initial placement begins.'
        : `Initial placement begins in this order: ${order.join(', ')}.`
    }
    case 'settlement':
      return `${seatName} places a settlement.`
    case 'road':
      return `${seatName} places a road.`
    case 'resources': {
      if (event.resources === null) {
        return `${seatName}'s starting resource grant is recorded.`
      }

      const grant = (Object.keys(RESOURCE_LABELS) as ResourceType[]).flatMap((resource) => {
        const count = event.resources?.[resource] ?? 0

        return count > 0
          ? [`${count} ${RESOURCE_LABELS[resource].toLowerCase()}`]
          : []
      })

      return grant.length === 0
        ? `${seatName} receives no starting resources.`
        : `${seatName} receives starting resources: ${grant.join(', ')}.`
    }
    case 'completed':
      return 'Initial placement is complete. The game is ready for turns.'
  }
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

function playerColorClass(seatNumber: number, controllerType: string): BoardPieceColor {
  if (controllerType === 'human') {
    return 'human'
  }

  const colors: BoardPieceColor[] = ['sable', 'moss', 'clay']

  return colors[(seatNumber - 2) % colors.length] ?? 'sable'
}

function eventCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'event' : 'events'}`
}

function eventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    'game_initialized.v1': 'Game initialized',
    'initial_placement_started.v1': 'Initial placement started',
    'initial_settlement_placed.v1': 'Initial settlement placed',
    'initial_road_placed.v1': 'Initial road placed',
    'initial_resources_granted.v1': 'Starting resources granted',
    'initial_placement_completed.v1': 'Initial placement completed',
  }

  if (labels[eventType]) {
    return labels[eventType]
  }

  return lifecycleStatusLabel(eventType.replace(/\.v\d+$/, ''))
}

function eventDescription(
  eventType: string,
  setupEvent: SetupPlaybackEvent | null,
  seats: ReplayResponse['context']['seats'],
): string {
  if (setupEvent !== null) {
    return describeSetupPlaybackEvent(setupEvent, seats)
  }

  if (eventType === 'game_initialized.v1') {
    return 'The board and players are ready.'
  }

  return 'This event is available in the saved history.'
}
