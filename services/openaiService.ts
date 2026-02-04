import OpenAI from 'openai';
import { Message, GeneratedImage, AppSettings, UploadedImage } from '../types';
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

/**
 * Collects selected model images to be used as input for the current request.
 */
function collectSelectedImages(messages: Message[]): OpenAI.Chat.ChatCompletionContentPart[] {
  const selectedImages: OpenAI.Chat.ChatCompletionContentPart[] = [];

  for (const msg of messages) {
    if (msg.role !== 'model' || !msg.selectedImageId || !msg.images) {
      continue;
    }

    const selectedImg = msg.images.find((img) => img.id === msg.selectedImageId);
    if (!selectedImg || selectedImg.status !== 'success') {
      continue;
    }

    const imageData = extractBase64Data(selectedImg.data);
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
        url: selectedImg.data
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

  const formattedHistory = buildHistory(history);

  // Build user message parts
  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [];

  // Add text first
  if (prompt) {
    userContent.push({ type: 'text', text: prompt });
  }

  const selectedImages = collectSelectedImages(history);
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
              const img: GeneratedImage = {
                id: generateUUID(),
                data: dataUriMatch[0],
                mimeType: dataUriMatch[0].split(';')[0].split(':')[1],
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
                    const img: GeneratedImage = {
                      id: generateUUID(),
                      data: imageUrl,
                      mimeType: imageUrl.split(';')[0].split(':')[1] || 'image/png',
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
          data: '',
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
