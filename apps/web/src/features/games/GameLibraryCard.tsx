import { GameRunControls } from './GameRunControls'
import type { GameLifecycleStatus, GameSummary } from './gameApi'

type GameLibraryCardProps = {
  game: GameSummary
  token: string
  isLoggingOut: boolean
  isDeleting: boolean
  isAnyGameDeleting: boolean
  isLoadingMore: boolean
  onDeleteRequest: (game: GameSummary, trigger: HTMLButtonElement) => void
  onStatusChange: (gameId: number, status: GameLifecycleStatus) => void
  onUnauthorized: () => void
}

export function GameLibraryCard({
  game,
  token,
  isLoggingOut,
  isDeleting,
  isAnyGameDeleting,
  isLoadingMore,
  onDeleteRequest,
  onStatusChange,
  onUnauthorized,
}: GameLibraryCardProps) {
  const statusTone = lifecycleStatusTone(game.lifecycle_status)

  return (
    <li
      className={`library-item library-item-${statusTone}`}
      data-lifecycle-status={game.lifecycle_status}
    >
      <a
        aria-label={gameDestinationLabel(game)}
        className="library-item-link"
        href={gameDestination(game)}
      >
        <span className={lifecycleStatusClassName(game.lifecycle_status)}>
          <LibraryStatusIcon status={game.lifecycle_status} />
          {lifecycleStatusLabel(game.lifecycle_status)}
        </span>

        <div className="library-item-body">
          <h3>Game {game.id}</h3>
          <p className="library-item-description">
            <svg className="library-icon" aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="9" cy="7" r="3" />
              <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2" />
            </svg>
            {gameSummaryDescription(game)}
          </p>
          <p className="library-item-format">
            {rulesetLabel(game.ruleset.key)}
            <span aria-hidden="true"> · </span>
            <span>{mapLabel(game.map.key)}</span>
          </p>
        </div>

        <div className="library-item-footer">
          <span className="library-item-date">
            Created{' '}
            <time dateTime={game.created_at ?? undefined}>
              {formatGameDate(game.created_at)}
            </time>
          </span>
          <span className="library-item-destination" aria-hidden="true">
            {gameDestinationCue(game.lifecycle_status)}
            <svg className="library-icon" viewBox="0 0 24 24">
              <path d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
          </span>
        </div>
      </a>

      <div className="library-item-actions">
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
            <div className="library-menu-details">
              <span>Board seed</span>
              <code>{game.seed}</code>
            </div>
            {(game.lifecycle_status === 'failed' || isRunActive(game.lifecycle_status)) && (
              <GameRunControls
                compact
                gameId={game.id}
                lifecycleStatus={game.lifecycle_status}
                token={token}
                disabled={isLoggingOut || isDeleting}
                onStatusChange={onStatusChange}
                onUnauthorized={onUnauthorized}
              />
            )}
            <button
              className="menu-item menu-item-danger"
              disabled={isAnyGameDeleting || isLoadingMore}
              type="button"
              onClick={(event) => onDeleteRequest(game, event.currentTarget)}
            >
              <svg className="menu-item-icon" aria-hidden="true" viewBox="0 0 24 24">
                <path d="M4 6h16m-13 0 1 15h8l1-15M9 6V3h6v3m-5 4v7m4-7v7" />
              </svg>
              {isDeleting ? 'Deleting game' : `Delete game ${game.id}`}
            </button>
          </div>
        </details>
      </div>
    </li>
  )
}

function LibraryStatusIcon({ status }: { status: GameLifecycleStatus }) {
  const tone = lifecycleStatusTone(status)

  return (
    <span className="library-status-symbol" aria-hidden="true">
      <svg className="library-icon" viewBox="0 0 24 24">
        {tone === 'saved' ? (
          <path d="M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1Z" />
        ) : tone === 'failed' ? (
          <path d="m12 3 10 18H2L12 3Zm0 5v6m0 3v.1" />
        ) : (
          <>
            <circle cx="12" cy="12" r="9" />
            {tone === 'completed'
              ? <path d="m8 12 3 3 5-6" />
              : <path d="m10 8 6 4-6 4V8Z" />}
          </>
        )}
      </svg>
    </span>
  )
}

function gameSummaryDescription(game: GameSummary): string {
  return game.mode === 'human_vs_ai'
    ? `You + ${aiOpponentCount(game)} AI opponents`
    : `${game.seat_count} AI players`
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

function gameDestination(game: GameSummary): string {
  return game.lifecycle_status === 'created' || game.lifecycle_status === 'failed'
    ? `/games/${game.id}/setup`
    : `/games/${game.id}/observe`
}

function gameDestinationLabel(game: GameSummary): string {
  if (game.lifecycle_status === 'created' || game.lifecycle_status === 'failed') {
    return `Open setup for Game ${game.id}`
  }

  if (game.lifecycle_status === 'completed') {
    return `View history for Game ${game.id}`
  }

  return `Open game for Game ${game.id}`
}

function gameDestinationCue(status: GameLifecycleStatus): string {
  if (status === 'created') {
    return 'Review setup'
  }

  if (status === 'failed') {
    return 'Review game'
  }

  return status === 'completed' ? 'View history' : 'Open board'
}

function lifecycleStatusLabel(status: GameLifecycleStatus): string {
  if (status === 'created') {
    return 'Saved setup'
  }

  if (status === 'failed') {
    return 'Needs attention'
  }

  if (status === 'completed') {
    return 'Finished'
  }

  return 'In progress'
}

function lifecycleStatusTone(status: GameLifecycleStatus): string {
  if (status === 'created') {
    return 'saved'
  }

  if (status === 'failed') {
    return 'failed'
  }

  if (status === 'completed') {
    return 'completed'
  }

  return 'active'
}

function lifecycleStatusClassName(status: GameLifecycleStatus): string {
  return `library-status library-status-${lifecycleStatusTone(status)} library-status-${status.replace(/ /g, '-')}`
}

function isRunActive(status: GameLifecycleStatus): boolean {
  return status === 'queued' ||
    status === 'running' ||
    status === 'awaiting human input' ||
    status === 'awaiting_human_input'
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
