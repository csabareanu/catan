import { useState } from 'react'
import { SettingsDialog } from './SettingsDialog'

export function SettingsButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        className="header-settings-button"
        type="button"
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="Settings"
        onClick={() => setIsOpen(true)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M10 3h4l.6 2.4 2.1 1.2 2.4-.7 2 3.4-1.8 1.7v2.4l1.8 1.7-2 3.4-2.4-.7-2.1 1.2L14 21h-4l-.6-2.4-2.1-1.2-2.4.7-2-3.4 1.8-1.7v-2.4L2.9 8.9l2-3.4 2.4.7 2.1-1.2L10 3Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      {isOpen && <SettingsDialog onClose={() => setIsOpen(false)} />}
    </>
  )
}
