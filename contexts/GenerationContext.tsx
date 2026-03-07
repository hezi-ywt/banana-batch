import React, { createContext, useContext, useCallback, useState, useRef } from 'react';
import { Message, AppSettings, UploadedImage, GeneratedImage } from '../types';
import { useImageContext } from './ImageContext';
import { generateImageBatchStream } from '../services/geminiService';
import { generateImageBatchStreamOpenAI } from '../services/openaiService';
import { generateUUID } from '../utils/uuid';
import { classifyError, logError } from '../utils/errorHandler';
import { APIKeyError } from '../types/errors';

/**
 * GenerationContext - 管理图片生成状态和操作
 * 
 * 从 App.tsx 中提取的生成逻辑:
 * - 生成状态管理 (isGenerating, progress)
 * - 图片生成流程
 * - 重试/重新生成
 * - AbortController 管理
 */

interface GenerationProgress {
  current: number;
  total: number;
}

interface GenerationContextState {
  /** 是否正在生成 */
  isGenerating: boolean;
  /** 生成进度 */
  progress: GenerationProgress | null;
  /** 生成图片 */
  generateImages: (
    prompt: string,
    settings: AppSettings,
    modelMessageId: string,
    uploadedImages?: UploadedImage[],
    onImageGenerated?: (messageId: string, image: GeneratedImage) => void,
    onTextGenerated?: (messageId: string, text: string) => void,
    onError?: (messageId: string, error: Error) => void,
    getLatestMessages?: () => Message[]
  ) => Promise<void>;
  /** 重试生成（在现有消息上添加更多图片） */
  retryGeneration: (
    prompt: string,
    history: Message[],
    settings: AppSettings,
    modelMessageId: string,
    currentImageCount: number,
    uploadedImages: UploadedImage[] | undefined,
    onImageGenerated?: (messageId: string, image: GeneratedImage) => void,
    onTextGenerated?: (messageId: string, text: string) => void,
    onError?: (messageId: string, error: Error) => void
  ) => Promise<void>;
  /** 停止生成 */
  stopGeneration: () => void;
}

const GenerationContext = createContext<GenerationContextState | null>(null);

export const useGenerationContext = () => {
  const context = useContext(GenerationContext);
  if (!context) {
    throw new Error('useGenerationContext must be used within GenerationProvider');
  }
  return context;
};

interface GenerationProviderProps {
  children: React.ReactNode;
}

export const GenerationProvider: React.FC<GenerationProviderProps> = ({ children }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * 停止生成
   */
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      setProgress(null);
    }
  }, []);

  /**
   * 生成图片
   */
  const generateImages = useCallback(
    async (
      prompt: string,
      settings: AppSettings,
      modelMessageId: string,
      uploadedImages?: UploadedImage[],
      onImageGenerated?: (messageId: string, image: GeneratedImage) => void,
      onTextGenerated?: (messageId: string, text: string) => void,
      onError?: (messageId: string, error: Error) => void,
      getLatestMessages?: () => Message[]
    ) => {
      const { providerConfig } = settings;

      if (!providerConfig.apiKey) {
        const providerName = providerConfig.provider === 'openai' ? 'OpenAI' : 'Gemini';
        const error = new APIKeyError('API Key is missing', providerName);
        onError?.(modelMessageId, error);
        return;
      }

      setIsGenerating(true);
      setProgress({ current: 0, total: settings.batchSize });

      // 创建新的 AbortController
      abortControllerRef.current = new AbortController();

      try {
        // 获取最新的消息
        const currentMessages = getLatestMessages?.() || [];

        const callbacks = {
          onImage: (image: GeneratedImage) => {
            onImageGenerated?.(modelMessageId, image);
          },
          onText: (text: string) => {
            onTextGenerated?.(modelMessageId, text);
          },
          onProgress: (current: number, total: number) => {
            setProgress({ current, total });
          },
        };

        if (providerConfig.provider === 'openai') {
          await generateImageBatchStreamOpenAI(
            providerConfig.apiKey,
            providerConfig.baseUrl || 'https://api.openai.com/v1',
            providerConfig.model || 'gpt-image-1',
            prompt,
            currentMessages,
            settings,
            uploadedImages,
            callbacks,
            abortControllerRef.current.signal
          );
        } else {
          await generateImageBatchStream(
            providerConfig.apiKey,
            prompt,
            currentMessages,
            settings,
            uploadedImages,
            callbacks,
            abortControllerRef.current.signal
          );
        }
      } catch (error) {
        logError('Image Generation', error);

        // 仅处理非取消错误
        if (!abortControllerRef.current?.signal.aborted) {
          const classifiedError = classifyError(error);
          onError?.(modelMessageId, classifiedError);
        }
      } finally {
        // 仅在未手动停止时重置状态
        if (
          abortControllerRef.current &&
          !abortControllerRef.current.signal.aborted
        ) {
          setIsGenerating(false);
          setProgress(null);
          abortControllerRef.current = null;
        }
      }
    },
    []
  );

  /**
   * 重试生成（用于"生成更多"功能）
   */
  const retryGeneration = useCallback(
    async (
      prompt: string,
      history: Message[],
      settings: AppSettings,
      modelMessageId: string,
      currentImageCount: number,
      uploadedImages: UploadedImage[] | undefined,
      onImageGenerated?: (messageId: string, image: GeneratedImage) => void,
      onTextGenerated?: (messageId: string, text: string) => void,
      onError?: (messageId: string, error: Error) => void
    ) => {
      const { providerConfig } = settings;

      if (!providerConfig.apiKey) {
        const providerName = providerConfig.provider === 'openai' ? 'OpenAI' : 'Gemini';
        const error = new APIKeyError('API Key is missing', providerName);
        onError?.(modelMessageId, error);
        return;
      }

      setIsGenerating(true);
      setProgress({
        current: currentImageCount,
        total: currentImageCount + settings.batchSize,
      });

      // 创建新的 AbortController
      abortControllerRef.current = new AbortController();

      try {
        const callbacks = {
          onImage: (image: GeneratedImage) => {
            onImageGenerated?.(modelMessageId, image);
          },
          onText: (text: string) => {
            onTextGenerated?.(modelMessageId, text);
          },
          onProgress: (current: number, total: number) => {
            setProgress({
              current: currentImageCount + current,
              total: currentImageCount + total,
            });
          },
        };

        if (providerConfig.provider === 'openai') {
          await generateImageBatchStreamOpenAI(
            providerConfig.apiKey,
            providerConfig.baseUrl || 'https://api.openai.com/v1',
            providerConfig.model || 'gpt-image-1',
            prompt,
            history,
            settings,
            uploadedImages,
            callbacks,
            abortControllerRef.current.signal
          );
        } else {
          await generateImageBatchStream(
            providerConfig.apiKey,
            prompt,
            history,
            settings,
            uploadedImages,
            callbacks,
            abortControllerRef.current.signal
          );
        }
      } catch (error) {
        logError('Image Retry', error);

        if (!abortControllerRef.current?.signal.aborted) {
          const classifiedError = classifyError(error);
          onError?.(modelMessageId, classifiedError);
        }
      } finally {
        if (
          abortControllerRef.current &&
          !abortControllerRef.current.signal.aborted
        ) {
          setIsGenerating(false);
          setProgress(null);
          abortControllerRef.current = null;
        }
      }
    },
    []
  );

  const value: GenerationContextState = {
    isGenerating,
    progress,
    generateImages,
    retryGeneration,
    stopGeneration,
  };

  return (
    <GenerationContext.Provider value={value}>
      {children}
    </GenerationContext.Provider>
  );
};
