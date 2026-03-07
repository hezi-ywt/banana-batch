import React, { useState, useCallback } from 'react';
import { Session } from '../types';
import { MessageSquare, Plus, Trash2, Check, X, Edit2 } from 'lucide-react';

interface SessionListProps {
  sessions: Session[];
  currentSessionId: string;
  onCreateSession: () => void;
  onSwitchSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdateTitle: (sessionId: string, title: string) => void;
  theme: 'light' | 'dark';
  generationStates?: Record<string, { isGenerating: boolean }>;
}

const SessionList: React.FC<SessionListProps> = ({
  sessions,
  currentSessionId,
  onCreateSession,
  onSwitchSession,
  onDeleteSession,
  onUpdateTitle,
  theme,
  generationStates
}) => {
  const isLight = theme === 'light';
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const handleStartEdit = useCallback((session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  }, []);

  const handleSaveEdit = useCallback((sessionId: string) => {
    const trimmedTitle = editTitle.trim();
    if (trimmedTitle) {
      onUpdateTitle(sessionId, trimmedTitle);
    }
    setEditingSessionId(null);
    setEditTitle('');
  }, [editTitle, onUpdateTitle]);

  const handleCancelEdit = useCallback(() => {
    setEditingSessionId(null);
    setEditTitle('');
  }, []);

  const handleDelete = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length === 1) {
      alert('至少需要保留一个会话');
      return;
    }
    if (confirm('确定要删除这个会话吗？')) {
      onDeleteSession(sessionId);
    }
  }, [sessions.length, onDeleteSession]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return '今天';
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className={`w-64 h-full flex flex-col border-r transition-colors duration-200 ${
      isLight
        ? 'bg-white border-gray-200'
        : 'bg-zinc-900 border-zinc-800'
    }`}>
      {/* Header */}
      <div className={`p-4 border-b ${
        isLight ? 'border-gray-200' : 'border-zinc-800'
      }`}>
        <button
          onClick={onCreateSession}
          className={`w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg transition-all ${
            isLight
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg hover:shadow-xl'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg hover:shadow-xl'
          }`}
        >
          <Plus size={18} />
          <span className="font-medium">新建会话</span>
        </button>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map(session => {
          const isActive = session.id === currentSessionId;
          const isEditing = editingSessionId === session.id;
          const messageCount = session.messages.length;
          const isGenerating = !!generationStates?.[session.id]?.isGenerating;

          return (
            <div
              key={session.id}
              onClick={() => !isEditing && onSwitchSession(session.id)}
              className={`group relative rounded-lg px-3 py-2.5 cursor-pointer transition-all ${
                isActive
                  ? isLight
                    ? 'bg-indigo-50 border border-indigo-200'
                    : 'bg-indigo-900/30 border border-indigo-700/50'
                  : isLight
                    ? 'hover:bg-gray-50 border border-transparent'
                    : 'hover:bg-zinc-800/50 border border-transparent'
              }`}
            >
              <div className="flex items-start space-x-2">
                <MessageSquare
                  size={16}
                  className={`mt-0.5 flex-shrink-0 ${
                    isActive
                      ? 'text-indigo-600'
                      : isLight
                        ? 'text-gray-400'
                        : 'text-zinc-500'
                  }`}
                />

                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex items-center space-x-1" onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            handleSaveEdit(session.id);
                          } else if (e.key === 'Escape') {
                            handleCancelEdit();
                          }
                        }}
                        className={`flex-1 px-2 py-1 text-sm rounded border ${
                          isLight
                            ? 'bg-white border-gray-300 text-gray-900 focus:border-indigo-500'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-100 focus:border-indigo-500'
                        } focus:outline-none focus:ring-1 focus:ring-indigo-500`}
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveEdit(session.id)}
                        className={`p-1 rounded ${
                          isLight
                            ? 'hover:bg-green-100 text-green-600'
                            : 'hover:bg-green-900/30 text-green-400'
                        }`}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className={`p-1 rounded ${
                          isLight
                            ? 'hover:bg-red-100 text-red-600'
                            : 'hover:bg-red-900/30 text-red-400'
                        }`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className={`text-sm font-medium truncate ${
                          isActive
                            ? isLight
                              ? 'text-indigo-900'
                              : 'text-indigo-200'
                            : isLight
                              ? 'text-gray-900'
                              : 'text-zinc-200'
                        }`}>
                          {session.title}
                        </h3>
                        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => handleStartEdit(session, e)}
                            className={`p-1 rounded ${
                              isLight
                                ? 'hover:bg-indigo-100 text-gray-600'
                                : 'hover:bg-indigo-900/30 text-zinc-400'
                            }`}
                            title="重命名"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={(e) => handleDelete(session.id, e)}
                            className={`p-1 rounded ${
                              isLight
                                ? 'hover:bg-red-100 text-red-600'
                                : 'hover:bg-red-900/30 text-red-400'
                            }`}
                            title="删除会话"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div className={`flex items-center justify-between mt-1 text-xs ${
                        isLight ? 'text-gray-500' : 'text-zinc-500'
                      }`}>
                        <div className="flex items-center gap-2">
                          <span>{messageCount} 条消息</span>
                          {isGenerating && (
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              isLight
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-indigo-900/40 text-indigo-300'
                            }`} title="生成中">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                              生成中
                            </span>
                          )}
                        </div>
                        <span>{formatDate(session.updatedAt)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SessionList;
