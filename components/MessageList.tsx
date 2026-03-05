import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Message, AspectRatio } from '../types';
import { User, Sparkles, CheckCircle2, Circle, AlertTriangle, Loader2, ChevronDown, ChevronUp, MessageSquare, RotateCcw, Trash2, Download } from 'lucide-react';
import ImagePreviewModal from './ImagePreviewModal';

interface MessageListProps {
  messages: Message[];
  isGenerating: boolean;
  progress: { current: number, total: number } | null;
  onSelectImage: (messageId: string, imageId: string) => void;
  onRetry?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  theme: 'light' | 'dark';
  currentGeneratingMessageId?: string;
}

const MessageList: React.FC<MessageListProps> = ({ messages, isGenerating, progress, onSelectImage, onRetry, onDeleteMessage, theme, currentGeneratingMessageId }) => {
  const isLight = theme === 'light';
  const bottomRef = useRef<HTMLDivElement>(null);
  
  // State to track which message's text details are expanded
  const [expandedTextId, setExpandedTextId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);

  // Optimize scroll behavior - only scroll when messages change or progress updates
  useEffect(() => {
    if (isGenerating || messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isGenerating, progress?.current]);

  const toggleTextExpansion = useCallback((id: string) => {
    setExpandedTextId((prev) => (prev === id ? null : id));
  }, []);

  const openPreview = useCallback((src: string, alt: string) => {
    setPreviewImage({ src, alt });
  }, []);

  const closePreview = useCallback(() => {
    setPreviewImage(null);
  }, []);

  // Download image function (memoized)
  const handleDownloadImage = useCallback(
    (e: React.MouseEvent, imageData: string, mimeType: string) => {
      e.stopPropagation(); // Prevent triggering selection

      try {
        // Create a temporary anchor element
        const link = document.createElement('a');
        link.href = imageData;

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const extension = mimeType.split('/')[1] || 'png';
        link.download = `banana-batch-${timestamp}.${extension}`;

        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (error) {
        // Only log in development
        if (import.meta.env.DEV) {
          console.error('Failed to download image:', error);
        }
      }
    },
    []
  );

  // Memoize grid class calculation
  const getGridClass = useMemo(
    () => (count: number) => {
      if (count === 0) return 'hidden';
      if (count === 1) return 'grid-cols-1 max-w-sm';
      if (count === 2) return 'grid-cols-2 max-w-2xl';
      if (count <= 4) return 'grid-cols-2 max-w-2xl';
      if (count <= 6) return 'grid-cols-2 sm:grid-cols-3';
      if (count <= 9) return 'grid-cols-2 sm:grid-cols-3';
      return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5';
    },
    []
  );

  // Memoize aspect ratio style calculation
  const getAspectRatioStyle = useMemo(
    () => (ratio?: AspectRatio) => {
      switch (ratio) {
        case '1:1':
          return { aspectRatio: '1 / 1' };
        case '3:4':
          return { aspectRatio: '3 / 4' };
        case '4:3':
          return { aspectRatio: '4 / 3' };
        case '9:16':
          return { aspectRatio: '9 / 16' };
        case '16:9':
          return { aspectRatio: '16 / 9' };
        case 'Auto':
        default:
          return { aspectRatio: '1 / 1' };
      }
    },
    []
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-8 pb-32">
      <ImagePreviewModal
        isOpen={!!previewImage}
        src={previewImage?.src || ''}
        alt={previewImage?.alt}
        onClose={closePreview}
        theme={theme}
      />

      {messages.length === 0 && (
        <div className={`flex flex-col items-center justify-center h-full space-y-4 opacity-50 ${
          isLight ? 'text-gray-400' : 'text-zinc-500'
        }`}>
          <Sparkles size={48} className="text-indigo-500 animate-pulse" />
          <p className={`text-center text-sm ${
            isLight ? 'text-gray-500' : 'text-zinc-400'
          }`}>Start by typing a prompt to generate images...</p>
        </div>
      )}

      {messages.map((msg, index) => (
        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
          <div className={`max-w-[90%] w-full flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            
            {/* Delete button - show on hover */}
            {onDeleteMessage && (
              <button
                onClick={() => onDeleteMessage(msg.id)}
                className={`self-start mt-1 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${
                  isLight
                    ? 'hover:bg-red-100 text-red-600'
                    : 'hover:bg-red-900/30 text-red-400'
                }`}
                title="删除此消息及之后的所有消息"
              >
                <Trash2 size={14} />
              </button>
            )}
            
            {/* Avatar */}
            <div className={`
              w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1
              ${msg.role === 'user' 
                ? (isLight ? 'bg-gray-300' : 'bg-zinc-700')
                : 'bg-indigo-600'
              }
            `}>
              {msg.role === 'user' ? <User size={16} /> : <Sparkles size={16} />}
            </div>

            {/* Content */}
            <div className={`flex flex-col space-y-3 ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}>
              
              {/* User Uploaded Images */}
              {msg.role === 'user' && msg.uploadedImages && msg.uploadedImages.length > 0 && (
                <div className="flex flex-wrap gap-3 max-w-2xl">
                  {msg.uploadedImages.map((img, index) => {
                    const imageNumber = index + 1;
                    const chineseNumber = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][imageNumber - 1] || imageNumber.toString();
                    return (
                      <div key={img.id} className="relative group">
                        <div className={`
                          relative max-w-[220px] max-h-[220px] rounded-xl overflow-hidden border-2 
                          transition-all duration-200 shadow-lg
                          ${isLight
                            ? 'border-indigo-400/60 bg-gray-50 hover:border-indigo-500 hover:shadow-xl'
                            : 'border-indigo-500/50 bg-zinc-900 hover:border-indigo-400 hover:shadow-xl'
                          }
                          group-hover:scale-105
                        `}>
                          <img
                            src={img.data}
                            alt={img.name || `图${chineseNumber}`}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          {/* Image number badge */}
                          <div className={`
                            absolute top-2 left-2 px-2 py-1 text-xs font-bold rounded-lg backdrop-blur-md shadow-lg
                            ${isLight
                              ? 'bg-indigo-600/95 text-white'
                              : 'bg-indigo-500/95 text-white'
                            }
                          `}>
                            图{chineseNumber}
                          </div>
                          {/* Download Button - Top Right */}
                          <button
                            onClick={(e) => handleDownloadImage(e, img.data, img.mimeType)}
                            className={`
                              absolute top-2 right-2 p-2 rounded-lg backdrop-blur-md transition-all z-20
                              opacity-0 group-hover:opacity-100
                              ${isLight 
                                ? 'bg-white/95 text-gray-700 hover:bg-white hover:scale-110 shadow-xl border border-gray-200/50' 
                                : 'bg-zinc-900/95 text-zinc-300 hover:bg-zinc-800 hover:scale-110 shadow-xl border border-zinc-700/50'
                              }
                            `}
                            title="下载图片"
                          >
                            <Download size={14} />
                          </button>
                          {img.name && (
                            <div className={`
                              absolute bottom-0 left-0 right-0 px-3 py-2 text-xs font-medium rounded-b-xl truncate 
                              backdrop-blur-md
                              ${isLight
                                ? 'bg-black/70 text-white'
                                : 'bg-black/80 text-white'
                              }
                            `}>
                              {img.name}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Text Bubble */}
              {msg.text && (
                <div className={`
                  flex flex-col
                  ${msg.role === 'user' ? 'items-end' : 'items-start'}
                `}>
                  <div className={`
                    px-5 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap max-w-3xl
                    shadow-md transition-all duration-200
                    ${msg.role === 'user' 
                      ? (isLight 
                          ? 'bg-gradient-to-br from-indigo-100 to-indigo-50 text-gray-900 rounded-tr-sm border border-indigo-200/50' 
                          : 'bg-gradient-to-br from-indigo-900/40 to-indigo-800/20 text-zinc-100 rounded-tr-sm border border-indigo-700/30')
                      : (isLight
                          ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
                          : 'bg-zinc-900/60 border border-zinc-800/50 text-zinc-300 rounded-tl-sm shadow-sm')
                    }
                  `}>
                    {msg.text}
                  </div>

                  {/* Text Variations Collapsible */}
                  {msg.role === 'model' && msg.textVariations && msg.textVariations.length > 1 && (
                    <div className="mt-1">
                      <button 
                        onClick={() => toggleTextExpansion(msg.id)}
                        className={`flex items-center space-x-1 text-xs transition-colors ${
                          isLight
                            ? 'text-gray-500 hover:text-gray-700'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                         <MessageSquare size={12} />
                         <span>
                           {expandedTextId === msg.id ? "Hide" : "Show"} {msg.textVariations.length - 1} other responses
                         </span>
                         {expandedTextId === msg.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>

                      {expandedTextId === msg.id && (
                        <div className={`mt-2 pl-2 border-l-2 space-y-2 animate-in slide-in-from-top-2 fade-in duration-200 ${
                          isLight ? 'border-gray-300' : 'border-zinc-800'
                        }`}>
                          {msg.textVariations.slice(1).map((variant, idx) => (
                            <div key={idx} className={`text-xs p-2 rounded ${
                              isLight
                                ? 'text-gray-600 bg-gray-100'
                                : 'text-zinc-400 bg-zinc-900/30'
                            }`}>
                              {variant}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Image Grid (Model only) */}
              {msg.role === 'model' && msg.images && (
                <div className="w-full">
                  <div className={`grid gap-4 ${getGridClass(msg.images.length)}`}>
                    {msg.images.map((img, imgIndex) => {
                      const isSelected = msg.selectedImageId === img.id;
                      const hasSelection = !!msg.selectedImageId;
                      const isDiscarded = hasSelection && !isSelected;
                      const previewAlt = `生成图片 ${imgIndex + 1}`;

                      // Error Tile
                      if (img.status === 'error') {
                          return (
                            <div 
                                key={img.id}
                                style={getAspectRatioStyle(msg.generationSettings?.aspectRatio)}
                                className={`w-full rounded-xl border border-dashed flex flex-col items-center justify-center p-4 ${
                                  isLight
                                    ? 'bg-gray-100 border-gray-300 text-gray-500'
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-600'
                                }`}
                            >
                                <AlertTriangle size={24} className="mb-2 opacity-50 text-amber-500" />
                                <span className="text-xs text-center font-medium">Failed</span>
                            </div>
                          );
                      }

                      return (
                        <div 
                          key={img.id} 
                          style={getAspectRatioStyle(msg.generationSettings?.aspectRatio)}
                          onClick={() => openPreview(img.data, previewAlt)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openPreview(img.data, previewAlt);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label={`${previewAlt} 预览`}
                          className={`
                            group relative w-full rounded-2xl overflow-hidden border-2 transition-all duration-300
                            ${isLight ? 'bg-gray-50' : 'bg-zinc-900/50'}
                            ${isSelected 
                              ? 'border-indigo-500 shadow-[0_0_25px_rgba(99,102,241,0.4)] scale-[1.03] z-10 ring-2 ring-indigo-500/30' 
                              : (isLight 
                                  ? 'border-gray-200 hover:border-indigo-300 hover:shadow-lg' 
                                  : 'border-zinc-800 hover:border-indigo-600/50 hover:shadow-xl')}
                            ${isDiscarded ? 'opacity-35 grayscale-[0.85] scale-[0.97]' : 'opacity-100'}
                            hover:scale-[1.01] cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                          `}
                        >
                          <img 
                            src={img.data} 
                            alt="Generated content" 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                          
                          {/* Selected Badge */}
                          {isSelected && (
                            <div className="absolute top-2 left-2 z-20">
                              <div className={`
                                px-2 py-1 rounded-md text-xs font-semibold backdrop-blur-md
                                ${isLight 
                                  ? 'bg-indigo-600 text-white shadow-lg' 
                                  : 'bg-indigo-500 text-white shadow-lg'
                                }
                              `}>
                                已选中
                              </div>
                            </div>
                          )}
                          
                          {/* Download Button - Top Right */}
                          <button
                            onClick={(e) => handleDownloadImage(e, img.data, img.mimeType)}
                            className={`
                              absolute top-2 right-2 p-2.5 rounded-xl backdrop-blur-md transition-all z-20
                              opacity-0 group-hover:opacity-100
                              ${isLight 
                                ? 'bg-white/95 text-gray-700 hover:bg-white hover:scale-110 shadow-xl border border-gray-200/50' 
                                : 'bg-zinc-900/95 text-zinc-300 hover:bg-zinc-800 hover:scale-110 shadow-xl border border-zinc-700/50'
                              }
                            `}
                            title="下载图片"
                          >
                            <Download size={16} />
                          </button>
                          
                          {/* Selection Overlay */}
                          <div
                            className={`
                              absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent 
                              opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-10
                              ${isSelected ? 'opacity-100 from-black/40 via-black/10 to-transparent' : ''}
                            `}
                          />
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectImage(msg.id, img.id);
                            }}
                            className={`
                              absolute bottom-3 left-1/2 -translate-x-1/2 z-20
                              flex items-center space-x-2 px-4 py-2 rounded-full backdrop-blur-md 
                              transition-all duration-200 transform opacity-0 group-hover:opacity-100
                              ${isSelected 
                                ? 'opacity-100 bg-indigo-600 text-white shadow-xl scale-105' 
                                : (isLight 
                                    ? 'bg-white/95 text-gray-700 hover:scale-110 shadow-xl' 
                                    : 'bg-zinc-900/95 text-zinc-300 hover:scale-110 shadow-xl')
                              }
                            `}
                            title={isSelected ? '取消选择' : '选择此图'}
                            type="button"
                          >
                            {isSelected ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                            <span className="text-sm font-semibold">
                              {isSelected ? '已选中' : '选择此图'}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  
                  {msg.images.length > 0 && (
                      <div className={`mt-4 flex items-center justify-between px-1 ${
                        isLight ? 'text-gray-500' : 'text-zinc-400'
                      }`}>
                        <div className="flex items-center space-x-2.5">
                          <div className={`
                            w-2 h-2 rounded-full transition-all duration-300
                            ${currentGeneratingMessageId === msg.id && !msg.selectedImageId 
                              ? 'bg-indigo-500 animate-pulse shadow-lg shadow-indigo-500/50' 
                              : (isLight ? 'bg-gray-400' : 'bg-zinc-600')
                            }
                          `}></div>
                          <span className="text-sm font-medium">
                          {msg.selectedImageId 
                              ? `已选中 1 张图片，共生成 ${msg.images.length} 张` 
                              : currentGeneratingMessageId === msg.id
                                  ? `正在生成... 已完成 ${msg.images.length} 张` 
                                  : `已生成 ${msg.images.length} 张图片`}
                          </span>
                        </div>
                        
                        {/* Retry button - show next to model messages */}
                        {onRetry && currentGeneratingMessageId !== msg.id && (
                          <button
                            onClick={() => onRetry(msg.id)}
                            className={`
                              flex items-center space-x-1.5 px-3 py-1.5 rounded-lg 
                              transition-all duration-200 text-sm font-medium
                              ${isLight
                                ? 'text-indigo-600 hover:bg-indigo-50 hover:shadow-md active:scale-95'
                                : 'text-indigo-400 hover:bg-indigo-900/30 hover:shadow-md active:scale-95'
                              }
                            `}
                            title="生成更多图片（增量添加）"
                          >
                            <RotateCcw size={14} />
                            <span>生成更多</span>
                          </button>
                        )}
                      </div>
                  )}
                </div>
              )}

              {/* Error State - only show if no images and an error flag is present */}
              {msg.isError && (!msg.images || msg.images.length === 0) && (
                 <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                   isLight
                     ? 'text-red-600 bg-red-50 border border-red-200'
                     : 'text-red-400 bg-red-900/10 border border-red-900/50'
                 }`}>
                   <div className="flex items-center">
                     <AlertTriangle size={14} className="mr-2" />
                     Generation stopped or failed.
                   </div>
                   {/* Retry button for failed messages */}
                   {onRetry && (
                     <button
                       onClick={() => onRetry(msg.id)}
                       className={`flex items-center space-x-1 px-2 py-1 rounded transition-colors ml-4 ${
                         isLight
                           ? 'text-indigo-600 hover:bg-indigo-50'
                           : 'text-indigo-400 hover:bg-indigo-900/20'
                       }`}
                       title="重试生成"
                     >
                       <RotateCcw size={12} />
                       <span>重试</span>
                     </button>
                   )}
                 </div>
              )}
            </div>
          </div>
        </div>
      ))}
      
      {/* Loading Indicator for Pending/Queue */}
      {isGenerating && progress && (
        <div className="flex justify-start ml-12">
           <div className={`flex items-center space-x-3 border rounded-lg px-4 py-2 ${
             isLight
               ? 'bg-gray-100 border-gray-300'
               : 'bg-zinc-900/50 border-zinc-800'
           }`}>
                 <Loader2 size={14} className="animate-spin text-indigo-500" />
                 <span className={`text-xs font-medium ${
                   isLight ? 'text-gray-600' : 'text-zinc-400'
                 }`}>
                    Processing batch... ({progress.current}/{progress.total})
                 </span>
                 <div className={`w-24 h-1 rounded-full overflow-hidden ${
                   isLight ? 'bg-gray-300' : 'bg-zinc-800'
                 }`}>
                      <div 
                        className="h-full bg-indigo-500 transition-all duration-300 ease-out"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      ></div>
                 </div>
           </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};

export default MessageList;
