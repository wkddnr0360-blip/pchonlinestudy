import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './shell.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main>
      <h1>박철한 온스 2.0</h1>
      <p>학습 서비스를 준비하고 있습니다.</p>
    </main>
  </StrictMode>,
)
