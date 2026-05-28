import { Routes, Route } from 'react-router-dom'
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
import Chatbot from './components/Chatbot/Chatbot'
import { CartProvider } from './context/CartContext'
import CartDrawer from './components/Cart/CartDrawer'
import './App.css'

function App() {
  return (
    <CartProvider>
      <div className="app">
        <Navbar />
        <main className="main-content">
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <Chatbot />
        <CartDrawer />
        <Footer />
      </div>
    </CartProvider>
  )
}

export default App
