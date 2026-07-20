import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
if (import.meta.env.DEV) {
  import('./index.css')
}
import theme from './theme'

try{ theme.init() }catch(e){console.warn('theme init failed',e)}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--toast-bg, rgba(251, 250, 247, 0.95))',
            color: 'var(--toast-text, #171717)',
            border: '1px solid var(--toast-border, rgba(222, 218, 209, 0.5))',
            backdropFilter: 'blur(16px)',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            borderRadius: '14px',
            boxShadow: 'var(--shadow-md)',
          },
          success: { duration: 2500 },
          error: { duration: 4000 },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>,
)
