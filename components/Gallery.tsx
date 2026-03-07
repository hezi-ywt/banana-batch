import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Download, Trash2, Grid, List, Search, Filter, Calendar, Image as ImageIcon } from 'lucide-react';
import { getImage, listImages, deleteImage, getStorageStats, clearOldImages, ImageRecord } from '../utils/imageStorage';
import ImagePreviewModal from './ImagePreviewModal';

interface GalleryProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
}

type ViewMode = 'grid' | 'list';
type SortBy = 'newest' | 'oldest' | 'accessed';

const Gallery: React.FC<GalleryProps> = ({ isOpen, onClose, theme }) => {
  const isLight = theme === 'light';
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [stats, setStats] = useState<{ count: number; totalSize: string } | null>(null);
  const [filterMimeType, setFilterMimeType] = useState<string>('all');

  // 加载图片列表
  const loadImages = useCallback(async () => {
    setLoading(true);
    try {
      const allImages = await listImages();
      setImages(allImages);
      
      // 计算统计信息
      const storageStats = await getStorageStats();
      const totalSizeMB = allImages.reduce((sum, img) => {
        // base64 转二进制大小估算
        const base64Length = img.data.length - (img.data.indexOf(',') + 1);
        const sizeBytes = (base64Length * 3) / 4;
        return sum + sizeBytes;
      }, 0) / (1024 * 1024);
      
      setStats({
        count: storageStats.count,
        totalSize: totalSizeMB.toFixed(2) + ' MB',
      });
    } catch (error) {
      console.error('Failed to load images:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载和打开时刷新
  useEffect(() => {
    if (isOpen) {
      loadImages();
    }
  }, [isOpen, loadImages]);

  // 过滤和排序图片
  const filteredImages = useMemo(() => {
    let result = [...images];

    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((img) => 
        img.id.toLowerCase().includes(query) ||
        img.mimeType.toLowerCase().includes(query)
      );
    }

    // MIME 类型过滤
    if (filterMimeType !== 'all') {
      result = result.filter((img) => img.mimeType.startsWith(filterMimeType));
    }

    // 排序
    result.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return b.createdAt - a.createdAt;
        case 'oldest':
          return a.createdAt - b.createdAt;
        case 'accessed':
          return b.accessedAt - a.accessedAt;
        default:
          return 0;
      }
    });

    return result;
  }, [images, searchQuery, filterMimeType, sortBy]);

  // MIME 类型选项
  const mimeTypeOptions = useMemo(() => {
    const types = new Set(images.map((img) => img.mimeType.split('/')[0]));
    return ['all', ...Array.from(types)];
  }, [images]);

  // 选择/取消选择图片
  const toggleSelection = useCallback((id: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    if (selectedImages.size === filteredImages.length) {
      setSelectedImages(new Set());
    } else {
      setSelectedImages(new Set(filteredImages.map((img) => img.id)));
    }
  }, [filteredImages, selectedImages.size]);

  // 删除选中图片
  const deleteSelected = useCallback(async () => {
    if (selectedImages.size === 0) return;
    
    if (!confirm(`确定要删除选中的 ${selectedImages.size} 张图片吗？`)) return;

    let deleted = 0;
    for (const id of selectedImages) {
      try {
        await deleteImage(id);
        deleted++;
      } catch (error) {
        console.error(`Failed to delete image ${id}:`, error);
      }
    }
    
    setSelectedImages(new Set());
    await loadImages();
    alert(`已删除 ${deleted} 张图片`);
  }, [selectedImages, loadImages]);

  // 清理旧图片
  const cleanupOld = useCallback(async () => {
    if (!confirm('确定要清理 30 天前的图片吗？')) return;
    
    try {
      const deleted = await clearOldImages(30);
      await loadImages();
      alert(`已清理 ${deleted} 张旧图片`);
    } catch (error) {
      console.error('Failed to cleanup old images:', error);
    }
  }, [loadImages]);

  // 下载图片
  const downloadImage = useCallback(async (id: string) => {
    try {
      const record = await getImage(id);
      if (!record) return;

      const link = document.createElement('a');
      link.href = record.data;
      const timestamp = new Date(record.createdAt).toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const extension = record.mimeType.split('/')[1] || 'png';
      link.download = `banana-batch-${timestamp}-${id.slice(0, 8)}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to download image:', error);
    }
  }, []);

  // 预览图片
  const previewGalleryImage = useCallback(async (id: string) => {
    try {
      const record = await getImage(id);
      if (record) {
        setPreviewImage({ src: record.data, alt: `图片 ${id.slice(0, 8)}` });
      }
    } catch (error) {
      console.error('Failed to load image for preview:', error);
    }
  }, []);

  if (!isOpen) return null;

  return (
    <>
      <ImagePreviewModal
        isOpen={!!previewImage}
        src={previewImage?.src || ''}
        alt={previewImage?.alt}
        onClose={() => setPreviewImage(null)}
        theme={theme}
      />

      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
        isLight ? 'bg-black/50' : 'bg-black/70'
      }`}>
        <div className={`w-full max-w-6xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden ${
          isLight ? 'bg-white' : 'bg-zinc-900'
        }`}>
          {/* Header */}
          <div className={`flex-none px-6 py-4 border-b flex items-center justify-between ${
            isLight ? 'border-gray-200' : 'border-zinc-800'
          }`}>
            <div className="flex items-center gap-4">
              <h2 className={`text-xl font-bold ${isLight ? 'text-gray-900' : 'text-zinc-100'}`}>
                图片库
              </h2>
              {stats && (
                <div className={`text-sm ${isLight ? 'text-gray-500' : 'text-zinc-400'}`}>
                  {stats.count} 张图片 · {stats.totalSize}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedImages.size > 0 && (
                <button
                  onClick={deleteSelected}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
                    isLight
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
                  }`}
                >
                  <Trash2 size={16} />
                  删除 ({selectedImages.size})
                </button>
              )}

              <button
                onClick={cleanupOld}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
                  isLight
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                <Calendar size={16} />
                清理旧图片
              </button>

              <button
                onClick={onClose}
                className={`p-2 rounded-lg ${
                  isLight ? 'hover:bg-gray-100' : 'hover:bg-zinc-800'
                }`}
              >
                <X size={20} className={isLight ? 'text-gray-500' : 'text-zinc-400'} />
              </button>
            </div>
          </div>

          {/* Toolbar */}
          <div className={`flex-none px-6 py-3 border-b flex items-center gap-4 ${
            isLight ? 'border-gray-200 bg-gray-50' : 'border-zinc-800 bg-zinc-950'
          }`}>
            {/* Search */}
            <div className="flex-1 relative">
              <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                isLight ? 'text-gray-400' : 'text-zinc-500'
              }`} />
              <input
                type="text"
                placeholder="搜索图片 ID 或类型..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 rounded-lg text-sm ${
                  isLight
                    ? 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-indigo-500'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:border-indigo-500'
                } border focus:outline-none focus:ring-2 focus:ring-indigo-500/20`}
              />
            </div>

            {/* MIME Type Filter */}
            <div className="flex items-center gap-2">
              <Filter size={16} className={isLight ? 'text-gray-500' : 'text-zinc-400'} />
              <select
                value={filterMimeType}
                onChange={(e) => setFilterMimeType(e.target.value)}
                className={`px-3 py-2 rounded-lg text-sm ${
                  isLight
                    ? 'bg-white border-gray-200 text-gray-900'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-100'
                } border focus:outline-none focus:ring-2 focus:ring-indigo-500/20`}
              >
                {mimeTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type === 'all' ? '所有类型' : type}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className={`px-3 py-2 rounded-lg text-sm ${
                isLight
                  ? 'bg-white border-gray-200 text-gray-900'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-100'
              } border focus:outline-none focus:ring-2 focus:ring-indigo-500/20`}
            >
              <option value="newest">最新创建</option>
              <option value="oldest">最早创建</option>
              <option value="accessed">最近访问</option>
            </select>

            {/* View Mode */}
            <div className={`flex rounded-lg overflow-hidden border ${
              isLight ? 'border-gray-200' : 'border-zinc-700'
            }`}>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${viewMode === 'grid'
                  ? (isLight ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-900/30 text-indigo-400')
                  : (isLight ? 'bg-white text-gray-500 hover:bg-gray-50' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800')
                }`}
              >
                <Grid size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list'
                  ? (isLight ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-900/30 text-indigo-400')
                  : (isLight ? 'bg-white text-gray-500 hover:bg-gray-50' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800')
                }`}
              >
                <List size={18} />
              </button>
            </div>

            {/* Select All */}
            <button
              onClick={toggleSelectAll}
              className={`text-sm font-medium px-3 py-2 rounded-lg ${
                isLight ? 'hover:bg-gray-200' : 'hover:bg-zinc-800'
              } ${selectedImages.size > 0 ? 'text-indigo-500' : (isLight ? 'text-gray-600' : 'text-zinc-400')}`}
            >
              {selectedImages.size === filteredImages.length && filteredImages.length > 0 ? '取消全选' : '全选'}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className={`animate-pulse ${isLight ? 'text-gray-400' : 'text-zinc-500'}`}>
                  加载中...
                </div>
              </div>
            ) : filteredImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <ImageIcon size={48} className={isLight ? 'text-gray-300' : 'text-zinc-700'} />
                <p className={isLight ? 'text-gray-500' : 'text-zinc-500'}>
                  {searchQuery ? '没有找到匹配的图片' : '图片库为空'}
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              // Grid View
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredImages.map((img) => (
                  <div
                    key={img.id}
                    className={`group relative aspect-square rounded-xl overflow-hidden border-2 cursor-pointer ${
                      selectedImages.has(img.id)
                        ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                        : (isLight ? 'border-gray-200 hover:border-indigo-300' : 'border-zinc-800 hover:border-indigo-600')
                    }`}
                    onClick={() => toggleSelection(img.id)}
                    onDoubleClick={() => previewGalleryImage(img.id)}
                  >
                    <img
                      src={img.data}
                      alt={img.id}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    
                    {/* Selection Indicator */}
                    <div className={`absolute top-2 left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedImages.has(img.id)
                        ? 'bg-indigo-500 border-indigo-500'
                        : (isLight ? 'bg-white/80 border-gray-300' : 'bg-zinc-900/80 border-zinc-600')
                    }`}>
                      {selectedImages.has(img.id) && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>

                    {/* Hover Actions */}
                    <div className={`absolute inset-x-0 bottom-0 p-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity ${
                      isLight ? 'bg-gradient-to-t from-black/60 to-transparent' : 'bg-gradient-to-t from-black/80 to-transparent'
                    }`}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          previewGalleryImage(img.id);
                        }}
                        className="flex-1 py-1.5 bg-white/90 text-gray-900 rounded text-xs font-medium hover:bg-white"
                      >
                        预览
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadImage(img.id);
                        }}
                        className="p-1.5 bg-white/90 text-gray-900 rounded hover:bg-white"
                      >
                        <Download size={14} />
                      </button>
                    </div>

                    {/* MIME Type Badge */}
                    <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-medium ${
                      isLight ? 'bg-black/50 text-white' : 'bg-black/70 text-zinc-200'
                    }`}>
                      {img.mimeType.split('/')[1]?.toUpperCase()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // List View
              <div className={`rounded-xl overflow-hidden border ${
                isLight ? 'border-gray-200' : 'border-zinc-800'
              }`}>
                {filteredImages.map((img, index) => (
                  <div
                    key={img.id}
                    className={`flex items-center gap-4 p-3 ${
                      index !== filteredImages.length - 1
                        ? (isLight ? 'border-b border-gray-200' : 'border-b border-zinc-800')
                        : ''
                    } ${selectedImages.has(img.id)
                      ? (isLight ? 'bg-indigo-50' : 'bg-indigo-900/20')
                      : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedImages.has(img.id)}
                      onChange={() => toggleSelection(img.id)}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-500 focus:ring-indigo-500"
                    />

                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                      <img
                        src={img.data}
                        alt={img.id}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => previewGalleryImage(img.id)}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${
                        isLight ? 'text-gray-900' : 'text-zinc-100'
                      }`}>
                        {img.id}
                      </p>
                      <p className={`text-xs ${isLight ? 'text-gray-500' : 'text-zinc-400'}`}>
                        {img.mimeType} · {new Date(img.createdAt).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => previewGalleryImage(img.id)}
                        className={`p-2 rounded-lg ${
                          isLight ? 'hover:bg-gray-100' : 'hover:bg-zinc-800'
                        }`}
                      >
                        <ImageIcon size={16} className={isLight ? 'text-gray-500' : 'text-zinc-400'} />
                      </button>
                      </button>
                      <button
                        onClick={() => downloadImage(img.id)}
                        className={`p-2 rounded-lg ${
                          isLight ? 'hover:bg-gray-100' : 'hover:bg-zinc-800'
                        }`}
                      >
                        <Download size={16} className={isLight ? 'text-gray-500' : 'text-zinc-400'} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Gallery;
