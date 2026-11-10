import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { listenForInstall } from './installPrompt.js'

// before anything else: the browser says only once that the app can be installed (installPrompt.js)
listenForInstall()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
