import { useEffect, useId, useRef } from 'react'
import { useSettings } from './useSettings'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const { boardAppearance, changeBoardAppearance } = useSettings()

  useEffect(() => {
    const dialog = dialogRef.current

    if (dialog === null) {
      return
    }

    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'

    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow

      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus()
      }
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) {
          return
        }

        const bounds = event.currentTarget.getBoundingClientRect()

        if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) {
          onClose()
        }
      }}
    >
      <div className="settings-dialog-heading">
        <div>
          <h2 id={`${id}-title`}>Settings</h2>
          <p id={`${id}-description`}>Your choices apply to every board in this browser.</p>
        </div>
        <button
          className="settings-dialog-close"
          type="button"
          aria-label="Close settings"
          autoFocus
          onClick={onClose}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m6 6 12 12M6 18 18 6" />
          </svg>
        </button>
      </div>

      <fieldset className="settings-section">
        <legend>Board style</legend>
        <p>Choose the look you prefer.</p>
        <div className="settings-style-options">
          <label className={`settings-style-option${boardAppearance === 'classic' ? ' settings-style-selected' : ''}`}>
            <span className="settings-style-icon" aria-hidden="true">
              <svg viewBox="0 0 40 40">
                <path d="m13 3 10 6v12l-10 6-10-6V9l10-6Z" />
                <path d="m23 13 10 6v12l-10 6-10-6V19l10-6Z" />
              </svg>
            </span>
            <span className="settings-style-copy">
              <strong id={`${id}-classic-title`}>Classic</strong>
              <small id={`${id}-classic-description`}>Clear colors and resource symbols.</small>
            </span>
            <input
              type="radio"
              name={`${id}-board-style`}
              value="classic"
              checked={boardAppearance === 'classic'}
              aria-labelledby={`${id}-classic-title`}
              aria-describedby={`${id}-classic-description`}
              onChange={() => changeBoardAppearance('classic')}
            />
          </label>
          <label className={`settings-style-option${boardAppearance === 'illustrated' ? ' settings-style-selected' : ''}`}>
            <span className="settings-style-icon" aria-hidden="true">
              <svg viewBox="0 0 40 40">
                <path d="m20 3 16 9v17l-16 9L4 29V12l16-9Z" />
                <path d="m6 28 10-13 8 10 4-6 6 9" />
                <circle cx="27" cy="13" r="2" />
              </svg>
            </span>
            <span className="settings-style-copy">
              <strong id={`${id}-illustrated-title`}>Illustrated</strong>
              <small id={`${id}-illustrated-description`}>Painted terrain and a coastal setting.</small>
            </span>
            <input
              type="radio"
              name={`${id}-board-style`}
              value="illustrated"
              checked={boardAppearance === 'illustrated'}
              aria-labelledby={`${id}-illustrated-title`}
              aria-describedby={`${id}-illustrated-description`}
              onChange={() => changeBoardAppearance('illustrated')}
            />
          </label>
        </div>
      </fieldset>

      <div className="settings-dialog-footer">
        <p>Changes apply immediately.</p>
        <button className="access-primary-action" type="button" onClick={onClose}>Done</button>
      </div>
    </dialog>
  )
}
