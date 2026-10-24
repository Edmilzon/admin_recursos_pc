import {useEffect, useState} from 'react';
import {AppState} from 'react-native';
import {isTelemetrySnapshot} from '../types/telemetry';
import type {ConnectionState, TelemetrySnapshot} from '../types/telemetry';

const TELEMETRY_URL = 'ws://localhost:8765/ws';
const RECONNECT_DELAY_MS = 2000;

export function useTelemetry() {
  const [appState, setAppState] = useState(AppState.currentState);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    AppState.currentState === 'active' ? 'connecting' : 'paused',
  );
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (appState !== 'active') {
      setSnapshot(null);
      setConnectionState('paused');
      return undefined;
    }

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined;

    const connect = () => {
      if (disposed) {
        return;
      }

      setConnectionState('connecting');
      const currentSocket = new WebSocket(TELEMETRY_URL);
      socket = currentSocket;

      currentSocket.onopen = () => {
        if (!disposed) {
          setConnectionState('connected');
        }
      };

      currentSocket.onmessage = event => {
        if (disposed) {
          return;
        }

        try {
          const parsed: unknown = JSON.parse(String(event.data));
          if (isTelemetrySnapshot(parsed)) {
            setSnapshot(parsed);
          }
        } catch {
          // Se ignora un mensaje incompleto y se conserva la siguiente lectura válida.
        }
      };

      currentSocket.onerror = () => {
        currentSocket.close();
      };

      currentSocket.onclose = () => {
        if (disposed) {
          return;
        }

        setSnapshot(null);
        setConnectionState('disconnected');
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
    };
  }, [appState]);

  return {connectionState, snapshot};
}
