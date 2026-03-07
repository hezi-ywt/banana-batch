import { useState, useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { Session, Message } from '../types';
import { generateUUID } from '../utils/uuid';
import {
  getAllSessions,
  putSession,
  deleteSessionById,
  getMetaValue,
  setMetaValue
} from '../utils/indexedDb';

const LEGACY_STORAGE_KEY = 'banana-batch-sessions';
const LEGACY_CURRENT_SESSION_KEY = 'banana-batch-current-session';
const META_CURRENT_SESSION_KEY = 'currentSessionId';

function getLegacySessions(): Session[] {
  try {
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
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

function getLegacyCurrentSessionId(): string | null {
  try {
    return localStorage.getItem(LEGACY_CURRENT_SESSION_KEY);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to load current session ID:', error);
    }
  }
  return null;
}

function clearLegacyStorage(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_CURRENT_SESSION_KEY);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to clear legacy storage:', error);
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
    const stored = getLegacySessions();
    const storedId = getLegacyCurrentSessionId();

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

    return {
      sessions: initialSessions,
      currentSessionId: newSession.id
    };
  });

  const sessions = state.sessions;
  const currentSessionId = state.currentSessionId;
  const sessionsRef = useRef<Session[]>(sessions);
  const prevSessionsRef = useRef<Session[]>([]);
  const hasHydratedRef = useRef(false);

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

  // Persist sessions to IndexedDB whenever they change
  useEffect(() => {
    const persist = async () => {
      const prev = prevSessionsRef.current;
      const current = sessions;
      prevSessionsRef.current = current;

      const prevMap = new Map(prev.map((session) => [session.id, session]));
      const currentMap = new Map(current.map((session) => [session.id, session]));

      for (const session of current) {
        const previous = prevMap.get(session.id);
        if (!previous || previous.updatedAt !== session.updatedAt) {
          try {
            await putSession(session);
          } catch (error) {
            if (import.meta.env.DEV) {
              console.error('Failed to persist session:', error);
            }
          }
        }
      }

      for (const session of prev) {
        if (!currentMap.has(session.id)) {
          try {
            await deleteSessionById(session.id);
          } catch (error) {
            if (import.meta.env.DEV) {
              console.error('Failed to delete session from DB:', error);
            }
          }
        }
      }
    };

    if (hasHydratedRef.current) {
      void persist();
    }
  }, [sessions]);

  // Persist current session ID whenever it changes
  useEffect(() => {
    if (!hasHydratedRef.current) return;
    void setMetaValue(META_CURRENT_SESSION_KEY, currentSessionId);
  }, [currentSessionId]);

  // Hydrate from IndexedDB, fallback to legacy localStorage if needed
  useEffect(() => {
    let isCancelled = false;

    const hydrate = async () => {
      try {
        const [dbSessions, dbCurrentId] = await Promise.all([
          getAllSessions(),
          getMetaValue<string>(META_CURRENT_SESSION_KEY)
        ]);

        if (isCancelled) return;

        if (dbSessions.length > 0) {
          const nextId =
            dbCurrentId && dbSessions.some((session) => session.id === dbCurrentId)
              ? dbCurrentId
              : dbSessions[0].id;
          prevSessionsRef.current = dbSessions;
          setState({ sessions: dbSessions, currentSessionId: nextId });
          hasHydratedRef.current = true;
          return;
        }

        const legacySessions = getLegacySessions();
        const legacyId = getLegacyCurrentSessionId();

        if (legacySessions.length > 0) {
          const nextId =
            legacyId && legacySessions.some((session) => session.id === legacyId)
              ? legacyId
              : legacySessions[0].id;
          prevSessionsRef.current = legacySessions;
          setState({ sessions: legacySessions, currentSessionId: nextId });
          hasHydratedRef.current = true;
          clearLegacyStorage();

          await Promise.all([
            ...legacySessions.map((session) => putSession(session)),
            setMetaValue(META_CURRENT_SESSION_KEY, nextId)
          ]);
          return;
        }

        hasHydratedRef.current = true;
        prevSessionsRef.current = sessionsRef.current;
        await Promise.all([
          ...sessionsRef.current.map((session) => putSession(session)),
          setMetaValue(META_CURRENT_SESSION_KEY, currentSessionId)
        ]);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Failed to hydrate sessions from IndexedDB:', error);
        }
        hasHydratedRef.current = true;
      }
    };

    void hydrate();

    return () => {
      isCancelled = true;
    };
  }, []);

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
