import { useState, useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { Session, Message } from '../types';
import { generateUUID } from '../utils/uuid';

const STORAGE_KEY = 'banana-batch-sessions';
const CURRENT_SESSION_KEY = 'banana-batch-current-session';

function getStoredSessions(): Session[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to load sessions from localStorage:', error);
    }
  }
  return [];
}

function getStoredCurrentSessionId(): string | null {
  try {
    return localStorage.getItem(CURRENT_SESSION_KEY);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to load current session ID:', error);
    }
  }
  return null;
}

function storeSessions(sessions: Session[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to save sessions to localStorage:', error);
    }
  }
}

function storeCurrentSessionId(sessionId: string): void {
  try {
    localStorage.setItem(CURRENT_SESSION_KEY, sessionId);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to save current session ID:', error);
    }
  }
}

function createNewSession(): Session {
  return {
    id: generateUUID(),
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function useSessionState() {
  // Initialize both sessions and current session ID together to avoid mismatch
  const [state, setState] = useState<{
    sessions: Session[];
    currentSessionId: string;
  }>(() => {
    const stored = getStoredSessions();
    const storedId = getStoredCurrentSessionId();

    // Case 1: Have stored sessions
    if (stored.length > 0) {
      // If stored ID exists in sessions, use it
      if (storedId && stored.some(s => s.id === storedId)) {
        return {
          sessions: stored,
          currentSessionId: storedId
        };
      }
      // Otherwise use first session
      return {
        sessions: stored,
        currentSessionId: stored[0].id
      };
    }

    // Case 2: No stored sessions, create new one
    const newSession = createNewSession();
    const initialSessions = [newSession];
    storeSessions(initialSessions);
    storeCurrentSessionId(newSession.id);

    return {
      sessions: initialSessions,
      currentSessionId: newSession.id
    };
  });

  const sessions = state.sessions;
  const currentSessionId = state.currentSessionId;
  const sessionsRef = useRef<Session[]>(sessions);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Update sessions while preserving currentSessionId
  const setSessions = useCallback((updater: React.SetStateAction<Session[]>) => {
    setState(prev => {
      const newSessions = typeof updater === 'function' ? updater(prev.sessions) : updater;
      return {
        sessions: newSessions,
        currentSessionId: prev.currentSessionId
      };
    });
  }, []);

  // Update currentSessionId while preserving sessions
  const setCurrentSessionId = useCallback((id: string) => {
    setState(prev => ({
      sessions: prev.sessions,
      currentSessionId: id
    }));
  }, []);

  // Persist sessions to localStorage whenever they change
  useEffect(() => {
    storeSessions(sessions);
  }, [sessions]);

  // Persist current session ID whenever it changes
  useEffect(() => {
    storeCurrentSessionId(currentSessionId);
  }, [currentSessionId]);

  const getCurrentSession = useCallback((): Session | undefined => {
    return sessions.find(s => s.id === currentSessionId);
  }, [sessions, currentSessionId]);

  const getLatestSessionMessages = useCallback((sessionId: string): Message[] => {
    const session = sessionsRef.current.find(s => s.id === sessionId);
    return session ? session.messages : [];
  }, []);

  const createSession = useCallback(() => {
    const newSession = createNewSession();
    setSessions(prev => [...prev, newSession]);
    setCurrentSessionId(newSession.id);
    return newSession.id;
  }, [setSessions, setCurrentSessionId]);

  const switchSession = useCallback((sessionId: string) => {
    if (sessions.some(s => s.id === sessionId)) {
      setCurrentSessionId(sessionId);
    }
  }, [sessions, setCurrentSessionId]);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId);

      // If deleting current session, switch to another
      if (sessionId === currentSessionId) {
        if (filtered.length === 0) {
          // Create new session if no sessions left
          const newSession = createNewSession();
          setCurrentSessionId(newSession.id);
          return [newSession];
        } else {
          // Switch to first available session
          setCurrentSessionId(filtered[0].id);
        }
      }

      return filtered;
    });
  }, [currentSessionId, setSessions, setCurrentSessionId]);

  const updateSessionTitle = useCallback((sessionId: string, title: string) => {
    setSessions(prev =>
      prev.map(session =>
        session.id === sessionId
          ? { ...session, title, updatedAt: Date.now() }
          : session
      )
    );
  }, [setSessions]);

  const updateSessionMessages = useCallback((sessionId: string, messages: Message[]) => {
    setSessions(prev =>
      prev.map(session =>
        session.id === sessionId
          ? { ...session, messages, updatedAt: Date.now() }
          : session
      )
    );
  }, [setSessions]);

  const updateSessionMessagesById = useCallback(
    (sessionId: string, updater: (prevMessages: Message[]) => Message[]) => {
      setSessions(prev =>
        prev.map(session =>
          session.id === sessionId
            ? { ...session, messages: updater(session.messages), updatedAt: Date.now() }
            : session
        )
      );
    },
    [setSessions]
  );

  const clearCurrentSession = useCallback(() => {
    setSessions(prev =>
      prev.map(session =>
        session.id === currentSessionId
          ? { ...session, messages: [], updatedAt: Date.now() }
          : session
      )
    );
  }, [currentSessionId, setSessions]);

  return {
    sessions,
    currentSessionId,
    getCurrentSession,
    getLatestSessionMessages,
    createSession,
    switchSession,
    deleteSession,
    updateSessionTitle,
    updateSessionMessages,
    updateSessionMessagesById,
    clearCurrentSession
  };
}
