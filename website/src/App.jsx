import { Routes, Route, useLocation } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Chatbot from './components/Chatbot/Chatbot'
import { CartProvider } from './context/CartContext'
import CartDrawer from './components/Cart/CartDrawer'
import './App.css'

// Lazy loaded page components
const Home = lazy(() => import('./pages/Home'))
const Services = lazy(() => import('./pages/Services'))
const Products = lazy(() => import('./pages/Products'))
const TrackOrder = lazy(() => import('./pages/TrackOrder'))
const SignIn = lazy(() => import('./pages/SignIn'))
const PortalDashboard = lazy(() => import('./pages/PortalDashboard'))
const JobDetail = lazy(() => import('./pages/JobDetail'))
const Contact = lazy(() => import('./pages/Contact'))
const NotFound = lazy(() => import('./pages/errors/NotFound'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Terms = lazy(() => import('./pages/Terms'))
const DesignHub = lazy(() => import('./pages/design/DesignHub'))
const PhotoSheetLayout = lazy(() => import('./pages/design/PhotoSheetLayout'))
const AlbumDesigner = lazy(() => import('./pages/design/AlbumDesigner'))
const FabricEditorHub = lazy(() => import('./pages/design/print-editor/FabricEditorHub'))
const PrintEditor = lazy(() => import('./pages/design/print-editor/PrintEditor'))
const UploadDesign = lazy(() => import('./pages/design/UploadDesign'))

const DESIGN_PATHS = ['/design/sheet-layout', '/design/album', '/design/print-editor', '/design/upload-design']

function PageSkeleton() {
  return (
    <div className="skeleton-container" style={{
      padding: '4rem 2rem',
      maxWidth: '1200px',
      margin: '0 auto',
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      gap: '2rem',
      animation: 'pulse 1.5s infinite ease-in-out'
    }}>
      <div style={{ height: '48px', width: '300px', background: 'var(--accent-soft, #e2e8f0)', borderRadius: '8px' }} />
      <div style={{ height: '24px', width: '100%', background: 'var(--accent-soft, #e2e8f0)', borderRadius: '6px' }} />
      <div style={{ height: '200px', width: '100%', background: 'var(--accent-soft, #e2e8f0)', borderRadius: '12px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', width: '100%' }}>
        <div style={{ height: '150px', background: 'var(--accent-soft, #e2e8f0)', borderRadius: '12px' }} />
        <div style={{ height: '150px', background: 'var(--accent-soft, #e2e8f0)', borderRadius: '12px' }} />
        <div style={{ height: '150px', background: 'var(--accent-soft, #e2e8f0)', borderRadius: '12px' }} />
      </div>
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 0.35; }
          100% { opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}

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
      <main className="main-content" style={isDesignTool ? { paddingTop: 0 } : undefined}>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/services" element={<Services />} />
            <Route path="/products" element={<Products />} />
            <Route path="/track" element={<TrackOrder />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/portal/dashboard" element={<PortalDashboard />} />
            <Route path="/portal/job/:id" element={<JobDetail />} />
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
    <CartProvider>
      <AppLayout />
    </CartProvider>
  )
}

export default App
