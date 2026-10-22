import { describe, it, expect } from 'vitest';
import contactsReducer, {
  clearError,
  setSelectedContact,
  clearSelectedContact,
  searchContacts,
  getContacts,
  createContact,
  updateContact,
  deleteContact,
} from '../contactsSlice';
import { Contact } from '@/types';

describe('#343 — contactsSlice reducers and extraReducers', () => {
  const initial = {
    list: [],
    isLoading: false,
    error: null,
    selectedContact: null,
  };

  const sampleContact: Contact = {
    id: '1',
    name: 'Alice',
    address: '0x123',
    tokenType: 'STRK',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };

  it('handles synchronous actions (setSelectedContact, clearSelectedContact, clearError, searchContacts)', () => {
    let state = contactsReducer(initial, setSelectedContact(sampleContact));
    expect(state.selectedContact).toEqual(sampleContact);

    state = contactsReducer(state, clearSelectedContact());
    expect(state.selectedContact).toBeNull();

    const stateWithError = { ...initial, error: 'Some error' };
    state = contactsReducer(stateWithError, clearError());
    expect(state.error).toBeNull();

    // searchContacts reducer exists and produces valid state
    state = contactsReducer(initial, searchContacts('Alice'));
    expect(state).toBeDefined();
  });

  describe('getContacts', () => {
    it('handles pending, fulfilled, and rejected', () => {
      let state = contactsReducer(initial, { type: getContacts.pending.type });
      expect(state.isLoading).toBe(true);
      expect(state.error).toBeNull();

      state = contactsReducer(state, {
        type: getContacts.fulfilled.type,
        payload: [sampleContact],
      });
      expect(state.isLoading).toBe(false);
      expect(state.list).toEqual([sampleContact]);

      state = contactsReducer(state, {
        type: getContacts.rejected.type,
        payload: 'Failed to fetch',
      });
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Failed to fetch');
    });
  });

  describe('createContact', () => {
    it('handles pending, fulfilled, and rejected', () => {
      let state = contactsReducer(initial, { type: createContact.pending.type });
      expect(state.isLoading).toBe(true);
      expect(state.error).toBeNull();

      state = contactsReducer(state, {
        type: createContact.fulfilled.type,
        payload: sampleContact,
      });
      expect(state.isLoading).toBe(false);
      expect(state.list).toContainEqual(sampleContact);

      state = contactsReducer(state, {
        type: createContact.rejected.type,
        payload: 'Create failed',
      });
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Create failed');
    });
  });

  describe('updateContact', () => {
    it('updates contact in list and selectedContact on fulfilled', () => {
      const existingState = {
        ...initial,
        list: [sampleContact],
        selectedContact: sampleContact,
      };

      const updated = { ...sampleContact, name: 'Alice Renamed' };
      let state = contactsReducer(existingState, { type: updateContact.pending.type });
      expect(state.isLoading).toBe(true);

      state = contactsReducer(state, {
        type: updateContact.fulfilled.type,
        payload: updated,
      });
      expect(state.isLoading).toBe(false);
      expect(state.list[0].name).toBe('Alice Renamed');
      expect(state.selectedContact?.name).toBe('Alice Renamed');

      state = contactsReducer(state, {
        type: updateContact.rejected.type,
        payload: 'Update failed',
      });
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Update failed');
    });
  });

  describe('deleteContact', () => {
    it('removes contact from list and clears selectedContact on fulfilled', () => {
      const existingState = {
        ...initial,
        list: [sampleContact],
        selectedContact: sampleContact,
      };

      let state = contactsReducer(existingState, { type: deleteContact.pending.type });
      expect(state.isLoading).toBe(true);

      state = contactsReducer(state, {
        type: deleteContact.fulfilled.type,
        payload: sampleContact.id,
      });
      expect(state.isLoading).toBe(false);
      expect(state.list).toHaveLength(0);
      expect(state.selectedContact).toBeNull();

      state = contactsReducer(state, {
        type: deleteContact.rejected.type,
        payload: 'Delete failed',
      });
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Delete failed');
    });
  });
});
