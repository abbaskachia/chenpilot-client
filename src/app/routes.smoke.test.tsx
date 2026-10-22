import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Common mocks for route smoke tests
const mockPush = vi.fn();
const mockDispatch = vi.fn();
let mockState: any = {};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src, ...props }: any) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt || ''} src={src} {...props} />
  ),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('@/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: any) => any) => selector(mockState),
}));

vi.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: any) => any) => selector(mockState),
}));

vi.mock('@/components/layout/ChatLayout', () => ({
  ChatLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chat-layout">{children}</div>
  ),
}));

vi.mock('@/components/layout/ClientOnlyChatLayout', () => ({
  ClientOnlyChatLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="client-only-chat-layout">{children}</div>
  ),
}));

// Mock sub-components that perform heavy canvas/animation/network effects
vi.mock('@/components/(home)/layout/header', () => ({
  default: () => <header data-testid="home-header">ChenPilot Header</header>,
}));

vi.mock('@/components/(home)/layout/footer', () => ({
  default: () => <footer data-testid="home-footer">ChenPilot Footer</footer>,
}));

vi.mock('@/components/(home)/sections/hero', () => ({
  default: () => <div data-testid="home-hero">AI Co-Pilot for Cross-Chain DeFi</div>,
}));

vi.mock('@/components/(home)/sections/features', () => ({
  default: () => <div data-testid="home-features">Features</div>,
}));

vi.mock('@/components/(home)/sections/logos', () => ({
  default: () => <div data-testid="home-logos">Logos</div>,
}));

vi.mock('@/components/(home)/sections/capabilities', () => ({
  default: () => <div data-testid="home-capabilities">Capabilities</div>,
}));

vi.mock('@/components/(home)/sections/CTA', () => ({
  default: () => <div data-testid="home-cta">CTA</div>,
}));

vi.mock('@/components/auth/(login)/animatedbackground', () => ({
  default: () => <div data-testid="animated-bg" />,
}));

vi.mock('@/components/auth/(login)/floatingelements', () => ({
  default: () => <div data-testid="floating-elements" />,
}));

vi.mock('@/components/auth/(login)/features', () => ({
  default: () => <div data-testid="auth-features">Auth Features</div>,
}));

vi.mock('@/components/auth/(login)/loginform', () => ({
  default: () => <form data-testid="auth-login-form">Login Form</form>,
}));

vi.mock('@/components/chat/ChatEngine', () => ({
  default: () => <div data-testid="chat-engine">Chat Engine Active</div>,
}));

vi.mock('@/components/dashboard/TransactionTable', () => ({
  default: () => <div data-testid="transaction-table">Transaction Table</div>,
}));

vi.mock('@/components/deployment/DeploymentStepper', () => ({
  default: () => <div data-testid="deployment-stepper">Deployment Stepper</div>,
}));

vi.mock('@/components/payment/SendPaymentForm', () => ({
  default: () => <div data-testid="send-payment-form">Send Payment Form</div>,
}));

vi.mock('@/hooks/useDeploymentProgress', () => ({
  useDeploymentProgress: () => ({
    status: 'idle',
    progress: 0,
    currentStep: 0,
    steps: [],
  }),
}));

describe('#342 — Route-level Smoke Tests for Primary App Destinations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      auth: {
        isAuthenticated: true,
        user: { id: 'u1', name: 'Test User', email: 'user@example.com' },
        isLoading: false,
      },
      account: {
        status: {
          isDeployed: true,
          publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        },
        balance: { XLM: '100.0', USDC: '50.0' },
        isLoading: false,
        error: null,
        transactions: {
          items: [],
          isLoading: false,
          error: null,
        },
      },
      contacts: {
        list: [],
        isLoading: false,
        error: null,
        selectedContact: null,
      },
      chat: {
        messages: [],
        chatHistory: {},
        currentConversation: null,
        conversations: [],
      },
      ui: {
        mode: 'dark',
        language: 'en',
      },
    };
    mockDispatch.mockReturnValue({
      unwrap: () => Promise.resolve({}),
    });
  });

  describe('1. Landing Destination (/)', () => {
    it('mounts landing page with header, main content, and footer', async () => {
      const { default: HomePage } = await import('./page');
      render(<HomePage />);

      expect(screen.getByTestId('home-header')).toBeInTheDocument();
      expect(screen.getByRole('main', { name: /main content/i })).toBeInTheDocument();
      expect(screen.getByTestId('home-footer')).toBeInTheDocument();
    });
  });

  describe('2. Auth Destination (/auth/login)', () => {
    it('mounts auth login destination with login form and features', async () => {
      const { default: LoginPage } = await import('./auth/login/page');
      render(<LoginPage />);

      expect(screen.getByTestId('auth-login-form')).toBeInTheDocument();
      expect(screen.getByTestId('auth-features')).toBeInTheDocument();
    });
  });

  describe('3. Dashboard Destination (/dashboard)', () => {
    it('mounts dashboard layout and key account widgets for authenticated user', async () => {
      const { default: DashboardPage } = await import('./dashboard/page');
      render(<DashboardPage />);

      expect(screen.getByTestId('chat-layout')).toBeInTheDocument();
      expect(screen.getByText('Account Overview')).toBeInTheDocument();
      expect(screen.getByText('Wallet Balance')).toBeInTheDocument();
    });
  });

  describe('4. Chat Destination (/chat)', () => {
    it('mounts chat destination with ChatEngine for authenticated user', async () => {
      const { default: ChatPage } = await import('./chat/page');
      render(<ChatPage />);

      expect(screen.getByTestId('client-only-chat-layout')).toBeInTheDocument();
      expect(screen.getByTestId('chat-engine')).toBeInTheDocument();
    });

    it('redirects unauthenticated visitor to login', async () => {
      mockState.auth.isAuthenticated = false;
      const { default: ChatPage } = await import('./chat/page');
      render(<ChatPage />);

      expect(screen.getByText('Redirecting to login...')).toBeInTheDocument();
      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });
  });

  describe('5. Contacts Destination (/contacts)', () => {
    it('mounts contacts destination and displays contact management interface', async () => {
      const { default: ContactsPage } = await import('./contacts/page');
      render(<ContactsPage />);

      expect(screen.getByTestId('chat-layout')).toBeInTheDocument();
      expect(screen.getByText('Your Contacts')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search contacts...')).toBeInTheDocument();
    });
  });

  describe('6. Send Payment Destination (/send)', () => {
    it('mounts send payment destination with send payment form', async () => {
      const { default: SendPage } = await import('./send/page');
      render(<SendPage />);

      expect(screen.getByTestId('chat-layout')).toBeInTheDocument();
      expect(screen.getByText('Send Payment')).toBeInTheDocument();
      expect(screen.getByTestId('send-payment-form')).toBeInTheDocument();
    });
  });

  describe('7. Transactions Destination (/transactions)', () => {
    it('mounts transactions destination and displays transaction history', async () => {
      const { default: TransactionsPage } = await import('./transactions/page');
      render(<TransactionsPage />);

      expect(screen.getByText('Transaction History')).toBeInTheDocument();
    });
  });

  describe('8. Settings Destination (/settings)', () => {
    it('mounts settings destination and renders user settings preferences', async () => {
      const { default: SettingsPage } = await import('./settings/page');
      render(<SettingsPage />);

      expect(screen.getByTestId('chat-layout')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Profile')).toBeInTheDocument();
      expect(screen.getByText('Preferences')).toBeInTheDocument();
    });
  });
});
