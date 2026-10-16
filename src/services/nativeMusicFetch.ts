import { Capacitor, CapacitorHttp, type HttpOptions, type HttpResponse } from '@capacitor/core';

// 仅供音乐服务的小型 JSON 请求使用，不替换全局 fetch，也不传输音频、图片或文件。
// 原生桥接可绕过 WebView 的 CORS 限制；调用方只隔离应用存储的会话。
// Capacitor iOS 使用系统 Cookie 存储，RequestInit.credentials 不控制它；同域换服务需单独验收。
const REQUEST_TIMEOUT_MS = 8_000;

const abortError = (): DOMException => new DOMException('音乐服务请求已取消', 'AbortError');

const nativeRequestError = (error: unknown): TypeError | DOMException => {
    const details = error && typeof error === 'object' ? error as { name?: unknown; code?: unknown; message?: unknown } : {};
    if (details.name === 'AbortError' || details.code === -999 || details.code === 'NSURLErrorCancelled') return abortError();
    if (details.code === -1001 || details.code === 'NSURLErrorTimedOut'
        || (typeof details.message === 'string' && /timeout|timed\s*out|超时/i.test(details.message))) {
        return new TypeError('音乐服务请求超时');
    }
    // 仅归类，不透传原生错误文本：底层信息可能包含 URL 中的 cookie/session。
    return new TypeError('音乐服务网络请求失败');
};

const requireHttpsUrl = (input: string): URL => {
    let url: URL;
    try {
        url = new URL(input);
    } catch {
        throw new TypeError('音乐服务需要完整的 HTTPS 接口地址');
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
        throw new TypeError('音乐服务需要不含嵌入账号的 HTTPS 接口地址');
    }
    return url;
};

const restoreResponse = (result: HttpResponse, requestUrl: URL): Response => {
    const responseUrl = result.url ? requireHttpsUrl(result.url) : requestUrl;
    if (responseUrl.origin !== requestUrl.origin) {
        throw new TypeError('音乐服务请求发生了跨站点重定向');
    }
    const headers = new Headers(result.headers);
    const location = headers.get('location');
    if (result.status >= 300 && result.status < 400 && location) {
        const redirectUrl = requireHttpsUrl(new URL(location, requestUrl).href);
        if (redirectUrl.origin !== requestUrl.origin) {
            throw new TypeError('音乐服务请求发生了跨站点重定向');
        }
    }
    const emptyBody = [204, 205, 304].includes(result.status);
    const body = emptyBody || result.data === undefined
        ? null
        : typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
    const response = new Response(body, { status: result.status, headers });
    // Response 构造器没有 url 参数，补上原生响应地址供现有诊断读取。
    Object.defineProperty(response, 'url', { value: responseUrl.href });
    return response;
};

export const nativeMusicFetch = async (input: string, init?: RequestInit): Promise<Response> => {
    // 网页和 Electron 保留 fetch 的完整行为，不改变相对地址、流或取消语义。
    if (!Capacitor.isNativePlatform()) return fetch(input, init);

    const signal = init?.signal;
    if (signal?.aborted) throw abortError();
    const url = requireHttpsUrl(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'POST') {
        throw new TypeError('原生音乐服务仅支持 GET 和 POST 请求');
    }
    if (init?.body != null && typeof init.body !== 'string') {
        throw new TypeError('原生音乐服务仅支持字符串 JSON 请求体');
    }
    if (method === 'GET' && init?.body != null) {
        throw new TypeError('GET 音乐服务请求不接受请求体');
    }
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const options: HttpOptions = {
        url: url.href,
        method,
        headers,
        ...(init?.body != null ? { data: init.body } : {}),
        responseType: 'text',
        connectTimeout: REQUEST_TIMEOUT_MS,
        readTimeout: REQUEST_TIMEOUT_MS,
        disableRedirects: true,
    };

    return new Promise<Response>((resolve, reject) => {
        let settled = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const settle = (complete: () => void) => {
            if (settled) return;
            settled = true;
            if (timeout !== undefined) clearTimeout(timeout);
            signal?.removeEventListener('abort', onAbort);
            complete();
        };
        // CapacitorHttp 没有请求取消接口：取消或超时仅结束本次等待，底层请求可能继续；
        // 已启动的账户写入不应自动重试，迟到的响应/错误会被丢弃且仍有处理器接收。
        const onAbort = () => settle(() => reject(abortError()));
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) {
            onAbort();
            return;
        }
        timeout = setTimeout(() => settle(() => reject(new TypeError('音乐服务请求超时'))), REQUEST_TIMEOUT_MS);
        try {
            Promise.resolve(CapacitorHttp.request(options)).then(
                result => {
                    if (settled) return;
                    try {
                        const response = restoreResponse(result, url);
                        settle(() => resolve(response));
                    } catch {
                        settle(() => reject(new TypeError('音乐服务响应无效或发生了跨站点重定向')));
                    }
                },
                error => settle(() => reject(nativeRequestError(error))),
            );
        } catch (error) {
            settle(() => reject(nativeRequestError(error)));
        }
    });
};
