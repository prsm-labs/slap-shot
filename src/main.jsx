import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { startNoteCollapse } from './lib/noteCollapse.js' // 2026-10-28 collapsible explanation boxes
import './lib/noteCollapse.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

startNoteCollapse()
