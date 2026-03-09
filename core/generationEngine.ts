import { AppSettings, Message, UploadedImage, GeneratedImage, ProviderConfig } from '../types';
import { generateImageBatchStream } from '../services/geminiService';
import { generateImageBatchStreamOpenAI } from '../services/openaiService';
import { APIKeyError } from '../types/errors';
import { resolveSettings } from './config';

export interface GenerationCallbacks {
  onImage: (image: GeneratedImage) => void;
  onText: (text: string) => void;
  onProgress: (current: number, total: number) => void;
}

export interface GenerationRequest {
  prompt: string;
  history?: Message[];
  uploadedImages?: UploadedImage[];
  settings?: Partial<AppSettings>;
  providerConfig?: Partial<ProviderConfig>;
  signal: AbortSignal;
  callbacks: GenerationCallbacks;
}

export async function runImageGeneration(request: GenerationRequest): Promise<void> {
  const settings = resolveSettings(request.settings, request.providerConfig);
  const providerConfig = settings.providerConfig;

  if (!providerConfig.apiKey) {
    const providerName = providerConfig.provider === 'openai' ? 'OpenAI' : 'Gemini';
    throw new APIKeyError('API Key is missing', providerName);
  }

  const history = request.history ?? [];

  if (providerConfig.provider === 'openai') {
    await generateImageBatchStreamOpenAI(
      providerConfig.apiKey,
      providerConfig.baseUrl || 'https://api.openai.com/v1',
      providerConfig.model || 'gpt-image-1',
      request.prompt,
      history,
      settings,
      request.uploadedImages,
      {
        onImage: request.callbacks.onImage,
        onText: request.callbacks.onText,
        onProgress: request.callbacks.onProgress
      },
      request.signal
    );
    return;
  }

  await generateImageBatchStream(
    providerConfig.apiKey,
    request.prompt,
    history,
    settings,
    request.uploadedImages,
    {
      onImage: request.callbacks.onImage,
      onText: request.callbacks.onText,
      onProgress: request.callbacks.onProgress
    },
    request.signal
  );
}
