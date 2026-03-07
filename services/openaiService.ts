import OpenAI from 'openai';
import { Message, GeneratedImage, AppSettings, UploadedImage, AspectRatio, Resolution } from '../types';
import { generateUUID } from '../utils/uuid';
import { logError } from '../utils/errorHandler';
import {
  validateApiKey,
  validatePrompt,
  VALIDATION_LIMITS
} from '../utils/validation';
import {
  ImageProcessingError,
  SafetyFilterError,
  NetworkError
} from '../types/errors';
import { StreamCallbacks } from './geminiService';
import { storeImage, trimImages, getImage } from '../utils/imageStorage';

const MAX_CONCURRENT_REQUESTS = 10;
const MAX_RETRIES = 3;

/**
 * Extracts base64 data from a data URI safely
 */
function extractBase64Data(
  dataUri: string
): { mimeType: string; base64Data: string } | null {
  const base64Match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!base64Match) {
    return null;
  }

  const [, mimeTypeFromData, base64Data] = base64Match;
  const finalMimeType = mimeTypeFromData || 'image/png';

  if (!base64Data || base64Data.length === 0) {
    return null;
  }

  return { mimeType: finalMimeType, base64Data };
}

function shouldUseGeminiCompat(baseUrl: string): boolean {
  const normalized = baseUrl.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes('generativelanguage.googleapis.com')) return true;
  if (normalized.includes('/openai')) return true;
  return false;
}

function hasReferenceImages(
  history: Message[],
  uploadedImages: UploadedImage[] | undefined
): boolean {
  if (uploadedImages && uploadedImages.length > 0) return true;
  return history.some(
    (msg) =>
      msg.role === 'model' &&
      !!msg.selectedImageId &&
      !!msg.images?.some((img) => img.id === msg.selectedImageId && img.status === 'success')
  );
}

function mapAspectRatioToOpenAISize(aspectRatio: AspectRatio | undefined, model: string): string {
  const normalizedModel = model.toLowerCase();
  const useDalleSizes = normalizedModel.includes('dall-e-3');

  switch (aspectRatio) {
    case '9:16':
    case '3:4':
      return useDalleSizes ? '1024x1792' : '1024x1536';
    case '16:9':
    case '4:3':
      return useDalleSizes ? '1792x1024' : '1536x1024';
    case '1:1':
    case 'Auto':
    default:
      return '1024x1024';
  }
}

function mapResolutionToOpenAIQuality(
  resolution: Resolution | undefined,
  model: string
): 'standard' | 'hd' | 'low' | 'medium' | 'high' | 'auto' | undefined {
  const normalizedModel = model.toLowerCase();
  const isDalle3 = normalizedModel.includes('dall-e-3');

  if (isDalle3) {
    return resolution && resolution !== '1K' ? 'hd' : 'standard';
  }

  if (!resolution || resolution === '1K') return 'auto';
  return 'high';
}

function inferImageMimeTypeFromUrl(url: string): string {
  const cleanUrl = url.split('?')[0];
  const ext = cleanUrl.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/png';
}

/**
 * Collects selected model images to be used as input for the current request.
 */
async function collectSelectedImages(messages: Message[]): Promise<OpenAI.Chat.ChatCompletionContentPart[]> {
  const selectedImages: OpenAI.Chat.ChatCompletionContentPart[] = [];

  for (const msg of messages) {
    if (msg.role !== 'model' || !msg.selectedImageId || !msg.images) {
      continue;
    }

    const selectedImg = msg.images.find((img) => img.id === msg.selectedImageId);
    if (!selectedImg || selectedImg.status !== 'success') {
      continue;
    }

    // 从 IndexedDB 获取图片数据
    const record = await getImage(selectedImg.id);
    if (!record) {
      logError(
        'Image Processing',
        new ImageProcessingError(
          `Selected image ${selectedImg.id} not found in storage`
        )
      );
      continue;
    }

    const imageData = extractBase64Data(record.data);
    if (!imageData) {
      continue;
    }

    const estimatedSizeMB =
      (imageData.base64Data.length * 3) / 4 / (1024 * 1024);
    if (estimatedSizeMB > VALIDATION_LIMITS.MAX_IMAGE_SIZE_MB) {
      logError(
        'Image Processing',
        new ImageProcessingError(
          `Selected image ${selectedImg.id} is too large (${estimatedSizeMB.toFixed(2)}MB)`
        )
      );
      continue;
    }

    selectedImages.push({
      type: 'image_url',
      image_url: {
        url: record.data
      }
    });
  }

  return selectedImages;
}

/**
 * Constructs the conversation history formatted for the OpenAI API.
 * Intentionally empty: prior text is not carried forward.
 */
function buildHistory(_messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return [];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generates images using OpenAI-compatible API with custom baseURL support
 */
export async function generateImageBatchStreamOpenAI(
  apiKey: string,
  baseUrl: string,
  model: string,
  prompt: string,
  history: Message[],
  settings: AppSettings,
  uploadedImages: UploadedImage[] | undefined,
  callbacks: StreamCallbacks,
  signal: AbortSignal
): Promise<void> {
  // Validate API key
  validateApiKey(apiKey);

  // Validate prompt if provided
  if (prompt) {
    validatePrompt(prompt);
  }

  // Initialize OpenAI client with custom baseURL
  const openai = new OpenAI({
    apiKey,
    baseURL: baseUrl,
    dangerouslyAllowBrowser: true // Required for browser usage
  });

  const useGeminiCompat = shouldUseGeminiCompat(baseUrl);
  if (!useGeminiCompat) {
    // Standard OpenAI Image API flow
    if (!prompt || prompt.trim().length === 0) {
      throw new ImageProcessingError('Prompt is required for OpenAI image generation.');
    }

    if (hasReferenceImages(history, uploadedImages)) {
      throw new ImageProcessingError(
        'OpenAI image generation does not support reference images in this mode.'
      );
    }

    const normalizedModel = model.toLowerCase();
    const size = mapAspectRatioToOpenAISize(settings.aspectRatio, model);
    const quality = mapResolutionToOpenAIQuality(settings.resolution, model);
    const responseFormat = normalizedModel.includes('dall-e') ? 'b64_json' : undefined;

    let attempt = 0;
    let response: OpenAI.ImagesResponse | null = null;

    while (attempt <= MAX_RETRIES && !response) {
      if (signal.aborted) return;

      try {
        response = await openai.images.generate({
          model,
          prompt,
          n: settings.batchSize,
          size,
          ...(quality ? { quality } : {}),
          ...(responseFormat ? { response_format: responseFormat } : {})
        });
      } catch (error) {
        attempt++;

        if (!signal.aborted) {
          if (
            error instanceof Error &&
            (error.message.includes('fetch') || error.message.includes('network'))
          ) {
            logError(`OpenAI Image API Attempt ${attempt}`, new NetworkError(error.message));
          } else {
            logError(`OpenAI Image API Attempt ${attempt}`, error);
          }
        }

        if (attempt <= MAX_RETRIES && !signal.aborted) {
          const waitTime = 1000 * Math.pow(2, attempt - 1);
          await delay(waitTime);
        }
      }
    }

    if (!response) {
      throw new ImageProcessingError('No response from OpenAI image generation.');
    }

    const images = response.data || [];
    if (images.length === 0) {
      throw new ImageProcessingError('No image data in response');
    }

    let completed = 0;
    for (const item of images) {
      if (signal.aborted) return;

      let imageData: string | undefined;
      let mimeType = 'image/png';

      if ('b64_json' in item && item.b64_json) {
        imageData = `data:image/png;base64,${item.b64_json}`;
      } else if ('url' in item && item.url) {
        imageData = item.url;
        mimeType = inferImageMimeTypeFromUrl(item.url);
      }

      if (imageData) {
        const imageId = generateUUID();
        
        // 存储到 IndexedDB
        try {
          await storeImage(imageId, imageData, mimeType);
          // 触发图片数量清理
          await trimImages(1000);
        } catch (storageError) {
          logError('Image Storage', storageError);
        }
        
        // 返回不包含 data 的引用（data 在 IndexedDB 中）
        callbacks.onImage({
          id: imageId,
          mimeType,
          status: 'success'
        });
        completed++;
        callbacks.onProgress(completed, settings.batchSize);
      }
    }

    if (completed === 0) {
      throw new ImageProcessingError('No image data in response');
    }

    return;
  }

  const formattedHistory = buildHistory(history);

  // Build user message parts
  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [];

  // Add text first
  if (prompt) {
    userContent.push({ type: 'text', text: prompt });
  }

  const selectedImages = await collectSelectedImages(history);
  if (selectedImages.length > 0) {
    userContent.push(...selectedImages);
  }

  // Process and validate images
  if (uploadedImages && uploadedImages.length > 0) {
    for (const img of uploadedImages) {
      const imageData = extractBase64Data(img.data);
      if (!imageData) {
        continue; // Skip invalid images
      }

      // Estimate image size
      const estimatedSizeMB =
        (imageData.base64Data.length * 3) / 4 / (1024 * 1024);

      if (estimatedSizeMB > VALIDATION_LIMITS.MAX_IMAGE_SIZE_MB) {
        logError(
          'Image Processing',
          new ImageProcessingError(
            `Image ${img.id} is too large (${estimatedSizeMB.toFixed(2)}MB)`
          )
        );
        continue;
      }

      userContent.push({
        type: 'image_url',
        image_url: {
          url: img.data // Use full data URI
        }
      });
    }
  }

  // Ensure at least one part exists
  if (userContent.length === 0) {
    throw new ImageProcessingError(
      'At least one image or text prompt is required.'
    );
  }

  // Build extra_body for image generation settings
  const extraBody: Record<string, unknown> = {
    modalities: ['image']
  };

  // Set aspect ratio if specified
  if (settings.aspectRatio && settings.aspectRatio !== 'Auto') {
    extraBody.aspect_ratio = settings.aspectRatio;
  }

  // Set resolution if specified
  if (settings.resolution) {
    extraBody.resolution = settings.resolution;
  }

  // Shared task queue
  const taskQueue = Array.from({ length: settings.batchSize }, (_, i) => i);
  let completedCount = 0;

  // Worker function
  const worker = async (workerId: number): Promise<void> => {
    while (taskQueue.length > 0) {
      if (signal.aborted) return;

      const index = taskQueue.shift();
      if (index === undefined) break;

      let attempt = 0;
      let success = false;

      while (attempt <= MAX_RETRIES && !success) {
        if (signal.aborted) return;

        try {
          const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            ...formattedHistory,
            { role: 'user', content: userContent }
          ];

          const response = await openai.chat.completions.create({
            model,
            messages,
            // @ts-ignore - extra_body is not in types but supported by API
            extra_body: extraBody
          });

          const choice = response.choices?.[0];
          if (!choice) {
            throw new ImageProcessingError('No choice returned from API');
          }

          // Check for content filtering
          if (choice.finish_reason === 'content_filter') {
            throw new SafetyFilterError('Content blocked by safety filters');
          }

          const message = choice.message;
          if (!message?.content) {
            throw new ImageProcessingError('No content in response');
          }

          // Extract image and text from response
          let foundImage = false;

          // Handle different content formats
          if (typeof message.content === 'string') {
            // Try to extract data URI from string content
            const dataUriMatch = message.content.match(
              /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/
            );
            if (dataUriMatch) {
              const imageId = generateUUID();
              const imageData = dataUriMatch[0];
              const mimeType = imageData.split(';')[0].split(':')[1];
              
              // 存储到 IndexedDB
              try {
                await storeImage(imageId, imageData, mimeType);
                await trimImages(1000);
              } catch (storageError) {
                logError('Image Storage', storageError);
              }
              
              // 返回不包含 data 的引用
              const img: GeneratedImage = {
                id: imageId,
                mimeType,
                status: 'success'
              };
              callbacks.onImage(img);
              foundImage = true;
            } else {
              // Text response
              callbacks.onText(message.content);
            }
          } else if (Array.isArray(message.content)) {
            // Handle array content
            for (const part of message.content) {
              if (typeof part === 'object' && part !== null) {
                if ('image_url' in part && part.image_url) {
                  const imageUrl =
                    typeof part.image_url === 'string'
                      ? part.image_url
                      : part.image_url.url;

                  if (imageUrl) {
                    const imageId = generateUUID();
                    const mimeType = imageUrl.split(';')[0].split(':')[1] || 'image/png';
                    
                    // 存储到 IndexedDB
                    try {
                      await storeImage(imageId, imageUrl, mimeType);
                      await trimImages(1000);
                    } catch (storageError) {
                      logError('Image Storage', storageError);
                    }
                    
                    // 返回不包含 data 的引用
                    const img: GeneratedImage = {
                      id: imageId,
                      mimeType,
                      status: 'success'
                    };
                    callbacks.onImage(img);
                    foundImage = true;
                  }
                } else if ('text' in part && part.text) {
                  callbacks.onText(part.text);
                }
              }
            }
          }

          if (foundImage) {
            success = true;
          } else {
            throw new ImageProcessingError('No image data in response');
          }
        } catch (error) {
          attempt++;

          if (!signal.aborted) {
            // Classify network errors
            if (
              error instanceof Error &&
              (error.message.includes('fetch') ||
                error.message.includes('network'))
            ) {
              logError(
                `Worker ${workerId} - Image ${index + 1} Attempt ${attempt}`,
                new NetworkError(error.message)
              );
            } else {
              logError(
                `Worker ${workerId} - Image ${index + 1} Attempt ${attempt}`,
                error
              );
            }
          }

          // Retry with exponential backoff
          if (attempt <= MAX_RETRIES && !signal.aborted) {
            const waitTime = 1000 * Math.pow(2, attempt - 1);
            await delay(waitTime);
          }
        }
      }

      // If failed and not aborted, report error image
      if (!success && !signal.aborted) {
        callbacks.onImage({
          id: generateUUID(),
          mimeType: '',
          status: 'error'
        });
      }

      // Update progress
      if (!signal.aborted) {
        completedCount++;
        callbacks.onProgress(completedCount, settings.batchSize);
      }
    }
  };

  // Start workers
  const numWorkers = Math.min(MAX_CONCURRENT_REQUESTS, settings.batchSize);
  const workers = Array.from({ length: numWorkers }, (_, i) => worker(i + 1));

  await Promise.all(workers);
}
