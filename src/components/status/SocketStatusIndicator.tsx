'use client';

import React from 'react';
import { useSocketConnection } from '@/hooks/useSocket';
import { Wifi, WifiOff } from 'lucide-react';

export function SocketStatusIndicator() {
  const { isConnected } = useSocketConnection();

  return (
    <div className="flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium">
      {isConnected ? (
        <>
          <Wifi className="w-4 h-4 text-green-500" />
          <span className="text-green-500">Connected</span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4 text-red-500" />
          <span className="text-red-500">Disconnected</span>
        </>
      )}
    </div>
  );
}
