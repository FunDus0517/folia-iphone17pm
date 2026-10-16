// 当前文件：读取 Docker 注入的 Web 运行时配置，并兼容既有 Vite 构建变量。

import { isNativeMusicRuntime, readNativeMusicConfig } from './nativeMusicConfig';

export type WebAiProvider = 'gemini' | 'openai';

/** Resolve same-origin Web API paths against the explicitly configured native backend. */
export const resolveFoliaApiUrl = (requestPath: string): string => {
    const configuredOrigin = isNativeMusicRuntime()
        ? readNativeMusicConfig().backendOrigin
        : String(import.meta.env.VITE_FOLIA_API_BASE ?? '').trim();
    if (!configuredOrigin || !requestPath.startsWith('/') || requestPath.startsWith('//')) {
        return requestPath;
    }

    const invalidOriginMessage = 'VITE_FOLIA_API_BASE 必须是纯 HTTPS 站点源地址，且不含账号、密码、路径或查询参数。';
    let origin: URL;
    try {
        origin = new URL(configuredOrigin);
    } catch {
        throw new Error(invalidOriginMessage);
    }
    if (origin.protocol !== 'https:' || origin.username || origin.password
        || origin.pathname !== '/' || origin.search || origin.hash) {
        throw new Error(invalidOriginMessage);
    }
    return new URL(requestPath, origin.origin).toString();
};

const normalizeAiProvider = (value: unknown): WebAiProvider => (
    value === 'openai' ? 'openai' : 'gemini'
);

export const getWebAiProvider = (): WebAiProvider => {
    if (typeof window !== 'undefined') {
        const runtimeValue = window.__FOLIA_RUNTIME_CONFIG__?.aiProvider;
        if (runtimeValue) return normalizeAiProvider(runtimeValue);
    }

    return normalizeAiProvider(import.meta.env.VITE_AI_PROVIDER);
};
