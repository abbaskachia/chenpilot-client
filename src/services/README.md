# Socket.io Integration

This directory contains the Socket.io integration for the ChenPilot client application.

## Files

- `socketManager.ts` - Core Socket.io connection management service
- `README.md` - This documentation

## Components

- `src/components/providers/SocketProvider.tsx` - React context provider for Socket.io
- `src/components/status/SocketStatusIndicator.tsx` - Connection status UI
- `docs/examples/` - Development-only demos (not bundled). See `docs/examples/README.md`.

## Hooks

- `src/hooks/useSocket.ts` - Custom hooks for Socket.io integration

## Usage

### Basic Usage

```tsx
import { useSocket } from '@/hooks/useSocket';

function MyComponent() {
  const { socket, isConnected, emit, on } = useSocket();

  useEffect(() => {
    if (socket) {
      // Listen for events
      on('message', (data) => {
        console.log('Received message:', data);
      });

      // Emit events
      emit('join-room', { roomId: '123' });
    }
  }, [socket, on, emit]);

  return (
    <div>
      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
    </div>
  );
}
```

### Using Event Hooks

```tsx
import { useSocketEvent } from '@/hooks/useSocket';

function ChatComponent() {
  const [messages, setMessages] = useState([]);

  // Automatically handle event subscription
  useSocketEvent('new-message', (message) => {
    setMessages(prev => [...prev, message]);
  });

  return (
    <div>
      {messages.map(msg => (
        <div key={msg.id}>{msg.text}</div>
      ))}
    </div>
  );
}
```

### Connection Status

```tsx
import { useSocketConnection } from '@/hooks/useSocket';
import { SocketStatusIndicator } from '@/components/status/SocketStatusIndicator';

function Header() {
  return (
    <header>
      <h1>ChenPilot</h1>
      <SocketStatusIndicator />
    </header>
  );
}
```

## Configuration

The Socket.io configuration is set in the `Providers` component:

```tsx
<SocketProvider 
  config={{
    url: process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001',
    options: {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 20000,
    },
  }}
  autoConnect={true}
>
```

### Environment Variables

Create a `.env.local` file in your project root:

```
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

## Features

- **Automatic Reconnection**: Configurable reconnection with exponential backoff
- **Connection Status**: Real-time connection status monitoring
- **Event Management**: Easy event emission and listening
- **Type Safety**: Full TypeScript support
- **React Integration**: Context-based provider pattern
- **Custom Hooks**: Convenient hooks for common patterns

## SocketManager Class

The `SocketManager` class provides:

- Connection management
- Event emission/listening
- Connection status tracking
- Automatic reconnection logic
- Singleton pattern for global instance

### Methods

- `connect()` - Establish WebSocket connection
- `disconnect()` - Close connection
- `isConnected()` - Check connection status
- `emit(event, data)` - Emit events to server
- `on(event, callback)` - Listen for events
- `off(event, callback)` - Stop listening for events
- `once(event, callback)` - Listen for event once
