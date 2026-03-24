import React, { useCallback, useEffect, useState } from 'react';
import { Banana } from 'lucide-react';
import { Message, UploadedImage } from './types';
import { generateUUID } from './utils/uuid';
import { getUserErrorMessage } from './utils/errorHandler';
import { useSessionState } from './hooks/useSessionState';
import { useImageGeneration } from './hooks/useImageGeneration';
import { useSettings } from './hooks/useSettings';
import { useProviderConfig } from './hooks/useProviderConfig';
import { useTheme } from './hooks/useTheme';
import { getStorageEstimate, AppStorageEstimate } from './utils/indexedDb';
import MessageList from './components/MessageList';
import InputArea from './components/InputArea';
import SettingsPanel from './components/SettingsPanel';
import SessionList from './components/SessionList';
import ErrorBoundary from './components/ErrorBoundary';

const App: React.FC = () => {
  // Session management
  const {
    sessions,
    currentSessionId,
    getCurrentSession,
    getLatestSessionMessages,
    createSession,
    switchSession,
    deleteSession,
    updateSessionTitle,
    updateSessionMessagesById,
    clearCurrentSession,
    cleanupCache
  } = useSessionState();

  const {
    providerConfig,
    updateProvider,
    updateApiKey,
    updateBaseUrl,
    updateModel
  } = useProviderConfig();

  const { settings, updateSettings, updateProviderConfig } = useSettings({
    batchSize: 2,
    aspectRatio: 'Auto',
    resolution: '1K',
    providerConfig
  });

  const { theme, setTheme } = useTheme();
  const [prefillRequest, setPrefillRequest] = useState<{ text: string; images?: UploadedImage[] } | null>(null);
  const [storageUsage, setStorageUsage] = useState<AppStorageEstimate | null>(null);
  const currentSession = getCurrentSession();
  const messages = currentSession?.messages ?? [];

  useEffect(() => {
    setPrefillRequest(null);
  }, [currentSessionId]);

  useEffect(() => {
    void getStorageEstimate().then(setStorageUsage).catch(() => {
      setStorageUsage(null);
    });
  }, [sessions]);

  const refreshStorageUsage = useCallback(() => {
    void getStorageEstimate().then(setStorageUsage).catch(() => {
      setStorageUsage(null);
    });
  }, []);

  // Sync provider config to settings when it changes
  useEffect(() => {
    updateProviderConfig(providerConfig);
  }, [providerConfig, updateProviderConfig]);

  const addMessagesToSession = useCallback(
    (sessionId: string, newMessages: Message[]) => {
      updateSessionMessagesById(sessionId, (prev) => [...prev, ...newMessages]);
    },
    [updateSessionMessagesById]
  );

  const updateMessageInSession = useCallback(
    (sessionId: string, messageId: string, updates: Partial<Message>) => {
      updateSessionMessagesById(sessionId, (prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, ...updates } : msg))
      );
    },
    [updateSessionMessagesById]
  );

  const addImageToMessageInSession = useCallback(
    (sessionId: string, messageId: string, image: import('./types').GeneratedImage) => {
      updateSessionMessagesById(sessionId, (prev) =>
        prev.map((msg) => {
          if (msg.id === messageId) {
            const updatedImages = [...(msg.images || []), image];
            return { ...msg, images: updatedImages };
          }
          return msg;
        })
      );
    },
    [updateSessionMessagesById]
  );

  const addTextToMessageInSession = useCallback(
    (sessionId: string, messageId: string, text: string) => {
      updateSessionMessagesById(sessionId, (prev) =>
        prev.map((msg) => {
          if (msg.id === messageId) {
            const currentVariations = msg.textVariations || [];
            if (currentVariations.includes(text)) {
              return msg;
            }
            const nextVariations = [...currentVariations, text];
            return {
              ...msg,
              text: nextVariations[0],
              textVariations: nextVariations
            };
          }
          return msg;
        })
      );
    },
    [updateSessionMessagesById]
  );

  const selectImageInSession = useCallback(
    (sessionId: string, messageId: string, imageId: string) => {
      updateSessionMessagesById(sessionId, (prev) =>
        prev.map((msg) => {
          if (msg.id === messageId) {
            const newSelection = msg.selectedImageId === imageId ? undefined : imageId;
            return { ...msg, selectedImageId: newSelection };
          }
          return msg;
        })
      );
    },
    [updateSessionMessagesById]
  );

  const deleteMessagesFromSession = useCallback(
    (sessionId: string, messageId: string) => {
      updateSessionMessagesById(sessionId, (prev) => {
        const messageIndex = prev.findIndex((msg) => msg.id === messageId);
        if (messageIndex === -1) return prev;
        return prev.slice(0, messageIndex);
      });
    },
    [updateSessionMessagesById]
  );

  const getLatestMessages = useCallback(
    (sessionId: string) => getLatestSessionMessages(sessionId),
    [getLatestSessionMessages]
  );

  // Image generation callbacks
  const handleImageGenerated = useCallback(
    (sessionId: string, messageId: string, image: import('./types').GeneratedImage) => {
      addImageToMessageInSession(sessionId, messageId, image);
    },
    [addImageToMessageInSession]
  );

  const handleTextGenerated = useCallback(
    (sessionId: string, messageId: string, text: string) => {
      addTextToMessageInSession(sessionId, messageId, text);
    },
    [addTextToMessageInSession]
  );

  const handleGenerationError = useCallback(
    (sessionId: string, messageId: string, error: Error) => {
      const userMessage = getUserErrorMessage(error);
      updateMessageInSession(sessionId, messageId, {
        isError: true,
        text: userMessage
      });
    },
    [updateMessageInSession]
  );

  const { generationStates, generateImages, retryGeneration, stopGeneration } =
    useImageGeneration({
      onImageGenerated: handleImageGenerated,
      onTextGenerated: handleTextGenerated,
      onError: handleGenerationError,
      getLatestMessages
    });

  const currentGenerationState = generationStates[currentSessionId] || {
    isGenerating: false,
    progress: null,
    currentMessageId: undefined
  };

  // Handle sending new message
  const handleSend = useCallback(
    async (text: string, images?: UploadedImage[]) => {
      if (currentGenerationState.isGenerating) return;
      const sessionId = currentSessionId;

      // Create user message
      const userMsg: Message = {
        id: generateUUID(),
        role: 'user',
        text: text || undefined,
        uploadedImages: images,
        timestamp: Date.now()
      };

      // Create model message placeholder
      const modelMsgId = generateUUID();
      const modelMsg: Message = {
        id: modelMsgId,
        role: 'model',
        text: undefined,
        textVariations: [],
        images: [],
        generationSettings: {
          aspectRatio: settings.aspectRatio
        },
        timestamp: Date.now()
      };

      // Add both messages
      addMessagesToSession(sessionId, [userMsg, modelMsg]);

      // Start generation
      await generateImages(sessionId, text || '', settings, modelMsgId, images);
    },
    [currentGenerationState.isGenerating, currentSessionId, settings, addMessagesToSession, generateImages]
  );

  const resolveMessagePair = useCallback(
    (sessionId: string, modelMessageId: string) => {
      const allMessages = getLatestMessages(sessionId);
      const modelMsgIndex = allMessages.findIndex((msg) => msg.id === modelMessageId);
      if (modelMsgIndex === -1 || allMessages[modelMsgIndex].role !== 'model') return null;

      let userMsgIndex = -1;
      for (let i = modelMsgIndex - 1; i >= 0; i--) {
        if (allMessages[i].role === 'user') {
          userMsgIndex = i;
          break;
        }
      }

      if (userMsgIndex === -1) return null;

      const userMsg = allMessages[userMsgIndex];
      const modelMsg = allMessages[modelMsgIndex];
      const history = allMessages.slice(0, userMsgIndex);

      return { userMsg, modelMsg, history };
    },
    [getLatestMessages]
  );

  // Handle retry
  const handleRetry = useCallback(
    async (modelMessageId: string) => {
      if (currentGenerationState.isGenerating) return;
      const sessionId = currentSessionId;

      const resolved = resolveMessagePair(sessionId, modelMessageId);
      if (!resolved) return;

      const { userMsg, modelMsg, history } = resolved;

      // Start retry generation
      const currentImageCount = modelMsg.images?.length || 0;
      await retryGeneration(
        sessionId,
        userMsg.text || '',
        history,
        settings,
        modelMessageId,
        currentImageCount,
        userMsg.uploadedImages
      );
    },
    [currentGenerationState.isGenerating, currentSessionId, settings, resolveMessagePair, retryGeneration]
  );

  const handleRegenerate = useCallback(
    (modelMessageId: string) => {
      if (currentGenerationState.isGenerating) return;
      const sessionId = currentSessionId;

      const resolved = resolveMessagePair(sessionId, modelMessageId);
      if (!resolved) return;

      setPrefillRequest({
        text: resolved.userMsg.text || '',
        images: resolved.userMsg.uploadedImages ?? []
      });
    },
    [currentGenerationState.isGenerating, currentSessionId, resolveMessagePair]
  );

  // Handle image selection
  const handleSelectImage = useCallback(
    (messageId: string, imageId: string) => {
      selectImageInSession(currentSessionId, messageId, imageId);
    },
    [currentSessionId, selectImageInSession]
  );

  // Handle message deletion
  const handleDeleteMessages = useCallback(
    (messageId: string) => {
      deleteMessagesFromSession(currentSessionId, messageId);
    },
    [currentSessionId, deleteMessagesFromSession]
  );

  // Handle clear current session
  const handleClearAll = useCallback(() => {
    if (currentGenerationState.isGenerating) {
      stopGeneration(currentSessionId);
    }
    clearCurrentSession();
  }, [currentGenerationState.isGenerating, currentSessionId, stopGeneration, clearCurrentSession]);

  const handleCreateSession = useCallback(() => {
    createSession();
  }, [createSession]);

  const handleSwitchSession = useCallback(
    (sessionId: string) => {
      switchSession(sessionId);
    },
    [switchSession]
  );

  // Handle API key change
  const handleApiKeyChange = useCallback(
    (key: string) => {
      try {
        updateApiKey(key);
      } catch (error) {
        const errorMessage = getUserErrorMessage(error);
        alert(errorMessage);
      }
    },
    [updateApiKey]
  );

  const handleCleanupCache = useCallback(async () => {
    const result = await cleanupCache();
    refreshStorageUsage();

    if (result.mode === 'none') {
      alert('当前缓存未达到清理条件，暂无可清理图片。');
      return;
    }

    const deletedMB = (result.deletedBytes / (1024 * 1024)).toFixed(1);
    alert(`缓存清理完成：已清理 ${result.deletedImageIds.length} 张图片，释放约 ${deletedMB} MB。`);
  }, [cleanupCache, refreshStorageUsage]);

  return (
    <ErrorBoundary>
      <div
        className={`flex flex-col h-screen transition-colors duration-200 ${
          theme === 'light' ? 'bg-gray-50 text-gray-900' : 'bg-zinc-950 text-zinc-200'
        }`}
      >
        {/* Header */}
        <header
          className={`flex-none px-6 py-4 flex items-center justify-between border-b backdrop-blur-md sticky top-0 z-50 transition-colors duration-200 ${
            theme === 'light'
              ? 'border-gray-200 bg-white/80'
              : 'border-zinc-800 bg-zinc-950/80'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className="bg-yellow-400 p-1.5 rounded-lg text-black">
              <Banana size={20} className="fill-black" />
            </div>
            <div className="hidden sm:block">
              <h1
                className={`font-bold text-lg leading-tight tracking-tight ${
                  theme === 'light' ? 'text-gray-900' : 'text-zinc-200'
                }`}
              >
                Banana Batch
              </h1>
              <p
                className={`text-xs font-medium ${
                  theme === 'light' ? 'text-gray-500' : 'text-zinc-500'
                }`}
              >
                NanoBanana Image Generator • Parallel Generation
              </p>
            </div>
          </div>

          <SettingsPanel
            settings={settings}
            updateSettings={updateSettings}
            providerConfig={providerConfig}
            onProviderChange={updateProvider}
            onApiKeyChange={handleApiKeyChange}
            onBaseUrlChange={updateBaseUrl}
            onModelChange={updateModel}
            theme={theme}
            onThemeChange={setTheme}
            onClearAll={handleClearAll}
            onCleanupCache={handleCleanupCache}
            hasMessages={messages.length > 0}
            messages={messages}
            storageUsage={storageUsage}
            onImportMessages={(importedMessages) => {
              if (currentGenerationState.isGenerating) {
                stopGeneration(currentSessionId);
              }
              updateSessionMessagesById(currentSessionId, () => importedMessages);
              refreshStorageUsage();
            }}
          />
        </header>

        {/* Main Content */}
        <main className="flex-1 flex min-h-0 relative">
          {/* Session List Sidebar */}
            <SessionList
              sessions={sessions}
              currentSessionId={currentSessionId}
              onCreateSession={handleCreateSession}
              onSwitchSession={handleSwitchSession}
              onDeleteSession={deleteSession}
              onUpdateTitle={updateSessionTitle}
              theme={theme}
              generationStates={generationStates}
            />

          {/* Chat Area */}
          <div className="flex-1 flex flex-col min-h-0">
            <MessageList
              messages={messages}
              isGenerating={currentGenerationState.isGenerating}
              progress={currentGenerationState.progress}
              onSelectImage={handleSelectImage}
              onRetry={handleRetry}
              onRegenerate={handleRegenerate}
              onDeleteMessage={handleDeleteMessages}
              theme={theme}
              currentGeneratingMessageId={currentGenerationState.currentMessageId}
            />

            {/* Input Area (Sticky) */}
            <div className="flex-none z-40">
              <InputArea
                onSend={handleSend}
                onStop={() => stopGeneration(currentSessionId)}
                disabled={currentGenerationState.isGenerating}
                theme={theme}
                prefillRequest={prefillRequest ?? undefined}
              />
            </div>
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
};

export default App;
