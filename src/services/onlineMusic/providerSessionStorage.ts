import type { OnlineProviderId } from '../../types/onlineMusic';

// src/services/onlineMusic/providerSessionStorage.ts：不依赖数据库的会话存储边界，切换服务地址时同步清除旧凭据。
export const getProviderSessionKey = (providerId: OnlineProviderId, key: string): string => `online_provider:${providerId}:${key}`;

export const readProviderSessionValue = (providerId: OnlineProviderId, key: string, legacyKeys: string[] = []): string | null => {
    if (typeof localStorage === 'undefined') return null;
    const current = localStorage.getItem(getProviderSessionKey(providerId, key));
    if (current != null) return current;
    for (const legacyKey of legacyKeys) {
        const legacy = localStorage.getItem(legacyKey);
        if (legacy == null) continue;
        localStorage.setItem(getProviderSessionKey(providerId, key), legacy);
        return legacy;
    }
    return null;
};

export const writeProviderSessionValue = (providerId: OnlineProviderId, key: string, value: string): void => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(getProviderSessionKey(providerId, key), value);
};

export const removeProviderSessionValue = (providerId: OnlineProviderId, key: string, legacyKeys: string[] = []): void => {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(getProviderSessionKey(providerId, key));
    legacyKeys.forEach(legacyKey => localStorage.removeItem(legacyKey));
};

export const clearProviderSessionValues = (providerId: OnlineProviderId): void => {
    if (typeof localStorage === 'undefined') return;
    const prefix = getProviderSessionKey(providerId, '');
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    keys.forEach(key => { if (key?.startsWith(prefix)) localStorage.removeItem(key); });
    if (providerId === 'netease') {
        ['netease_cookie', 'netease_anonymous_cookie'].forEach(key => localStorage.removeItem(key));
    }
};
