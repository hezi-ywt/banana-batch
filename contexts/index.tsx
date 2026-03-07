/**
 * Contexts index file
 * 
 * 导出所有 Context 和 Provider
 * 
 * 使用方法:
 * ```tsx
 * import { AppProviders, useSessionContext, useGenerationContext, useImageContext } from './contexts';
 * 
 * // 在应用根组件包裹 Providers
 * <AppProviders>
 *   <App />
 * </AppProviders>
 * 
 * // 在子组件中使用
 * const { isGenerating, generateImages } = useGenerationContext();
 * ```
 */

export { SessionProvider, useSessionContext } from './SessionContext';
export { GenerationProvider, useGenerationContext } from './GenerationContext';
export { ImageProvider, useImageContext } from './ImageContext';

import React from 'react';
import { SessionProvider } from './SessionContext';
import { GenerationProvider } from './GenerationContext';
import { ImageProvider } from './ImageContext';

interface AppProvidersProps {
  children: React.ReactNode;
}

/**
 * 组合所有 Provider 的包装组件
 * 按依赖顺序嵌套：Session -> Image -> Generation
 */
export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  return (
    <SessionProvider>
      <ImageProvider>
        <GenerationProvider>
          {children}
        </GenerationProvider>
      </ImageProvider>
    </SessionProvider>
  );
};
