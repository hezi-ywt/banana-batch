import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildYunwuGptImage2CreateRequest,
  buildYunwuGptImage2EditFormData,
  buildYunwuGptImage2AllRequest,
  extractYunwuImages,
  generateYunwuGptImage2,
  generateYunwuGptImage2All,
  isYunwuGptImage2AllModel,
  isYunwuGptImage2Model,
  mapYunwuGptImage2Format,
  mapYunwuGptImage2EditSize,
  mapYunwuGptImage2AllSize,
  mapYunwuGptImage2Quality,
  mapYunwuGptImage2Size
} from './yunwuImageService';
import { AppSettings, GeneratedImage, Message, UploadedImage } from '../types';

const pngDataUri = 'data:image/png;base64,ZmFrZQ==';
const jpgDataUri = 'data:image/jpeg;base64,ZmFrZTI=';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('yunwu gpt-image-2 adapter', () => {
  it('detects only gpt-image-2 as the Yunwu image model', () => {
    expect(isYunwuGptImage2Model('gpt-image-2')).toBe(true);
    expect(isYunwuGptImage2Model(' GPT-IMAGE-2 ')).toBe(true);
    expect(isYunwuGptImage2Model('gpt-image-2-all')).toBe(false);
    expect(isYunwuGptImage2Model('gpt-image-1')).toBe(false);
  });

  it('detects gpt-image-2-all as the Yunwu fast edit model', () => {
    expect(isYunwuGptImage2AllModel('gpt-image-2-all')).toBe(true);
    expect(isYunwuGptImage2AllModel(' GPT-IMAGE-2-ALL ')).toBe(true);
    expect(isYunwuGptImage2AllModel('gpt-image-2')).toBe(false);
  });

  it('maps app ratio and resolution to gpt-image-2 supported sizes', () => {
    expect(mapYunwuGptImage2Size('Auto', '1K')).toBe('auto');
    expect(mapYunwuGptImage2Size('1:1', '1K')).toBe('1024x1024');
    expect(mapYunwuGptImage2Size('16:9', '1K')).toBe('1536x1024');
    expect(mapYunwuGptImage2Size('9:16', '1K')).toBe('1024x1536');
    expect(mapYunwuGptImage2Size('1:1', '2K')).toBe('2048x2048');
    expect(mapYunwuGptImage2Size('16:9', '2K')).toBe('2048x1152');
    expect(mapYunwuGptImage2Size('16:9', '4K')).toBe('3840x2160');
    expect(mapYunwuGptImage2Size('9:16', '4K')).toBe('2160x3840');
    expect(mapYunwuGptImage2Size('4:1', '4K')).toBe('3840x2160');
  });

  it('maps edit requests to the smaller size set accepted by /images/edits', () => {
    expect(mapYunwuGptImage2EditSize('Auto')).toBe('auto');
    expect(mapYunwuGptImage2EditSize('1:1')).toBe('1024x1024');
    expect(mapYunwuGptImage2EditSize('16:9')).toBe('1536x1024');
    expect(mapYunwuGptImage2EditSize('9:16')).toBe('1024x1536');
  });

  it('maps resolution to faster gpt-image-2 quality and format defaults', () => {
    expect(mapYunwuGptImage2Quality('1K')).toBe('low');
    expect(mapYunwuGptImage2Quality('2K')).toBe('medium');
    expect(mapYunwuGptImage2Quality('4K')).toBe('high');
    expect(mapYunwuGptImage2Format('1K')).toBe('jpeg');
    expect(mapYunwuGptImage2Format('2K')).toBe('jpeg');
    expect(mapYunwuGptImage2Format('4K')).toBe('png');
  });

  it('maps gpt-image-2-all to documented 1K sizes and enabled 2K sizes', () => {
    expect(mapYunwuGptImage2AllSize('Auto', '1K')).toBe('1024x1024');
    expect(mapYunwuGptImage2AllSize('1:1', '1K')).toBe('1024x1024');
    expect(mapYunwuGptImage2AllSize('3:2', '1K')).toBe('1536x1024');
    expect(mapYunwuGptImage2AllSize('2:3', '1K')).toBe('1024x1536');
    expect(mapYunwuGptImage2AllSize('1:1', '2K')).toBe('2048x2048');
    expect(mapYunwuGptImage2AllSize('16:9', '2K')).toBe('2048x1152');
    expect(mapYunwuGptImage2AllSize('3:2', '2K')).toBe('2048x1152');
    expect(mapYunwuGptImage2AllSize('9:16', '2K')).toBe('1024x1536');
    expect(mapYunwuGptImage2AllSize('1:1', '4K')).toBe('2048x2048');
  });

  it('builds a JSON create request without reference images', () => {
    expect(
      buildYunwuGptImage2CreateRequest({
        model: 'gpt-image-2',
        prompt: 'banana poster',
        batchSize: 3,
        aspectRatio: '16:9',
        resolution: '4K'
      })
    ).toEqual({
      model: 'gpt-image-2',
      prompt: 'banana poster',
      n: 3,
      size: '3840x2160',
      quality: 'high',
      format: 'png'
    });
  });

  it('builds a gpt-image-2-all JSON request with image array references', () => {
    const history: Message[] = [
      {
        id: 'model-message',
        role: 'model',
        timestamp: 1,
        selectedImageId: 'remote-image',
        images: [
          {
            id: 'remote-image',
            data: 'https://example.com/reference.webp',
            mimeType: 'image/webp',
            status: 'success'
          }
        ]
      }
    ];

    expect(
      buildYunwuGptImage2AllRequest({
        model: 'gpt-image-2-all',
        prompt: 'combine',
        batchSize: 1,
        aspectRatio: '16:9',
        resolution: '2K',
        history,
        uploadedImages: [{ id: 'upload', data: pngDataUri, mimeType: 'image/png' }]
      })
    ).toEqual({
      model: 'gpt-image-2-all',
      prompt: 'combine',
      n: 1,
      size: '2048x1152',
      image: ['https://example.com/reference.webp', pngDataUri]
    });
  });

  it('builds a multipart edit request with uploaded and selected images', async () => {
    const selectedImage: GeneratedImage = {
      id: 'selected',
      data: pngDataUri,
      mimeType: 'image/png',
      status: 'success'
    };
    const history: Message[] = [
      {
        id: 'model-message',
        role: 'model',
        images: [selectedImage],
        selectedImageId: selectedImage.id,
        timestamp: 1
      }
    ];
    const uploadedImages: UploadedImage[] = [
      {
        id: 'upload',
        data: jpgDataUri,
        mimeType: 'image/jpeg',
        name: 'upload.jpg'
      }
    ];

    const formData = buildYunwuGptImage2EditFormData({
      model: 'gpt-image-2',
      prompt: 'combine these',
      batchSize: 2,
      aspectRatio: '9:16',
      resolution: '4K',
      history,
      uploadedImages
    });

    expect(formData.get('model')).toBe('gpt-image-2');
    expect(formData.get('prompt')).toBe('combine these');
    expect(formData.get('n')).toBe('2');
    expect(formData.get('size')).toBe('1024x1536');
    expect(formData.get('quality')).toBe('auto');
    expect(formData.getAll('image')).toHaveLength(2);
    expect(formData.getAll('image').every((value) => value instanceof Blob)).toBe(true);
  });

  it('extracts url and base64 images from common Yunwu response shapes', () => {
    expect(
      extractYunwuImages({
        data: [
          { url: 'https://example.com/a.webp' },
          { b64_json: 'YmFzZTY0' }
        ]
      })
    ).toEqual([
      { data: 'https://example.com/a.webp', mimeType: 'image/webp' },
      { data: 'data:image/png;base64,YmFzZTY0', mimeType: 'image/png' }
    ]);

    expect(
      extractYunwuImages({
        choices: [
          {
            message: {
              content: 'result: data:image/jpeg;base64,QUJD'
            }
          }
        ]
      })
    ).toEqual([{ data: 'data:image/jpeg;base64,QUJD', mimeType: 'image/jpeg' }]);
  });

  it('uses create endpoint when there are no reference images', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).startsWith('https://example.com/')) {
        return new Response(new Blob(['fake image'], { type: 'image/webp' }), {
          status: 200,
          headers: { 'Content-Type': 'image/webp' }
        });
      }

      return new Response(
        JSON.stringify({ created: 1, data: [{ url: 'https://example.com/generated.webp' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const images: GeneratedImage[] = [];
    const settings: AppSettings = {
      batchSize: 1,
      aspectRatio: '16:9',
      resolution: '2K',
      providerConfig: {
        provider: 'openai',
        apiKey: 'test_yunwu_key_12345',
        baseUrl: 'https://yunwu.ai/v1',
        model: 'gpt-image-2'
      }
    };

    await generateYunwuGptImage2(
      'test_yunwu_key_12345',
      'https://yunwu.ai/v1',
      'gpt-image-2',
      'banana',
      [],
      settings,
      undefined,
      {
        onImage: (image) => images.push(image),
        onText: () => {},
        onProgress: () => {}
      },
      new AbortController().signal
    );

    const generationCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/images/generations')
    );
    expect(generationCalls).toHaveLength(1);
    expect(JSON.parse(String(generationCalls[0][1]?.body)).size).toBe('2048x1152');
    expect(JSON.parse(String(generationCalls[0][1]?.body)).quality).toBe('medium');
    expect(JSON.parse(String(generationCalls[0][1]?.body)).format).toBe('jpeg');
    expect(images[0].data).toBe('https://example.com/generated.webp');
  });

  it('uses edit endpoint when reference images are present', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ data: [{ b64_json: 'YmFzZTY0' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const images: GeneratedImage[] = [];
    const settings: AppSettings = {
      batchSize: 1,
      aspectRatio: 'Auto',
      resolution: '1K',
      providerConfig: {
        provider: 'openai',
        apiKey: 'test_yunwu_key_12345',
        baseUrl: 'https://yunwu.ai/v1',
        model: 'gpt-image-2'
      }
    };

    await generateYunwuGptImage2(
      'test_yunwu_key_12345',
      'https://yunwu.ai/v1',
      'gpt-image-2',
      'edit this',
      [],
      settings,
      [{ id: 'upload', data: pngDataUri, mimeType: 'image/png' }],
      {
        onImage: (image) => images.push(image),
        onText: () => {},
        onProgress: () => {}
      },
      new AbortController().signal
    );

    expect(String(fetchMock.mock.calls[0][0])).toBe('https://yunwu.ai/v1/images/edits');
    expect(fetchMock.mock.calls[0][1]?.body).toBeInstanceOf(FormData);
    expect(images[0].data).toBe('data:image/png;base64,YmFzZTY0');
  });

  it('downloads remote selected images before sending edit multipart requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url) === 'https://example.com/reference.webp') {
        return new Response(new Blob(['reference image'], { type: 'image/webp' }), {
          status: 200,
          headers: { 'Content-Type': 'image/webp' }
        });
      }

      return new Response(JSON.stringify({ data: [{ b64_json: 'YmFzZTY0' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const history: Message[] = [
      {
        id: 'model-message',
        role: 'model',
        timestamp: 1,
        selectedImageId: 'remote-image',
        images: [
          {
            id: 'remote-image',
            data: 'https://example.com/reference.webp',
            mimeType: 'image/webp',
            status: 'success'
          }
        ]
      }
    ];
    const settings: AppSettings = {
      batchSize: 1,
      aspectRatio: 'Auto',
      resolution: '1K',
      providerConfig: {
        provider: 'openai',
        apiKey: 'test_yunwu_key_12345',
        baseUrl: 'https://yunwu.ai/v1',
        model: 'gpt-image-2'
      }
    };

    await generateYunwuGptImage2(
      'test_yunwu_key_12345',
      'https://yunwu.ai/v1',
      'gpt-image-2',
      'edit remote image',
      history,
      settings,
      undefined,
      {
        onImage: () => {},
        onText: () => {},
        onProgress: () => {}
      },
      new AbortController().signal
    );

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.com/reference.webp',
      'https://yunwu.ai/v1/images/edits'
    ]);
    const editBody = fetchMock.mock.calls[1][1]?.body as FormData;
    expect(editBody.getAll('image')).toHaveLength(1);
    expect(editBody.get('image')).toBeInstanceOf(Blob);
  });

  it('emits remote output URLs immediately without downloading them first', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url) === 'https://example.com/slow-output.webp') {
        throw new Error('output image should not be fetched before display');
      }

      return new Response(
        JSON.stringify({ data: [{ url: 'https://example.com/slow-output.webp' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const images: GeneratedImage[] = [];
    const settings: AppSettings = {
      batchSize: 1,
      aspectRatio: 'Auto',
      resolution: '1K',
      providerConfig: {
        provider: 'openai',
        apiKey: 'test_yunwu_key_12345',
        baseUrl: 'https://yunwu.ai/v1',
        model: 'gpt-image-2'
      }
    };

    await generateYunwuGptImage2(
      'test_yunwu_key_12345',
      'https://yunwu.ai/v1',
      'gpt-image-2',
      'banana',
      [],
      settings,
      undefined,
      {
        onImage: (image) => images.push(image),
        onText: () => {},
        onProgress: () => {}
      },
      new AbortController().signal
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(images[0].data).toBe('https://example.com/slow-output.webp');
  });

  it('surfaces Yunwu API error messages directly', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({ error: { message: 'image field is required' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const settings: AppSettings = {
      batchSize: 1,
      aspectRatio: 'Auto',
      resolution: '1K',
      providerConfig: {
        provider: 'openai',
        apiKey: 'test_yunwu_key_12345',
        baseUrl: 'https://yunwu.ai/v1',
        model: 'gpt-image-2'
      }
    };

    await expect(
      generateYunwuGptImage2(
        'test_yunwu_key_12345',
        'https://yunwu.ai/v1',
        'gpt-image-2',
        'banana',
        [],
        settings,
        undefined,
        {
          onImage: () => {},
          onText: () => {},
          onProgress: () => {}
        },
        new AbortController().signal
      )
    ).rejects.toMatchObject({
      code: 'YUNWU_API_ERROR',
      userMessage: '云雾接口错误（400）：image field is required'
    });
  });

  it('uses gpt-image-2-all generations endpoint with JSON image references', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({ data: [{ url: 'https://example.com/all-output.webp' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const images: GeneratedImage[] = [];
    const settings: AppSettings = {
      batchSize: 1,
      aspectRatio: '16:9',
      resolution: '2K',
      providerConfig: {
        provider: 'openai',
        apiKey: 'test_yunwu_key_12345',
        baseUrl: 'https://yunwu.ai/v1',
        model: 'gpt-image-2-all'
      }
    };

    await generateYunwuGptImage2All(
      'test_yunwu_key_12345',
      'https://yunwu.ai/v1',
      'gpt-image-2-all',
      'fast edit',
      [],
      settings,
      [{ id: 'upload', data: pngDataUri, mimeType: 'image/png' }],
      {
        onImage: (image) => images.push(image),
        onText: () => {},
        onProgress: () => {}
      },
      new AbortController().signal
    );

    expect(String(fetchMock.mock.calls[0][0])).toBe('https://yunwu.ai/v1/images/generations');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      model: 'gpt-image-2-all',
      prompt: 'fast edit',
      n: 1,
      size: '2048x1152',
      image: [pngDataUri]
    });
    expect(images[0].data).toBe('https://example.com/all-output.webp');
  });
});
