import React, { useState, useEffect, useRef } from 'react';
import { Layers, Monitor, Square, Key, Sun, Moon, Trash2, Download, Upload } from 'lucide-react';
import { AppSettings, AspectRatio, Resolution, Message, ProviderConfig, Provider, ASPECT_RATIO_OPTIONS } from '../types';
import ProviderConfigPanel from './ProviderConfigPanel';
import { isYunwuGptImage2AllModel, isYunwuGptImage2Model } from '../services/yunwuImageService';

interface SettingsPanelProps {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  providerConfig: ProviderConfig;
  onProviderChange: (provider: Provider) => void;
  onApiKeyChange: (key: string) => void;
  onBaseUrlChange: (url: string) => void;
  onModelChange: (model: string) => void;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onClearAll?: () => void;
  onCleanupCache?: () => void;
  hasMessages?: boolean;
  messages?: Message[];
  storageUsage?: { usageBytes: number; budgetBytes: number; usageRatio: number; browserQuotaBytes: number } | null;
  onImportMessages?: (messages: Message[]) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  updateSettings,
  providerConfig,
  onProviderChange,
  onApiKeyChange,
  onBaseUrlChange,
  onModelChange,
  theme,
  onThemeChange,
  onClearAll,
  onCleanupCache,
  hasMessages,
  messages,
  storageUsage,
  onImportMessages
}) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aspectRatioOptions = isYunwuGptImage2Model(providerConfig.model)
    ? ASPECT_RATIO_OPTIONS.filter((option) =>
        ['Auto', '1:1', '3:2', '2:3', '16:9', '9:16'].includes(option.value)
      )
    : isYunwuGptImage2AllModel(providerConfig.model)
    ? ASPECT_RATIO_OPTIONS.filter((option) =>
        ['Auto', '1:1', '3:2', '2:3', '16:9'].includes(option.value)
      )
    : ASPECT_RATIO_OPTIONS;

  useEffect(() => {
    if (!aspectRatioOptions.some((option) => option.value === settings.aspectRatio)) {
      updateSettings({ aspectRatio: 'Auto' });
    }
  }, [aspectRatioOptions, settings.aspectRatio, updateSettings]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsConfigOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Export data package
  const handleExport = () => {
    if (!messages || messages.length === 0) {
      alert('没有对话数据可导出');
      return;
    }

    // Validate and prepare messages with target results (selected images)
    const validatedMessages = messages.map(msg => {
      // For model messages with selected images, ensure the target result is valid
      if (msg.role === 'model' && msg.selectedImageId && msg.images) {
        const selectedImage = msg.images.find(img => img.id === msg.selectedImageId);
        if (!selectedImage) {
          console.warn(`Message ${msg.id}: selectedImageId ${msg.selectedImageId} not found in images, clearing selection`);
          return { ...msg, selectedImageId: undefined };
        }
        if (selectedImage.status !== 'success') {
          console.warn(`Message ${msg.id}: selected image has status ${selectedImage.status}, clearing selection`);
          return { ...msg, selectedImageId: undefined };
        }
      }
      return msg;
    });

    // Count target results (selected images)
    const targetResultsCount = validatedMessages.filter(msg => 
      msg.role === 'model' && msg.selectedImageId && msg.images?.some(img => 
        img.id === msg.selectedImageId && img.status === 'success'
      )
    ).length;

    const exportData = {
      version: 1,
      timestamp: Date.now(),
      messages: validatedMessages,
      settings: settings,
      metadata: {
        totalMessages: validatedMessages.length,
        targetResultsCount: targetResultsCount, // Number of selected target results
        exportNote: '目标结果（选中的图像）已包含在消息的 selectedImageId 字段中'
      },
      // Note: API Key is NOT exported for security
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `banana-batch-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.json`;
    link.target = '_blank'; // Ensure download works
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Show export summary
    if (targetResultsCount > 0) {
      alert(`导出成功！\n共 ${validatedMessages.length} 条消息\n包含 ${targetResultsCount} 个目标结果（选中的图像）`);
    } else {
      alert(`导出成功！\n共 ${validatedMessages.length} 条消息`);
    }
  };

  // Import data package
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate data structure
      if (!data.messages || !Array.isArray(data.messages)) {
        throw new Error('无效的数据包格式：缺少消息数据');
      }

      // Validate and restore target results (selected images)
      const restoredMessages = data.messages.map((msg: Message) => {
        // For model messages, validate selectedImageId
        if (msg.role === 'model' && msg.selectedImageId && msg.images) {
          const selectedImage = msg.images.find((img: any) => img.id === msg.selectedImageId);
          
          if (!selectedImage) {
            console.warn(`Message ${msg.id}: selectedImageId ${msg.selectedImageId} not found in images, clearing selection`);
            return { ...msg, selectedImageId: undefined };
          }
          
          if (selectedImage.status !== 'success') {
            console.warn(`Message ${msg.id}: selected image has status ${selectedImage.status}, clearing selection`);
            return { ...msg, selectedImageId: undefined };
          }
          
          // Ensure image data is valid
          if (!selectedImage.data || selectedImage.data.length === 0) {
            console.warn(`Message ${msg.id}: selected image has no data, clearing selection`);
            return { ...msg, selectedImageId: undefined };
          }
        }
        return msg;
      });

      // Count restored target results
      const restoredTargetResultsCount = restoredMessages.filter(msg => 
        msg.role === 'model' && msg.selectedImageId && msg.images?.some(img => 
          img.id === msg.selectedImageId && img.status === 'success'
        )
      ).length;

      // Import messages
      if (onImportMessages) {
        const targetResultsInfo = restoredTargetResultsCount > 0 
          ? `\n包含 ${restoredTargetResultsCount} 个目标结果（选中的图像）` 
          : '';
        
        if (window.confirm(`确定要导入 ${data.messages.length} 条消息吗？当前对话将被替换。${targetResultsInfo}`)) {
          onImportMessages(restoredMessages);
          
          // Import settings if available
          if (data.settings) {
            updateSettings(data.settings);
          }
          
          // Show import summary
          if (restoredTargetResultsCount > 0) {
            alert(`数据包导入成功！\n共导入 ${restoredMessages.length} 条消息\n已恢复 ${restoredTargetResultsCount} 个目标结果（选中的图像）`);
          } else {
            alert(`数据包导入成功！\n共导入 ${restoredMessages.length} 条消息`);
          }
        }
      }
    } catch (error: any) {
      console.error('Import failed:', error);
      alert(`导入失败：${error.message || '未知错误'}`);
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const isLight = theme === 'light';

  const formatStorage = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  };

  return (
    <div className={`flex flex-wrap items-center gap-4 backdrop-blur-md px-4 py-2 rounded-lg border relative transition-colors duration-200 ${
      isLight
        ? 'bg-gray-100/80 border-gray-300'
        : 'bg-zinc-900/50 border-zinc-800'
    }`}>
      
      {/* Batch Size Slider */}
      <div className={`flex items-center space-x-3 border-r pr-4 ${
        isLight ? 'border-gray-300' : 'border-zinc-700'
      }`}>
        <div className={`flex items-center ${isLight ? 'text-gray-600' : 'text-zinc-400'}`} title="Batch Size">
          <Layers size={16} />
        </div>
        <input 
            type="range" 
            min="1" 
            max="20" 
            step="1"
            value={settings.batchSize} 
            onChange={(e) => updateSettings({ batchSize: Number(e.target.value) })}
            className={`w-20 h-1.5 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all focus:outline-none ${
              isLight ? 'bg-gray-300' : 'bg-zinc-700'
            }`}
        />
        <div className={`min-w-[1.5rem] text-center text-sm font-bold ${
          isLight ? 'text-indigo-600' : 'text-indigo-400'
        }`}>
            {settings.batchSize}
        </div>
      </div>

      {/* Aspect Ratio */}
      <div className="flex items-center space-x-2">
         <Square size={16} className={isLight ? 'text-gray-600' : 'text-zinc-400'} />
         <select 
            value={settings.aspectRatio} 
            onChange={(e) => updateSettings({ aspectRatio: e.target.value as AspectRatio })}
            className={`text-xs font-medium rounded px-2 py-1 border focus:outline-none focus:border-indigo-500 cursor-pointer transition-colors ${
              isLight
                ? 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
            }`}
         >
            {aspectRatioOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
         </select>
       </div>

      {/* Resolution */}
      <div className={`flex items-center space-x-2 border-r pr-4 ${
        isLight ? 'border-gray-300' : 'border-zinc-700'
      }`}>
         <Monitor size={16} className={isLight ? 'text-gray-600' : 'text-zinc-400'} />
         <select 
            value={settings.resolution} 
            onChange={(e) => updateSettings({ resolution: e.target.value as Resolution })}
            className={`text-xs font-medium rounded px-2 py-1 border focus:outline-none focus:border-indigo-500 cursor-pointer transition-colors ${
              isLight
                ? 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
            }`}
         >
            <option value="1K">1K (Fast)</option>
            <option value="2K">2K (Pro)</option>
            <option value="4K">4K (Pro)</option>
         </select>
      </div>

      {/* Theme Toggle */}
      <div className="flex items-center">
        <button 
          onClick={() => onThemeChange(theme === 'light' ? 'dark' : 'light')}
          className={`p-1.5 rounded transition-colors ${
            isLight 
              ? 'text-yellow-600 hover:text-yellow-700' 
              : 'text-yellow-400 hover:text-yellow-300'
          }`}
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>

      {/* Export/Import Data Package */}
      <div className={`flex items-center space-x-1 border-r pr-4 ${
        isLight ? 'border-gray-300' : 'border-zinc-700'
      }`}>
        <button 
          onClick={handleExport}
          className={`p-1.5 rounded transition-colors ${
            isLight
              ? 'text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50'
              : 'text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/20'
          }`}
          title="导出数据包"
        >
          <Download size={16} />
        </button>
        <button 
          onClick={handleImportClick}
          className={`p-1.5 rounded transition-colors ${
            isLight
              ? 'text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50'
              : 'text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/20'
          }`}
          title="导入数据包"
        >
          <Upload size={16} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImport}
          className="hidden"
        />
      </div>

      {storageUsage && storageUsage.budgetBytes > 0 && (
        <div className={`flex items-center space-x-2 border-r pr-4 text-xs ${
          isLight ? 'border-gray-300 text-gray-600' : 'border-zinc-700 text-zinc-400'
        }`} title="浏览器存储占用情况">
          <span>
            缓存 {Math.round(storageUsage.usageRatio * 100)}%
          </span>
          <span>
            {formatStorage(storageUsage.usageBytes)} / {formatStorage(storageUsage.budgetBytes)}
          </span>
        </div>
      )}

      {onCleanupCache && (
        <div className={`flex items-center border-r pr-4 ${
          isLight ? 'border-gray-300' : 'border-zinc-700'
        }`}>
          <button
            onClick={onCleanupCache}
            className={`p-1.5 rounded transition-colors ${
              isLight
                ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                : 'text-amber-400 hover:text-amber-300 hover:bg-amber-900/20'
            }`}
            title="清理旧图片缓存"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {/* Clear All Messages */}
      {onClearAll && hasMessages && (
        <div className={`flex items-center border-r pr-4 ${
          isLight ? 'border-gray-300' : 'border-zinc-700'
        }`}>
          <button 
            onClick={() => {
              if (window.confirm('确定要清除所有对话历史吗？此操作不可撤销。')) {
                onClearAll();
              }
            }}
            className={`p-1.5 rounded transition-colors ${
              isLight
                ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                : 'text-red-400 hover:text-red-300 hover:bg-red-900/20'
            }`}
            title="清除所有对话历史"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {/* Provider Config Toggle */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsConfigOpen(!isConfigOpen)}
          className={`p-1.5 rounded transition-colors ${
            providerConfig.apiKey
              ? 'text-green-500 hover:text-green-400'
              : isLight
              ? 'text-gray-500 hover:text-gray-700'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
          title="Configure Provider & API"
        >
          <Key size={16} />
        </button>

        {isConfigOpen && (
          <div
            className={`absolute top-full right-0 mt-3 w-96 border rounded-xl shadow-2xl z-50 animate-in slide-in-from-top-2 duration-200 ${
              isLight ? 'bg-white border-gray-300' : 'bg-zinc-950 border-zinc-800'
            }`}
          >
            <ProviderConfigPanel
              config={providerConfig}
              onProviderChange={onProviderChange}
              onApiKeyChange={onApiKeyChange}
              onBaseUrlChange={onBaseUrlChange}
              onModelChange={onModelChange}
              theme={theme}
              batchSize={settings.batchSize}
            />
          </div>
        )}
      </div>

    </div>
  );
};

export default SettingsPanel;
