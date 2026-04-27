import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  materializeImageDataForRequest,
  materializeMessagesForGeneration,
  materializeUploadedImagesForGeneration
} from './imageData';
import type { Message, UploadedImage } from '../types';

describe('image data materialization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves data urls and remote urls unchanged', async () => {
    const dataUrl = 'data:image/png;base64,ZmFrZQ==';
    const remoteUrl = 'https://example.com/image.webp';

    await expect(materializeImageDataForRequest(dataUrl)).resolves.toBe(dataUrl);
    await expect(materializeImageDataForRequest(remoteUrl)).resolves.toBe(remoteUrl);
  });

  it('converts blob urls to data urls for provider requests', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['fake'], { type: 'image/png' }), { status: 200 })
    );

    await expect(materializeImageDataForRequest('blob:banana-image')).resolves.toBe(
      'data:image/png;base64,ZmFrZQ=='
    );
  });

  it('materializes only selected history images for generation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['fake'], { type: 'image/png' }), { status: 200 })
    );

    const messages: Message[] = [
      {
        id: 'model-1',
        role: 'model',
        selectedImageId: 'selected',
        timestamp: 1,
        images: [
          { id: 'selected', data: 'blob:selected-image', mimeType: 'image/png', status: 'success' },
          { id: 'unselected', data: 'blob:unselected-image', mimeType: 'image/png', status: 'success' }
        ]
      }
    ];

    const materialized = await materializeMessagesForGeneration(messages);
    expect(materialized[0].images?.[0].data).toBe('data:image/png;base64,ZmFrZQ==');
    expect(materialized[0].images?.[1].data).toBe('blob:unselected-image');
  });

  it('materializes uploaded images for generation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['fake'], { type: 'image/png' }), { status: 200 })
    );

    const uploaded: UploadedImage[] = [
      { id: 'upload-1', data: 'blob:upload-image', mimeType: 'image/png', name: 'upload.png' }
    ];

    const materialized = await materializeUploadedImagesForGeneration(uploaded);
    expect(materialized[0].data).toBe('data:image/png;base64,ZmFrZQ==');
  });
});
