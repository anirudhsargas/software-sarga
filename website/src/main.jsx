import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'
import theme from './theme'

// initialize theme early so data-theme is set before render
try{ theme.init() }catch(e){console.warn('theme init failed',e)}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'rgba(251, 250, 247, 0.85)',
            color: '#171717',
            border: '1px solid rgba(222, 218, 209, 0.5)',
            backdropFilter: 'blur(16px)',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            borderRadius: '14px',
            boxShadow: '0 8px 32px rgba(20, 20, 20, 0.08)',
          },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>,
)
