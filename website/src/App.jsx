import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Services from './pages/Services'
import Products from './pages/Products'
import TrackOrder from './pages/TrackOrder'
import SignIn from './pages/SignIn'
import PortalDashboard from './pages/PortalDashboard'
import JobDetail from './pages/JobDetail'
import Contact from './pages/Contact'
import NotFound from './pages/errors/NotFound'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import DesignHub from './pages/design/DesignHub'
import { lazy, Suspense } from 'react'

const PhotoSheetLayout = lazy(() => import('./pages/design/PhotoSheetLayout'))
const AlbumDesigner = lazy(() => import('./pages/design/AlbumDesigner'))
const FabricEditorHub = lazy(() => import('./pages/design/print-editor/FabricEditorHub'))
const PrintEditor = lazy(() => import('./pages/design/print-editor/PrintEditor'))
const UploadDesign = lazy(() => import('./pages/design/UploadDesign'))
import BlogList from './pages/BlogList'
import BlogPostDetail from './pages/BlogPostDetail'
import ArtworkUpload from './pages/ArtworkUpload'
import SampleRequest from './pages/SampleRequest'
import DesignBooking from './pages/DesignBooking'
import Portfolio from './pages/Portfolio'
import PickupBooking from './pages/PickupBooking'
import Checkout from './pages/Checkout'
import OrderView from './pages/OrderView'
import PricingPage from './pages/PricingPage'

import Chatbot from './components/Chatbot/Chatbot'
import { CartProvider } from './context/CartContext'
import { I18nProvider } from './context/I18nContext'
import CartDrawer from './components/Cart/CartDrawer'
import './App.css'

// Simple auth guard for customer portal routes
function PrivateRoute({ children }) {
  const uuid = typeof window !== 'undefined' ? (localStorage.getItem('sarga_customer_id') || localStorage.getItem('sarga_uuid')) : null
  const token = typeof window !== 'undefined' ? (localStorage.getItem('sarga_customer_token') || localStorage.getItem('sarga_token')) : null
  return (uuid && token) ? children : <Navigate to="/signin" replace />
}

const DESIGN_PATHS = ['/design/sheet-layout', '/design/album', '/design/print-editor', '/design/upload-design']

function AppLayout() {
  const location = useLocation()
  
  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  // Global scroll-reveal observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed')
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    )

    const revealElements = document.querySelectorAll('.reveal, .reveal-scale')
    revealElements.forEach((el) => observer.observe(el))

    return () => observer.disconnect()
  }, [location.pathname])

  const isDesignTool = DESIGN_PATHS.includes(location.pathname) || location.pathname.startsWith('/design/print-editor')

  return (
    <div className="app">
      {!isDesignTool && <Navbar />}
      <main className={`app-main ${isDesignTool ? 'design-mode' : ''} ${location.pathname === '/' ? 'home-mode' : ''}`}>
        <Suspense fallback={<div className="loading-overlay">Loading...</div>}>
          <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/products" element={<Products />} />
          <Route path="/track" element={<TrackOrder />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/portal/dashboard" element={<PrivateRoute><PortalDashboard /></PrivateRoute>} />
          <Route path="/portal/job/:id" element={<PrivateRoute><JobDetail /></PrivateRoute>} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/design" element={<DesignHub />} />
          <Route path="/design/sheet-layout" element={<PhotoSheetLayout />} />
          <Route path="/design/album" element={<AlbumDesigner />} />
          <Route path="/design/print-editor" element={<FabricEditorHub />} />
          <Route path="/design/print-editor/:productId" element={<PrintEditor />} />
          <Route path="/design/print-editor/:productId/:designId" element={<PrintEditor />} />
          <Route path="/design/upload-design" element={<UploadDesign />} />
          <Route path="/artwork-upload" element={<ArtworkUpload />} />
          <Route path="/blog" element={<BlogList />} />
          <Route path="/blog/:slug" element={<BlogPostDetail />} />
          <Route path="/samples" element={<SampleRequest />} />
          <Route path="/book" element={<DesignBooking />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/pickup" element={<PickupBooking />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/pricing/:productId" element={<PricingPage />} />
          <Route path="/portal/order/:orderNumber" element={<PrivateRoute><OrderView /></PrivateRoute>} />
          <Route path="*" element={<NotFound />} />

          </Routes>
        </Suspense>
      </main>
      {!isDesignTool && <Chatbot />}
      {!isDesignTool && <CartDrawer />}
      {!isDesignTool && <Footer />}
    </div>
  )
}

function App() {
  return (
    <I18nProvider>
      <CartProvider>
        <AppLayout />
      </CartProvider>
    </I18nProvider>
  )
}

export default App
