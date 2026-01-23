<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# 🍌 Banana Batch

**AI 图片批量生成工具 · 支持多会话管理 · 智能图像优化**

[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue?style=flat-square)](https://hezi-ywt.github.io/banana-batch/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite)](https://vitejs.dev/)

[在线演示](https://hezi-ywt.github.io/banana-batch/) · [功能特性](#-核心特性) · [快速开始](#-快速开始) · [问题反馈](https://github.com/hezi-ywt/banana-batch/issues)

</div>

---

## 📖 简介

Banana Batch 是一个强大的 AI 图片生成工具，支持 **Google Gemini** 和 **OpenAI** 兼容接口。提供文字生成图片、图片参考生成、批量并发生成等功能，让 AI 创作更高效！

## ✨ 核心特性

### 🗂️ 多会话管理 <sup>NEW</sup>
- **会话侧边栏**：创建、切换、删除、重命名多个对话
- **自动持久化**：所有会话自动保存到浏览器本地
- **智能同步**：切换会话时自动加载历史消息

### 🖼️ 智能图像优化 <sup>NEW</sup>
- **自动压缩**：大图自动压缩到最优大小（5-20MB → 1-5MB）
- **尺寸调整**：超大图片自动调整到 2048×2048px
- **进度反馈**：处理过程可视化，体验更流畅

### ⚡ 性能优化 <sup>NEW</sup>
- **性能提示**：实时建议优化批次大小和设置
- **速度分析**：帮助理解影响生成速度的因素
- **批次建议**：基于 API 限制的智能推荐

### 🎨 AI 生成功能
- **文字生成图片**：输入描述，AI 帮你画出来
- **图片参考生成**：上传参考图，基于图片创作
- **批量并发生成**：一次生成多张，支持 1-20 张
- **多轮对话创作**：选择喜欢的图片继续对话完善

### 🔧 灵活配置
- **双提供商支持**：Gemini / OpenAI Compatible
- **自定义模型**：支持任何兼容模型
- **自定义端点**：配置 Base URL 使用代理
- **多种分辨率**：1K / 2K / 4K 可选

### 🎯 用户体验
- **拖拽上传**：支持拖放图片到输入框
- **主题切换**：浅色/深色主题
- **实时进度**：批量生成进度可视化
- **历史管理**：删除消息及后续对话
- **清空对话**：一键清除当前会话

## 🚀 快速开始

### 📋 前置要求

- **Node.js** 18+
- **npm** / **yarn** / **pnpm**
- **API Key**（二选一）：
  - [Gemini API Key](https://ai.google.dev/) - Google AI Studio
  - [OpenAI API Key](https://platform.openai.com/) - OpenAI Platform

### 💻 本地运行

```bash
# 1. 克隆项目
git clone https://github.com/hezi-ywt/banana-batch.git
cd banana-batch

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 打开浏览器访问
# http://localhost:3000
```

### 🔑 配置 API Key

> **⚠️ 安全提示**：API Key 仅存储在浏览器 localStorage，不会暴露在源代码中

1. 点击右上角 **🔑 图标** 打开设置面板
2. 选择提供商：**Gemini** 或 **OpenAI Compatible**
3. 输入对应的 API Key
4. 点击 **✓** 保存

### 🎯 开始创作

1. **输入描述**：在输入框描述你想要的图片
2. **上传参考**：可选，拖放图片作为参考
3. **生成图片**：点击发送或按 Enter
4. **选择图片**：点击喜欢的图片选中
5. **继续对话**：基于选中的图片继续创作

## 🌐 在线使用

访问 **[在线演示](https://hezi-ywt.github.io/banana-batch/)** 立即体验！

## 🏗️ 构建部署

### 本地构建

```bash
# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

### GitHub Pages 部署

本项目已配置自动部署：

1. **启用 GitHub Pages**
   - 仓库 Settings → Pages
   - Source 选择 `GitHub Actions`

2. **触发部署**
   ```bash
   git push origin main
   ```

3. **查看部署**
   - Actions 标签查看进度
   - 部署完成后访问 `https://<username>.github.io/banana-batch/`

### 自定义部署

如需部署到自己的服务器：

```bash
# 构建并输出到 dist/
npm run build:server

# 将 dist/ 目录部署到 Nginx/Apache 等
```

## 📸 功能截图

### 多会话管理
<img width="600" alt="Multi-session management" src="https://via.placeholder.com/600x400?text=Multi-Session+Management" />

### 图像优化
<img width="600" alt="Image optimization" src="https://via.placeholder.com/600x400?text=Image+Optimization" />

### 批量生成
<img width="600" alt="Batch generation" src="https://via.placeholder.com/600x400?text=Batch+Generation" />

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| **框架** | React 19 + TypeScript 5.8 |
| **构建** | Vite 6 |
| **UI** | Lucide React Icons + Tailwind CSS |
| **API** | Google Generative AI SDK + OpenAI SDK |
| **验证** | Zod |
| **部署** | GitHub Actions + GitHub Pages |

## 💡 使用技巧

### 文字生成

```
提示词示例：
一只可爱的橘猫坐在窗台上，温暖的阳光透过窗户洒在它身上，画风温馨治愈
```

### 图片参考生成

1. 拖放图片到输入框
2. 输入："将这张照片转换为油画风格"

### 多图组合

1. 上传 2 张图片
2. 输入："将图2的背景替换成图1的场景"

### OpenAI Compatible 配置

**使用 Google AI OpenAI Endpoint：**
```
Base URL: https://generativelanguage.googleapis.com/v1beta/openai/
Model: gemini-3-pro-image-preview
API Key: 你的 Gemini API Key
```

**使用标准 OpenAI：**
```
Base URL: https://api.openai.com/v1
Model: gpt-4o
API Key: 你的 OpenAI API Key
```

## ⚙️ 配置说明

### 批次大小

- **推荐**：2-4 张（速度快）
- **最大**：20 张（需要更长时间）

### 模型选择

| 提供商 | 模型 | 特点 |
|--------|------|------|
| Gemini | `gemini-3-pro-image-preview` | 高质量，推荐 |
| Gemini | `gemini-2.5-flash-image` | 速度快 |
| OpenAI | `gpt-4o` | 官方模型 |

### 分辨率

- **1K**：快速生成（Flash Image）
- **2K/4K**：高质量（Pro Image）

## 🎁 项目亮点

- ✅ **类型安全**：完整 TypeScript 类型定义
- ✅ **错误处理**：分级错误系统 + 友好提示
- ✅ **性能优化**：并发控制 + 图片懒加载
- ✅ **响应式设计**：适配桌面和移动端
- ✅ **安全第一**：API Key 客户端存储
- ✅ **开箱即用**：无需配置即可开始

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT License](LICENSE) © 2024

---

<div align="center">

**[⬆ 回到顶部](#-banana-batch)**

Made with ❤️ by [hezi-ywt](https://github.com/hezi-ywt)

</div>
