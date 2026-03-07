import React, { createContext, useContext, useCallback, useState, useEffect, useRef } from 'react';
import { Message, Session } from '../types';
import { generateUUID } from '../utils/uuid';

/**
 * SessionContext - 管理会话相关的状态和操作
 * 
 * 从 App.tsx 中提取的会话管理逻辑:
 * - 会话列表
 * - 当前会话
 * - 创建/切换/删除会话
 * - 消息持久化
 */

const STORAGE_KEY = 'banana-batch-sessions';
const STORAGE_VERSION = '1';

interface SessionContextState {
  /** 所有会话 */
  sessions: Session[];
  /** 当前会话 ID */
  currentSessionId: string;
  /** 获取当前会话 */
  getCurrentSession: () => Session | undefined;
  /** 创建新会话 */
  createSession: () => void;
  /** 切换会话 */
  switchSession: (sessionId: string) => void;
  /** 删除会话 */
  deleteSession: (sessionId: string) => void;
  /** 更新会话标题 */
  updateSessionTitle: (sessionId: string, title: string) => void;
  /** 更新会话消息 */
  updateSessionMessages: (sessionId: string, messages: Message[]) => void;
  /** 清空当前会话消息 */
  clearCurrentSession: () => void;
}

const SessionContext = createContext<SessionContextState | null>(null);

export const useSessionContext = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessionContext must be used within SessionProvider');
  }
  return context;
};

interface SessionProviderProps {
  children: React.ReactNode;
}

export const SessionProvider: React.FC<SessionProviderProps> = ({ children }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [initialized, setInitialized] = useState(false);

  // 初始化：从 localStorage 加载或创建默认会话
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // 版本检查
        if (parsed.version === STORAGE_VERSION && parsed.sessions?.length > 0) {
          setSessions(parsed.sessions);
          setCurrentSessionId(parsed.currentSessionId || parsed.sessions[0].id);
        } else {
          // 版本不兼容，创建新会话
          createDefaultSession();
        }
      } else {
        createDefaultSession();
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      createDefaultSession();
    }
    setInitialized(true);
  }, []);

  // 保存到 localStorage
  useEffect(() => {
    if (!initialized) return;
    
    try {
      const data = {
        version: STORAGE_VERSION,
        sessions,
        currentSessionId,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save sessions:', error);
      // localStorage 可能已满，尝试清理
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        // 清理旧会话
        cleanupOldSessions();
      }
    }
  }, [sessions, currentSessionId, initialized]);

  const createDefaultSession = () => {
    const newSession: Session = {
      id: generateUUID(),
      title: 'New Session',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setSessions([newSession]);
    setCurrentSessionId(newSession.id);
  };

  const cleanupOldSessions = () => {
    // 保留最近的 10 个会话
    setSessions((prev) => {
      if (prev.length <= 10) return prev;
      const sorted = [...prev].sort((a, b) => b.updatedAt - a.updatedAt);
      const toKeep = sorted.slice(0, 10);
      // 如果当前会话被删除，切换到第一个
      if (!toKeep.find((s) => s.id === currentSessionId)) {
        setCurrentSessionId(toKeep[0].id);
      }
      return toKeep;
    });
  };

  const getCurrentSession = useCallback(() => {
    return sessions.find((s) => s.id === currentSessionId);
  }, [sessions, currentSessionId]);

  const createSession = useCallback(() => {
    const newSession: Session = {
      id: generateUUID(),
      title: 'New Session',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
  }, []);

  const switchSession = useCallback((sessionId: string) => {
    if (sessions.find((s) => s.id === sessionId)) {
      setCurrentSessionId(sessionId);
    }
  }, [sessions]);

  const deleteSession = useCallback(
    (sessionId: string) => {
      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== sessionId);
        // 如果删除的是当前会话，切换到第一个可用会话
        if (sessionId === currentSessionId) {
          if (filtered.length > 0) {
            setCurrentSessionId(filtered[0].id);
          } else {
            // 没有会话了，创建新的
            const newSession: Session = {
              id: generateUUID(),
              title: 'New Session',
              messages: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            filtered.push(newSession);
            setCurrentSessionId(newSession.id);
          }
        }
        return filtered;
      });
    },
    [currentSessionId]
  );

  const updateSessionTitle = useCallback((sessionId: string, title: string) => {
    setSessions((prev) =
      prev.map((s) =
        s.id === sessionId ? { ...s, title, updatedAt: Date.now() } : s
      )
    );
  }, []);

  const updateSessionMessages = useCallback(
    (sessionId: string, messages: Message[]) => {
      setSessions((prev) =
        prev.map((s) =
          s.id === sessionId
            ? { ...s, messages, updatedAt: Date.now() }
            : s
        )
      );
    },
    []
  );

  const clearCurrentSession = useCallback(() => {
    setSessions((prev) =
      prev.map((s) =
        s.id === currentSessionId
          ? { ...s, messages: [], updatedAt: Date.now() }
          : s
      )
    );
  }, [currentSessionId]);

  const value: SessionContextState = {
    sessions,
    currentSessionId,
    getCurrentSession,
    createSession,
    switchSession,
    deleteSession,
    updateSessionTitle,
    updateSessionMessages,
    clearCurrentSession,
  };

  if (!initialized) {
    // 初始化时显示加载状态
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-indigo-500">Loading...</div>
      </div>
    );
  }

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};
