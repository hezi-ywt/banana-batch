import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createImageRecord,
  hydrateImageRecord,
  revokeAllHydratedImageObjectUrls,
  revokeUnusedHydratedImageObjectUrls,
  shouldDeleteImageForAutomaticCleanup
} from './indexedDb';

describe('indexedDB image storage helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores remote image urls without converting them to blobs', () => {
    const remoteUrl = 'https://example.com/generated.webp';

    const record = createImageRecord(
      'session-1',
      'message-1',
      'generated',
      {
        id: 'image-1',
        data: remoteUrl,
        mimeType: 'image/webp',
        status: 'success'
      },
      123,
      'success'
    );

    expect(record.blob).toBeUndefined();
    expect(record.dataUrl).toBe(remoteUrl);
    expect(record.size).toBe(remoteUrl.length);
  });

  it('hydrates stored blobs as object urls instead of base64 data urls', async () => {
    const blob = new Blob(['image bytes'], { type: 'image/png' });
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:banana-image');

    const image = await hydrateImageRecord({
      id: 'image-1',
      sessionId: 'session-1',
      messageId: 'message-1',
      role: 'generated',
      blob,
      mimeType: 'image/png',
      status: 'success',
      size: blob.size,
      createdAt: 123,
      lastAccessedAt: 456
    });

    expect(createObjectUrl).toHaveBeenCalledWith(blob);
    expect(image.data).toBe('blob:banana-image');
  });

  it('revokes hydrated object urls that are no longer active', async () => {
    const blob = new Blob(['image bytes'], { type: 'image/png' });
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:keep-image')
      .mockReturnValueOnce('blob:drop-image');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await hydrateImageRecord({
      id: 'keep',
      sessionId: 'session-1',
      messageId: 'message-1',
      role: 'generated',
      blob,
      mimeType: 'image/png',
      status: 'success',
      size: blob.size,
      createdAt: 123,
      lastAccessedAt: 456
    });
    await hydrateImageRecord({
      id: 'drop',
      sessionId: 'session-1',
      messageId: 'message-1',
      role: 'generated',
      blob,
      mimeType: 'image/png',
      status: 'success',
      size: blob.size,
      createdAt: 123,
      lastAccessedAt: 456
    });

    revokeUnusedHydratedImageObjectUrls(['blob:keep-image']);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:drop-image');
    expect(revokeObjectUrl).not.toHaveBeenCalledWith('blob:keep-image');

    revokeAllHydratedImageObjectUrls();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:keep-image');
  });

  it('keeps the existing stored blob when persisting a hydrated object url', () => {
    const blob = new Blob(['persisted image'], { type: 'image/png' });

    const record = createImageRecord(
      'session-1',
      'message-1',
      'generated',
      {
        id: 'image-1',
        data: 'blob:runtime-image',
        mimeType: 'image/png',
        status: 'success',
        lastAccessedAt: 789
      },
      123,
      'success',
      {
        id: 'image-1',
        sessionId: 'session-1',
        messageId: 'message-1',
        role: 'generated',
        blob,
        mimeType: 'image/png',
        status: 'success',
        size: blob.size,
        createdAt: 123,
        lastAccessedAt: 456
      }
    );

    expect(record.blob).toBe(blob);
    expect(record.dataUrl).toBeUndefined();
    expect(record.size).toBe(blob.size);
    expect(record.lastAccessedAt).toBe(789);
  });

  it('does not delete successful images during automatic cleanup', () => {
    expect(
      shouldDeleteImageForAutomaticCleanup(
        {
          id: 'image-1',
          sessionId: 'session-1',
          messageId: 'message-1',
          role: 'generated',
          mimeType: 'image/png',
          status: 'success',
          size: 1024,
          createdAt: 123,
          lastAccessedAt: 456
        },
        new Set()
      )
    ).toBe(false);
  });

  it('allows failed unprotected images to be deleted during automatic cleanup', () => {
    expect(
      shouldDeleteImageForAutomaticCleanup(
        {
          id: 'image-1',
          sessionId: 'session-1',
          messageId: 'message-1',
          role: 'generated',
          dataUrl: '',
          mimeType: '',
          status: 'error',
          size: 1024,
          createdAt: 123,
          lastAccessedAt: 456
        },
        new Set()
      )
    ).toBe(true);
  });
});
