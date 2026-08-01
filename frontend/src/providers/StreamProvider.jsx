import React, { createContext, useContext, useState, useEffect } from 'react';
import { monitoringService } from '../services/monitoringService';
import { useAuth } from './AuthProvider';

const StreamContext = createContext(null);

export function StreamProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [events, setEvents] = useState([]);
  const [lastEvent, setLastEvent] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setConnected(false);
      return;
    }

    const unsubscribe = monitoringService.subscribeToStream(
      (event) => {
        if (event.type === 'connected') {
          setConnected(true);
        } else {
          setLastEvent(event);
          setEvents((prev) => [event, ...prev.slice(0, 49)]);
        }
      },
      () => {
        setConnected(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated]);

  return (
    <StreamContext.Provider value={{ connected, events, lastEvent }}>
      {children}
    </StreamContext.Provider>
  );
}

export function useStream() {
  const context = useContext(StreamContext);
  if (!context) {
    throw new Error('useStream must be used within a StreamProvider');
  }
  return context;
}
