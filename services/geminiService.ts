import { GoogleGenAI, Content, Part } from "@google/genai";
import { Message, GeneratedImage, AppSettings, UploadedImage } from "../types";
import { generateUUID } from "../utils/uuid";
import { logError } from "../utils/errorHandler";
import {
  validateApiKey,
  validateImageData,
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

/**
 * Constructs the conversation history formatted for the Gemini API.
 * Only selected model images are carried forward to avoid leaking prior prompts.
 */
function buildHistory(messages: Message[]): Content[] {
  const history: Content[] = [];

  for (const msg of messages) {
    const parts: Part[] = [];

    if (msg.role === 'model') {
      // If the model generated images, check if one was selected
      if (msg.images && msg.images.length > 0) {
        const selectedImg = msg.images.find(img => img.id === msg.selectedImageId);

        // Only include SUCCESSFUL selected images in history
        if (selectedImg && selectedImg.status === 'success') {
          const imageData = extractBase64Data(selectedImg.data, selectedImg.id);
          if (imageData) {
            parts.push({
              inlineData: {
                mimeType: imageData.mimeType,
                data: imageData.base64Data
              }
            });
          }
        }
      }
    }

    if (parts.length > 0) {
      history.push({
        role: msg.role,
        parts
      });
    }
  }

  return history;
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

  // Initialize the client per request with the provided key
  const ai = new GoogleGenAI({ apiKey });
  
  const formattedHistory = buildHistory(history);
  
  // Build user message parts according to Gemini API best practices
  // Reference: https://ai.google.dev/gemini-api/docs/image-generation
  // Order: text first, then images (for better context understanding)
  const userParts: Part[] = [];
  
  // Process and validate images first
  const validImages: Part[] = [];
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

      validImages.push({
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.base64Data
        }
      });
    }

    // Throw error if no valid images were processed
    if (validImages.length === 0 && uploadedImages.length > 0) {
      throw new ImageProcessingError(
        'No valid images could be processed. Please check image format and size.'
      );
    }
  }
  
  // According to Gemini API docs: text first, then images
  // This order helps the model better understand the context
  if (prompt) {
    let enhancedPrompt = prompt;
    
    // If there are multiple images, enhance the prompt to clarify image references
    if (validImages.length > 1) {
      // Check if prompt mentions image numbers (图一, 图二, etc. or image 1, image 2, etc.)
      const hasImageReference = /图[一二三四五六七八九十\d]|image\s*[1-9\d]|第[一二三四五六七八九十\d]张|第[1-9\d]张/i.test(prompt);
      
      if (hasImageReference) {
        // Add clarification about image order
        const imageCount = validImages.length;
        const imageLabels = Array.from({ length: imageCount }, (_, i) => {
          const num = i + 1;
          const chineseNum = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][num - 1] || num.toString();
          return `图${chineseNum}（第${num}张上传的图片）`;
        }).join('、');
        
        enhancedPrompt = `参考图片说明：${imageLabels}。\n\n${prompt}`;
      }
    }
    
    // Add text first (following API example pattern)
    userParts.push({ text: enhancedPrompt });
  }
  
  // Then add all images in order
  userParts.push(...validImages);
  
  // Ensure at least one part exists
  if (userParts.length === 0) {
    throw new ValidationError('At least one image or text prompt is required.', 'Input');
  }
  
  // Always use Pro model (gemini-3-pro-image-preview) for better quality
  const modelName = MODEL_PRO;

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

          const response = await ai.models.generateContent({
            model: modelName,
            contents,
            config
          });

          const candidate = response.candidates?.[0];
          if (!candidate) {
            throw new ImageProcessingError('No candidate returned from API');
          }

          // Handle safety filter
          if (candidate.finishReason === 'SAFETY') {
            throw new SafetyFilterError('Content blocked by safety filters');
          }

          const content = candidate.content;
          if (!content?.parts) {
            throw new ImageProcessingError('No content parts in response');
          }

          let foundImage = false;
          for (const part of content.parts) {
            if (part.inlineData) {
              const img: GeneratedImage = {
                id: generateUUID(),
                data: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                mimeType: part.inlineData.mimeType,
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
