import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContactsPage from './page';
import toast from 'react-hot-toast';
import { createContact, updateContact, deleteContact, getContacts } from '@/store/slices/contactsSlice';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/contacts',
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/components/layout/ChatLayout', () => ({
  ChatLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="chat-layout">{children}</div>
  ),
}));

const mockDispatch = vi.fn();
let mockState: any;

vi.mock('@/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: any) => any) => selector(mockState),
}));

describe('#343 — ContactsPage Component Tests', () => {
  const sampleContacts = [
    {
      id: 'contact-1',
      name: 'Alice Stark',
      address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      tokenType: 'STRK' as const,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'contact-2',
      name: 'Bob Lumens',
      address: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      tokenType: 'ETH' as const,
      createdAt: '2025-01-02T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      auth: { isAuthenticated: true },
      contacts: {
        list: sampleContacts,
        isLoading: false,
        error: null,
        selectedContact: null,
      },
    };
    mockDispatch.mockReturnValue({
      unwrap: () => Promise.resolve({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects to /auth/login when user is unauthenticated', () => {
    mockState = {
      auth: { isAuthenticated: false },
      contacts: { list: [], isLoading: false, error: null, selectedContact: null },
    };

    render(<ContactsPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(mockPush).toHaveBeenCalledWith('/auth/login');
  });

  it('renders loading indicator when contacts are loading', () => {
    mockState = {
      auth: { isAuthenticated: true },
      contacts: { list: [], isLoading: true, error: null, selectedContact: null },
    };

    render(<ContactsPage />);
    expect(screen.getByText('Loading contacts...')).toBeInTheDocument();
  });

  it('renders empty state when there are no contacts and allows opening create modal', () => {
    mockState = {
      auth: { isAuthenticated: true },
      contacts: { list: [], isLoading: false, error: null, selectedContact: null },
    };

    render(<ContactsPage />);

    expect(screen.getByText('No contacts yet')).toBeInTheDocument();
    const addBtn = screen.getByRole('button', { name: /Add your first contact/i });
    expect(addBtn).toBeInTheDocument();

    fireEvent.click(addBtn);
    expect(screen.getByRole('heading', { name: 'Add New Contact' })).toBeInTheDocument();
  });

  describe('Create Contact Workflow', () => {
    beforeEach(() => {
      mockState = {
        auth: { isAuthenticated: true },
        contacts: { list: [], isLoading: false, error: null, selectedContact: null },
      };
    });

    it('successfully creates contact, closes modal, and resets form', async () => {
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.resolve({
          id: 'mock-new-id',
          name: 'Charlie New',
          address: 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
          tokenType: 'STRK',
        }),
      });

      render(<ContactsPage />);

      // Open modal
      fireEvent.click(screen.getByRole('button', { name: /Add your first contact/i }));
      expect(screen.getByRole('heading', { name: 'Add New Contact' })).toBeInTheDocument();

      // Fill in form inputs
      const nameInput = screen.getByPlaceholderText('Enter contact name') as HTMLInputElement;
      const addressInput = screen.getByPlaceholderText('Enter Stellar address') as HTMLInputElement;

      fireEvent.change(nameInput, { target: { value: 'Charlie New' } });
      fireEvent.change(addressInput, { target: { value: 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' } });

      expect(nameInput.value).toBe('Charlie New');
      expect(addressInput.value).toBe('GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC');

      // Submit form
      fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }));

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalledWith('Contact created successfully!');
      });

      // Modal should be closed
      expect(screen.queryByRole('heading', { name: 'Add New Contact' })).not.toBeInTheDocument();
    });

    it('preserves form data and displays error toast when create mutation fails', async () => {
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(new Error('Failed to save contact')),
      });

      render(<ContactsPage />);

      // Open modal
      fireEvent.click(screen.getByRole('button', { name: /Add your first contact/i }));

      const nameInput = screen.getByPlaceholderText('Enter contact name') as HTMLInputElement;
      const addressInput = screen.getByPlaceholderText('Enter Stellar address') as HTMLInputElement;

      fireEvent.change(nameInput, { target: { value: 'Charlie Draft' } });
      fireEvent.change(addressInput, { target: { value: 'GDRAFTADDRESS12345' } });

      // Submit form
      fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to save contact');
      });

      // Modal should remain open
      expect(screen.getByRole('heading', { name: 'Add New Contact' })).toBeInTheDocument();

      // Form input values MUST be preserved
      expect(nameInput.value).toBe('Charlie Draft');
      expect(addressInput.value).toBe('GDRAFTADDRESS12345');
    });
  });

  describe('Edit Contact Workflow', () => {
    it('populates existing contact data into edit modal and saves updates successfully', async () => {
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.resolve({
          ...sampleContacts[0],
          name: 'Alice Modified',
        }),
      });

      render(<ContactsPage />);

      // Find edit buttons (two contacts in list)
      const editButtons = screen.getAllByRole('button').filter((btn) =>
        btn.querySelector('svg.lucide-square-pen, svg.lucide-edit') ||
        btn.innerHTML.includes('lucide-edit') ||
        btn.innerHTML.includes('lucide-square-pen')
      );

      // Open edit modal for first contact
      const firstEditButton = editButtons[0];
      fireEvent.click(firstEditButton);

      expect(screen.getByRole('heading', { name: 'Edit Contact' })).toBeInTheDocument();

      const nameInput = screen.getByPlaceholderText('Enter contact name') as HTMLInputElement;
      const addressInput = screen.getByPlaceholderText('Enter Stellar address') as HTMLInputElement;

      // Assert pre-populated data
      expect(nameInput.value).toBe('Alice Stark');
      expect(addressInput.value).toBe('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

      // Modify the name
      fireEvent.change(nameInput, { target: { value: 'Alice Modified' } });
      expect(nameInput.value).toBe('Alice Modified');

      // Submit edit
      fireEvent.click(screen.getByRole('button', { name: 'Update Contact' }));

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalledWith('Contact updated successfully!');
      });

      // Modal closed
      expect(screen.queryByRole('heading', { name: 'Edit Contact' })).not.toBeInTheDocument();
    });

    it('preserves modified form data and shows toast error when edit mutation fails', async () => {
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject('Network timeout on edit'),
      });

      render(<ContactsPage />);

      const editButtons = screen.getAllByRole('button').filter((btn) =>
        btn.querySelector('svg.lucide-square-pen, svg.lucide-edit') ||
        btn.innerHTML.includes('lucide-edit') ||
        btn.innerHTML.includes('lucide-square-pen')
      );

      fireEvent.click(editButtons[0]);

      const nameInput = screen.getByPlaceholderText('Enter contact name') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Alice Failure Preserved' } });

      fireEvent.click(screen.getByRole('button', { name: 'Update Contact' }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Network timeout on edit');
      });

      // Modal remains open and value is preserved
      expect(screen.getByRole('heading', { name: 'Edit Contact' })).toBeInTheDocument();
      expect(nameInput.value).toBe('Alice Failure Preserved');
    });
  });

  describe('Delete Contact Workflow & Confirmation Behavior', () => {
    it('aborts deletion when user cancels the confirmation dialog', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      render(<ContactsPage />);

      // Find delete buttons
      const deleteButtons = screen.getAllByRole('button').filter((btn) =>
        btn.className.includes('text-red-600') ||
        btn.innerHTML.includes('lucide-trash')
      );

      fireEvent.click(deleteButtons[0]);

      expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete Alice Stark?');
      // Dispatch should NOT have been called with deleteContact
      expect(mockDispatch).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('dispatches delete and shows success toast when user confirms deletion', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.resolve('contact-1'),
      });

      render(<ContactsPage />);

      const deleteButtons = screen.getAllByRole('button').filter((btn) =>
        btn.className.includes('text-red-600') ||
        btn.innerHTML.includes('lucide-trash')
      );

      fireEvent.click(deleteButtons[0]);

      expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete Alice Stark?');

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalledWith('Contact deleted successfully!');
      });
    });

    it('shows error toast when delete mutation fails after confirmation', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(new Error('Server failed to delete contact')),
      });

      render(<ContactsPage />);

      const deleteButtons = screen.getAllByRole('button').filter((btn) =>
        btn.className.includes('text-red-600') ||
        btn.innerHTML.includes('lucide-trash')
      );

      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Server failed to delete contact');
      });
    });
  });

  describe('Search and Filter Behavior', () => {
    it('filters contacts dynamically based on search term', () => {
      render(<ContactsPage />);

      expect(screen.getByText('Alice Stark')).toBeInTheDocument();
      expect(screen.getByText('Bob Lumens')).toBeInTheDocument();

      const searchInput = screen.getByPlaceholderText('Search contacts...');
      fireEvent.change(searchInput, { target: { value: 'Alice' } });

      expect(screen.getByText('Alice Stark')).toBeInTheDocument();
      expect(screen.queryByText('Bob Lumens')).not.toBeInTheDocument();
    });

    it('displays no contacts found state when search returns zero results', () => {
      render(<ContactsPage />);

      const searchInput = screen.getByPlaceholderText('Search contacts...');
      fireEvent.change(searchInput, { target: { value: 'Nonexistent' } });

      expect(screen.getByText('No contacts found')).toBeInTheDocument();
      expect(screen.getByText('Try another name or address.')).toBeInTheDocument();
    });
  });
});
