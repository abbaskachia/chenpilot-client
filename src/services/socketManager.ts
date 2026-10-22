import { io, Socket } from 'socket.io-client';
import { logger } from "../utils/logger";

export interface SocketConfig {
  url: string;
  options?: {
    transports?: ('polling' | 'websocket')[];
    autoConnect?: boolean;
    reconnection?: boolean;
    reconnectionDelay?: number;
    reconnectionAttempts?: number;
    timeout?: number;
  };
  queueEnabled?: boolean;
  maxQueueSize?: number;
}

interface QueuedEvent {
  event: string;
  data?: unknown;
}
type SocketEventHandler = (...args: unknown[]) => void;

export class SocketManager {
  private isRefreshingToken = false;
  private socket: Socket | null = null;
  private config: SocketConfig;
  private reconnectAttempts = 0;
  private eventQueue: QueuedEvent[] = [];
  private queueEnabled: boolean;
  private maxQueueSize: number;
  private registeredHandlers = new Map<string, Set<SocketEventHandler>>();

  constructor(config: SocketConfig) {
    const defaultOptions: NonNullable<SocketConfig['options']> = {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 20000,
    };

    this.config = {
      ...config,
      options: { ...defaultOptions, ...(config.options || {}) },
    };
    this.queueEnabled = this.config.queueEnabled ?? false;
    this.maxQueueSize = this.config.maxQueueSize ?? 100;
  }

  connect(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    if (this.socket) {
      this.removeRegisteredHandlers(this.socket);
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(this.config.url, this.config.options);

    this.registerHandler('connect', () => {
      logger.debug('Socket connected:', this.socket?.id);
      this.reconnectAttempts = 0;
      this.flushQueue();
    });

    this.registerHandler('disconnect', (reason) => {
      logger.debug('Socket disconnected:', reason);
    });

    this.registerHandler('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.reconnectAttempts++;
    });

    this.registerHandler('reconnect', (attemptNumber) => {
      logger.debug('Socket reconnected after', attemptNumber, 'attempts');
      this.reconnectAttempts = 0;
      this.flushQueue();
    });

    this.registerHandler('reconnect_error', (error) => {
      console.error('Socket reconnection error:', error);
    });

    this.registerHandler('reconnect_failed', () => {
      console.error('Socket reconnection failed after', this.reconnectAttempts, 'attempts');
    });

    return this.socket;
  }

  updateAuth(newToken: string): void {
    if (this.config.options) {
      this.config.options = {
        ...this.config.options,
        auth: { token: newToken },
      };
    } else {
      this.config.options = { auth: { token: newToken } };
    }

    if (this.socket) {
      if ((this.socket as any).auth) {
        (this.socket as any).auth = { token: newToken };
      }
      if (!this.isRefreshingToken) {
        this.isRefreshingToken = true;
        this.removeRegisteredHandlers(this.socket);
        this.socket.disconnect();
        this.socket = null;
        this.connect();
        this.isRefreshingToken = false;
      }
    }
  }

  disconnect(): void {
    const socket = this.socket;

    if (!socket) {
      return;
    }

    this.removeRegisteredHandlers(socket);
    socket.disconnect();
    this.socket = null;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Emits an event immediately when connected, or queues it when queueing is
   * enabled. The return value indicates whether the event was sent immediately.
   */
  emit(event: string, data?: unknown): boolean {
    if (this.socket?.connected) {
      try {
        this.socket.emit(event, data);
        return true;
      } catch (error) {
        console.warn('Failed to emit event:', event, error);
        return false;
      }
    }

    if (!this.queueEnabled) {
      console.warn('Socket not connected. Cannot emit event:', event);
      return false;
    }

    if (this.eventQueue.length >= this.maxQueueSize) {
      console.warn('Event queue is full. Dropping event:', event);
      return false;
    }

    this.eventQueue.push({ event, data });
    console.warn('Socket not connected. Event queued:', event);
    return false;
  }

  private flushQueue(): void {
    while (this.eventQueue.length > 0) {
      if (!this.socket?.connected) {
        break;
      }

      const queuedEvent = this.eventQueue.shift();
      if (!queuedEvent) {
        break;
      }

      this.socket.emit(queuedEvent.event, queuedEvent.data);
    }
  }

  private registerHandler(event: string, callback: SocketEventHandler): void {
    if (!this.socket) {
      return;
    }

    const handlers = this.registeredHandlers.get(event) ?? new Set<SocketEventHandler>();
    handlers.add(callback);
    this.registeredHandlers.set(event, handlers);
    this.socket.on(event, callback);
  }

  private removeRegisteredHandlers(socket: Socket): void {
    for (const [event, handlers] of this.registeredHandlers) {
      for (const handler of handlers) {
        socket.off(event, handler);
      }
    }
    this.registeredHandlers.clear();
  }

  on(event: string, callback: (...args: unknown[]) => void): void {
    if (this.socket) {
      this.registerHandler(event, callback);
    }
  }

  off(event: string, callback?: (...args: unknown[]) => void): void {
    if (this.socket) {
      this.socket.off(event, callback);

      const handlers = this.registeredHandlers.get(event);
      if (handlers) {
        if (callback) {
          handlers.delete(callback);
        } else {
          handlers.clear();
        }

        if (handlers.size === 0) {
          this.registeredHandlers.delete(event);
        }
      }
    }
  }

  once(event: string, callback: (...args: unknown[]) => void): void {
    if (this.socket) {
      const handlers = this.registeredHandlers.get(event) ?? new Set<SocketEventHandler>();
      handlers.add(callback);
      this.registeredHandlers.set(event, handlers);
      this.socket.once(event, callback);
    }
  }
}

// Singleton instance
let socketManagerInstance: SocketManager | null = null;

export const getSocketManager = (config?: SocketConfig): SocketManager => {
  if (!socketManagerInstance && config) {
    socketManagerInstance = new SocketManager(config);
  }
  if (!socketManagerInstance) {
    throw new Error('SocketManager not initialized. Call getSocketManager with config first.');
  }
  return socketManagerInstance;
};

export const initializeSocketManager = (config: SocketConfig): SocketManager => {
  socketManagerInstance = new SocketManager(config);
  return socketManagerInstance;
};
