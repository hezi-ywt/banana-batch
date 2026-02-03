import { GoogleGenAI, Content, Part } from "@google/genai";
import { Message, GeneratedImage, AppSettings, UploadedImage } from "../types";
import { generateUUID } from "../utils/uuid";
import { logError } from "../utils/errorHandler";
import {
  validateApiKey,
  validatePrompt,
  VALIDATION_LIMITS
} from "../utils/validation";
import { ImageProcessingError, SafetyFilterError, ValidationError } from "../types/errors";

const MODEL_PRO = 'gemini-3-pro-image-preview';
const MAX_CONCURRENT_REQUESTS = 10;
const MAX_RETRIES = 3; 

/**
 * Extracts base64 data from a data URI safely
 */
function extractBase64Data(dataUri: string, imageId?: string): {
  mimeType: string;
  base64Data: string;
} | null {
  const base64Match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!base64Match) {
    logError('Image Processing', new ImageProcessingError(
      `Invalid image data format${imageId ? ` for image ${imageId}` : ''}`
    ));
    return null;
  }

  const [, mimeTypeFromData, base64Data] = base64Match;
  const finalMimeType = mimeTypeFromData || 'image/png';

  if (!base64Data || base64Data.length === 0) {
    logError('Image Processing', new ImageProcessingError(
      `Empty base64 data${imageId ? ` for image ${imageId}` : ''}`
    ));
    return null;
  }

  return { mimeType: finalMimeType, base64Data };
}

interface ImageInput {
  mimeType: string;
  base64Data: string;
}

/**
 * Collects selected model images to be used as input for the current request.
 */
function collectSelectedImages(messages: Message[]): ImageInput[] {
  const selectedImages: ImageInput[] = [];

  for (const msg of messages) {
    if (msg.role !== 'model' || !msg.selectedImageId || !msg.images) {
      continue;
    }

    const selectedImg = msg.images.find((img) => img.id === msg.selectedImageId);
    if (!selectedImg || selectedImg.status !== 'success') {
      continue;
    }

    const imageData = extractBase64Data(selectedImg.data, selectedImg.id);
    if (!imageData) {
      continue;
    }

    const estimatedSizeMB = (imageData.base64Data.length * 3 / 4) / (1024 * 1024);
    if (estimatedSizeMB > VALIDATION_LIMITS.MAX_IMAGE_SIZE_MB) {
      logError('Image Processing', new ImageProcessingError(
        `Selected image ${selectedImg.id} is too large (${estimatedSizeMB.toFixed(2)}MB)`
      ));
      continue;
    }

    selectedImages.push({
      mimeType: imageData.mimeType,
      base64Data: imageData.base64Data
    });
  }

  return selectedImages;
}

/**
 * Constructs the conversation history formatted for the Gemini API.
 * Intentionally empty: prior text is not carried forward.
 */
function buildHistory(_messages: Message[]): Content[] {
  return [];
}

function buildGeminiEndpoint(baseUrl: string, modelName: string): string {
  let normalized = baseUrl.trim();
  if (!normalized) return '';

  normalized = normalized.replace(/\/+$/, '');

  if (normalized.includes(':generateContent')) {
    return normalized;
  }

  if (/\/models\/[^/]+$/.test(normalized)) {
    return `${normalized}:generateContent`;
  }

  if (normalized.endsWith('/models')) {
    return `${normalized}/${modelName}:generateContent`;
  }

  if (/\/v1beta$|\/v1$/.test(normalized)) {
    return `${normalized}/models/${modelName}:generateContent`;
  }

  return `${normalized}/v1beta/models/${modelName}:generateContent`;
}

function appendKeyParam(url: string, apiKey: string): string {
  if (!apiKey || url.includes('key=')) {
    return url;
  }
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}key=${encodeURIComponent(apiKey)}`;
}

async function fetchGeminiGenerateContent(
  baseUrl: string,
  apiKey: string,
  modelName: string,
  contents: Array<{ role?: string; parts?: Array<Record<string, unknown>> }>,
  imageConfig: Record<string, unknown> | undefined,
  signal: AbortSignal
): Promise<any> {
  const endpoint = appendKeyParam(buildGeminiEndpoint(baseUrl, modelName), apiKey);
  if (!endpoint) {
    throw new ImageProcessingError('Gemini Base URL is missing.');
  }

  const body: Record<string, unknown> = { contents };
  if (imageConfig && Object.keys(imageConfig).length > 0) {
    body.generationConfig = { imageConfig };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(body),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new ImageProcessingError(
      `Gemini proxy error (${response.status}): ${errorText || response.statusText}`
    );
  }

  const data = await response.json();
  if (data?.error?.message) {
    throw new ImageProcessingError(`Gemini proxy error: ${data.error.message}`);
  }

  return data;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface StreamCallbacks {
  onImage: (image: GeneratedImage) => void;
  onText: (text: string) => void;
  onProgress: (completed: number, total: number) => void;
}

/**
 * Generates images concurrently with streaming updates and abort support.
 * Accepts apiKey dynamically.
 */
export async function generateImageBatchStream(
  apiKey: string,
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

  const proxyBaseUrl = settings.providerConfig?.baseUrl?.trim() || '';
  const useProxy = proxyBaseUrl.length > 0;

  // Initialize the client per request with the provided key
  const ai = useProxy ? null : new GoogleGenAI({ apiKey });
  
  const formattedHistory = buildHistory(history);
  
  // Build user message parts according to Gemini API best practices
  // Reference: https://ai.google.dev/gemini-api/docs/image-generation
  // Order: text first, then images (for better context understanding)
  const userParts: Part[] = [];
  const userPartsProxy: Array<Record<string, unknown>> = [];
  
  // Process and validate images first
  const imageInputs: ImageInput[] = [];
  const selectedImages = collectSelectedImages(history);
  if (selectedImages.length > 0) {
    imageInputs.push(...selectedImages);
  }

  const uploadedImageInputs: ImageInput[] = [];
  if (uploadedImages && uploadedImages.length > 0) {
    for (const img of uploadedImages) {
      const imageData = extractBase64Data(img.data, img.id);
      if (!imageData) {
        continue; // Skip invalid images, error already logged
      }

      // Estimate image size (base64 is ~33% larger than binary)
      const estimatedSizeMB = (imageData.base64Data.length * 3 / 4) / (1024 * 1024);

      // Gemini API typically has a limit of ~20MB per image
      if (estimatedSizeMB > VALIDATION_LIMITS.MAX_IMAGE_SIZE_MB) {
        logError('Image Processing', new ImageProcessingError(
          `Image ${img.id} is too large (${estimatedSizeMB.toFixed(2)}MB)`
        ));
        continue;
      }

      uploadedImageInputs.push({
        mimeType: imageData.mimeType,
        base64Data: imageData.base64Data
      });
    }

    // Throw error if no valid images were processed
    if (uploadedImageInputs.length === 0 && uploadedImages.length > 0) {
      throw new ImageProcessingError(
        'No valid images could be processed. Please check image format and size.'
      );
    }
  }

  if (uploadedImageInputs.length > 0) {
    imageInputs.push(...uploadedImageInputs);
  }
  
  // According to Gemini API docs: text first, then images
  // This order helps the model better understand the context
  if (prompt) {
    let enhancedPrompt = prompt;
    
    // If there are multiple images, enhance the prompt to clarify image references
    if (imageInputs.length > 1) {
      // Check if prompt mentions image numbers (图一/第x张/image 1, etc.)
      const imageRefPattern = new RegExp(
        '(?:' +
          '\\u56fe[\\u4e00\\u4e8c\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341\\d]+' +
          '|image\\s*[1-9]\\d*' +
          '|\\u7b2c[\\u4e00\\u4e8c\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341\\d]+\\u5f20' +
          '|\\u7b2c[1-9]\\d*\\u5f20' +
        ')',
        'i'
      );
      const hasImageReference = imageRefPattern.test(prompt);
      
      if (hasImageReference) {
        // Add clarification about image order
        const imageCount = imageInputs.length;
        const imageLabels = Array.from({ length: imageCount }, (_, i) => {
          const num = i + 1;
          const chineseNum = ['?', '?', '?', '?', '?', '?', '?', '?', '?', '?'][num - 1] || num.toString();
          return `?${chineseNum}??${num}???????`;
        }).join('?');
        
        enhancedPrompt = `???????${imageLabels}?

${prompt}`;
      }
    }
    
    // Add text first (following API example pattern)
    userParts.push({ text: enhancedPrompt });
    userPartsProxy.push({ text: enhancedPrompt });
  }
  
  // Then add all images in order
  if (imageInputs.length > 0) {
    userParts.push(
      ...imageInputs.map((img) => ({
        inlineData: {
          mimeType: img.mimeType,
          data: img.base64Data
        }
      }))
    );
    userPartsProxy.push(
      ...imageInputs.map((img) => ({
        inline_data: {
          mime_type: img.mimeType,
          data: img.base64Data
        }
      }))
    );
  }
  
  // Ensure at least one part exists
  if (userParts.length === 0) {
    throw new ValidationError('At least one image or text prompt is required.', 'Input');
  }
  
  // Prefer configured model, fallback to Pro
  const modelName = settings.providerConfig?.model || MODEL_PRO;

  interface ImageConfig {
    aspectRatio?: string;
    imageSize?: string;
  }

  const imageConfig: ImageConfig = {};

  // Set aspect ratio if specified
  if (settings.aspectRatio && settings.aspectRatio !== 'Auto') {
    imageConfig.aspectRatio = settings.aspectRatio;
  }

  // Set image size based on resolution setting
  // Pro model supports 1K, 2K, and 4K resolutions
  if (settings.resolution === '1K' || settings.resolution === '2K' || settings.resolution === '4K') {
    imageConfig.imageSize = settings.resolution;
  }

  const config = Object.keys(imageConfig).length > 0 ? { imageConfig } : undefined;

  // Shared task queue
  const taskQueue = Array.from({ length: settings.batchSize }, (_, i) => i);
  let completedCount = 0;

  // Worker function
  const worker = async (workerId: number): Promise<void> => {
    while (taskQueue.length > 0) {
      // Check for cancellation
      if (signal.aborted) return;

      const index = taskQueue.shift();
      if (index === undefined) break;

      let attempt = 0;
      let success = false;

      while (attempt <= MAX_RETRIES && !success) {
        if (signal.aborted) return; // Check abort inside retry loop

        try {
          // Build contents array: history + current user message
          const contents: Content[] = [
            ...formattedHistory,
            { role: 'user' as const, parts: userParts }
          ];

          const response = useProxy
            ? await fetchGeminiGenerateContent(
                proxyBaseUrl,
                apiKey,
                modelName,
                [{ role: 'user', parts: userPartsProxy }],
                imageConfig,
                signal
              )
            : await ai!.models.generateContent({
                model: modelName,
                contents,
                config
              });

          const candidate = response.candidates?.[0];
          if (!candidate) {
            throw new ImageProcessingError('No candidate returned from API');
          }

          // Handle safety filter
          const finishReason = (candidate as any).finishReason || (candidate as any).finish_reason;
          if (finishReason === 'SAFETY') {
            throw new SafetyFilterError('Content blocked by safety filters');
          }

          const content = candidate.content;
          if (!content?.parts) {
            throw new ImageProcessingError('No content parts in response');
          }

          let foundImage = false;
          for (const part of content.parts as any[]) {
            const inlineData = part.inlineData || part.inline_data;
            if (inlineData && inlineData.data) {
              const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';
              const img: GeneratedImage = {
                id: generateUUID(),
                data: `data:${mimeType};base64,${inlineData.data}`,
                mimeType,
                status: 'success'
              };
              callbacks.onImage(img);
              foundImage = true;
            } else if (part.text) {
              callbacks.onText(part.text);
            }
          }

          if (foundImage) {
            success = true;
          } else {
            throw new ImageProcessingError('No image data in response');
          }
        } catch (error) {
          attempt++;

          // Only log errors if not aborted
          if (!signal.aborted) {
            logError(`Worker ${workerId} - Image ${index + 1} Attempt ${attempt}`, error);
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
