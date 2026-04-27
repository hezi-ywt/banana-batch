import { AppSettings, AspectRatio, GeneratedImage, Message, Resolution, UploadedImage } from '../types';
import { generateUUID } from '../utils/uuid';
import { logError } from '../utils/errorHandler';
import {
  validateApiKey,
  validatePrompt,
  VALIDATION_LIMITS
} from '../utils/validation';
import { AppError, ImageProcessingError } from '../types/errors';
import { StreamCallbacks } from './geminiService';

const YUNWU_GPT_IMAGE_2_MODEL = 'gpt-image-2';
const YUNWU_GPT_IMAGE_2_ALL_MODEL = 'gpt-image-2-all';
const MAX_BATCH_SIZE = 10;
const MAX_ALL_REFERENCE_IMAGES = 5;

type CreateRequestInput = {
  model: string;
  prompt: string;
  batchSize: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
};

type EditFormInput = CreateRequestInput & {
  history: Message[];
  uploadedImages?: UploadedImage[];
};

type ExtractedImage = {
  data: string;
  mimeType: string;
};

type ImageInput = {
  data: string;
  mimeType: string;
  name: string;
};

export function isYunwuGptImage2Model(model?: string): boolean {
  return model?.trim().toLowerCase() === YUNWU_GPT_IMAGE_2_MODEL;
}

export function isYunwuGptImage2AllModel(model?: string): boolean {
  return model?.trim().toLowerCase() === YUNWU_GPT_IMAGE_2_ALL_MODEL;
}

export function mapYunwuGptImage2Size(aspectRatio: AspectRatio, resolution: Resolution): string {
  if (!aspectRatio || aspectRatio === 'Auto') {
    return 'auto';
  }

  const [width, height] = aspectRatio.split(':').map(Number);
  if (!width || !height || width === height) {
    return resolution === '2K' || resolution === '4K' ? '2048x2048' : '1024x1024';
  }

  const isLandscape = width > height;
  if (resolution === '4K') {
    return isLandscape ? '3840x2160' : '2160x3840';
  }

  if (resolution === '2K') {
    return isLandscape ? '2048x1152' : '1024x1536';
  }

  return isLandscape ? '1536x1024' : '1024x1536';
}

export function mapYunwuGptImage2EditSize(aspectRatio: AspectRatio): string {
  if (!aspectRatio || aspectRatio === 'Auto') {
    return 'auto';
  }

  const [width, height] = aspectRatio.split(':').map(Number);
  if (!width || !height || width === height) {
    return '1024x1024';
  }

  return width > height ? '1536x1024' : '1024x1536';
}

export function mapYunwuGptImage2AllSize(aspectRatio: AspectRatio, resolution: Resolution): string {
  if (resolution === '2K' || resolution === '4K') {
    if (aspectRatio === '1:1') return '2048x2048';
    if (aspectRatio === '16:9' || aspectRatio === '3:2') return '2048x1152';
  }

  if (aspectRatio === '3:2' || aspectRatio === '16:9') {
    return '1536x1024';
  }

  if (aspectRatio === '2:3' || aspectRatio === '9:16') {
    return '1024x1536';
  }

  return resolution === '2K' ? '2048x2048' : '1024x1024';
}

export function mapYunwuGptImage2Quality(resolution: Resolution): 'low' | 'medium' | 'high' {
  if (resolution === '4K') return 'high';
  if (resolution === '2K') return 'medium';
  return 'low';
}

export function mapYunwuGptImage2Format(resolution: Resolution): 'jpeg' | 'png' {
  return resolution === '4K' ? 'png' : 'jpeg';
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'png';
}

function inferImageMimeType(value: string): string {
  const dataUriMatch = value.match(/^data:([^;]+);base64,/);
  if (dataUriMatch) {
    return dataUriMatch[1] || 'image/png';
  }

  const cleanUrl = value.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg')) return 'image/jpeg';
  if (cleanUrl.endsWith('.webp')) return 'image/webp';
  if (cleanUrl.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}

function normalizeImageData(value: string): ExtractedImage {
  if (value.startsWith('data:image/')) {
    return { data: value, mimeType: inferImageMimeType(value) };
  }

  if (/^[A-Za-z0-9+/=]+$/.test(value) && value.length > 32) {
    return { data: `data:image/png;base64,${value}`, mimeType: 'image/png' };
  }

  return { data: value, mimeType: inferImageMimeType(value) };
}

function extractBase64Data(dataUri: string, imageId?: string): {
  mimeType: string;
  base64Data: string;
} | null {
  const base64Match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!base64Match) {
    logError('Yunwu Image Processing', new ImageProcessingError(
      `Invalid image data format${imageId ? ` for image ${imageId}` : ''}`
    ));
    return null;
  }

  const [, mimeTypeFromData, base64Data] = base64Match;
  if (!base64Data) {
    return null;
  }

  return { mimeType: mimeTypeFromData || 'image/png', base64Data };
}

function dataUriToBlob(dataUri: string, imageId?: string): Blob | null {
  const imageData = extractBase64Data(dataUri, imageId);
  if (!imageData) {
    return null;
  }

  const estimatedSizeMB = (imageData.base64Data.length * 3 / 4) / (1024 * 1024);
  if (estimatedSizeMB > VALIDATION_LIMITS.MAX_IMAGE_SIZE_MB) {
    logError('Yunwu Image Processing', new ImageProcessingError(
      `Image ${imageId || 'input'} is too large (${estimatedSizeMB.toFixed(2)}MB)`
    ));
    return null;
  }

  const binary = atob(imageData.base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: imageData.mimeType });
}

async function imageInputToBlob(image: ImageInput, signal: AbortSignal): Promise<Blob | null> {
  if (image.data.startsWith('data:image/')) {
    return dataUriToBlob(image.data, image.name);
  }

  try {
    const response = await fetch(image.data, { signal });
    if (!response.ok) {
      logError('Yunwu Image Processing', new ImageProcessingError(
        `Failed to download reference image ${image.name} (${response.status})`
      ));
      return null;
    }

    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) {
      logError('Yunwu Image Processing', new ImageProcessingError(
        `Downloaded reference is not an image: ${image.name}`
      ));
      return null;
    }

    const sizeMB = blob.size / (1024 * 1024);
    if (sizeMB > VALIDATION_LIMITS.MAX_IMAGE_SIZE_MB) {
      logError('Yunwu Image Processing', new ImageProcessingError(
        `Image ${image.name} is too large (${sizeMB.toFixed(2)}MB)`
      ));
      return null;
    }

    return blob;
  } catch (error) {
    logError('Yunwu Image Processing', error);
    return null;
  }
}

function collectSelectedImageInputs(messages: Message[]): ImageInput[] {
  const images: ImageInput[] = [];

  for (const msg of messages) {
    if (msg.role !== 'model' || !msg.selectedImageId || !msg.images) {
      continue;
    }

    const selectedImg = msg.images.find((img) => img.id === msg.selectedImageId);
    if (!selectedImg || selectedImg.status !== 'success' || !selectedImg.data) {
      continue;
    }

    images.push({
      data: selectedImg.data,
      mimeType: selectedImg.mimeType || inferImageMimeType(selectedImg.data),
      name: `selected-${selectedImg.id}.${extensionForMimeType(selectedImg.mimeType)}`
    });
  }

  return images;
}

function collectUploadedImageInputs(uploadedImages?: UploadedImage[]): ImageInput[] {
  if (!uploadedImages || uploadedImages.length === 0) {
    return [];
  }

  return uploadedImages
    .filter((img) => !!img.data)
    .map((img) => ({
      data: img.data,
      mimeType: img.mimeType || inferImageMimeType(img.data),
      name: img.name || `upload-${img.id}.${extensionForMimeType(img.mimeType)}`
    }));
}

function collectReferenceImages(history: Message[], uploadedImages?: UploadedImage[]): ImageInput[] {
  return [
    ...collectSelectedImageInputs(history),
    ...collectUploadedImageInputs(uploadedImages)
  ];
}

export function buildYunwuGptImage2CreateRequest(input: CreateRequestInput): Record<string, unknown> {
  return {
    model: input.model,
    prompt: input.prompt,
    n: Math.min(Math.max(input.batchSize, 1), MAX_BATCH_SIZE),
    size: mapYunwuGptImage2Size(input.aspectRatio, input.resolution),
    quality: mapYunwuGptImage2Quality(input.resolution),
    format: mapYunwuGptImage2Format(input.resolution)
  };
}

export function buildYunwuGptImage2AllRequest(input: EditFormInput): Record<string, unknown> {
  const images = collectReferenceImages(input.history, input.uploadedImages)
    .map((image) => image.data)
    .slice(0, MAX_ALL_REFERENCE_IMAGES);

  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    n: Math.min(Math.max(input.batchSize, 1), MAX_BATCH_SIZE),
    size: mapYunwuGptImage2AllSize(input.aspectRatio, input.resolution)
  };

  if (images.length > 0) {
    body.image = images;
  }

  return body;
}

export function buildYunwuGptImage2EditFormData(input: EditFormInput): FormData {
  const formData = new FormData();
  formData.append('model', input.model);
  formData.append('prompt', input.prompt);
  formData.append('n', String(Math.min(Math.max(input.batchSize, 1), MAX_BATCH_SIZE)));
  formData.append('size', mapYunwuGptImage2EditSize(input.aspectRatio));
  formData.append('quality', 'auto');

  const referenceImages = collectReferenceImages(input.history, input.uploadedImages);
  for (const image of referenceImages) {
    const blob = dataUriToBlob(image.data, image.name);
    if (blob) {
      formData.append('image', blob, image.name);
    }
  }

  return formData;
}

async function buildYunwuGptImage2EditFormDataAsync(
  input: EditFormInput,
  signal: AbortSignal
): Promise<FormData> {
  const formData = new FormData();
  formData.append('model', input.model);
  formData.append('prompt', input.prompt);
  formData.append('n', String(Math.min(Math.max(input.batchSize, 1), MAX_BATCH_SIZE)));
  formData.append('size', mapYunwuGptImage2EditSize(input.aspectRatio));
  formData.append('quality', 'auto');

  const referenceImages = collectReferenceImages(input.history, input.uploadedImages);
  for (const image of referenceImages) {
    if (signal.aborted) {
      break;
    }
    const blob = await imageInputToBlob(image, signal);
    if (blob) {
      formData.append('image', blob, image.name);
    }
  }

  if (formData.getAll('image').length === 0) {
    throw new ImageProcessingError('No valid reference images could be prepared for editing.');
  }

  return formData;
}

function extractImagesFromText(text: string): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  const dataUriPattern = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
  const urlPattern = /https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>]*)?/gi;

  for (const match of text.matchAll(dataUriPattern)) {
    images.push(normalizeImageData(match[0]));
  }

  for (const match of text.matchAll(urlPattern)) {
    images.push(normalizeImageData(match[0]));
  }

  return images;
}

export function extractYunwuImages(response: any): ExtractedImage[] {
  const images: ExtractedImage[] = [];

  if (Array.isArray(response?.data)) {
    for (const item of response.data) {
      if (typeof item?.url === 'string' && item.url) {
        images.push(normalizeImageData(item.url));
      }
      if (typeof item?.b64_json === 'string' && item.b64_json) {
        images.push({ data: `data:image/png;base64,${item.b64_json}`, mimeType: 'image/png' });
      }
    }
  }

  if (Array.isArray(response?.choices)) {
    for (const choice of response.choices) {
      const content = choice?.message?.content;
      if (typeof content === 'string') {
        images.push(...extractImagesFromText(content));
      }
    }
  }

  return images;
}

function buildEndpoint(baseUrl: string, path: 'generations' | 'edits'): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) {
    throw new ImageProcessingError('Yunwu Base URL is missing.');
  }
  return `${normalized}/images/${path}`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

async function resolveRemoteImage(image: ExtractedImage, signal: AbortSignal): Promise<ExtractedImage> {
  if (image.data.startsWith('data:image/')) {
    return image;
  }

  try {
    const response = await fetch(image.data, { signal });
    if (!response.ok) {
      return image;
    }

    const blob = await response.blob();
    const data = await blobToDataUrl(blob);
    return {
      data,
      mimeType: blob.type || image.mimeType
    };
  } catch {
    return image;
  }
}

async function fetchYunwu(
  apiKey: string,
  endpoint: string,
  body: BodyInit,
  signal: AbortSignal
): Promise<ExtractedImage[]> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${apiKey}`
  };

  if (typeof body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body,
    signal
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    let message = errorText || response.statusText;
    try {
      const parsed = JSON.parse(errorText);
      message = parsed?.error?.message || parsed?.message || message;
    } catch {
      // Keep raw text when the provider does not return JSON.
    }
    throw new AppError(
      `Yunwu gpt-image-2 error (${response.status}): ${message}`,
      'YUNWU_API_ERROR',
      `云雾接口错误（${response.status}）：${message}`
    );
  }

  const data = await response.json();
  if (data?.error?.message) {
    throw new AppError(
      data.error.message,
      'YUNWU_API_ERROR',
      `云雾接口错误：${data.error.message}`
    );
  }

  const images = extractYunwuImages(data);
  if (images.length === 0) {
    throw new ImageProcessingError('No image data in Yunwu gpt-image-2 response.');
  }

  return images;
}

export async function generateYunwuGptImage2(
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
  validateApiKey(apiKey);

  if (prompt) {
    validatePrompt(prompt);
  }

  if (!prompt || prompt.trim().length === 0) {
    throw new ImageProcessingError('Prompt is required for Yunwu gpt-image-2.');
  }

  const expectedTotal = Math.min(Math.max(settings.batchSize, 1), MAX_BATCH_SIZE);
  const referenceImages = collectReferenceImages(history, uploadedImages);
  const useEditEndpoint = referenceImages.length > 0;

  const endpoint = buildEndpoint(baseUrl, useEditEndpoint ? 'edits' : 'generations');
  const requestBody = useEditEndpoint
    ? await buildYunwuGptImage2EditFormDataAsync({
        model,
        prompt,
        batchSize: 1,
        aspectRatio: settings.aspectRatio,
        resolution: settings.resolution,
        history,
        uploadedImages
      }, signal)
    : JSON.stringify(
        buildYunwuGptImage2CreateRequest({
          model,
          prompt,
          batchSize: 1,
          aspectRatio: settings.aspectRatio,
          resolution: settings.resolution
        })
      );

  let completed = 0;
  const tasks = Array.from({ length: expectedTotal }, async () => {
    if (signal.aborted) return;

    const images = await fetchYunwu(apiKey, endpoint, requestBody, signal);
    if (signal.aborted) return;

    const image = images[0];

    callbacks.onImage({
      id: generateUUID(),
      data: image.data,
      mimeType: image.mimeType,
      status: 'success'
    });
    completed++;
    callbacks.onProgress(completed, expectedTotal);
  });

  await Promise.all(tasks);
}

export async function generateYunwuGptImage2All(
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
  validateApiKey(apiKey);

  if (prompt) {
    validatePrompt(prompt);
  }

  if (!prompt || prompt.trim().length === 0) {
    throw new ImageProcessingError('Prompt is required for Yunwu gpt-image-2-all.');
  }

  const expectedTotal = Math.min(Math.max(settings.batchSize, 1), MAX_BATCH_SIZE);
  const endpoint = buildEndpoint(baseUrl, 'generations');
  const requestBody = JSON.stringify(
    buildYunwuGptImage2AllRequest({
      model,
      prompt,
      batchSize: 1,
      aspectRatio: settings.aspectRatio,
      resolution: settings.resolution,
      history,
      uploadedImages
    })
  );

  let completed = 0;
  const tasks = Array.from({ length: expectedTotal }, async () => {
    if (signal.aborted) return;

    const images = await fetchYunwu(apiKey, endpoint, requestBody, signal);
    if (signal.aborted) return;

    const image = images[0];
    callbacks.onImage({
      id: generateUUID(),
      data: image.data,
      mimeType: image.mimeType,
      status: 'success'
    });
    completed++;
    callbacks.onProgress(completed, expectedTotal);
  });

  await Promise.all(tasks);
}
