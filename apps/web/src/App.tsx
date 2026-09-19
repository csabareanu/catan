import { useState } from 'react'
import {
  BoardApiError,
  generateBoard,
} from './features/board/boardApi'
import type { BoardResponse } from './features/board/boardApi'
import { BoardSvg } from './features/board/BoardSvg'
import './App.css'

const EXAMPLE_SEED = '894177203164'

type GenerationState = 'idle' | 'loading' | 'success' | 'error'

function App() {
  const [seed, setSeed] = useState(EXAMPLE_SEED)
  const [generationState, setGenerationState] = useState<GenerationState>('idle')
  const [board, setBoard] = useState<BoardResponse | null>(null)
  const [error, setError] = useState<BoardApiError | null>(null)

  const handleGenerate = async () => {
    setGenerationState('loading')
    setBoard(null)
    setError(null)

    try {
      const generatedBoard = await generateBoard({
        seed,
        ruleset_key: 'base',
        map_key: 'standard',
      })

      setBoard(generatedBoard)
      setGenerationState('success')
    } catch (caught: unknown) {
      const boardError =
        caught instanceof BoardApiError
          ? caught
          : new BoardApiError(
              'The board could not be generated. Please try again.',
              'unknown_error',
              0,
            )

      setError(boardError)
      setGenerationState('error')
    }
  }

  const boardData = board?.data
  const boardStateLabel =
    generationState === 'loading'
      ? 'Generating'
      : generationState === 'success'
        ? 'Generated'
        : generationState === 'error'
          ? 'Unavailable'
          : 'Not generated'
  const requestWasRejected = error?.status === 422

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Catan board preview home">
          <span className="brand-mark" aria-hidden="true">
            <span>C</span>
          </span>
          <span className="brand-copy">
            <strong>Catan</strong>
            <small>Board lab</small>
          </span>
        </a>

        <div className="topbar-status">
          <span className="status-dot" aria-hidden="true" />
          <span>Anonymous preview</span>
        </div>
      </header>

      <main className="page-content">
        <section className="page-intro" aria-labelledby="page-title">
          <div className="intro-copy-group">
            <p className="eyebrow">Seeded board preview</p>
            <h1 id="page-title">
              Chart a board
              <br />
              from a seed.
            </h1>
            <p className="page-description">
              Set a number and get a reproducible Catan map. This preview is
              stateless: no game or history is saved.
            </p>
          </div>

          <div className="intro-index">
            <span className="index-caption">Standard map</span>
            <strong>19</strong>
            <span className="index-footnote">hexes · base game</span>
          </div>
        </section>

        <div className="preview-grid">
          <section className="setup-panel panel" aria-labelledby="setup-title">
            <div className="panel-topline">
              <span className="step-badge">
                <span>01</span>
                Configure
              </span>
              <span className="availability-badge">
                <span className="availability-dot" aria-hidden="true" />
                {generationState === 'loading'
                  ? 'Generating'
                  : boardData
                    ? 'Board ready'
                    : 'Seed input ready'}
              </span>
            </div>

            <h2 id="setup-title">Choose a seed</h2>
            <p className="panel-description">
              Use the same number again to reproduce the same board.
            </p>

            <div className="seed-field">
              <label htmlFor="board-seed">Board seed</label>
              <div className="seed-control">
                <span className="seed-symbol" aria-hidden="true">
                  #
                </span>
                <input
                  autoComplete="off"
                  autoCapitalize="off"
                  className="seed-input"
                  id="board-seed"
                  inputMode="numeric"
                  maxLength={19}
                  spellCheck={false}
                  value={seed}
                  aria-describedby="seed-help generation-note"
                  onChange={(event) => setSeed(event.target.value)}
                />
                <span className="seed-format">INT64</span>
              </div>
              <p className="field-help" id="seed-help">
                A non-negative whole number, up to 19 digits.
              </p>
            </div>

            <button
              className="generate-button"
              type="button"
              disabled={generationState === 'loading'}
              aria-busy={generationState === 'loading'}
              aria-describedby="generation-note"
              onClick={handleGenerate}
            >
              <span>
                {generationState === 'loading'
                  ? 'Generating preview'
                  : 'Generate preview'}
              </span>
              <span className="button-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
            <p className="generation-note" id="generation-note">
              {generationState === 'loading'
                ? 'Asking the board service for a canonical response.'
                : generationState === 'error'
                  ? error?.message
                  : generationState === 'success'
                    ? 'The response is ready for the board renderer.'
                    : 'Generate a stateless preview. Nothing is saved.'}
            </p>

            <div className="metadata-list">
              <div className="metadata-row">
                <div className="metadata-copy">
                  <span className="metadata-label">Ruleset</span>
                  <strong>Base game</strong>
                </div>
                <code className="version-chip">
                  {boardData
                    ? `${boardData.ruleset.key}@${boardData.ruleset.version}`
                    : 'base@1.0.0'}
                </code>
              </div>
              <div className="metadata-row">
                <div className="metadata-copy">
                  <span className="metadata-label">Map</span>
                  <strong>Standard · pointy-top</strong>
                </div>
                <code className="version-chip">
                  {boardData
                    ? `${boardData.map.key}@${boardData.map.version}`
                    : 'standard@1.0.0'}
                </code>
              </div>
            </div>

            <div className="privacy-note">
              <span className="privacy-mark" aria-hidden="true" />
              <p>Anonymous preview. No game record or history is created.</p>
            </div>
          </section>

          <section className="board-panel" aria-labelledby="board-title">
            <div className="board-panel-header">
              <div>
                <p className="eyebrow">Map canvas</p>
                <h2 id="board-title">Your board</h2>
              </div>
              <span className={`board-state board-state-${generationState}`}>
                <span className="board-state-dot" aria-hidden="true" />
                {boardStateLabel}
              </span>
            </div>

            {generationState === 'idle' && (
              <div className="empty-state" role="group" aria-labelledby="empty-title">
                <div className="empty-illustration" aria-hidden="true">
                  <span className="empty-orbit empty-orbit-outer" />
                  <span className="empty-orbit empty-orbit-inner" />
                  <svg className="empty-hex" viewBox="0 0 128 128">
                    <polygon points="64,8 112,36 112,92 64,120 16,92 16,36" />
                    <path d="M64 44v40M44 64h40" />
                    <circle cx="64" cy="64" r="3.5" />
                  </svg>
                  <span className="constellation-dot constellation-dot-one" />
                  <span className="constellation-dot constellation-dot-two" />
                </div>
                <p className="empty-kicker">Waiting for a seed</p>
                <h3 id="empty-title">Nothing charted yet.</h3>
                <p className="empty-copy">
                  Generate a board to receive terrain, number tokens, and ports
                  from the canonical service.
                </p>
                <span className="empty-state-note">
                  <span className="empty-state-dot" aria-hidden="true" />
                  No board data yet
                </span>
              </div>
            )}

            {generationState === 'loading' && (
              <div className="board-feedback" role="status" aria-live="polite">
                <span className="feedback-mark feedback-mark-loading" aria-hidden="true" />
                <p className="empty-kicker">Contacting board service</p>
                <h3>Generating your board.</h3>
                <p className="empty-copy">
                  The same seed will always produce the same response.
                </p>
              </div>
            )}

            {generationState === 'error' && error && (
              <div className="board-feedback board-feedback-error" role="alert">
                <span className="feedback-mark" aria-hidden="true">!</span>
                <p className="empty-kicker">
                  {requestWasRejected ? 'Request rejected' : 'Generation failed'}
                </p>
                <h3>{requestWasRejected ? 'Check your seed.' : 'Board unavailable.'}</h3>
                <p className="empty-copy">{error.message}</p>
                <span className="empty-state-note">
                  <span className="empty-state-dot" aria-hidden="true" />
                  {requestWasRejected ? 'Update the seed and try again' : 'Try the request again'}
                </span>
              </div>
            )}

            {generationState === 'success' && boardData && (
              <div className="board-result board-result-ready" role="status" aria-live="polite">
                <div className="board-result-intro">
                  <span className="feedback-mark feedback-mark-success" aria-hidden="true">
                    ✓
                  </span>
                  <div>
                    <p className="empty-kicker">Canonical response received</p>
                    <h3>Board ready to render.</h3>
                    <p className="empty-copy">
                      Seed <strong>{boardData.seed}</strong> produced a{' '}
                      {boardData.map.key} map with {boardData.hexes.length} hexes.
                    </p>
                  </div>
                </div>
                <BoardSvg board={boardData} />
                <div className="board-result-metadata">
                  <span>
                    Schema <strong>{boardData.board_schema_version}</strong>
                  </span>
                  <span>
                    Ruleset <strong>{boardData.ruleset.version}</strong>
                  </span>
                  <span>
                    Map <strong>{boardData.map.version}</strong>
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="page-footer">
          <span className="footer-brand">CATAN · BOARD LAB</span>
          <span>Base rules <i /> Standard map <i /> Stateless preview</span>
        </footer>
      </main>
    </div>
  )
}

export default App
