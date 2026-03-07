import React, { createContext, useContext, useCallback, useState } from 'react';
import { GeneratedImage, Message } from '../types';
import { deleteImage } from '../utils/imageStorage';

/**
 * ImageContext - 管理图片相关的状态和操作
 * 
 * 从 App.tsx 中提取的图片管理逻辑:
 * - 图片选择/取消选择
 * - 图片删除（清理 IndexedDB）
 * - 获取图片数据
 */

interface ImageContextState {
  /** 获取消息中已选图片的数据（用于上下文输入） */
  getSelectedImageData: (messages: Message[]) => Promise<Array<{ id: string; data: string; mimeType: string }>>;
  /** 清理孤立的图片数据（不再被任何消息引用的图片） */
  cleanupOrphanedImages: (messages: Message[]) => Promise<number>;
}

const ImageContext = createContext<ImageContextState | null>(null);

export const useImageContext = () => {
  const context = useContext(ImageContext);
  if (!context) {
    throw new Error('useImageContext must be used within ImageProvider');
  }
  return context;
};

interface ImageProviderProps {
  children: React.ReactNode;
}

export const ImageProvider: React.FC<ImageProviderProps> = ({ children }) => {
  // 获取选中图片的数据
  const getSelectedImageData = useCallback(async (messages: Message[]) => {
    const selectedImages: Array<{ id: string; data: string; mimeType: string }> = [];

    for (const msg of messages) {
      if (msg.role !== 'model' || !msg.selectedImageId || !msg.images) {
        continue;
      }

      const selectedImg = msg.images.find((img) => img.id === msg.selectedImageId);
      if (!selectedImg || selectedImg.status !== 'success') {
        continue;
      }

      // 从 IndexedDB 获取图片数据
      const { getImage } = await import('../utils/imageStorage');
      const record = await getImage(selectedImg.id);
      
      if (record) {
        selectedImages.push({
          id: selectedImg.id,
          data: record.data,
          mimeType: record.mimeType,
        });
      }
    }

    return selectedImages;
  }, []);

  // 清理不再被引用的图片
  const cleanupOrphanedImages = useCallback(async (messages: Message[]) => {
    // 收集所有被引用的图片 ID
    const referencedIds = new Set<string>();
    
    for (const msg of messages) {
      // 收集生成的图片 ID
      if (msg.images) {
        for (const img of msg.images) {
          referencedIds.add(img.id);
        }
      }
      // 收集上传的图片 ID
      if (msg.uploadedImages) {
        for (const img of msg.uploadedImages) {
          referencedIds.add(img.id);
        }
      }
    }

    // 获取所有存储的图片 ID
    const { listImageIds } = await import('../utils/imageStorage');
    const storedIds = await listImageIds();
    
    // 找出并删除孤立的图片
    let deletedCount = 0;
    for (const storedId of storedIds) {
      if (!referencedIds.has(storedId)) {
        try {
          await deleteImage(storedId);
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete orphaned image ${storedId}:`, error);
        }
      }
    }

    return deletedCount;
  }, []);

  const value: ImageContextState = {
    getSelectedImageData,
    cleanupOrphanedImages,
  };

  return (
    <ImageContext.Provider value={value}>
      {children}
    </ImageContext.Provider>
  );
};
