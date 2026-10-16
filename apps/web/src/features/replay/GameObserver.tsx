import { useEffect, useState } from 'react'
import { ApiError, isRecord } from '../../lib/apiClient'
import { AccessShell } from '../auth/AuthShell'
import type { AuthenticatedUser } from '../auth/authApi'
import { BoardSvg } from '../board/BoardSvg'
import { getGameReplay, type ReplayFrame, type ReplayResponse } from './replayApi'

const POLL_INTERVAL_MS = 2000
const REFRESHABLE_LIFECYCLE_STATUSES = new Set(['queued', 'running'])

type GameObserverProps = {
  isLoggingOut: boolean
  user: AuthenticatedUser
  token: string
  gameID: number
  onLogout: () => void | Promise<void>
  onUnauthorized: () => void
}

type ReplayLoadState = 'loading' | 'success' | 'error'

export function GameObserver({
  isLoggingOut,
  onLogout,
  user,
  token,
  gameID,
  onUnauthorized,
}: GameObserverProps) {
  const [replay, setReplay] = useState<ReplayResponse | null>(null)
  const [loadState, setLoadState] = useState<ReplayLoadState>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let isActive = true
    let timeoutID: number | null = null
    let activeController: AbortController | null = null

    const loadReplay = async (): Promise<void> => {
      const controller = new AbortController()
      activeController = controller

      try {
        const response = await getGameReplay(
          token,
          gameID,
          onUnauthorized,
          controller.signal,
        )

        if (!isActive) {
          return
        }

        setReplay(response)
        setLoadState('success')
        setErrorMessage(null)

        if (shouldRefreshReplay(response.context.game.lifecycle_status)) {
          timeoutID = window.setTimeout(() => {
            void loadReplay()
          }, POLL_INTERVAL_MS)
        }
      } catch (caught: unknown) {
        if (
          !isActive ||
          controller.signal.aborted ||
          (caught instanceof ApiError && caught.status === 401)
        ) {
          return
        }

        setLoadState('error')
        setErrorMessage(toReplayErrorMessage(caught))
      }
    }

    void loadReplay()

    return () => {
      isActive = false

      if (timeoutID !== null) {
        window.clearTimeout(timeoutID)
      }

      activeController?.abort()
    }
  }, [gameID, onUnauthorized, reloadKey, token])

  const retry = () => {
    setErrorMessage(null)
    setLoadState('loading')
    setReloadKey((currentKey) => currentKey + 1)
  }

  return (
    <AccessShell
      authenticatedUser={user}
      cardClassName="access-card observer-card"
      contentClassName="observer-content"
      isLoggingOut={isLoggingOut}
      onLogout={onLogout}
    >
      <header className="observer-header">
        <div>
          <p className="eyebrow">Read-only observer</p>
          <h1>Game {replay?.context.game.id ?? gameID} observer.</h1>
          <p className="access-description">
            Inspect the latest safe replay frame for this owned game. The board
            and history are supplied by the server.
          </p>
        </div>
        <div className="observer-header-actions">
          {replay && (
            <span className={`library-status observer-status-${statusClass(replay.context.game.lifecycle_status)}`}>
              {lifecycleStatusLabel(replay.context.game.lifecycle_status)}
            </span>
          )}
          <a className="access-secondary-action" href="/games">
            Return to your games
          </a>
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

      {replay && <ObserverContent replay={replay} />}
    </AccessShell>
  )
}

function ObserverContent({ replay }: { replay: ReplayResponse }) {
  const { context, events, event_cursor: eventCursor, snapshot_index: snapshotIndex, frame } = replay
  const game = context.game

  return (
    <div className="observer-layout">
      <section className="board-panel observer-board" aria-labelledby="observer-board-title">
        <div className="board-panel-header">
          <div>
            <p className="eyebrow">Persisted topology</p>
            <h2 id="observer-board-title">Public board</h2>
          </div>
          <span className="board-state observer-board-state">
            <span className="board-state-dot" aria-hidden="true" />
            {frame ? 'Frame loaded' : 'Context loaded'}
          </span>
        </div>
        <BoardSvg board={context.board} />
      </section>

      <aside className="observer-sidebar">
        <section className="observer-panel" aria-labelledby="observer-context-title">
          <div className="observer-panel-heading">
            <p className="eyebrow">Safe context</p>
            <h2 id="observer-context-title">Game details</h2>
          </div>
          <dl className="observer-detail-list">
            <div>
              <dt>Mode</dt>
              <dd>{gameModeLabel(game.mode)}</dd>
            </div>
            <div>
              <dt>Lifecycle</dt>
              <dd>{lifecycleStatusLabel(game.lifecycle_status)}</dd>
            </div>
            <div>
              <dt>Seed</dt>
              <dd><code>{game.seed}</code></dd>
            </div>
            <div>
              <dt>Ruleset</dt>
              <dd>{game.ruleset_key}@{game.ruleset_version}</dd>
            </div>
            <div>
              <dt>Your seat</dt>
              <dd>{game.human_seat_number === null ? 'Spectator' : `Seat ${game.human_seat_number}`}</dd>
            </div>
          </dl>

          <h3 className="observer-subheading">Seats</h3>
          <ul className="observer-seat-list" aria-label="Game seats">
            {context.seats.map((seat) => (
              <li className="observer-seat" key={seat.seat_number}>
                <span className="observer-seat-number">{seat.seat_number}</span>
                <span>
                  <strong>{seat.label ?? `Seat ${seat.seat_number}`}</strong>
                  <small>{controllerTypeLabel(seat.controller_type)}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="observer-panel" aria-labelledby="observer-history-title">
          <div className="observer-panel-heading">
            <p className="eyebrow">Visible history</p>
            <h2 id="observer-history-title">Replay cursor</h2>
          </div>
          <dl className="observer-stat-grid">
            <div>
              <dt>Events returned</dt>
              <dd>{events.length}</dd>
            </div>
            <div>
              <dt>Through event</dt>
              <dd>{eventCursor.returned_through_sequence ?? 'None'}</dd>
            </div>
            <div>
              <dt>Snapshot index</dt>
              <dd>{snapshotIndex.length}</dd>
            </div>
            <div>
              <dt>More history</dt>
              <dd>{eventCursor.has_more ? 'Available' : 'Complete'}</dd>
            </div>
          </dl>
          <p className="observer-note">
            {eventCursor.has_more
              ? 'Additional visible events are available for the future replay timeline.'
              : 'The current response contains the complete visible event page.'}
          </p>
        </section>

        <FramePanel frame={frame} />
      </aside>
    </div>
  )
}

function FramePanel({ frame }: { frame: ReplayFrame | null }) {
  return (
    <section className="observer-panel" aria-labelledby="observer-frame-title">
      <div className="observer-panel-heading">
        <p className="eyebrow">Latest checkpoint</p>
        <h2 id="observer-frame-title">Selected frame</h2>
      </div>

      {frame === null ? (
        <div className="observer-frame-empty" role="status">
          <strong>No persisted public frame yet.</strong>
          <p>The replay has context, but no checkpoint is available to display yet.</p>
        </div>
      ) : (
        <div className="observer-frame-content">
          <p className="observer-frame-banner" role="status">
            <span className="status-dot" aria-hidden="true" />
            Public frame available
          </p>
          <dl className="observer-detail-list observer-frame-details">
            <div>
              <dt>Command</dt>
              <dd><code>{frame.command_sequence}</code></dd>
            </div>
            <div>
              <dt>Event</dt>
              <dd><code>{frame.event_sequence}</code></dd>
            </div>
            <div>
              <dt>Projection</dt>
              <dd>{frame.public_projection_schema_version}</dd>
            </div>
          </dl>

          <h3 className="observer-subheading">Public state</h3>
          {Object.keys(frame.public_state).length === 0 ? (
            <p className="observer-note">This checkpoint contains no public state fields.</p>
          ) : (
            <dl className="observer-state-list">
              {Object.entries(frame.public_state).map(([field, value]) => (
                <div key={field}>
                  <dt>{publicFieldLabel(field)}</dt>
                  <dd>{publicFieldValue(field, value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </section>
  )
}

function shouldRefreshReplay(lifecycleStatus: string): boolean {
  return REFRESHABLE_LIFECYCLE_STATUSES.has(lifecycleStatus)
}

function toReplayErrorMessage(caught: unknown): string {
  if (!(caught instanceof ApiError)) {
    return 'The replay could not be loaded. Check the connection and try again.'
  }

  if (caught.status === 404) {
    return caught.message
  }

  if (caught.status === 422) {
    return caught.message
  }

  if (caught.status === 503) {
    return 'The replay service is unavailable right now. Please try again.'
  }

  if (caught.status === 0) {
    return 'The replay could not be reached. Check the connection and try again.'
  }

  if (caught.code === 'invalid_response') {
    return 'The replay service returned an invalid response. Please try again.'
  }

  return caught.message
}

function lifecycleStatusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
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
    return 'Human seat'
  }

  if (controllerType === 'ai') {
    return 'AI seat'
  }

  return lifecycleStatusLabel(controllerType)
}

function publicFieldLabel(field: string): string {
  return field
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function publicFieldValue(field: string, value: unknown): string {
  if (field === 'active_seat_number' && typeof value === 'number') {
    return `Seat ${value}`
  }

  if ((field === 'phase' || field === 'turn_phase') && typeof value === 'string') {
    return lifecycleStatusLabel(value)
  }

  if (field === 'roads' || field === 'buildings') {
    return `${countStateEntries(value)} recorded`
  }

  if (field === 'public_scores') {
    return `${countStateEntries(value)} visible`
  }

  if (field === 'public_awards') {
    return `${countStateEntries(value)} assigned`
  }

  if (value === null) {
    return 'None'
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return 'Available'
}

function countStateEntries(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length
  }

  return isRecord(value) ? Object.keys(value).length : 0
}
