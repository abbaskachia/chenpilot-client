import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import authSlice, { initializeAuth } from './slices/authSlice';
import accountSlice from './slices/accountSlice';
import contactsSlice from './slices/contactsSlice';
import chatSlice, { initializeChatHistory } from './slices/chatSlice';
import uiSlice from './slices/uiSlice';
import presenceSlice from './slices/presenceSlice';
import apiService from '@/services/api';

export const store = configureStore({
  reducer: {
    auth: authSlice,
    account: accountSlice,
    contacts: contactsSlice,
    chat: chatSlice,
    ui: uiSlice,
    presence: presenceSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ["persist/PERSIST"],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Initialize auth and chat history on app startup
if (typeof window !== 'undefined') {
  // Give the API service a reference to the store so the response interceptor
  // can sync the refreshed token into Redux state (fixes token divergence bug).
  apiService.setStore(store);

  store.dispatch(initializeAuth());
  store.dispatch(initializeChatHistory());
}
