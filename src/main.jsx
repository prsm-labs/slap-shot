import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { startNoteCollapse } from './lib/noteCollapse.js' // 2026-10-28 collapsible explanation boxes
import './lib/noteCollapse.css'
import { startTableCards } from './lib/tableCards.js' // 2026-11-03 phone cards for list tables
import './lib/tableCards.css'
import { bootOffline } from './lib/offline.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

startNoteCollapse()
startTableCards()
bootOffline() // 2026-11-02 📦 keeps the offline worker only for viewers who saved a snapshot
