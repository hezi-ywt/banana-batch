import React, { useState, useEffect } from 'react';
import { Check, Server, Cpu, Eye, EyeOff } from 'lucide-react';
import { ProviderConfig, Provider } from '../types';
import PerformanceHint from './PerformanceHint';

interface ProviderConfigPanelProps {
  config: ProviderConfig;
  onProviderChange: (provider: Provider) => void;
  onApiKeyChange: (key: string) => void;
  onBaseUrlChange: (url: string) => void;
  onModelChange: (model: string) => void;
  theme: 'light' | 'dark';
  batchSize?: number;
}

// Predefined Gemini models
const GEMINI_MODELS = [
  { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image (推荐)' },
  { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image (快速)' }
] as const;

// Predefined OpenAI compatible models (for Google AI endpoint)
const OPENAI_MODELS = [
  { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image (推荐)' },
  { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image (快速)' },
  { value: 'gpt-4o', label: 'GPT-4o' }
] as const;

const ProviderConfigPanel: React.FC<ProviderConfigPanelProps> = ({
  config,
  onProviderChange,
  onApiKeyChange,
  onBaseUrlChange,
  onModelChange,
  theme,
  batchSize = 2
}) => {
  const isLight = theme === 'light';
  const [localApiKey, setLocalApiKey] = useState(config.apiKey);
  const [localBaseUrl, setLocalBaseUrl] = useState(config.baseUrl || '');
  const [localModel, setLocalModel] = useState(config.model || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{
    apiKey?: 'saving' | 'saved' | 'error';
    baseUrl?: 'saving' | 'saved' | 'error';
    model?: 'saving' | 'saved' | 'error';
  }>({});
  const [isCustomModel, setIsCustomModel] = useState(() => {
    // Check if current model is a predefined one
    const models = config.provider === 'openai' ? OPENAI_MODELS : GEMINI_MODELS;
    return config.model && !models.some((m) => m.value === config.model);
  });

  useEffect(() => {
    setLocalApiKey(config.apiKey);
    setLocalBaseUrl(config.baseUrl || '');
    setLocalModel(config.model || '');
    // Update isCustomModel when config changes
    const models = config.provider === 'openai' ? OPENAI_MODELS : GEMINI_MODELS;
    setIsCustomModel(
      config.model && !models.some((m) => m.value === config.model)
    );
  }, [config]);

  const handleApiKeySave = () => {
    try {
      onApiKeyChange(localApiKey);
      setSaveStatus((prev) => ({ ...prev, apiKey: 'saved' }));
      setTimeout(() => {
        setSaveStatus((prev) => ({ ...prev, apiKey: undefined }));
      }, 2000);
    } catch (error) {
      setSaveStatus((prev) => ({ ...prev, apiKey: 'error' }));
      alert(error instanceof Error ? error.message : 'API Key 保存失败');
      setTimeout(() => {
        setSaveStatus((prev) => ({ ...prev, apiKey: undefined }));
      }, 2000);
    }
  };

  const handleBaseUrlSave = () => {
    onBaseUrlChange(localBaseUrl);
    setSaveStatus((prev) => ({ ...prev, baseUrl: 'saved' }));
    setTimeout(() => {
      setSaveStatus((prev) => ({ ...prev, baseUrl: undefined }));
    }, 2000);
  };

  const handleModelSave = () => {
    onModelChange(localModel);
    setSaveStatus((prev) => ({ ...prev, model: 'saved' }));
    setTimeout(() => {
      setSaveStatus((prev) => ({ ...prev, model: undefined }));
    }, 2000);
  };

  return (
    <div
      className={`p-6 space-y-6 ${
        isLight ? 'bg-white text-gray-900' : 'bg-zinc-950 text-zinc-200'
      }`}
    >
      {/* Provider Selection */}
      <div>
        <label
          className={`block text-sm font-medium mb-2 ${
            isLight ? 'text-gray-700' : 'text-zinc-300'
          }`}
        >
          提供商 Provider
        </label>
        <div className="flex gap-3">
          <button
            onClick={() => onProviderChange('gemini')}
            className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
              config.provider === 'gemini'
                ? isLight
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-indigo-500 bg-indigo-900/30 text-indigo-300'
                : isLight
                ? 'border-gray-300 bg-gray-50 text-gray-700 hover:border-gray-400'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <Cpu size={18} />
              <span className="font-semibold">Gemini</span>
            </div>
          </button>
          <button
            onClick={() => onProviderChange('openai')}
            className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
              config.provider === 'openai'
                ? isLight
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-indigo-500 bg-indigo-900/30 text-indigo-300'
                : isLight
                ? 'border-gray-300 bg-gray-50 text-gray-700 hover:border-gray-400'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <Server size={18} />
              <span className="font-semibold">OpenAI Compatible</span>
            </div>
          </button>
        </div>
      </div>

      {/* API Key */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label
            className={`text-sm font-medium ${
              isLight ? 'text-gray-700' : 'text-zinc-300'
            }`}
          >
            API Key {config.provider === 'openai' && '(OpenAI/Custom)'}
          </label>
          {saveStatus.apiKey && (
            <span
              className={`text-xs ${
                saveStatus.apiKey === 'saved'
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}
            >
              {saveStatus.apiKey === 'saved' ? '✓ 已保存' : '✗ 保存失败'}
            </span>
          )}
        </div>
        <div className="flex space-x-2">
          <div className="relative flex-1">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={localApiKey}
              onChange={(e) => setLocalApiKey(e.target.value)}
              placeholder={
                config.provider === 'openai'
                  ? 'Enter OpenAI API Key...'
                  : 'Enter Gemini API Key...'
              }
              className={`w-full border rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                isLight
                  ? 'bg-gray-50 border-gray-300 text-gray-900'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-200'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors ${
                isLight
                  ? 'text-gray-500 hover:text-gray-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title={showApiKey ? '隐藏 API Key' : '显示 API Key'}
            >
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button
            onClick={handleApiKeySave}
            className={`p-2 rounded-lg transition-all ${
              saveStatus.apiKey === 'saved'
                ? 'bg-green-600 hover:bg-green-500'
                : 'bg-indigo-600 hover:bg-indigo-500'
            } text-white`}
            title="保存 API Key"
          >
            <Check size={18} />
          </button>
        </div>
      </div>

      {/* Model Selection - Both providers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label
            className={`text-sm font-medium ${
              isLight ? 'text-gray-700' : 'text-zinc-300'
            }`}
          >
            模型 Model
          </label>
          {saveStatus.model && (
            <span
              className={`text-xs ${
                saveStatus.model === 'saved'
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}
            >
              {saveStatus.model === 'saved' ? '✓ 已保存' : '✗ 保存失败'}
            </span>
          )}
        </div>

        {config.provider === 'gemini' ? (
          // Gemini: Dropdown + Custom option
          <div className="space-y-2">
            <div className="flex space-x-2">
              {!isCustomModel ? (
                <select
                  value={localModel}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '__custom__') {
                      setIsCustomModel(true);
                      setLocalModel('');
                    } else {
                      setLocalModel(value);
                    }
                  }}
                  className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isLight
                      ? 'bg-gray-50 border-gray-300 text-gray-900'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-200'
                  }`}
                >
                  {GEMINI_MODELS.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                  <option value="__custom__">自定义模型...</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={localModel}
                  onChange={(e) => setLocalModel(e.target.value)}
                  placeholder="输入自定义模型名称"
                  className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isLight
                      ? 'bg-gray-50 border-gray-300 text-gray-900'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-200'
                  }`}
                />
              )}
              <button
                onClick={handleModelSave}
                className={`p-2 rounded-lg transition-all ${
                  saveStatus.model === 'saved'
                    ? 'bg-green-600 hover:bg-green-500'
                    : 'bg-indigo-600 hover:bg-indigo-500'
                } text-white`}
                title="保存 Model"
              >
                <Check size={18} />
              </button>
            </div>
            {isCustomModel && (
              <button
                onClick={() => {
                  setIsCustomModel(false);
                  setLocalModel('gemini-3-pro-image-preview');
                }}
                className={`text-xs ${
                  isLight
                    ? 'text-indigo-600 hover:text-indigo-700'
                    : 'text-indigo-400 hover:text-indigo-300'
                }`}
              >
                ← 返回预设模型
              </button>
            )}
          </div>
        ) : (
          // OpenAI: Dropdown + Custom option (same as Gemini)
          <div className="space-y-2">
            <div className="flex space-x-2">
              {!isCustomModel ? (
                <select
                  value={localModel}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '__custom__') {
                      setIsCustomModel(true);
                      setLocalModel('');
                    } else {
                      setLocalModel(value);
                    }
                  }}
                  className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isLight
                      ? 'bg-gray-50 border-gray-300 text-gray-900'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-200'
                  }`}
                >
                  {OPENAI_MODELS.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                  <option value="__custom__">自定义模型...</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={localModel}
                  onChange={(e) => setLocalModel(e.target.value)}
                  placeholder="输入自定义模型名称 (如 dall-e-3)"
                  className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isLight
                      ? 'bg-gray-50 border-gray-300 text-gray-900'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-200'
                  }`}
                />
              )}
              <button
                onClick={handleModelSave}
                className={`p-2 rounded-lg transition-all ${
                  saveStatus.model === 'saved'
                    ? 'bg-green-600 hover:bg-green-500'
                    : 'bg-indigo-600 hover:bg-indigo-500'
                } text-white`}
                title="保存 Model"
              >
                <Check size={18} />
              </button>
            </div>
            {isCustomModel && (
              <button
                onClick={() => {
                  setIsCustomModel(false);
                  setLocalModel('gemini-3-pro-image-preview');
                }}
                className={`text-xs ${
                  isLight
                    ? 'text-indigo-600 hover:text-indigo-700'
                    : 'text-indigo-400 hover:text-indigo-300'
                }`}
              >
                ← 返回预设模型
              </button>
            )}
          </div>
        )}

        <p
          className={`text-xs mt-1 ${
            isLight ? 'text-gray-500' : 'text-zinc-600'
          }`}
        >
          选择预设模型或输入自定义模型名称
        </p>
      </div>

      {/* Base URL */}
      {(config.provider === 'openai' || config.provider === 'gemini') && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              className={`text-sm font-medium ${
                isLight ? 'text-gray-700' : 'text-zinc-300'
              }`}
            >
              {config.provider === 'openai' ? 'Base URL' : 'Gemini Base URL'}
            </label>
            {saveStatus.baseUrl && (
              <span
                className={`text-xs ${
                  saveStatus.baseUrl === 'saved'
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {saveStatus.baseUrl === 'saved' ? '???????' : '????????'}
              </span>
            )}
          </div>
          <div className="flex space-x-2">
            <input
              type="text"
              value={localBaseUrl}
              onChange={(e) => setLocalBaseUrl(e.target.value)}
              placeholder={
                config.provider === 'openai'
                  ? 'https://api.openai.com/v1'
                  : 'https://generativelanguage.googleapis.com/v1beta'
              }
              className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                isLight
                  ? 'bg-gray-50 border-gray-300 text-gray-900'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-200'
              }`}
            />
            <button
              onClick={handleBaseUrlSave}
              className={`p-2 rounded-lg transition-all ${
                saveStatus.baseUrl === 'saved'
                  ? 'bg-green-600 hover:bg-green-500'
                  : 'bg-indigo-600 hover:bg-indigo-500'
              } text-white`}
              title="保存 Base URL"
            >
              <Check size={18} />
            </button>
          </div>
          <p
            className={`text-xs mt-1 ${
              isLight ? 'text-gray-500' : 'text-zinc-600'
            }`}
          >
            {config.provider === 'openai'
              ? '支持 OpenAI 兼容接口 (如Google AI OpenAI endpoint)'
              : 'Gemini REST Base URL'}
          </p>
        </div>
      )}

      {/* Info */}
      <div
        className={`p-3 rounded-lg text-xs ${
          isLight
            ? 'bg-blue-50 text-blue-700 border border-blue-200'
            : 'bg-blue-900/20 text-blue-300 border border-blue-900/50'
        }`}
      >
        <p className="font-semibold mb-1">配置说明:</p>
        <ul className="space-y-1 list-disc list-inside">
          {config.provider === 'gemini' ? (
            <>
              <li>使用 Google Gemini API</li>
              <li>支持预设模型或自定义模型</li>
              <li>推荐: Gemini 3 Pro Image (高质量)</li>
              <li>快速: Gemini 2.5 Flash Image (速度快)</li>
            </>
          ) : (
            <>
              <li>支持 OpenAI 和任何兼容接口</li>
              <li>支持预设模型 (Gemini, GPT-4o) 或自定义模型</li>
              <li>可自定义 Base URL</li>
              <li>
                Google AI 端点: https://generativelanguage.googleapis.com/v1beta/openai/
              </li>
            </>
          )}
        </ul>
      </div>

      {/* Performance Hint */}
      <PerformanceHint
        theme={theme}
        batchSize={batchSize}
        provider={config.provider}
      />
    </div>
  );
};

export default ProviderConfigPanel;
