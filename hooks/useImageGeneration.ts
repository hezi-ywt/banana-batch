import { useState, useCallback, useRef } from 'react';
import { Message, AppSettings, UploadedImage, GeneratedImage } from '../types';
import { classifyError, logError } from '../utils/errorHandler';
import { runImageGeneration } from '../core/generationEngine';

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
      setIsGenerating(true);
      setProgress({ current: 0, total: settings.batchSize });

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      try {
        // Get latest messages at generation time (not from closure)
        const currentMessages = getLatestMessages();

        await runImageGeneration({
          prompt,
          history: currentMessages,
          uploadedImages,
          settings,
          signal: abortControllerRef.current.signal,
          callbacks: {
            onImage: (image) => {
              onImageGenerated(modelMessageId, image);
            },
            onText: (text) => {
              onTextGenerated(modelMessageId, text);
            },
            onProgress: (current, total) => {
              setProgress({ current, total });
            }
          }
        });
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
      setIsGenerating(true);
      setProgress({
        current: currentImageCount,
        total: currentImageCount + settings.batchSize
      });

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      try {
        await runImageGeneration({
          prompt,
          history,
          uploadedImages,
          settings,
          signal: abortControllerRef.current.signal,
          callbacks: {
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
          }
        });
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
