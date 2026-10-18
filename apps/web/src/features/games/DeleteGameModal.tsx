import { useEffect, useRef } from 'react'
import type { GameSummary } from './gameApi'

type DeleteGameModalProps = {
  game: GameSummary
  isDeleting: boolean
  errorMessage: string | null
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteGameModal({
  game,
  isDeleting,
  errorMessage,
  onCancel,
  onConfirm,
}: DeleteGameModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const hasFocusedInitialControl = useRef(false)

  useEffect(() => {
    if (!hasFocusedInitialControl.current) {
      cancelButtonRef.current?.focus()
      hasFocusedInitialControl.current = true
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()

        if (!isDeleting) {
          onCancel()
        }

        return
      }

      if (event.key !== 'Tab' || dialogRef.current === null) {
        return
      }

      const focusableElements = getModalFocusableElements(dialogRef.current)

      if (focusableElements.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }

      const firstFocusableElement = focusableElements[0]
      const lastFocusableElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (!dialogRef.current.contains(activeElement)) {
        event.preventDefault()
        firstFocusableElement.focus()
      } else if (event.shiftKey && activeElement === firstFocusableElement) {
        event.preventDefault()
        lastFocusableElement.focus()
      } else if (!event.shiftKey && activeElement === lastFocusableElement) {
        event.preventDefault()
        firstFocusableElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDeleting, onCancel])

  useEffect(() => {
    if (isDeleting) {
      dialogRef.current?.focus()
    }
  }, [isDeleting])

  useEffect(() => {
    if (errorMessage) {
      errorRef.current?.focus()
    }
  }, [errorMessage])

  return (
    <div
      className="delete-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isDeleting) {
          onCancel()
        }
      }}
    >
      <div
        ref={dialogRef}
        aria-busy={isDeleting}
        aria-describedby="delete-game-description"
        aria-labelledby="delete-game-title"
        aria-modal="true"
        className="delete-modal"
        role="dialog"
        tabIndex={-1}
      >
        <div className="delete-modal-heading">
          <span className="delete-modal-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 6h16m-13 0 1 15h8l1-15M9 6V3h6v3m-5 4v7m4-7v7" />
            </svg>
          </span>
          <div>
            <p className="delete-modal-eyebrow">Permanent action</p>
            <h2 id="delete-game-title">Delete Game {game.id}?</h2>
          </div>
        </div>
        <p id="delete-game-description" className="delete-modal-description">
          This will permanently delete the saved game and its history. You cannot undo this action.
        </p>
        {errorMessage && (
          <p
            ref={errorRef}
            className="delete-modal-error"
            role="alert"
            tabIndex={-1}
          >
            {errorMessage}
          </p>
        )}
        <div className="delete-modal-actions">
          <button
            ref={cancelButtonRef}
            className="access-secondary-action"
            disabled={isDeleting}
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="delete-modal-confirm"
            disabled={isDeleting}
            type="button"
            onClick={onConfirm}
          >
            {isDeleting ? 'Deleting game' : 'Delete game'}
          </button>
        </div>
      </div>
    </div>
  )
}

function getModalFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
