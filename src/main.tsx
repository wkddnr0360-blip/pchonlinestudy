import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './app/App'
import { PremiumProvider } from './premium/PremiumProvider'
import './app/base.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><HashRouter><PremiumProvider><App /></PremiumProvider></HashRouter></StrictMode>,
)
