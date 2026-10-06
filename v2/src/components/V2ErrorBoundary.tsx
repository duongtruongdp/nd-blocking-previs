import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean }

export class V2ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error('[ND Blocking & Previs]', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <main className="v2-runtime-error" role="alert">
        <div className="v2-runtime-error-card">
          <span className="v2-brand-mark">ND</span>
          <h1>Something went wrong.</h1>
          <p>ND Blocking &amp; Previs could not continue. Reload the app and try again.</p>
          <button className="v2-button v2-button-primary" onClick={() => window.location.reload()} type="button">Reload App</button>
        </div>
      </main>
    )
  }
}
