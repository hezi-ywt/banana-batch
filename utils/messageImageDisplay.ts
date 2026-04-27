import type { GeneratedImage } from '../types';

export type VisibleMessageImage = {
  image: GeneratedImage;
  originalIndex: number;
};

export type VisibleMessageImages = VisibleMessageImage[] & {
  hiddenCount: number;
};

type GetVisibleMessageImagesInput = {
  images: GeneratedImage[];
  selectedImageId?: string;
  isGenerating: boolean;
  isExpanded: boolean;
  visibleLimit?: number;
};

export function getVisibleMessageImages({
  images,
  selectedImageId,
  isGenerating,
  isExpanded,
  visibleLimit = 6
}: GetVisibleMessageImagesInput): VisibleMessageImages {
  if (isGenerating || isExpanded || images.length <= visibleLimit) {
    const visible = images.map((image, originalIndex) => ({ image, originalIndex })) as VisibleMessageImages;
    visible.hiddenCount = 0;
    return visible;
  }

  const visibleIndices = new Set<number>();
  const selectedIndex = selectedImageId
    ? images.findIndex((image) => image.id === selectedImageId)
    : -1;

  if (selectedIndex >= 0) {
    visibleIndices.add(selectedIndex);
  }

  for (let index = images.length - 1; index >= 0 && visibleIndices.size < visibleLimit; index -= 1) {
    visibleIndices.add(index);
  }

  const visible = [...visibleIndices]
    .sort((a, b) => a - b)
    .map((originalIndex) => ({
      image: images[originalIndex],
      originalIndex
    })) as VisibleMessageImages;

  visible.hiddenCount = images.length - visible.length;
  return visible;
}

export function shouldShowImageExpansionToggle({
  totalImageCount,
  hiddenCount,
  isExpanded
}: {
  totalImageCount: number;
  hiddenCount: number;
  isExpanded: boolean;
}): boolean {
  return hiddenCount > 0 || (isExpanded && totalImageCount > 0);
}
