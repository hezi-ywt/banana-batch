// 图片引用类型（存储在 IndexedDB 中）
export interface ImageReference {
  id: string;
  mimeType: string;
  status: 'success' | 'error';
}

// 保留兼容性的类型别名（用于服务层生成时）
export interface GeneratedImage extends ImageReference {
  data?: string; // 可选，用于临时传递，不存储
}

// 完全的数据类型（用于存储）
export interface GeneratedImageData extends ImageReference {
  data: string; // Base64 data URI
}

export interface UploadedImage {
  id: string;
  data: string; // Base64 data URI
  mimeType: string;
  name?: string; // Original filename
}

export type AspectRatio = 'Auto' | '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type Resolution = '1K' | '2K' | '4K';
export type Provider = 'gemini' | 'openai';

export interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  baseUrl?: string; // For OpenAI custom endpoint or Gemini proxy
  model?: string; // Model name
}

export interface AppSettings {
  batchSize: number; // 1 to 20
  aspectRatio: AspectRatio;
  resolution: Resolution;
  providerConfig: ProviderConfig;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text?: string; // The primary text to display
  textVariations?: string[]; // All unique text responses received
  images?: GeneratedImage[]; // Generated images (model only)
  uploadedImages?: UploadedImage[]; // User uploaded images (user only)
  // Store settings used for this generation to display correctly
  generationSettings?: {
    aspectRatio: AspectRatio;
  };
  // The index of the image the user selected to keep for context.
  // If undefined, no image from this batch is used in future context.
  selectedImageId?: string;
  timestamp: number;
  isError?: boolean;
}

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}
