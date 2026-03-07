import { openDB, DBSchema, IDBPDatabase } from 'idb';

/**
 * IndexedDB 图片存储服务
 * 
 * 用于存储生成的图片数据，替代 localStorage 和 state 存储
 * - localStorage 有 5MB 限制
 * - state 存储会导致内存占用过大
 * - IndexedDB 支持更大的存储空间（通常 50MB+，可请求更多）
 */

const DB_NAME = 'banana-batch-images';
const DB_VERSION = 1;
const STORE_NAME = 'images';

// 保留的最大图片数量（防止无限增长）
const MAX_IMAGES = 1000;

// 图片保留天数
const IMAGE_RETENTION_DAYS = 30;

interface ImageRecord {
  id: string;
  data: string; // Base64 data URI
  mimeType: string;
  createdAt: number;
  accessedAt: number;
}

interface BananaBatchDB extends DBSchema {
  images: {
    key: string;
    value: ImageRecord;
    indexes: {
      'by-created': number;
      'by-accessed': number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<BananaBatchDB>> | null = null;

/**
 * 获取数据库实例（单例模式）
 */
function getDB(): Promise<IDBPDatabase<BananaBatchDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BananaBatchDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
        });
        store.createIndex('by-created', 'createdAt');
        store.createIndex('by-accessed', 'accessedAt');
      },
    });
  }
  return dbPromise;
}

/**
 * 存储图片到 IndexedDB
 * @param id 图片唯一标识
 * @param data Base64 图片数据
 * @param mimeType MIME 类型
 */
export async function storeImage(
  id: string,
  data: string,
  mimeType: string
): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  
  const record: ImageRecord = {
    id,
    data,
    mimeType,
    createdAt: now,
    accessedAt: now,
  };

  await db.put(STORE_NAME, record);
}

/**
 * 从 IndexedDB 获取图片
 * @param id 图片唯一标识
 * @returns 图片记录或 null
 */
export async function getImage(
  id: string
): Promise<ImageRecord | null> {
  const db = await getDB();
  const record = await db.get(STORE_NAME, id);
  
  if (record) {
    // 更新访问时间
    record.accessedAt = Date.now();
    await db.put(STORE_NAME, record);
  }
  
  return record || null;
}

/**
 * 删除指定图片
 * @param id 图片唯一标识
 */
export async function deleteImage(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

/**
 * 列出所有图片 ID
 * @returns 图片 ID 数组
 */
export async function listImageIds(): Promise<string[]> {
  const db = await getDB();
  const keys = await db.getAllKeys(STORE_NAME);
  return keys as string[];
}

/**
 * 获取所有图片记录（慎用，可能占用大量内存）
 * @returns 图片记录数组
 */
export async function listImages(): Promise<ImageRecord[]> {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

/**
 * 获取图片数量
 */
export async function getImageCount(): Promise<number> {
  const db = await getDB();
  const keys = await db.getAllKeys(STORE_NAME);
  return keys.length;
}

/**
 * 清理旧图片（基于保留天数）
 * @param maxAgeDays 最大保留天数，默认 30 天
 */
export async function clearOldImages(maxAgeDays: number = IMAGE_RETENTION_DAYS): Promise<number> {
  const db = await getDB();
  const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  
  const index = db.transaction(STORE_NAME).store.index('by-created');
  const oldRecords = await index.getAll(IDBKeyRange.upperBound(cutoffTime));
  
  const deletePromises = oldRecords.map((record) => 
    db.delete(STORE_NAME, record.id)
  );
  
  await Promise.all(deletePromises);
  return oldRecords.length;
}

/**
 * 清理最早访问的图片，直到满足最大数量限制
 * @param maxImages 最大保留数量，默认 1000
 */
export async function trimImages(maxImages: number = MAX_IMAGES): Promise<number> {
  const db = await getDB();
  
  const count = await getImageCount();
  if (count <= maxImages) return 0;
  
  const deleteCount = count - maxImages;
  
  // 按最后访问时间排序，删除最早访问的
  const index = db.transaction(STORE_NAME).store.index('by-accessed');
  const records = await index.getAll();
  
  // 按访问时间升序排序
  records.sort((a, b) => a.accessedAt - b.accessedAt);
  
  const toDelete = records.slice(0, deleteCount);
  const deletePromises = toDelete.map((record) => 
    db.delete(STORE_NAME, record.id)
  );
  
  await Promise.all(deletePromises);
  return toDelete.length;
}

/**
 * 清空所有图片
 */
export async function clearAllImages(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}

/**
 * 检查 IndexedDB 是否可用
 */
export function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

/**
 * 获取存储统计信息
 */
export async function getStorageStats(): Promise<{
  count: number;
  oldestImage: number | null;
  newestImage: number | null;
}> {
  const db = await getDB();
  const records = await db.getAll(STORE_NAME);
  
  if (records.length === 0) {
    return { count: 0, oldestImage: null, newestImage: null };
  }
  
  const createdAt = records.map((r) => r.createdAt);
  return {
    count: records.length,
    oldestImage: Math.min(...createdAt),
    newestImage: Math.max(...createdAt),
  };
}
