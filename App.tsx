import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Banana } from 'lucide-react';
import { Message, UploadedImage } from './types';
import { generateUUID } from './utils/uuid';
import { getUserErrorMessage } from './utils/errorHandler';
import { useMessageState } from './hooks/useMessageState';
import { useSessionState } from './hooks/useSessionState';
import { useImageGeneration } from './hooks/useImageGeneration';
import { useSettings } from './hooks/useSettings';
import { useProviderConfig } from './hooks/useProviderConfig';
import { useTheme } from './hooks/useTheme';
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
    createSession,
    switchSession,
    deleteSession,
    updateSessionTitle,
    updateSessionMessages,
    clearCurrentSession
  } = useSessionState();

  // Message state (for current session)
  const {
    messages,
    getLatestMessages,
    addMessages,
    addImageToMessage,
    addTextToMessage,
    updateMessage,
    selectImage,
    deleteMessagesFrom,
    clearAllMessages,
    replaceAllMessages
  } = useMessageState();

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

  // Track the last loaded session to avoid saving when loading
  const lastLoadedSessionRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);

  // Load messages when switching sessions
  useEffect(() => {
    const currentSession = getCurrentSession();
    if (currentSession) {
      lastLoadedSessionRef.current = currentSessionId;
      replaceAllMessages(currentSession.messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]); // Only depend on sessionId change

  // Save messages to current session whenever they change
  useEffect(() => {
    // Skip initial load
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }

    // Skip if we just loaded this session (avoid saving right after loading)
    if (lastLoadedSessionRef.current === currentSessionId) {
      lastLoadedSessionRef.current = null;
      return;
    }

    // Save messages to current session
    updateSessionMessages(currentSessionId, messages);
  }, [messages, currentSessionId, updateSessionMessages]);

  // Sync provider config to settings when it changes
  useEffect(() => {
    updateProviderConfig(providerConfig);
  }, [providerConfig, updateProviderConfig]);

  // Image generation callbacks
  const handleImageGenerated = useCallback(
    (messageId: string, image: import('./types').GeneratedImage) => {
      addImageToMessage(messageId, image);
    },
    [addImageToMessage]
  );

  const handleTextGenerated = useCallback(
    (messageId: string, text: string) => {
      addTextToMessage(messageId, text);
    },
    [addTextToMessage]
  );

  const handleGenerationError = useCallback(
    (messageId: string, error: Error) => {
      const userMessage = getUserErrorMessage(error);
      updateMessage(messageId, {
        isError: true,
        text: userMessage
      });
    },
    [updateMessage]
  );

  const { isGenerating, progress, generateImages, retryGeneration, stopGeneration } =
    useImageGeneration({
      onImageGenerated: handleImageGenerated,
      onTextGenerated: handleTextGenerated,
      onError: handleGenerationError,
      getLatestMessages
    });

  // Handle sending new message
  const handleSend = useCallback(
    async (text: string, images?: UploadedImage[]) => {
      if (isGenerating) return;

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
      addMessages([userMsg, modelMsg]);

      // Start generation
      await generateImages(text || '', settings, modelMsgId, images);
    },
    [isGenerating, settings, addMessages, generateImages]
  );

  const resolveMessagePair = useCallback(
    (modelMessageId: string) => {
      const allMessages = getLatestMessages();
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
      if (isGenerating) return;

      const resolved = resolveMessagePair(modelMessageId);
      if (!resolved) return;

      const { userMsg, modelMsg, history } = resolved;

      // Start retry generation
      const currentImageCount = modelMsg.images?.length || 0;
      await retryGeneration(
        userMsg.text || '',
        history,
        settings,
        modelMessageId,
        currentImageCount,
        userMsg.uploadedImages
      );
    },
    [isGenerating, settings, resolveMessagePair, retryGeneration]
  );

  const handleRegenerate = useCallback(
    (modelMessageId: string) => {
      if (isGenerating) return;

      const resolved = resolveMessagePair(modelMessageId);
      if (!resolved) return;

      setPrefillRequest({
        text: resolved.userMsg.text || '',
        images: resolved.userMsg.uploadedImages ?? []
      });
    },
    [isGenerating, resolveMessagePair]
  );

  // Handle image selection
  const handleSelectImage = useCallback(
    (messageId: string, imageId: string) => {
      selectImage(messageId, imageId);
    },
    [selectImage]
  );

  // Handle message deletion
  const handleDeleteMessages = useCallback(
    (messageId: string) => {
      deleteMessagesFrom(messageId);
    },
    [deleteMessagesFrom]
  );

  // Handle clear current session
  const handleClearAll = useCallback(() => {
    if (isGenerating) {
      stopGeneration();
    }
    clearAllMessages();
    clearCurrentSession();
  }, [isGenerating, stopGeneration, clearAllMessages, clearCurrentSession]);

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
            hasMessages={messages.length > 0}
            messages={messages}
            onImportMessages={(importedMessages) => {
              if (isGenerating) {
                stopGeneration();
              }
              replaceAllMessages(importedMessages);
            }}
          />
        </header>

        {/* Main Content */}
        <main className="flex-1 flex min-h-0 relative">
          {/* Session List Sidebar */}
          <SessionList
            sessions={sessions}
            currentSessionId={currentSessionId}
            onCreateSession={createSession}
            onSwitchSession={switchSession}
            onDeleteSession={deleteSession}
            onUpdateTitle={updateSessionTitle}
            theme={theme}
          />

          {/* Chat Area */}
          <div className="flex-1 flex flex-col min-h-0">
            <MessageList
              messages={messages}
              isGenerating={isGenerating}
              progress={progress}
              onSelectImage={handleSelectImage}
              onRetry={handleRetry}
              onRegenerate={handleRegenerate}
              onDeleteMessage={handleDeleteMessages}
              theme={theme}
              currentGeneratingMessageId={
                isGenerating && messages.length > 0
                  ? messages[messages.length - 1].id
                  : undefined
              }
            />

            {/* Input Area (Sticky) */}
            <div className="flex-none z-40">
              <InputArea
                onSend={handleSend}
                onStop={stopGeneration}
                disabled={isGenerating}
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
