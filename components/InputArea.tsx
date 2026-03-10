import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, KeyboardEvent, DragEvent } from 'react';
import { SendHorizontal, Square, X, Loader2 } from 'lucide-react';
import { UploadedImage } from '../types';
import { generateUUID } from '../utils/uuid';
import {
  validateImageSize,
  validateImageCount,
  validateImageMimeType,
  VALIDATION_LIMITS
} from '../utils/validation';
import { getUserErrorMessage } from '../utils/errorHandler';
import { optimizeImage, shouldOptimizeImage } from '../utils/imageOptimizer';

interface InputAreaProps {
  onSend: (text: string, images?: UploadedImage[]) => void;
  onStop: () => void;
  disabled: boolean; // This now means "isGenerating" essentially
  theme: 'light' | 'dark';
  prefillRequest?: { text: string; images?: UploadedImage[] };
}

const InputArea: React.FC<InputAreaProps> = ({ onSend, onStop, disabled, theme, prefillRequest }) => {
  const isLight = theme === 'light';
  const [text, setText] = useState('');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [draggingImageId, setDraggingImageId] = useState<string | null>(null);
  const [dragOverImageId, setDragOverImageId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after'>('before');
  const dragCounterRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MIN_TEXTAREA_HEIGHT = 64;
  const MAX_TEXTAREA_HEIGHT = 160;

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT);
    const clampedHeight = Math.max(nextHeight, MIN_TEXTAREA_HEIGHT);
    textarea.style.height = `${clampedHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    if (!prefillRequest) return;
    setText(prefillRequest.text ?? '');
    setUploadedImages(prefillRequest.images ? [...prefillRequest.images] : []);
  }, [prefillRequest]);

  useLayoutEffect(() => {
    adjustTextareaHeight();
  }, [text, adjustTextareaHeight]);

  const isFileDragEvent = (e: DragEvent<HTMLElement>) => e.dataTransfer.types.includes('Files');

  const reorderUploadedImages = useCallback(
    (sourceImageId: string, targetImageId: string, position: 'before' | 'after') => {
      setUploadedImages((prev) => {
        const sourceIndex = prev.findIndex((img) => img.id === sourceImageId);
        const targetIndex = prev.findIndex((img) => img.id === targetImageId);

        if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
          return prev;
        }

        const nextImages = [...prev];
        const [sourceImage] = nextImages.splice(sourceIndex, 1);
        const normalizedTargetIndex = nextImages.findIndex((img) => img.id === targetImageId);
        const insertIndex = position === 'before' ? normalizedTargetIndex : normalizedTargetIndex + 1;

        nextImages.splice(insertIndex, 0, sourceImage);
        return nextImages;
      });
    },
    []
  );

  const processFiles = async (files: FileList) => {
    const fileArray = Array.from(files);

    // Validate image count
    try {
      validateImageCount(fileArray.length, uploadedImages.length);
    } catch (error) {
      alert(getUserErrorMessage(error));
      return;
    }

    // Filter and validate image files
    const validFiles: File[] = [];
    for (const file of fileArray) {
      // Check file type
      if (!file.type.startsWith('image/')) {
        continue; // Silently ignore non-image files
      }

      // Validate MIME type
      try {
        validateImageMimeType(file.type);
      } catch (error) {
        alert(getUserErrorMessage(error));
        continue;
      }

      // Validate file size (before optimization)
      try {
        validateImageSize(file.size);
      } catch (error) {
        alert(getUserErrorMessage(error));
        continue;
      }

      // Check for duplicate images (by name)
      const isDuplicate = uploadedImages.some((img) => img.name === file.name);
      if (isDuplicate) {
        continue; // Skip duplicates silently
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      return;
    }

    // Show processing indicator
    setIsProcessingImages(true);

    try {
      // Process files with optimization
      const imagePromises = validFiles.map(async (file: File) => {
        try {
          // Optimize image if needed
          const needsOptimization = shouldOptimizeImage(file);

          if (needsOptimization) {
            const optimizationResult = await optimizeImage(file);

            // Show optimization info in dev mode
            if (import.meta.env.DEV) {
              const originalMB = (optimizationResult.originalSize / (1024 * 1024)).toFixed(2);
              const optimizedMB = (optimizationResult.optimizedSize / (1024 * 1024)).toFixed(2);
              const saved = ((1 - optimizationResult.optimizedSize / optimizationResult.originalSize) * 100).toFixed(1);
              console.log(`Optimized ${file.name}: ${originalMB}MB → ${optimizedMB}MB (${saved}% smaller)`);
            }

            const uploadedImage: UploadedImage = {
              id: generateUUID(),
              data: optimizationResult.data,
              mimeType: optimizationResult.mimeType,
              name: file.name
            };
            return uploadedImage;
          } else {
            // No optimization needed, read file directly
            return new Promise<UploadedImage | null>((resolve) => {
              const reader = new FileReader();
              reader.onload = (event: ProgressEvent<FileReader>) => {
                const dataUrl = event.target?.result as string;
                if (dataUrl) {
                  const uploadedImage: UploadedImage = {
                    id: generateUUID(),
                    data: dataUrl,
                    mimeType: file.type,
                    name: file.name
                  };
                  resolve(uploadedImage);
                } else {
                  resolve(null);
                }
              };
              reader.onerror = () => {
                alert(`读取图片 "${file.name}" 失败，请重试`);
                resolve(null);
              };
              reader.readAsDataURL(file);
            });
          }
        } catch (error) {
          alert(`处理图片 "${file.name}" 失败: ${getUserErrorMessage(error)}`);
          return null;
        }
      });

      // Wait for all images to be processed
      const loadedImages = await Promise.all(imagePromises);
      const validImages = loadedImages.filter(
        (img): img is UploadedImage => img !== null
      );

      // Add images in order (immutable update)
      if (validImages.length > 0) {
        setUploadedImages((prev) => [...prev, ...validImages]);
      }
    } finally {
      setIsProcessingImages(false);
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!isFileDragEvent(e)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (!disabled && !isProcessingImages && dragCounterRef.current === 1) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!isFileDragEvent(e)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    // Only set dragging to false when we've truly left the container
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!isFileDragEvent(e)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!isFileDragEvent(e)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    if (disabled || isProcessingImages) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  const removeImage = (id: string) => {
    setUploadedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const resetImageSortDragState = () => {
    setDraggingImageId(null);
    setDragOverImageId(null);
    setDragOverPosition('before');
  };

  const getDropPosition = (e: DragEvent<HTMLDivElement>): 'before' | 'after' => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    return relativeX < rect.width / 2 ? 'before' : 'after';
  };

  const handleImageDragStart = (e: DragEvent<HTMLDivElement>, imageId: string) => {
    if (disabled || isProcessingImages || uploadedImages.length <= 1) {
      e.preventDefault();
      return;
    }

    setDraggingImageId(imageId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', imageId);
  };

  const handleImageDragOver = (e: DragEvent<HTMLDivElement>, imageId: string) => {
    if (!draggingImageId || draggingImageId === imageId) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    setDragOverImageId(imageId);
    setDragOverPosition(getDropPosition(e));
  };

  const handleImageDrop = (e: DragEvent<HTMLDivElement>, imageId: string) => {
    if (!draggingImageId) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (draggingImageId !== imageId) {
      const position = getDropPosition(e);
      reorderUploadedImages(draggingImageId, imageId, position);
    }

    resetImageSortDragState();
  };

  const handleImageDragEnd = () => {
    resetImageSortDragState();
  };

  const handlePreviewDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!draggingImageId) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverImageId(null);
  };

  const handlePreviewDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!draggingImageId) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    setUploadedImages((prev) => {
      const sourceIndex = prev.findIndex((img) => img.id === draggingImageId);
      if (sourceIndex < 0 || sourceIndex === prev.length - 1) {
        return prev;
      }

      const nextImages = [...prev];
      const [sourceImage] = nextImages.splice(sourceIndex, 1);
      nextImages.push(sourceImage);
      return nextImages;
    });

    resetImageSortDragState();
  };

  const handleSend = () => {
    if ((text.trim() || uploadedImages.length > 0) && !disabled && !isProcessingImages) {
      onSend(text.trim(), uploadedImages.length > 0 ? uploadedImages : undefined);
      setText('');
      setUploadedImages([]);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div 
      className={`p-4 backdrop-blur-xl border-t transition-colors duration-200 ${
        isLight
          ? 'bg-white/80 border-gray-200'
          : 'bg-zinc-950/80 border-zinc-800'
      } ${isDragging ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="max-w-4xl mx-auto relative">
        {/* Drag Overlay */}
        {isDragging && (
          <div className={`absolute inset-0 flex items-center justify-center rounded-lg z-20 ${
            isLight
              ? 'bg-indigo-50/90 border-2 border-dashed border-indigo-400'
              : 'bg-indigo-900/30 border-2 border-dashed border-indigo-500'
          }`}>
            <div className={`text-center ${isLight ? 'text-indigo-700' : 'text-indigo-300'}`}>
              <p className="text-lg font-semibold">拖放图片到这里</p>
              <p className="text-sm mt-1">图片将添加到消息中</p>
            </div>
          </div>
        )}

        {/* Processing Indicator */}
        {isProcessingImages && (
          <div className={`mb-3 flex items-center space-x-2 px-3 py-2 rounded-lg ${
            isLight ? 'bg-indigo-50 text-indigo-700' : 'bg-indigo-900/30 text-indigo-300'
          }`}>
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm font-medium">正在优化图片，请稍候...</span>
          </div>
        )}

        {/* Image Preview */}
        {uploadedImages.length > 0 && (
          <div
            className="mb-3 flex flex-wrap gap-2.5"
            onDragOver={handlePreviewDragOver}
            onDrop={handlePreviewDrop}
          >
            {uploadedImages.map((img, index) => {
              const imageNumber = index + 1;
              const chineseNumber = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][imageNumber - 1] || imageNumber.toString();
              return (
                <div
                  key={img.id}
                  draggable={!disabled && !isProcessingImages && uploadedImages.length > 1}
                  onDragStart={(e) => handleImageDragStart(e, img.id)}
                  onDragOver={(e) => handleImageDragOver(e, img.id)}
                  onDrop={(e) => handleImageDrop(e, img.id)}
                  onDragEnd={handleImageDragEnd}
                  className={`relative group ${draggingImageId === img.id ? 'opacity-70 scale-95' : ''}`}
                  title={uploadedImages.length > 1 ? '可拖动调整顺序' : undefined}
                >
                  {dragOverImageId === img.id && draggingImageId !== img.id && (
                    <div
                      className={`
                        pointer-events-none absolute top-0 bottom-0 w-1 rounded-full z-20
                        ${dragOverPosition === 'before' ? '-left-1' : '-right-1'}
                        ${isLight ? 'bg-indigo-600' : 'bg-indigo-400'}
                      `}
                    />
                  )}
                  <div className={`
                    relative w-24 h-24 rounded-xl overflow-hidden border-2 transition-all duration-200
                    ${isLight
                      ? 'border-indigo-400/60 bg-gray-50 shadow-md hover:shadow-lg hover:border-indigo-500'
                      : 'border-indigo-500/50 bg-zinc-900 shadow-lg hover:shadow-xl hover:border-indigo-400'
                    }
                    group-hover:scale-105
                  `}>
                    <img 
                      src={img.data} 
                      alt={img.name || `图${chineseNumber}`}
                      className="w-full h-full object-cover"
                    />
                    {/* Image number badge */}
                    <div className={`
                      absolute top-1 left-1 px-1.5 py-0.5 text-xs font-bold rounded-md backdrop-blur-sm
                      ${isLight
                        ? 'bg-indigo-600/90 text-white'
                        : 'bg-indigo-500/90 text-white'
                      }
                    `}>
                      {imageNumber}
                    </div>
                  </div>
                  <button
                    onClick={() => removeImage(img.id)}
                    className={`
                      absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center 
                      transition-all duration-200 z-10
                      ${isLight
                        ? 'bg-red-500 text-white hover:bg-red-600 shadow-lg hover:scale-110'
                        : 'bg-red-600 text-white hover:bg-red-500 shadow-lg hover:scale-110'
                      }
                      opacity-0 group-hover:opacity-100
                    `}
                    title="移除图片"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={
              disabled
                ? '正在生成图片... 点击停止按钮取消'
                : isProcessingImages
                ? '正在处理图片...'
                : uploadedImages.length > 0
                ? `已添加 ${uploadedImages.length} 张图片，输入描述或直接发送...`
                : '描述你想要生成的图片，或拖放图片到这里...'
            }
            className={`
              w-full border-0 rounded-2xl py-4 pl-5 pr-16
              focus:ring-2 focus:ring-indigo-500/50 focus:outline-none
              resize-none min-h-[64px] max-h-[160px]
              shadow-lg disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-200
              ${
                isLight
                  ? 'bg-gray-50 text-gray-900 placeholder-gray-400 border border-gray-200/50 focus:border-indigo-300'
                  : 'bg-zinc-900/90 text-zinc-100 placeholder-zinc-500 border border-zinc-800/50 focus:border-indigo-600'
              }
            `}
            rows={1}
          />
          
          {disabled ? (
            <button
              onClick={onStop}
              className={`
                absolute right-2.5 bottom-2.5 w-10 h-10 rounded-xl 
                flex items-center justify-center transition-all duration-200
                ${isLight
                  ? 'bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white border border-red-500/30 hover:border-red-500 shadow-md hover:scale-105'
                  : 'bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/50 hover:border-red-500 shadow-md hover:scale-105'
                }
              `}
              title="停止生成"
            >
              <Square size={18} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={(!text.trim() && uploadedImages.length === 0) || isProcessingImages}
              className={`
                absolute right-2.5 bottom-2.5 w-10 h-10 rounded-xl
                flex items-center justify-center transition-all duration-200
                ${((!text.trim() && uploadedImages.length === 0) || isProcessingImages)
                  ? (isLight
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-zinc-800 text-zinc-600 cursor-not-allowed')
                  : (isLight
                      ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 hover:shadow-xl hover:scale-105 active:scale-95'
                      : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 hover:shadow-xl hover:scale-105 active:scale-95')
                }
              `}
              title={
                isProcessingImages
                  ? "正在处理图片..."
                  : uploadedImages.length > 0
                    ? "发送图片和描述"
                    : "发送消息"
              }
            >
              {isProcessingImages ? <Loader2 size={20} className="animate-spin" /> : <SendHorizontal size={20} />}
            </button>
          )}
        </div>
      </div>
      <div className={`max-w-4xl mx-auto mt-3 text-center text-xs transition-colors duration-200 ${
        isLight ? 'text-gray-400' : 'text-zinc-500'
      }`}>
        <span className="inline-flex items-center gap-1.5">
          <span>使用 <strong className={isLight ? 'text-indigo-600' : 'text-indigo-400'}>Flash Image</strong> 生成 1K（快速）</span>
          <span className="mx-1">•</span>
          <span>使用 <strong className={isLight ? 'text-indigo-600' : 'text-indigo-400'}>Pro Image</strong> 生成 2K/4K</span>
          <span className="mx-1">•</span>
          <span>仅选中的图片会被记住</span>
        </span>
      </div>
    </div>
  );
};

export default InputArea;
