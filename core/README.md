# Core 生成引擎模块

该目录提供与 UI 无关的图片生成核心能力，可被 agent/skill、CLI 工具或后端适配层调用，不依赖 React。

## 提供能力

- `runImageGeneration`：Gemini/OpenAI 的统一生成入口
- `DEFAULT_SETTINGS` / `DEFAULT_PROVIDER_CONFIG`：集中默认配置
- `resolveSettings` / `resolveProviderConfig`：配置合并辅助函数

## 文件说明

- `core/config.ts`：默认配置与合并逻辑
- `core/generationEngine.ts`：核心执行函数
- `core/index.ts`：对外导出

## 使用示例

```ts
import { runImageGeneration } from '../core';

const controller = new AbortController();

await runImageGeneration({
  prompt: '蓝色桌面上的极简香蕉海报',
  history: [], // 可选：Message[]
  uploadedImages: [], // 可选：UploadedImage[]
  settings: {
    batchSize: 2,
    aspectRatio: 'Auto',
    resolution: '1K'
  },
  providerConfig: {
    provider: 'gemini',
    apiKey: 'YOUR_KEY',
    baseUrl: '',
    model: 'gemini-3-pro-image-preview'
  },
  signal: controller.signal,
  callbacks: {
    onImage: (img) => console.log('image', img),
    onText: (text) => console.log('text', text),
    onProgress: (current, total) => console.log('progress', current, total)
  }
});
```

## 说明

- `apiKey` 必填，缺失会在引擎内直接报错。
- 持久化、重试、UI 状态等由调用方自行处理。
- 若需集中托管配置，可在 `DEFAULT_PROVIDER_CONFIG` 中填写。

## 下一步建议

1. 将 API Key / BaseURL 改为环境变量或密钥管理，并映射到 `DEFAULT_PROVIDER_CONFIG`。
2. 增加薄适配层（HTTP/CLI/Agent/Skill）调用 `runImageGeneration`。
3. 补充测试：缺失 key、无效 prompt、abort 中断、不同 provider 切换。
