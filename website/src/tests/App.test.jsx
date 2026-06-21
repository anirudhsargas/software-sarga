import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

vi.mock('../components/Navbar', () => ({
  default: () => <div data-testid="navbar">Navbar</div>,
}));

vi.mock('../components/Footer', () => ({
  default: () => <div data-testid="footer">Footer</div>,
}));

vi.mock('../components/Chatbot/Chatbot', () => ({
  default: () => <div data-testid="chatbot">Chatbot</div>,
}));

vi.mock('../context/CartContext', () => ({
  CartProvider: ({ children }) => <div data-testid="cart-provider">{children}</div>,
}));

vi.mock('../components/Cart/CartDrawer', () => ({
  default: () => <div data-testid="cart-drawer">CartDrawer</div>,
}));

vi.mock('../pages/Home', () => ({
  default: () => <div data-testid="home-page">Home</div>,
}));

vi.mock('../pages/Services', () => ({
  default: () => <div>Services</div>,
}));

vi.mock('../pages/Products', () => ({
  default: () => <div>Products</div>,
}));

vi.mock('../pages/errors/NotFound', () => ({
  default: () => <div data-testid="not-found">404</div>,
}));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
    })),
  });
});

describe('Website App', () => {
  it('renders home page by default', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    });
  });

  it('renders Navbar on non-design pages', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('navbar')).toBeInTheDocument();
    });
  });

  it('renders 404 page for unknown routes', async () => {
    render(
      <MemoryRouter initialEntries={['/nonexistent-route']}>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByTestId('not-found')).toBeInTheDocument();
    });
  });

  it('renders without crashing into error boundary', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
    });
  });
});
