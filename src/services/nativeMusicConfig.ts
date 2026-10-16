import { clearProviderSessionValues } from './onlineMusic/providerSessionStorage';

// src/services/nativeMusicConfig.ts：手机端可修改的音乐 API 地址；地址变更不向新服务携带旧会话。
export type NativeMusicProvider = 'netease' | 'qq' | 'kugou';
export type NativeMusicConfig = { backendOrigin: string; neteaseApiBase: string; qqApiBase: string; kugouApiBase: string };
export const NATIVE_MUSIC_CONFIG_KEY = 'folia:native-music-config:v1';
export const NATIVE_MUSIC_CONFIG_EVENT = 'folia:native-music-config-changed';
export const isNativeMusicRuntime = (): boolean => String(import.meta.env.VITE_NATIVE_IOS) === 'true';
const fields = { netease: 'neteaseApiBase', qq: 'qqApiBase', kugou: 'kugouApiBase' } as const;
export const isNativeMusicProvider = (provider: string): provider is NativeMusicProvider => Object.hasOwn(fields, provider);
const buildConfig = (): NativeMusicConfig => ({
    backendOrigin: String(import.meta.env.VITE_FOLIA_API_BASE || '').trim(),
    neteaseApiBase: String(import.meta.env.VITE_NETEASE_API_BASE || '').trim(),
    qqApiBase: String(import.meta.env.VITE_QQ_API_BASE || '').trim(),
    kugouApiBase: String(import.meta.env.VITE_KUGOU_API_BASE || '').trim(),
});

const normalizeUrl = (value: string, originOnly = false): string => {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error('请填写完整的 HTTPS 接口地址。'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
        throw new Error('接口必须使用 HTTPS，地址中请勿包含账号、密码、查询参数或片段。');
    }
    if (['localhost', '0.0.0.0', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost') || /^127\./.test(url.hostname)) {
        throw new Error('此地址指向手机本机，请填写部署在服务器上的 HTTPS 接口。');
    }
    if (originOnly && url.pathname !== '/') throw new Error('Folia 服务地址只填写域名，不包含路径。');
    return originOnly ? url.origin : url.toString().replace(/\/$/, '');
};

export const validateNativeMusicConfig = (input: NativeMusicConfig): NativeMusicConfig => {
    const result = Object.fromEntries(Object.keys(buildConfig()).map(key => [key, String(input[key as keyof NativeMusicConfig] ?? '').trim()])) as NativeMusicConfig;
    if (result.backendOrigin) result.backendOrigin = normalizeUrl(result.backendOrigin, true);
    for (const key of Object.values(fields)) {
        if (!result[key]) continue;
        if (result[key].startsWith('/') && !result[key].startsWith('//')) {
            if (!result.backendOrigin) throw new Error('相对接口路径需要先填写 Folia 服务域名。');
            const target = normalizeUrl(new URL(result[key], result.backendOrigin).toString());
            result[key] = new URL(target).pathname.replace(/\/$/, '') || '/';
        } else result[key] = normalizeUrl(result[key]);
    }
    return result;
};

export const readNativeMusicConfig = (): NativeMusicConfig => {
    const fallback = buildConfig();
    if (!isNativeMusicRuntime() || typeof localStorage === 'undefined') return fallback;
    try {
        const saved = JSON.parse(localStorage.getItem(NATIVE_MUSIC_CONFIG_KEY) || 'null');
        if (saved?.version === 1 && Object.keys(fallback).every(key => typeof saved.config?.[key] === 'string')) {
            return validateNativeMusicConfig(saved.config);
        }
    } catch { /* 损坏或被旧版本写入的配置不阻止应用启动。 */ }
    return fallback;
};

export const resolveNativeMusicApiBase = (config: NativeMusicConfig, provider: NativeMusicProvider): string => {
    const value = config[fields[provider]];
    if (!value) return '';
    if (value.startsWith('/') && !value.startsWith('//')) {
        return config.backendOrigin ? new URL(value, config.backendOrigin).toString().replace(/\/$/, '') : '';
    }
    return value.replace(/\/$/, '');
};

export const getNativeMusicApiBase = (provider: NativeMusicProvider): string => resolveNativeMusicApiBase(readNativeMusicConfig(), provider);

const clearChangedSessions = (before: NativeMusicConfig, after: NativeMusicConfig): NativeMusicProvider[] => {
    const changed = (Object.keys(fields) as NativeMusicProvider[]).filter(provider => resolveNativeMusicApiBase(before, provider) !== resolveNativeMusicApiBase(after, provider));
    changed.forEach(clearProviderSessionValues);
    return changed;
};

const announce = (changedProviders: NativeMusicProvider[]): void => {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent(NATIVE_MUSIC_CONFIG_EVENT, { detail: { changedProviders } }));
    }
};

export const saveNativeMusicConfig = (input: NativeMusicConfig): NativeMusicConfig => {
    if (!isNativeMusicRuntime() || typeof localStorage === 'undefined') throw new Error('此配置入口仅用于手机应用。');
    const config = validateNativeMusicConfig(input);
    const changed = clearChangedSessions(readNativeMusicConfig(), config);
    localStorage.setItem(NATIVE_MUSIC_CONFIG_KEY, JSON.stringify({ version: 1, config }));
    announce(changed);
    return config;
};

export const clearNativeMusicConfig = (): void => {
    if (!isNativeMusicRuntime() || typeof localStorage === 'undefined') return;
    const changed = clearChangedSessions(readNativeMusicConfig(), buildConfig());
    localStorage.removeItem(NATIVE_MUSIC_CONFIG_KEY);
    announce(changed);
};

export { checkNativeMusicConnection } from './nativeMusicConnection';
