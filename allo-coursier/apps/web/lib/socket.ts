'use client';

import { io, Socket } from 'socket.io-client';
import { tokens } from './api';

let socket: Socket | null = null;
let currentToken: string | null = null;

/** Connexion temps réel unique (reconnexion automatique, repli en « polling » sur réseau faible). */
export function getSocket(): Socket {
  const token = tokens.access;
  if (socket && currentToken === token) return socket;
  socket?.close();
  currentToken = token;
  socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? undefined, {
    path: '/api/v1/socket.io',
    auth: token ? { token } : {},
    transports: ['websocket', 'polling'],
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30000,
  });
  socket.on('connect_error', (err) => {
    // Jeton expiré : la prochaine requête API le renouvellera, puis on se reconnecte.
    if (err.message.includes('Session')) setTimeout(() => getSocket(), 5000);
  });
  return socket;
}

if (typeof window !== 'undefined') {
  tokens.subscribe(() => {
    if (socket && currentToken !== tokens.access) {
      socket.close();
      socket = null;
      getSocket();
    }
  });
}
