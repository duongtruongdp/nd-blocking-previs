import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { V2App } from './App'
import './styles/tokens.css'
import './styles/editor.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <V2App />
  </StrictMode>,
)
