import type { Message, UploadedImage } from '../types';

function isBlobUrl(value: string): boolean {
  return value.startsWith('blob:');
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

export async function materializeImageDataForRequest(data: string): Promise<string> {
  if (!isBlobUrl(data)) {
    return data;
  }

  const response = await fetch(data);
  if (!response.ok) {
    throw new Error(`Failed to load local image for request: ${response.status}`);
  }

  return blobToDataUrl(await response.blob());
}

export async function materializeUploadedImagesForGeneration(
  uploadedImages?: UploadedImage[]
): Promise<UploadedImage[] | undefined> {
  if (!uploadedImages || uploadedImages.length === 0) {
    return uploadedImages;
  }

  return Promise.all(
    uploadedImages.map(async (image) => ({
      ...image,
      data: await materializeImageDataForRequest(image.data)
    }))
  );
}

export async function materializeMessagesForGeneration(messages: Message[]): Promise<Message[]> {
  return Promise.all(
    messages.map(async (message) => {
      if (
        message.role !== 'model' ||
        !message.selectedImageId ||
        !message.images ||
        message.images.length === 0
      ) {
        return message;
      }

      const images = await Promise.all(
        message.images.map(async (image) => {
          if (image.id !== message.selectedImageId || image.status !== 'success') {
            return image;
          }

          return {
            ...image,
            data: await materializeImageDataForRequest(image.data)
          };
        })
      );

      return {
        ...message,
        images
      };
    })
  );
}
