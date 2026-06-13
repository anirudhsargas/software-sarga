import { Routes, Route, useLocation } from 'react-router-dom'
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
import PhotoSheetLayout from './pages/design/PhotoSheetLayout'
import AlbumDesigner from './pages/design/AlbumDesigner'
import FabricEditorHub from './pages/design/print-editor/FabricEditorHub'
import PrintEditor from './pages/design/print-editor/PrintEditor'
import UploadDesign from './pages/design/UploadDesign'
import Chatbot from './components/Chatbot/Chatbot'
import { CartProvider } from './context/CartContext'
import CartDrawer from './components/Cart/CartDrawer'
import './App.css'

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
      <main className="main-content" style={isDesignTool ? { paddingTop: 0 } : undefined}>
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
