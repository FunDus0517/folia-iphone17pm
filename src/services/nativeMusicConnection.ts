import type { NativeMusicProvider } from './nativeMusicConfig';
import { validateNativeMusicConfig } from './nativeMusicConfig';
import { nativeMusicFetch } from './nativeMusicFetch';

// src/services/nativeMusicConnection.ts：无凭据、带超时的只读连接检查；收到响应不等于登录或播放验收。
export const checkNativeMusicConnection = async (provider: NativeMusicProvider, base: string): Promise<{ status: 'success' | 'failed'; message: string }> => {
    try {
        const config = validateNativeMusicConfig({ backendOrigin: '', neteaseApiBase: '', qqApiBase: '', kugouApiBase: '', [`${provider}ApiBase`]: base });
        const normalized = config[`${provider}ApiBase`];
        if (!normalized) return { status: 'failed', message: '请先填写该平台的 HTTPS 音乐 API 地址。' };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const route = provider === 'kugou' ? '/user/detail' : '/login/status';
            const response = await nativeMusicFetch(`${normalized}${route}?timestamp=${Date.now()}`, {
                method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
            });
            const body: unknown = await response.json();
            const data = body && typeof body === 'object' ? body as Record<string, unknown> : null;
            const envelope = data?.body && typeof data.body === 'object' ? data.body as Record<string, unknown> : data;
            const code = Number(envelope?.code);
            const recognized = provider === 'kugou'
                ? Boolean(envelope && (typeof envelope.error_code === 'number' || typeof envelope.errcode === 'number' || typeof envelope.status === 'number'))
                : Boolean(envelope && Number.isFinite(code) && (envelope.data !== undefined || [301, 401, 403].includes(code)));
            if (!recognized) return { status: 'failed', message: '返回内容不是预期的音乐接口，请检查地址及对应服务版本。' };
            if (Number.isFinite(code) && code >= 500) return { status: 'failed', message: '音乐接口返回服务异常，请检查服务端日志。' };
            if (!response.ok && ![401, 403].includes(response.status)) return { status: 'failed', message: `接口返回 HTTP ${response.status}，请检查服务器。` };
            return { status: 'success', message: '已收到音乐接口响应；这不代表账号已登录或歌曲可播放，仍需实际登录验证。' };
        } finally { clearTimeout(timeout); }
    } catch (error) {
        return { status: 'failed', message: error instanceof DOMException && error.name === 'AbortError'
            ? '连接超时，请检查服务地址与手机网络。'
            : error instanceof TypeError ? '连接失败，请检查 HTTPS 证书、服务可用性及跨域设置。'
                : error instanceof Error && !/JSON|Unexpected|token/i.test(error.message) ? error.message : '接口未返回有效数据，请检查服务地址。' };
    }
};
