import { describe, expect, it } from 'vitest';
import { getVisibleMessageImages, shouldShowImageExpansionToggle } from './messageImageDisplay';
import type { GeneratedImage } from '../types';

function makeImages(count: number): GeneratedImage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `image-${index + 1}`,
    data: `https://example.com/${index + 1}.webp`,
    mimeType: 'image/webp',
    status: 'success'
  }));
}

describe('message image display', () => {
  it('shows all images when the batch is small', () => {
    const images = makeImages(4);

    const visible = getVisibleMessageImages({
      images,
      selectedImageId: undefined,
      isGenerating: false,
      isExpanded: false,
      visibleLimit: 6
    });

    expect(visible.map((item) => item.image.id)).toEqual([
      'image-1',
      'image-2',
      'image-3',
      'image-4'
    ]);
    expect(visible.hiddenCount).toBe(0);
  });

  it('keeps the selected image visible and fills the rest with latest images', () => {
    const images = makeImages(10);

    const visible = getVisibleMessageImages({
      images,
      selectedImageId: 'image-2',
      isGenerating: false,
      isExpanded: false,
      visibleLimit: 6
    });

    expect(visible.map((item) => item.image.id)).toEqual([
      'image-2',
      'image-6',
      'image-7',
      'image-8',
      'image-9',
      'image-10'
    ]);
    expect(visible.hiddenCount).toBe(4);
  });

  it('shows all images while a message is actively generating', () => {
    const images = makeImages(10);

    const visible = getVisibleMessageImages({
      images,
      selectedImageId: undefined,
      isGenerating: true,
      isExpanded: false,
      visibleLimit: 6
    });

    expect(visible).toHaveLength(10);
    expect(visible.hiddenCount).toBe(0);
  });

  it('shows all images after the batch is expanded', () => {
    const images = makeImages(10);

    const visible = getVisibleMessageImages({
      images,
      selectedImageId: 'image-2',
      isGenerating: false,
      isExpanded: true,
      visibleLimit: 6
    });

    expect(visible).toHaveLength(10);
    expect(visible.hiddenCount).toBe(0);
  });

  it('keeps the expansion toggle visible after expanding a large batch', () => {
    expect(
      shouldShowImageExpansionToggle({
        totalImageCount: 10,
        hiddenCount: 0,
        isExpanded: true
      })
    ).toBe(true);
  });
});
