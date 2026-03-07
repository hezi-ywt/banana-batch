import { useState, useCallback, useRef, useEffect } from 'react';
import { Message, AppSettings, UploadedImage, GeneratedImage } from '../types';
import { classifyError, logError } from '../utils/errorHandler';
import { runImageGeneration } from '../core/generationEngine';

interface UseImageGenerationOptions {
  onImageGenerated: (sessionId: string, messageId: string, image: GeneratedImage) => void;
  onTextGenerated: (sessionId: string, messageId: string, text: string) => void;
  onError: (sessionId: string, messageId: string, error: Error) => void;
  getLatestMessages: (sessionId: string) => Message[];
}

interface GenerationState {
  isGenerating: boolean;
  progress: { current: number; total: number } | null;
  currentMessageId?: string;
}

/**
 * Custom hook for managing per-session image generation with abort handling
 */
export function useImageGeneration(options: UseImageGenerationOptions) {
  const { onImageGenerated, onTextGenerated, onError, getLatestMessages } = options;

  const [generationStates, setGenerationStates] = useState<Record<string, GenerationState>>({});
  const generationStatesRef = useRef<Record<string, GenerationState>>(generationStates);
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  useEffect(() => {
    generationStatesRef.current = generationStates;
  }, [generationStates]);

  const setSessionState = useCallback(
    (sessionId: string, updater: (prev: GenerationState) => GenerationState) => {
      setGenerationStates((prev) => {
        const current = prev[sessionId] || { isGenerating: false, progress: null };
        const next = updater(current);
        return {
          ...prev,
          [sessionId]: next
        };
      });
    },
    []
  );

  const stopGeneration = useCallback(
    (sessionId: string) => {
      const controller = abortControllersRef.current[sessionId];
      if (controller) {
        controller.abort();
        delete abortControllersRef.current[sessionId];
      }
      setSessionState(sessionId, () => ({
        isGenerating: false,
        progress: null,
        currentMessageId: undefined
      }));
    },
    [setSessionState]
  );

  const generateImages = useCallback(
    async (
      sessionId: string,
      prompt: string,
      settings: AppSettings,
      modelMessageId: string,
      uploadedImages?: UploadedImage[]
    ) => {
      if (generationStatesRef.current[sessionId]?.isGenerating) return;

      setSessionState(sessionId, () => ({
        isGenerating: true,
        progress: { current: 0, total: settings.batchSize },
        currentMessageId: modelMessageId
      }));

      const controller = new AbortController();
      abortControllersRef.current[sessionId] = controller;

      try {
        const currentMessages = getLatestMessages(sessionId);

        await runImageGeneration({
          prompt,
          history: currentMessages,
          uploadedImages,
          settings,
          signal: controller.signal,
          callbacks: {
            onImage: (image) => {
              onImageGenerated(sessionId, modelMessageId, image);
            },
            onText: (text) => {
              onTextGenerated(sessionId, modelMessageId, text);
            },
            onProgress: (current, total) => {
              setSessionState(sessionId, (prev) => ({
                ...prev,
                progress: { current, total }
              }));
            }
          }
        });
      } catch (error) {
        logError('Image Generation', error);

        if (!controller.signal.aborted) {
          const classifiedError = classifyError(error);
          onError(sessionId, modelMessageId, classifiedError);
        }
      } finally {
        if (abortControllersRef.current[sessionId] === controller) {
          delete abortControllersRef.current[sessionId];
          setSessionState(sessionId, () => ({
            isGenerating: false,
            progress: null,
            currentMessageId: undefined
          }));
        }
      }
    },
    [getLatestMessages, onImageGenerated, onTextGenerated, onError, setSessionState]
  );

  const retryGeneration = useCallback(
    async (
      sessionId: string,
      prompt: string,
      history: Message[],
      settings: AppSettings,
      modelMessageId: string,
      currentImageCount: number,
      uploadedImages?: UploadedImage[]
    ) => {
      if (generationStatesRef.current[sessionId]?.isGenerating) return;

      setSessionState(sessionId, () => ({
        isGenerating: true,
        progress: {
          current: currentImageCount,
          total: currentImageCount + settings.batchSize
        },
        currentMessageId: modelMessageId
      }));

      const controller = new AbortController();
      abortControllersRef.current[sessionId] = controller;

      try {
        await runImageGeneration({
          prompt,
          history,
          uploadedImages,
          settings,
          signal: controller.signal,
          callbacks: {
            onImage: (image) => {
              onImageGenerated(sessionId, modelMessageId, image);
            },
            onText: (text) => {
              onTextGenerated(sessionId, modelMessageId, text);
            },
            onProgress: (current, total) => {
              setSessionState(sessionId, () => ({
                isGenerating: true,
                progress: {
                  current: currentImageCount + current,
                  total: currentImageCount + total
                },
                currentMessageId: modelMessageId
              }));
            }
          }
        });
      } catch (error) {
        logError('Image Retry', error);

        if (!controller.signal.aborted) {
          const classifiedError = classifyError(error);
          onError(sessionId, modelMessageId, classifiedError);
        }
      } finally {
        if (abortControllersRef.current[sessionId] === controller) {
          delete abortControllersRef.current[sessionId];
          setSessionState(sessionId, () => ({
            isGenerating: false,
            progress: null,
            currentMessageId: undefined
          }));
        }
      }
    },
    [onImageGenerated, onTextGenerated, onError, setSessionState]
  );

  return {
    generationStates,
    generateImages,
    retryGeneration,
    stopGeneration
  };
}
