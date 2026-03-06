import { useState, useCallback, useRef } from 'react';
import { Message, AppSettings, UploadedImage, GeneratedImage } from '../types';
import { generateImageBatchStream } from '../services/geminiService';
import { generateImageBatchStreamOpenAI } from '../services/openaiService';
import { generateUUID } from '../utils/uuid';
import { classifyError, logError } from '../utils/errorHandler';
import { APIKeyError } from '../types/errors';

interface UseImageGenerationOptions {
  onImageGenerated: (messageId: string, image: GeneratedImage) => void;
  onTextGenerated: (messageId: string, text: string) => void;
  onError: (messageId: string, error: Error) => void;
  getLatestMessages: () => Message[];
}

/**
 * Custom hook for managing image generation with proper abort handling
 */
export function useImageGeneration(options: UseImageGenerationOptions) {
  const { onImageGenerated, onTextGenerated, onError, getLatestMessages } = options;

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      setProgress(null);
    }
  }, []);

  const generateImages = useCallback(
    async (
      prompt: string,
      settings: AppSettings,
      modelMessageId: string,
      uploadedImages?: UploadedImage[]
    ) => {
      const { providerConfig } = settings;

      if (!providerConfig.apiKey) {
        const providerName = providerConfig.provider === 'openai' ? 'OpenAI' : 'Gemini';
        const error = new APIKeyError('API Key is missing', providerName);
        onError(modelMessageId, error);
        return;
      }

      setIsGenerating(true);
      setProgress({ current: 0, total: settings.batchSize });

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      try {
        // Get latest messages at generation time (not from closure)
        const currentMessages = getLatestMessages();

        if (providerConfig.provider === 'openai') {
          // Use OpenAI service
          await generateImageBatchStreamOpenAI(
            providerConfig.apiKey,
            providerConfig.baseUrl || 'https://api.openai.com/v1',
            providerConfig.model || 'gpt-image-1',
            prompt,
            currentMessages,
            settings,
            uploadedImages,
            {
              onImage: (image) => {
                onImageGenerated(modelMessageId, image);
              },
              onText: (text) => {
                onTextGenerated(modelMessageId, text);
              },
              onProgress: (current, total) => {
                setProgress({ current, total });
              }
            },
            abortControllerRef.current.signal
          );
        } else {
          // Use Gemini service
          await generateImageBatchStream(
            providerConfig.apiKey,
            prompt,
            currentMessages,
            settings,
            uploadedImages,
            {
              onImage: (image) => {
                onImageGenerated(modelMessageId, image);
              },
              onText: (text) => {
                onTextGenerated(modelMessageId, text);
              },
              onProgress: (current, total) => {
                setProgress({ current, total });
              }
            },
            abortControllerRef.current.signal
          );
        }
      } catch (error) {
        logError('Image Generation', error);

        // Only handle error if not aborted
        if (!abortControllerRef.current?.signal.aborted) {
          const classifiedError = classifyError(error);
          onError(modelMessageId, classifiedError);
        }
      } finally {
        // Only reset if not already stopped manually
        if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
          setIsGenerating(false);
          setProgress(null);
          abortControllerRef.current = null;
        }
      }
    },
    [onImageGenerated, onTextGenerated, onError, getLatestMessages]
  );

  const retryGeneration = useCallback(
    async (
      prompt: string,
      history: Message[],
      settings: AppSettings,
      modelMessageId: string,
      currentImageCount: number,
      uploadedImages?: UploadedImage[]
    ) => {
      const { providerConfig } = settings;

      if (!providerConfig.apiKey) {
        const providerName = providerConfig.provider === 'openai' ? 'OpenAI' : 'Gemini';
        const error = new APIKeyError('API Key is missing', providerName);
        onError(modelMessageId, error);
        return;
      }

      setIsGenerating(true);
      setProgress({
        current: currentImageCount,
        total: currentImageCount + settings.batchSize
      });

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      try {
        if (providerConfig.provider === 'openai') {
          // Use OpenAI service
          await generateImageBatchStreamOpenAI(
            providerConfig.apiKey,
            providerConfig.baseUrl || 'https://api.openai.com/v1',
            providerConfig.model || 'gpt-image-1',
            prompt,
            history,
            settings,
            uploadedImages,
            {
              onImage: (image) => {
                onImageGenerated(modelMessageId, image);
              },
              onText: (text) => {
                onTextGenerated(modelMessageId, text);
              },
              onProgress: (current, total) => {
                setProgress({
                  current: currentImageCount + current,
                  total: currentImageCount + total
                });
              }
            },
            abortControllerRef.current.signal
          );
        } else {
          // Use Gemini service
          await generateImageBatchStream(
            providerConfig.apiKey,
            prompt,
            history,
            settings,
            uploadedImages,
            {
              onImage: (image) => {
                onImageGenerated(modelMessageId, image);
              },
              onText: (text) => {
                onTextGenerated(modelMessageId, text);
              },
              onProgress: (current, total) => {
                setProgress({
                  current: currentImageCount + current,
                  total: currentImageCount + total
                });
              }
            },
            abortControllerRef.current.signal
          );
        }
      } catch (error) {
        logError('Image Retry', error);

        if (!abortControllerRef.current?.signal.aborted) {
          const classifiedError = classifyError(error);
          onError(modelMessageId, classifiedError);
        }
      } finally {
        if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
          setIsGenerating(false);
          setProgress(null);
          abortControllerRef.current = null;
        }
      }
    },
    [onImageGenerated, onTextGenerated, onError]
  );

  return {
    isGenerating,
    progress,
    generateImages,
    retryGeneration,
    stopGeneration
  };
}
