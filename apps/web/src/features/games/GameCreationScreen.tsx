import { useState, type FormEvent } from 'react'
import { ApiError, type ApiErrorFields } from '../../lib/apiClient'
import { navigateTo } from '../../lib/navigation'
import { AccessShell } from '../auth/AuthShell'
import type { AuthenticatedUser } from '../auth/authApi'
import { createGame, type CreateGameInput } from './gameApi'

type GameCreationScreenProps = {
  user: AuthenticatedUser
  token: string
  onUnauthorized: () => void
}

type CreationError = {
  message: string
  fields: ApiErrorFields
}

const DEFAULT_SEED = '894177203164'

export function GameCreationScreen({
  user,
  token,
  onUnauthorized,
}: GameCreationScreenProps) {
  const [seed, setSeed] = useState(DEFAULT_SEED)
  const [aiCount, setAiCount] = useState<CreateGameInput['ai_count']>(2)
  const [creationError, setCreationError] = useState<CreationError | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setCreationError(null)

    try {
      await createGame(
        token,
        {
          seed,
          ruleset_key: 'base',
          map_key: 'standard',
          ai_count: aiCount,
        },
        onUnauthorized,
      )
      navigateTo('/games')
    } catch (caught: unknown) {
      setCreationError(toCreationError(caught))
    } finally {
      setIsSubmitting(false)
    }
  }

  const fieldError = (field: string): string | undefined => {
    return creationError?.fields[field]?.[0]
  }

  return (
    <AccessShell
      topbarContent={
        <a className="topbar-status topbar-account-link" href="/games">
          <span className="status-dot" aria-hidden="true" />
          <span>
            Signed in as <strong>{user.name}</strong>
          </span>
        </a>
      }
    >
      <p className="eyebrow">Game setup</p>
      <h1>Create a game.</h1>
      <p className="access-description">
        Choose a reproducible seed and two or three AI opponents. The game will
        appear in your private library after it is created.
      </p>

      <form className="access-form" onSubmit={handleSubmit} noValidate>
        {creationError && (
          <p className="access-error" role="alert">
            {creationError.message}
          </p>
        )}

        <label className="access-field">
          <span>Game seed</span>
          <input
            name="seed"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            aria-invalid={fieldError('seed') !== undefined}
            aria-describedby={fieldError('seed') ? 'game-seed-error' : undefined}
            required
          />
          {fieldError('seed') && (
            <span className="access-field-error" id="game-seed-error">
              {fieldError('seed')}
            </span>
          )}
          <small className="field-help">Use a non-negative whole number.</small>
        </label>

        <div className="creation-option-grid">
          <label className="access-field">
            <span>Ruleset</span>
            <select value="base" disabled aria-label="Ruleset">
              <option value="base">Base game</option>
            </select>
          </label>

          <label className="access-field">
            <span>Map</span>
            <select value="standard" disabled aria-label="Map">
              <option value="standard">Standard map</option>
            </select>
          </label>
        </div>

        <label className="access-field">
          <span>AI opponents</span>
          <select
            name="ai_count"
            value={aiCount}
            onChange={(event) => setAiCount(event.target.value === '3' ? 3 : 2)}
            aria-invalid={fieldError('ai_count') !== undefined}
            aria-describedby={fieldError('ai_count') ? 'ai-count-error' : undefined}
          >
            <option value={2}>2 AI opponents</option>
            <option value={3}>3 AI opponents</option>
          </select>
          {fieldError('ai_count') && (
            <span className="access-field-error" id="ai-count-error">
              {fieldError('ai_count')}
            </span>
          )}
        </label>

        <button className="access-primary-action" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating game…' : 'Create game'}
        </button>
      </form>

      <div className="access-links">
        <a href="/games">Return to your games</a>
        <a href="/">Return to board preview</a>
      </div>
    </AccessShell>
  )
}

function toCreationError(caught: unknown): CreationError {
  if (caught instanceof ApiError) {
    if (caught.status === 0) {
      return {
        message: 'The game service could not be reached. Check the connection and try again.',
        fields: {},
      }
    }

    if (caught.status === 503) {
      return {
        message: 'The game service is unavailable right now. Please try again.',
        fields: {},
      }
    }

    return {
      message: caught.message,
      fields: caught.fields ?? {},
    }
  }

  return {
    message: 'The game could not be created. Please try again.',
    fields: {},
  }
}
