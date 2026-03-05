import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ImagePreviewModalProps {
  isOpen: boolean;
  src: string;
  alt?: string;
  onClose: () => void;
  theme: 'light' | 'dark';
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  isOpen,
  src,
  alt,
  onClose,
  theme
}) => {
  const isLight = theme === 'light';

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !src) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="关闭预览"
      />
      <div
        className={`relative max-h-[90vh] max-w-[95vw] rounded-2xl overflow-hidden shadow-2xl border ${
          isLight ? 'border-white/60 bg-white' : 'border-zinc-800 bg-zinc-900'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <img
          src={src}
          alt={alt || 'Image preview'}
          className="max-h-[85vh] max-w-[95vw] object-contain select-none"
          draggable={false}
        />
        <button
          onClick={onClose}
          className={`absolute top-3 right-3 p-2 rounded-full backdrop-blur-md transition-all ${
            isLight
              ? 'bg-white/90 text-gray-700 hover:bg-white'
              : 'bg-zinc-900/90 text-zinc-200 hover:bg-zinc-800'
          }`}
          aria-label="关闭预览"
          title="关闭预览"
          type="button"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
};

export default ImagePreviewModal;
