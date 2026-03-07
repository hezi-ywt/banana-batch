import React, { useCallback, useEffect, useState } from 'react';
import { Banana } from 'lucide-react';
import { Message, UploadedImage } from './types';
import { generateUUID } from './utils/uuid';
import { getUserErrorMessage } from './utils/errorHandler';
import { useMessageState } from './hooks/useMessageState';
import { useSettings } from './hooks/useSettings';
import { useProviderConfig } from './hooks/useProviderConfig';
import { useTheme } from './hooks/useTheme';
import { 
  useSessionContext, 
  useGenerationContext 
} from './contexts';
import MessageList from './components/MessageList';
import InputArea from './components/InputArea';
import SettingsPanel from './components/SettingsPanel';
import SessionList from './components/SessionList';
import ErrorBoundary from './components/ErrorBoundary';

const App: React.FC = () => {
  // === Context Hooks ===
  const {
    sessions,
    currentSessionId,
    getCurrentSession,
    createSession,
    switchSession,
    deleteSession,
    updateSessionTitle,
    updateSessionMessages,
    clearCurrentSession,
  } = useSessionContext();

  const {
    isGenerating,
    progress,
    generateImages,
    retryGeneration,
    stopGeneration,
  } = useGenerationContext();

  // === Local Hooks ===
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
    replaceAllMessages,
  } = useMessageState();

  const {
    providerConfig,
    updateProvider,
    updateApiKey,
    updateBaseUrl,
    updateModel,
  } = useProviderConfig();

  const { settings, updateSettings, updateProviderConfig } = useSettings({
    batchSize: 2,
    aspectRatio: 'Auto',
    resolution: '1K',
    providerConfig,
  });

  const { theme, setTheme } = useTheme();
  
  // === Local State ===
  const [prefillRequest, setPrefillRequest] = useState<{ 
    text: string; 
    images?: UploadedImage[] 
  } | null>(null);

  // === Effects ===
  
  // 同步 provider config 到 settings
  useEffect(() => {
    updateProviderConfig(providerConfig);
  }, [providerConfig, updateProviderConfig]);

  // 切换会话时加载消息
  useEffect(() => {
    const currentSession = getCurrentSession();
    if (currentSession) {
      replaceAllMessages(currentSession.messages);
    }
  }, [currentSessionId, getCurrentSession, replaceAllMessages]);

  // 消息变化时保存到当前会话
  useEffect(() => {
    // 跳过首次加载（当消息与会话消息相同时）
    const currentSession = getCurrentSession();
    if (currentSession && JSON.stringify(currentSession.messages) === JSON.stringify(messages)) {
      return;
    }
    
    if (messages.length > 0 || currentSession?.messages.length > 0) {
      updateSessionMessages(currentSessionId, messages);
    }
  }, [messages, currentSessionId, updateSessionMessages, getCurrentSession]);

  // === Handlers ===

  // 图片生成回调
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
        text: userMessage,
      });
    },
    [updateMessage]
  );

  // 发送新消息
  const handleSend = useCallback(
    async (text: string, images?: UploadedImage[]) => {
      if (isGenerating) return;

      // 创建用户消息
      const userMsg: Message = {
        id: generateUUID(),
        role: 'user',
        text: text || undefined,
        uploadedImages: images,
        timestamp: Date.now(),
      };

      // 创建模型消息占位符
      const modelMsgId = generateUUID();
      const modelMsg: Message = {
        id: modelMsgId,
        role: 'model',
        text: undefined,
        textVariations: [],
        images: [],
        generationSettings: {
          aspectRatio: settings.aspectRatio,
        },
        timestamp: Date.now(),
      };

      // 添加两条消息
      addMessages([userMsg, modelMsg]);

      // 开始生成
      await generateImages(
        text || '',
        settings,
        modelMsgId,
        images,
        handleImageGenerated,
        handleTextGenerated,
        handleGenerationError,
        getLatestMessages
      );
    },
    [
      isGenerating, 
      settings, 
      addMessages, 
      generateImages, 
      handleImageGenerated, 
      handleTextGenerated, 
      handleGenerationError,
      getLatestMessages
    ]
  );

  // 解析消息对（用于重试/重新生成）
  const resolveMessagePair = useCallback(
    (modelMessageId: string) => {
      const allMessages = getLatestMessages();
      const modelMsgIndex = allMessages.findIndex(
        (msg) => msg.id === modelMessageId
      );
      if (modelMsgIndex === -1 || allMessages[modelMsgIndex].role !== 'model')
        return null;

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

  // 重试生成
  const handleRetry = useCallback(
    async (modelMessageId: string) => {
      if (isGenerating) return;

      const resolved = resolveMessagePair(modelMessageId);
      if (!resolved) return;

      const { userMsg, modelMsg, history } = resolved;

      // 开始重试生成
      const currentImageCount = modelMsg.images?.length || 0;
      await retryGeneration(
        userMsg.text || '',
        history,
        settings,
        modelMessageId,
        currentImageCount,
        userMsg.uploadedImages,
        handleImageGenerated,
        handleTextGenerated,
        handleGenerationError
      );
    },
    [
      isGenerating, 
      settings, 
      resolveMessagePair, 
      retryGeneration,
      handleImageGenerated,
      handleTextGenerated,
      handleGenerationError
    ]
  );

  // 重新生成（填充输入）
  const handleRegenerate = useCallback(
    (modelMessageId: string) => {
      if (isGenerating) return;

      const resolved = resolveMessagePair(modelMessageId);
      if (!resolved) return;

      setPrefillRequest({
        text: resolved.userMsg.text || '',
        images: resolved.userMsg.uploadedImages ?? [],
      });
    },
    [isGenerating, resolveMessagePair]
  );

  // 选择图片
  const handleSelectImage = useCallback(
    (messageId: string, imageId: string) => {
      selectImage(messageId, imageId);
    },
    [selectImage]
  );

  // 删除消息
  const handleDeleteMessages = useCallback(
    (messageId: string) => {
      deleteMessagesFrom(messageId);
    },
    [deleteMessagesFrom]
  );

  // 清空当前会话
  const handleClearAll = useCallback(() => {
    if (isGenerating) {
      stopGeneration();
    }
    clearAllMessages();
    clearCurrentSession();
  }, [isGenerating, stopGeneration, clearAllMessages, clearCurrentSession]);

  // API Key 变更
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

  // === Render ===
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
