import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Services from './pages/Services'
import Products from './pages/Products'
import TrackOrder from './pages/TrackOrder'
import Contact from './pages/Contact'
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
            <Route path="/contact" element={<Contact />} />
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
