import type { GameLifecycleStatus } from './gameApi'
import { useGameRun } from './useGameRun'

type GameRunControlsProps = {
  gameId: number
  lifecycleStatus: GameLifecycleStatus
  token: string
  disabled: boolean
  onStatusChange: (gameId: number, status: GameLifecycleStatus) => void
  onUnauthorized: () => void
}

const STATUS_MESSAGES: Record<GameLifecycleStatus, string> = {
  created: 'Ready to start the run.',
  queued: 'The run is queued. Status updates automatically.',
  running: 'The game is running. Status updates automatically.',
  awaiting_human_input: 'The game is waiting for human input.',
  completed: 'The run has completed.',
  failed: 'The run failed. You can try starting it again.',
}

export function GameRunControls(props: GameRunControlsProps) {
  const { lifecycleStatus, disabled } = props
  const { pendingAction, failure, startRun, refreshStatus } = useGameRun(props)
  const canStart = lifecycleStatus === 'created' || lifecycleStatus === 'failed'

  return (
    <div className="game-run-controls">
      <p className="game-run-message" role="status">{STATUS_MESSAGES[lifecycleStatus]}</p>

      {failure ? (
        <div className="game-run-error" role="alert">
          <p>{failure.error.status === 0
            ? 'Check the connection and refresh the status before trying again.'
            : failure.error.message}</p>
          {failure.error.status === 404 ? (
            <a className="access-secondary-action" href="/games">Reload library</a>
          ) : (
            <>
              {failure.action === 'start' && (
                <p>Refresh the status before attempting another start.</p>
              )}
              <button
                className="access-secondary-action"
                type="button"
                onClick={() => void refreshStatus()}
                disabled={disabled || pendingAction !== null}
                aria-busy={pendingAction === 'refresh'}
              >
                {pendingAction === 'refresh' ? 'Refreshing status...' : 'Refresh status'}
              </button>
            </>
          )}
        </div>
      ) : canStart && (
        <button
          className="access-primary-action"
          type="button"
          onClick={() => void startRun()}
          disabled={disabled || pendingAction !== null}
          aria-busy={pendingAction === 'start'}
        >
          {pendingAction === 'start' ? 'Starting run...' : lifecycleStatus === 'failed' ? 'Retry run' : 'Start run'}
        </button>
      )}
    </div>
  )
}
