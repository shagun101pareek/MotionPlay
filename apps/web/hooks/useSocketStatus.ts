'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';

export function useSocketStatus(): 'connecting' | 'online' | 'offline' {
  const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');

  useEffect(() => {
    const socket = getSocket();
    const sync = () => setStatus(socket.connected ? 'online' : 'offline');
    sync();
    socket.on('connect', sync);
    socket.on('disconnect', sync);
    return () => {
      socket.off('connect', sync);
      socket.off('disconnect', sync);
    };
  }, []);

  return status;
}
