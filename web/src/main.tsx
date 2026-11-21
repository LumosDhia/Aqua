import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initializeI18n } from './i18n'

const root = document.getElementById('root')
if (!root) throw new Error('Root element missing')

await initializeI18n()

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
