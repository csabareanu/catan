import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../lib/apiClient'
import { AccessShell } from '../auth/AuthShell'
import type { AuthenticatedUser } from '../auth/authApi'
import {
  BoardApiError,
  generateBoard,
  type BoardResponse,
} from '../board/boardApi'
import { BoardSvg } from '../board/BoardSvg'
import { getGame, type CreateGameInput, type GameResource } from './gameApi'
import { readGameStartIntent } from './gameStartIntent'
import { useGameStart } from './useGameStart'
import { navigateTo } from '../../lib/navigation'

type GameCreationScreenProps = {
  isLoggingOut: boolean
  user: AuthenticatedUser
  token: string
  onLogout: () => void | Promise<void>
  onUnauthorized: () => void
  gameID?: number
}

type GenerationState = 'loading' | 'success' | 'error'

export function GameCreationScreen({
  isLoggingOut,
  onLogout,
  onUnauthorized,
  token,
  user,
  gameID,
}: GameCreationScreenProps) {
  const isSavedSetup = gameID !== undefined
  const [restoredIntent] = useState(() => (
    isSavedSetup ? null : readGameStartIntent(user.id)
  ))
  const [seed, setSeed] = useState(restoredIntent?.seed ?? createFreshSeed)
  const [aiCount, setAiCount] = useState<CreateGameInput['ai_count']>(restoredIntent?.aiCount ?? 2)
  const [advancedOptionsExpanded, setAdvancedOptionsExpanded] = useState(false)
  const [generationState, setGenerationState] = useState<GenerationState>('loading')
  const [board, setBoard] = useState<BoardResponse | null>(null)
  const [savedGame, setSavedGame] = useState<GameResource | null>(null)
  const [savedSetupError, setSavedSetupError] = useState<string | null>(null)
  const [setupReloadKey, setSetupReloadKey] = useState(0)
  const [generationError, setGenerationError] = useState<BoardApiError | null>(null)
  const generationRequestRef = useRef(0)
  const initialSeedRef = useRef(seed)
  const initialPreviewRequestedRef = useRef(false)
  const isMountedRef = useRef(true)

  const requestPreview = useCallback(async (nextSeed: string) => {
    const requestID = generationRequestRef.current + 1
    generationRequestRef.current = requestID
    setGenerationState('loading')
    setBoard(null)
    setGenerationError(null)

    try {
      const generatedBoard = await generateBoard({
        seed: nextSeed,
        ruleset_key: 'base',
        map_key: 'standard',
      })

      if (!isMountedRef.current || requestID !== generationRequestRef.current) {
        return
      }

      setBoard(generatedBoard)
      setGenerationState('success')
    } catch (caught: unknown) {
      if (!isMountedRef.current || requestID !== generationRequestRef.current) {
        return
      }

      setGenerationError(toBoardError(caught))
      setGenerationState('error')
    }
  }, [])

  useEffect(() => {
    if (isSavedSetup) {
      return
    }

    isMountedRef.current = true

    if (initialPreviewRequestedRef.current) {
      return () => {
        isMountedRef.current = false
      }
    }

    initialPreviewRequestedRef.current = true
    void requestPreview(initialSeedRef.current)

    return () => {
      isMountedRef.current = false
    }
  }, [isSavedSetup, requestPreview])

  useEffect(() => {
    if (!isSavedSetup || gameID === undefined) {
      return
    }

    isMountedRef.current = true
    const controller = new AbortController()

    getGame(token, gameID, onUnauthorized, controller.signal)
      .then((response) => {
        if (!isMountedRef.current || controller.signal.aborted) {
          return
        }

        if (isObserverReady(response.data.lifecycle_status)) {
          navigateTo(`/games/${response.data.id}/observe`)
          return
        }

        setSavedGame(response.data)
        setSeed(response.data.seed)
        setAiCount(readAiCount(response.data))
        setBoard({ data: response.data.board })
        setGenerationState('success')
        setSavedSetupError(null)
      })
      .catch((caught: unknown) => {
        if (!isMountedRef.current || controller.signal.aborted) {
          return
        }

        setSavedSetupError(toSavedSetupError(caught))
        setGenerationState('error')
      })

    return () => {
      isMountedRef.current = false
      controller.abort()
    }
  }, [gameID, isSavedSetup, onUnauthorized, setupReloadKey, token])

  const boardData = board?.data
  const previewIsCurrent = isSavedSetup
    ? savedGame !== null && boardData?.seed === savedGame.seed
    : boardData?.seed === seed
  const gameStart = useGameStart({
    aiCount,
    existingGame: savedGame,
    existingGameID: gameID,
    onUnauthorized,
    ownerId: user.id,
    previewBoard: boardData ?? null,
    previewIsCurrent,
    seed,
    token,
  })
  const seedError = generationError?.fields?.seed?.[0]
  const collapsedSeedError = !isSavedSetup && !advancedOptionsExpanded ? seedError : undefined
  const boardStateLabel =
    gameStart.phase === 'mismatch'
      ? 'Review saved board'
      : generationState === 'loading'
      ? 'Generating'
      : generationState === 'error'
        ? 'Unavailable'
        : previewIsCurrent
          ? 'Board ready'
          : 'Update needed'
  const boardStateClass =
    gameStart.phase === 'mismatch'
      ? 'warning'
      : generationState === 'success' && !previewIsCurrent
        ? 'warning'
        : generationState
  const displayedBoard = gameStart.authoritativeBoard ?? boardData

  const handleGenerateAnother = () => {
    const nextSeed = createFreshSeed()
    setSeed(nextSeed)
    void requestPreview(nextSeed)
  }

  const handleApplySeed = () => {
    void requestPreview(seed)
  }

  return (
    <AccessShell
      authenticatedUser={user}
      cardClassName="game-creation-card"
      contentClassName="game-creation-content"
      isLoggingOut={isLoggingOut}
      onLogout={onLogout}
    >
      <section className="game-creation-intro" aria-labelledby="game-creation-title">
        <p className="eyebrow">{isSavedSetup ? 'Saved setup' : 'New game'}</p>
        <h1 id="game-creation-title">{isSavedSetup ? 'Review your game.' : 'Create a game.'}</h1>
        <p className="access-description">
          {isSavedSetup
            ? 'This board is saved and ready to start. Its configuration is locked.'
            : 'Choose your opponents and review the generated board before saving. Previewing a board does not create a game.'}
        </p>
        {isSavedSetup && (
          <p className="game-setup-saved-notice" role="status">
            {isSavedNotice()
              ? 'Setup saved. Start it when you are ready.'
              : 'Saved setup. Start this board when you are ready.'}
          </p>
        )}
      </section>

      <div className="preview-grid game-creation-grid">
        <section className="setup-panel panel game-creation-setup" aria-labelledby="setup-title">
          <div className="panel-topline">
            <span className="step-badge">
              <span>01</span>
              Setup
            </span>
            <span className="availability-badge">
              <span className="availability-dot" aria-hidden="true" />
              {generationState === 'loading'
                ? 'Generating'
                : previewIsCurrent
                  ? 'Board ready'
                  : 'Update preview'}
            </span>
          </div>

          <h2 id="setup-title">{isSavedSetup ? 'Game setup' : 'Choose opponents'}</h2>
          <p className="panel-description">
            {isSavedSetup
              ? 'The saved opponents and board cannot be changed here.'
              : 'Set the AI seats, then inspect the board before you save anything.'}
          </p>

          <label className="access-field" htmlFor="ai-opponents">
            <span>AI opponents</span>
            <select
              id="ai-opponents"
              name="ai_count"
              value={aiCount}
              disabled={gameStart.isLocked || isSavedSetup}
              onChange={(event) => setAiCount(event.target.value === '3' ? 3 : 2)}
            >
              <option value={2}>2 AI opponents</option>
              <option value={3}>3 AI opponents</option>
            </select>
          </label>

          <div className="creation-format-card" aria-label="Game format">
            <div>
              <span className="creation-format-label">Game format</span>
              <strong>Base game · Standard map</strong>
            </div>
            <small>Current game format</small>
          </div>

          {!isSavedSetup && (
            <>
              <details
                className={`creation-advanced${seedError ? ' creation-advanced-has-error' : ''}`}
                onToggle={(event) => setAdvancedOptionsExpanded(event.currentTarget.open)}
              >
                <summary>
                  Advanced options
                  {seedError && (
                    <span className="creation-advanced-error-indicator">
                      Seed needs attention
                    </span>
                  )}
                </summary>
                <div className="creation-advanced-fields">
                  <label className="access-field" htmlFor="game-board-seed">
                    <span>Reproducible board seed</span>
                    <input
                      id="game-board-seed"
                      name="seed"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      autoCapitalize="off"
                      maxLength={19}
                      spellCheck={false}
                      value={seed}
                      disabled={gameStart.isLocked}
                      aria-invalid={seedError !== undefined}
                      aria-describedby={seedError ? 'game-board-seed-error' : 'game-board-seed-help'}
                      onChange={(event) => setSeed(event.target.value)}
                    />
                    {seedError && (
                      <span className="access-field-error" id="game-board-seed-error">
                        {seedError}
                      </span>
                    )}
                    <small className="field-help" id="game-board-seed-help">
                      Apply a non-negative whole number to refresh the preview.
                    </small>
                  </label>

                  <button
                    className="access-secondary-action"
                    type="button"
                    disabled={generationState === 'loading' || gameStart.isLocked}
                    onClick={handleApplySeed}
                  >
                    {generationState === 'loading' ? 'Generating preview' : 'Apply seed'}
                  </button>
                </div>
              </details>

              <button
                className="access-secondary-action game-creation-regenerate"
                type="button"
                disabled={generationState === 'loading' || gameStart.isLocked}
                aria-busy={generationState === 'loading'}
                onClick={handleGenerateAnother}
              >
                {generationState === 'loading' ? 'Generating preview' : 'Generate another board'}
              </button>
            </>
          )}

          <p
            className={`generation-note game-creation-generation-note${collapsedSeedError ? ' game-creation-generation-note-error' : ''}`}
            role={collapsedSeedError ? 'alert' : 'status'}
          >
            {collapsedSeedError ? (
              <>
                <strong>Seed needs attention · Advanced options</strong>
                <span>{collapsedSeedError}</span>
              </>
            ) : generationState === 'loading'
              ? isSavedSetup
                ? 'Loading the saved board.'
                : 'Preparing a reproducible board.'
              : generationState === 'error'
                ? savedSetupError ?? generationError?.message ?? 'Board generation failed.'
                : previewIsCurrent
                  ? isSavedSetup ? 'Your saved board is ready to inspect.' : 'Your board is ready to inspect.'
                  : 'Apply the seed to update the board preview.'}
          </p>

          <div className="game-start-actions">
            <button
              className="access-primary-action game-start-button"
              type="button"
              disabled={!gameStart.canStart || isLoggingOut}
              aria-busy={gameStart.isBusy}
              onClick={gameStart.start}
            >
              {gameStart.startLabel}
            </button>

            {!isSavedSetup && (
              <button
                className="access-secondary-action game-save-button"
                type="button"
                disabled={!gameStart.canSaveSetup || isLoggingOut}
                aria-busy={gameStart.isBusy}
                onClick={gameStart.saveSetup}
              >
                {gameStart.saveLabel}
              </button>
            )}

            {gameStart.statusMessage && (
              <p className="game-start-status" role="status">
                {gameStart.statusMessage}
              </p>
            )}

            {gameStart.errorMessage && (
              <div className="game-start-feedback" role="alert">
                <p>{gameStart.errorMessage}</p>
                {gameStart.recoveryAction === 'refresh' && (
                  <button
                    className="access-secondary-action"
                    type="button"
                    disabled={gameStart.isBusy}
                    onClick={gameStart.refreshStatus}
                  >
                    {gameStart.isBusy ? 'Refreshing status...' : 'Refresh status'}
                  </button>
                )}
              </div>
            )}

            {gameStart.phase === 'mismatch' && (
              <div className="game-start-feedback game-start-feedback-warning" role="alert">
                <p>The saved board differs from the preview. Review the board before starting.</p>
                <button
                  className="access-primary-action"
                  type="button"
                  disabled={gameStart.isBusy}
                  onClick={gameStart.confirmBoard}
                >
                  Use saved board and continue
                </button>
              </div>
            )}
          </div>

          <div className="privacy-note">
            <span className="privacy-mark" aria-hidden="true" />
            <p>
              {isSavedSetup
                ? 'Saved setup · Configuration is read-only'
                : gameStart.intent === null
                  ? 'Preview only. No game or history is saved.'
                  : `${gameStart.intent.operation === 'save' ? 'Save' : 'Start'} request is preserved for a safe retry.`}
            </p>
          </div>
        </section>

        <section className="board-panel game-creation-board-panel" aria-labelledby="board-title">
          <div className="board-panel-header">
            <div>
              <p className="eyebrow">{isSavedSetup ? 'Saved board' : 'Board preview'}</p>
              <h2 id="board-title">{isSavedSetup ? 'Review the saved board' : 'Review your board'}</h2>
            </div>
            <span className={`board-state board-state-${boardStateClass}`}>
              <span className="board-state-dot" aria-hidden="true" />
              {boardStateLabel}
            </span>
          </div>

          {generationState === 'loading' && (
            <div className="board-feedback" role="status" aria-live="polite">
              <span className="feedback-mark feedback-mark-loading" aria-hidden="true" />
              <p className="empty-kicker">{isSavedSetup ? 'Loading saved board' : 'Preparing your board'}</p>
              <h3>{isSavedSetup ? 'Loading your saved board.' : 'Generating your board.'}</h3>
              <p className="empty-copy">
                {isSavedSetup
                  ? 'The saved configuration is being loaded from your game.'
                  : 'The same seed will always create the same board.'}
              </p>
            </div>
          )}

          {generationState === 'error' && isSavedSetup && savedSetupError && (
            <div className="board-feedback board-feedback-error" role="alert">
              <span className="feedback-mark" aria-hidden="true">!</span>
              <p className="empty-kicker">Saved setup unavailable</p>
              <h3>We could not load this game.</h3>
              <p className="empty-copy">{savedSetupError}</p>
              <div className="game-setup-error-actions">
                <button
                  className="access-secondary-action"
                  type="button"
                  onClick={() => {
                    setSavedSetupError(null)
                    setGenerationState('loading')
                    setSetupReloadKey((currentKey) => currentKey + 1)
                  }}
                >
                  Try again
                </button>
                <a className="access-secondary-action" href="/games">Return to your games</a>
              </div>
            </div>
          )}

          {generationState === 'error' && !isSavedSetup && generationError && (
            <div className="board-feedback board-feedback-error" role="alert">
              <span className="feedback-mark" aria-hidden="true">
                !
              </span>
              <p className="empty-kicker">
                {generationError.status === 422 ? 'Request rejected' : 'Generation failed'}
              </p>
              <h3>
                {generationError.status === 422 ? 'Check your seed.' : 'Board unavailable.'}
              </h3>
              <p className="empty-copy">{generationError.message}</p>
              <button
                className="access-secondary-action"
                type="button"
                onClick={handleApplySeed}
              >
                Try again
              </button>
            </div>
          )}

          {generationState === 'success' && displayedBoard && (
            <div className="board-result board-result-ready" role="status" aria-live="polite">
              {!previewIsCurrent && gameStart.phase !== 'mismatch' && (
                <p className="preview-stale-note" role="alert">
                  The seed changed. Apply it to refresh this board before continuing.
                </p>
              )}
              <div className="board-result-intro">
                <span className="feedback-mark feedback-mark-success" aria-hidden="true">
                  ✓
                </span>
                <div>
                  <p className="empty-kicker">Board generated</p>
                  <h3>
                    {gameStart.phase === 'mismatch'
                      ? 'Review the saved board.'
                      : previewIsCurrent
                        ? 'Your board is ready.'
                        : 'Preview needs an update.'}
                  </h3>
                  <p className="empty-copy">
                    Seed <strong>{displayedBoard.seed}</strong> created a Catan board with{' '}
                    {displayedBoard.hexes.length} terrain tiles.
                  </p>
                </div>
              </div>
              <BoardSvg board={displayedBoard} />
            </div>
          )}
        </section>
      </div>

      <div className="access-links game-creation-links">
        <a href="/games">Return to your games</a>
        <a href="/">Return to board preview</a>
      </div>

      <footer className="page-footer">
        <span className="footer-brand">CATAN · BOARD LAB</span>
        <span>
          {isSavedSetup
            ? 'Saved setup · Ready to start'
            : gameStart.intent === null
              ? 'Temporary setup · Nothing is saved'
              : `${gameStart.intent.operation === 'save' ? 'Save' : 'Start'} request preserved`}
        </span>
      </footer>
    </AccessShell>
  )
}

function createFreshSeed(): string {
  const values = new Uint32Array(2)
  globalThis.crypto.getRandomValues(values)

  return ((BigInt(values[0] & 0x7fffffff) << 32n) | BigInt(values[1])).toString()
}

function toBoardError(caught: unknown): BoardApiError {
  if (caught instanceof BoardApiError) {
    return caught
  }

  return new BoardApiError(
    'The board could not be generated. Please try again.',
    'unknown_error',
    0,
  )
}

function isObserverReady(status: GameResource['lifecycle_status']): boolean {
  return status === 'queued' ||
    status === 'running' ||
    status === 'awaiting human input' ||
    status === 'awaiting_human_input' ||
    status === 'completed'
}

function readAiCount(game: GameResource): CreateGameInput['ai_count'] {
  return game.configuration.ai_count === 3 ? 3 : 2
}

function isSavedNotice(): boolean {
  return new URLSearchParams(window.location.search).get('saved') === '1'
}

function toSavedSetupError(caught: unknown): string {
  if (!(caught instanceof ApiError)) {
    return 'The saved setup could not be loaded. Please try again.'
  }

  if (caught.status === 404) {
    return 'This game could not be found. It may have been deleted.'
  }

  if (caught.status === 0) {
    return 'The saved setup could not be reached. Check the connection and try again.'
  }

  return caught.message
}
