import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { V2App } from './App'
import { V2ErrorBoundary } from './components/V2ErrorBoundary'
import { detectBrowserCapabilities, webglErrorMessage } from './platform/browserCapabilities'
import './styles/tokens.css'
import './styles/editor.css'

const root = document.getElementById('root')
const capabilities = detectBrowserCapabilities()

createRoot(root!).render(
  <StrictMode>
    <V2ErrorBoundary>
      {capabilities.webgl ? <V2App /> : <main className="v2-runtime-error" role="alert"><div className="v2-runtime-error-card"><span className="v2-brand-mark">ND</span><h1>Graphics features unavailable.</h1><p>{webglErrorMessage()}</p></div></main>}
    </V2ErrorBoundary>
  </StrictMode>,
)
