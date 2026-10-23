import { useEffect, useRef } from 'react'

export type UnsavedDialogPurpose = 'quit' | 'new' | 'load' | 'projects'
export type UnsavedDialogChoice = 'save' | 'discard' | 'cancel'

type V2UnsavedChangesDialogProps = {
  purpose: UnsavedDialogPurpose
  onChoice: (choice: UnsavedDialogChoice) => void
}

const copy: Record<UnsavedDialogPurpose, { title: string; body: string; save: string }> = {
  quit: { title: 'Save changes before quitting?', body: "Your project has changes that haven't been saved.", save: 'Save & Quit' },
  new: { title: 'Save changes before creating a new project?', body: "Your project has changes that haven't been saved.", save: 'Save' },
  load: { title: 'Save changes before loading another project?', body: "Your project has changes that haven't been saved.", save: 'Save' },
  projects: { title: 'Save changes before opening Projects?', body: "Your project has changes that haven't been saved.", save: 'Save' },
}

export function V2UnsavedChangesDialog({ purpose, onChoice }: V2UnsavedChangesDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const message = copy[purpose]

  useEffect(() => {
    cancelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onChoice('cancel')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onChoice])

  return (
    <div className="v2-modal-backdrop" role="presentation">
      <section className="v2-unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="v2-unsaved-title" aria-describedby="v2-unsaved-body">
        <div className="v2-modal-heading">
          <div>
            <span className="v2-eyebrow">PROJECT</span>
            <h2 id="v2-unsaved-title">{message.title}</h2>
          </div>
        </div>
        <p id="v2-unsaved-body">{message.body}</p>
        <div className="v2-unsaved-dialog-actions">
          <button className="v2-button v2-button-danger" onClick={() => onChoice('discard')} type="button">Don’t Save</button>
          <div className="v2-unsaved-dialog-primary-actions">
            <button className="v2-button" ref={cancelRef} onClick={() => onChoice('cancel')} type="button">Cancel</button>
            <button className="v2-button v2-button-primary" onClick={() => onChoice('save')} type="button">{message.save}</button>
          </div>
        </div>
      </section>
    </div>
  )
}
