import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveFoliaApiUrl } from '../../../src/services/runtimeConfig';

// 当前文件：验证 iOS 原生构建的 HTTPS API origin 解析，同时保留既有 Web 相对路径和外部资源地址。

describe('resolveFoliaApiUrl', () => {
    beforeEach(() => {
        vi.stubEnv('VITE_FOLIA_API_BASE', '');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it.each([
        '/api/generate-theme',
        '/api/lyric-proxy?url=https%3A%2F%2Fmusic.example.test%2Flyrics%3Fid%3D123',
        '/api/navidrome-preset',
        '/netease',
        '/netease/search?keywords=Folia&limit=20',
    ])('keeps the existing Web request unchanged without a native origin: %s', (requestPath) => {
        expect(resolveFoliaApiUrl(requestPath)).toBe(requestPath);
    });

    it('treats whitespace-only native configuration as unconfigured', () => {
        vi.stubEnv('VITE_FOLIA_API_BASE', '   ');

        expect(resolveFoliaApiUrl('/api/segment-lyrics')).toBe('/api/segment-lyrics');
    });

    it.each([
        '/api/generate-theme',
        '/api/generate-theme_openai',
        '/api/segment-lyrics',
        '/api/navidrome-preset',
        '/api/lyric-proxy?url=https%3A%2F%2Fmusic.example.test%2Flyrics%3Fid%3D123',
        '/api/qq/song/url?id=123&quality=320',
        '/netease',
        '/netease/search?keywords=Folia&limit=20',
        '/kugou/search?keyword=Folia&page=2',
    ])('resolves API and relative provider paths against the native origin: %s', (requestPath) => {
        vi.stubEnv('VITE_FOLIA_API_BASE', 'https://folia.example.test');

        expect(resolveFoliaApiUrl(requestPath)).toBe(`https://folia.example.test${requestPath}`);
    });

    it('normalizes surrounding whitespace and accepts an explicit HTTPS port and root slash', () => {
        vi.stubEnv('VITE_FOLIA_API_BASE', '  https://folia.example.test:8443/  ');

        expect(resolveFoliaApiUrl('/api/qq/login/channels?timestamp=123'))
            .toBe('https://folia.example.test:8443/api/qq/login/channels?timestamp=123');
    });

    it.each([
        'https://cdn.example.test/song.mp3?token=abc',
        'http://localhost:9863/api/query/progress',
        '//cdn.example.test/cover.jpg',
        'blob:https://folia.example.test/1234-5678',
        'data:audio/mpeg;base64,AAAA',
        'relative/local-song.mp3',
    ])('does not rewrite external or non-root-relative resources: %s', (requestPath) => {
        vi.stubEnv('VITE_FOLIA_API_BASE', 'https://folia.example.test');

        expect(resolveFoliaApiUrl(requestPath)).toBe(requestPath);
    });

    it.each([
        'http://folia.example.test',
        'ftp://folia.example.test',
        'https://user@folia.example.test',
        'https://user:secret@folia.example.test',
        'https://folia.example.test/api',
        'https://folia.example.test/?token=abc',
        'https://folia.example.test/#fragment',
    ])('rejects a native backend configuration that is not a credential-free HTTPS origin: %s', (origin) => {
        vi.stubEnv('VITE_FOLIA_API_BASE', origin);

        expect(() => resolveFoliaApiUrl('/api/generate-theme'))
            .toThrow('VITE_FOLIA_API_BASE 必须是纯 HTTPS 站点源地址，且不含账号、密码、路径或查询参数。');
    });

    it.each(['not-an-origin', '/relative-origin', 'https://'])('rejects a malformed origin: %s', (origin) => {
        vi.stubEnv('VITE_FOLIA_API_BASE', origin);

        expect(() => resolveFoliaApiUrl('/netease/search?keywords=Folia')).toThrow();
    });
});
