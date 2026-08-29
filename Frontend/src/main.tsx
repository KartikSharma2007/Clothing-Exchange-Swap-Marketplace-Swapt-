import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from './router.tsx'
import { ensureServiceWorker } from './lib/push'

const router = getRouter()

// Register the push service worker in the background — never blocks first paint.
if ("serviceWorker" in navigator) {
  void ensureServiceWorker();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
