import { useState, useCallback } from 'react';
import { ProviderConfig, Provider } from '../types';
import { validateApiKey } from '../utils/validation';
import { ValidationError } from '../types/errors';

const STORAGE_KEYS = {
  PROVIDER: 'app_provider',
  GEMINI_API_KEY: 'user_gemini_api_key',
  GEMINI_BASE_URL: 'user_gemini_base_url',
  OPENAI_API_KEY: 'user_openai_api_key',
  OPENAI_BASE_URL: 'user_openai_base_url',
  OPENAI_MODEL: 'user_openai_model'
} as const;

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gemini-3-pro-image-preview';
const DEFAULT_GEMINI_MODEL = 'gemini-3-pro-image-preview';
const DEFAULT_GEMINI_BASE_URL = '';

function getStoredGeminiBaseUrl(): string | undefined {
  const value = localStorage.getItem(STORAGE_KEYS.GEMINI_BASE_URL);
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Custom hook for managing provider configuration with localStorage persistence
 */
export function useProviderConfig() {
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>(() => {
    const storedProvider = localStorage.getItem(STORAGE_KEYS.PROVIDER) as Provider;
    const provider: Provider = storedProvider === 'openai' ? 'openai' : 'gemini';

    if (provider === 'openai') {
      return {
        provider: 'openai',
        apiKey: localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY) || '',
        baseUrl:
          localStorage.getItem(STORAGE_KEYS.OPENAI_BASE_URL) ||
          DEFAULT_OPENAI_BASE_URL,
        model:
          localStorage.getItem(STORAGE_KEYS.OPENAI_MODEL) || DEFAULT_OPENAI_MODEL
      };
    }

    return {
      provider: 'gemini',
      apiKey: localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY) || '',
      model:
        localStorage.getItem('user_gemini_model') || DEFAULT_GEMINI_MODEL,
      baseUrl: getStoredGeminiBaseUrl()
    };
  });

  const updateProvider = useCallback((provider: Provider) => {
    setProviderConfig((prev) => {
      const newConfig: ProviderConfig = { ...prev, provider };

      if (provider === 'openai') {
        newConfig.apiKey =
          localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY) || '';
        newConfig.baseUrl =
          localStorage.getItem(STORAGE_KEYS.OPENAI_BASE_URL) ||
          DEFAULT_OPENAI_BASE_URL;
        newConfig.model =
          localStorage.getItem(STORAGE_KEYS.OPENAI_MODEL) || DEFAULT_OPENAI_MODEL;
      } else {
        newConfig.apiKey =
          localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY) || '';
        newConfig.model =
          localStorage.getItem('user_gemini_model') || DEFAULT_GEMINI_MODEL;
        newConfig.baseUrl = getStoredGeminiBaseUrl();
      }

      localStorage.setItem(STORAGE_KEYS.PROVIDER, provider);
      return newConfig;
    });
  }, []);

  const updateApiKey = useCallback(
    (key: string) => {
      // Allow empty key (user clearing it)
      if (key === '') {
        setProviderConfig((prev) => {
          const newConfig = { ...prev, apiKey: '' };
          if (prev.provider === 'openai') {
            localStorage.removeItem(STORAGE_KEYS.OPENAI_API_KEY);
          } else {
            localStorage.removeItem(STORAGE_KEYS.GEMINI_API_KEY);
          }
          return newConfig;
        });
        return;
      }

      // Validate non-empty keys
      try {
        validateApiKey(key);
        setProviderConfig((prev) => {
          const newConfig = { ...prev, apiKey: key };
          if (prev.provider === 'openai') {
            localStorage.setItem(STORAGE_KEYS.OPENAI_API_KEY, key);
          } else {
            localStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, key);
          }
          return newConfig;
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          throw error;
        }
        throw new ValidationError('API Key 格式无效', 'API Key');
      }
    },
    []
  );

  const updateBaseUrl = useCallback((url: string) => {
    setProviderConfig((prev) => {
      if (prev.provider === 'openai') {
        const newConfig = { ...prev, baseUrl: url || DEFAULT_OPENAI_BASE_URL };
        localStorage.setItem(
          STORAGE_KEYS.OPENAI_BASE_URL,
          url || DEFAULT_OPENAI_BASE_URL
        );
        return newConfig;
      }

      const trimmed = url.trim();
      if (trimmed.length === 0) {
        localStorage.removeItem(STORAGE_KEYS.GEMINI_BASE_URL);
        return { ...prev, baseUrl: undefined };
      }

      const newConfig = { ...prev, baseUrl: trimmed };
      localStorage.setItem(STORAGE_KEYS.GEMINI_BASE_URL, trimmed);
      return newConfig;
    });
  }, []);

  const updateModel = useCallback((model: string) => {
    setProviderConfig((prev) => {
      const newConfig = { ...prev, model };
      if (prev.provider === 'openai') {
        localStorage.setItem(STORAGE_KEYS.OPENAI_MODEL, model);
      } else {
        // For Gemini, save model as well
        localStorage.setItem('user_gemini_model', model);
      }
      return newConfig;
    });
  }, []);

  return {
    providerConfig,
    updateProvider,
    updateApiKey,
    updateBaseUrl,
    updateModel
  };
}
