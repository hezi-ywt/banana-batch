import { z } from 'zod';
import { ValidationError } from '../types/errors';

// Constants for validation
export const VALIDATION_LIMITS = {
  MAX_IMAGES_PER_REQUEST: 10,
  MAX_IMAGE_SIZE_MB: 20,
  MIN_BATCH_SIZE: 1,
  MAX_BATCH_SIZE: 20,
  MAX_PROMPT_LENGTH: 10000,
  API_KEY_MIN_LENGTH: 10 // Relaxed: support various API key formats
} as const;

// API Key validation schema
// Note: Allow various formats (OpenAI: sk-..., Gemini: AIza..., custom endpoints)
const apiKeySchema = z
  .string()
  .min(
    VALIDATION_LIMITS.API_KEY_MIN_LENGTH,
    `API Key 长度至少为 ${VALIDATION_LIMITS.API_KEY_MIN_LENGTH} 字符`
  )
  .regex(
    /^[A-Za-z0-9_\-\.]+$/,
    'API Key 格式无效'
  );

// Prompt validation schema
const promptSchema = z
  .string()
  .max(
    VALIDATION_LIMITS.MAX_PROMPT_LENGTH,
    `提示词长度不能超过 ${VALIDATION_LIMITS.MAX_PROMPT_LENGTH} 字符`
  );

// Batch size validation schema
const batchSizeSchema = z
  .number()
  .int('批次大小必须是整数')
  .min(VALIDATION_LIMITS.MIN_BATCH_SIZE, `批次大小至少为 ${VALIDATION_LIMITS.MIN_BATCH_SIZE}`)
  .max(VALIDATION_LIMITS.MAX_BATCH_SIZE, `批次大小不能超过 ${VALIDATION_LIMITS.MAX_BATCH_SIZE}`);

// Base64 data URI validation
const base64DataUriSchema = z
  .string()
  .regex(
    /^data:image\/[a-z]+;base64,/,
    '无效的图片数据格式（需要 base64 Data URI）'
  );

function getZodErrorMessage(error: z.ZodError): string {
  return error.issues[0]?.message || 'Invalid input';
}

/**
 * Validates API Key format
 * Note: Validation is relaxed to support various API key formats
 */
export function validateApiKey(apiKey: string): void {
  // Skip validation if key is empty (will be caught elsewhere)
  if (!apiKey || apiKey.trim().length === 0) {
    return;
  }

  try {
    apiKeySchema.parse(apiKey);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(getZodErrorMessage(error), 'API Key');
    }
    throw error;
  }
}

/**
 * Validates prompt text
 */
export function validatePrompt(prompt: string): void {
  try {
    promptSchema.parse(prompt);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(getZodErrorMessage(error), '提示词');
    }
    throw error;
  }
}

/**
 * Validates batch size
 */
export function validateBatchSize(batchSize: number): void {
  try {
    batchSizeSchema.parse(batchSize);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(getZodErrorMessage(error), '批次大小');
    }
    throw error;
  }
}

/**
 * Validates base64 image data
 */
export function validateImageData(data: string): void {
  try {
    base64DataUriSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(getZodErrorMessage(error), '图片数据');
    }
    throw error;
  }
}

/**
 * Validates image file size
 */
export function validateImageSize(sizeInBytes: number): void {
  const sizeMB = sizeInBytes / (1024 * 1024);
  if (sizeMB > VALIDATION_LIMITS.MAX_IMAGE_SIZE_MB) {
    throw new ValidationError(
      `图片大小 ${sizeMB.toFixed(2)}MB 超过限制 ${VALIDATION_LIMITS.MAX_IMAGE_SIZE_MB}MB`,
      '图片大小'
    );
  }
}

/**
 * Validates image count
 */
export function validateImageCount(count: number, existingCount: number = 0): void {
  const total = count + existingCount;
  if (total > VALIDATION_LIMITS.MAX_IMAGES_PER_REQUEST) {
    throw new ValidationError(
      `图片总数 ${total} 超过限制 ${VALIDATION_LIMITS.MAX_IMAGES_PER_REQUEST}`,
      '图片数量'
    );
  }
}

/**
 * Validates image MIME type
 */
export function validateImageMimeType(mimeType: string): void {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (!validTypes.includes(mimeType)) {
    throw new ValidationError(
      `不支持的图片格式: ${mimeType}。支持的格式: ${validTypes.join(', ')}`,
      '图片格式'
    );
  }
}
