import { useState } from 'react'
import './App.css'

const EXAMPLE_SEED = '894177203164'

function App() {
  const [seed, setSeed] = useState(EXAMPLE_SEED)

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
                Seed input ready
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
              disabled
              aria-describedby="generation-note"
            >
              <span>Generate preview</span>
              <span className="button-arrow" aria-hidden="true">
                ↗
              </span>
            </button>
            <p className="generation-note" id="generation-note">
              Generation connects in a later step. The seed field is ready, but
              no board is generated yet.
            </p>

            <div className="metadata-list">
              <div className="metadata-row">
                <div className="metadata-copy">
                  <span className="metadata-label">Ruleset</span>
                  <strong>Base game</strong>
                </div>
                <code className="version-chip">base@1.0.0</code>
              </div>
              <div className="metadata-row">
                <div className="metadata-copy">
                  <span className="metadata-label">Map</span>
                  <strong>Standard · pointy-top</strong>
                </div>
                <code className="version-chip">standard@1.0.0</code>
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
              <span className="board-state">
                <span className="board-state-dot" aria-hidden="true" />
                Not generated
              </span>
            </div>

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
                When board generation is connected, terrain, number tokens, and
                ports will appear here.
              </p>
              <span className="empty-state-note">
                <span className="empty-state-dot" aria-hidden="true" />
                No board data yet
              </span>
            </div>
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
