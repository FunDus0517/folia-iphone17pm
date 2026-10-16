import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    checkNativeMusicConnection, clearNativeMusicConfig, isNativeMusicRuntime,
    readNativeMusicConfig, resolveNativeMusicApiBase, saveNativeMusicConfig, validateNativeMusicConfig,
    type NativeMusicConfig, type NativeMusicProvider as Provider,
} from '../../../services/nativeMusicConfig';
import ConfirmDialog from '../../shared/ConfirmDialog';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';

// 当前文件：原生手机端的音乐服务地址表单；连接检测、持久化和旧会话隔离均交给服务层。

type Props = { isDaylight: boolean; settingsCardClass: string };
type Feedback = { status: 'success' | 'failed'; message: string };
const PROVIDER_FIELDS = [
    { provider: 'netease', field: 'neteaseApiBase' },
    { provider: 'qq', field: 'qqApiBase' },
    { provider: 'kugou', field: 'kugouApiBase' },
] as const;

const NativeMusicServiceForm: React.FC<Props> = ({ isDaylight, settingsCardClass }) => {
    const { t } = useTranslation();
    const [draft, setDraft] = useState(readNativeMusicConfig);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [results, setResults] = useState<Partial<Record<Provider, Feedback>>>({});
    const [checking, setChecking] = useState<Provider | null>(null);
    const [pending, setPending] = useState<NativeMusicConfig | 'clear' | null>(null);
    const [needsRefresh, setNeedsRefresh] = useState(false);
    const revision = useRef(0);
    useEffect(() => () => { revision.current += 1; }, []);
    const messageFor = (error: unknown) => error instanceof Error && /[\u3400-\u9fff]/.test(error.message)
        ? error.message : t('nativeMusicServices.failed');
    const buttonClass = `min-h-11 rounded-xl border px-4 py-2 text-sm ${isDaylight ? 'border-black/10 hover:bg-black/5' : 'border-white/15 hover:bg-white/10'}`;

    const updateDraft = (field: keyof NativeMusicConfig, value: string) => {
        revision.current += 1;
        setDraft(current => ({ ...current, [field]: value }));
        setResults({});
        setFeedback(null);
    };
    const requestSave = () => {
        try { setPending(validateNativeMusicConfig(draft)); }
        catch (error) { setFeedback({ status: 'failed', message: messageFor(error) }); }
    };
    const confirmChange = () => {
        if (!pending) return;
        try {
            const clearing = pending === 'clear';
            if (clearing) clearNativeMusicConfig();
            else saveNativeMusicConfig(pending);
            revision.current += 1;
            setDraft(readNativeMusicConfig());
            setResults({});
            setNeedsRefresh(true);
            setFeedback({ status: 'success', message: t(clearing ? 'nativeMusicServices.cleared' : 'nativeMusicServices.saved') });
        } catch (error) { setFeedback({ status: 'failed', message: messageFor(error) }); }
        finally { setPending(null); }
    };
    // 草稿检测不写入配置，也不带旧会话；修改地址后丢弃旧请求的结果，避免把结果归给新地址。
    const checkConnection = async (provider: Provider) => {
        const requestRevision = revision.current;
        try {
            const validated = validateNativeMusicConfig(draft);
            const resolved = resolveNativeMusicApiBase(validated, provider);
            if (!resolved) throw new Error(t('nativeMusicServices.fillAddress'));
            setChecking(provider);
            setResults(current => ({ ...current, [provider]: undefined }));
            const result = await checkNativeMusicConnection(provider, resolved);
            if (revision.current === requestRevision) setResults(current => ({ ...current, [provider]: result }));
        } catch (error) {
            if (revision.current === requestRevision) setResults(current => ({ ...current, [provider]: { status: 'failed', message: messageFor(error) } }));
        } finally { setChecking(null); }
    };

    const renderField = (field: keyof NativeMusicConfig, provider?: Provider) => (
        <div key={field} className="space-y-2">
            <label htmlFor={`native-music-${field}`} className="block text-sm font-medium">
                {t(`nativeMusicServices.fields.${field}`)}
            </label>
            <input
                id={`native-music-${field}`} type="text" inputMode="url" autoCapitalize="none"
                autoCorrect="off" spellCheck={false} value={draft[field]}
                onChange={event => updateDraft(field, event.target.value)}
                placeholder={field === 'backendOrigin' ? 'https://folia.example.com' : 'https://music-api.example.com'}
                className="min-h-11 w-full min-w-0 rounded-xl border border-current/15 bg-transparent px-3 py-2 text-base outline-none focus:border-current/50"
                aria-describedby={`native-music-${field}-hint`}
            />
            <p id={`native-music-${field}-hint`} className="text-xs opacity-65 leading-relaxed">
                {t(provider ? 'nativeMusicServices.providerHint' : 'nativeMusicServices.backendHint')}
            </p>
            {provider && <>
                <button type="button" data-testid={`native-music-check-${provider}`} className={`${buttonClass} inline-flex items-center gap-2 disabled:opacity-50`}
                    disabled={checking !== null} onClick={() => { void checkConnection(provider); }}>
                    {checking === provider && <Loader2 size={16} className="animate-spin" aria-hidden />}
                    {t(checking === provider ? 'nativeMusicServices.checking' : 'nativeMusicServices.check')}
                </button>
                <p className={`text-xs leading-relaxed ${results[provider]?.status === 'failed' ? 'text-red-500' : 'opacity-75'}`} role="status">
                    {results[provider]?.message ?? t('nativeMusicServices.notChecked')}
                </p>
            </>}
        </div>
    );

    return (
        <SettingsAnchor anchorId="nativeMusicServices" label={t('nativeMusicServices.title')}>
            <div data-testid="native-music-service-settings">
                <SettingsSectionHeading icon={Server} label={t('nativeMusicServices.title')} />
                <div className={`space-y-5 rounded-xl border p-4 ${settingsCardClass}`} style={{ color: 'var(--text-primary)' }}>
                    <p className="text-sm leading-relaxed opacity-75">{t('nativeMusicServices.description')}</p>
                    <p className="text-xs leading-relaxed opacity-65">{t('nativeMusicServices.websiteHint')}</p>
                    {PROVIDER_FIELDS.map(({ provider, field }) => renderField(field, provider))}
                    {renderField('backendOrigin')}
                    <p className="text-xs leading-relaxed opacity-65">{t('nativeMusicServices.testHint')}</p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" data-testid="native-music-save" className={buttonClass} onClick={requestSave}>{t('nativeMusicServices.save')}</button>
                        <button type="button" data-testid="native-music-clear" className={buttonClass} onClick={() => setPending('clear')}>{t('nativeMusicServices.clear')}</button>
                    </div>
                    {feedback && <p className={`text-sm leading-relaxed ${feedback.status === 'failed' ? 'text-red-500' : ''}`}
                        role={feedback.status === 'failed' ? 'alert' : 'status'}>{feedback.message}</p>}
                    {needsRefresh && <button type="button" data-testid="native-music-reload" className={buttonClass} onClick={() => window.location.reload()}>
                        {t('nativeMusicServices.reload')}
                    </button>}
                </div>
            </div>
            {typeof document !== 'undefined' && createPortal(<div data-testid="native-music-confirmation"
                className="[&>div]:pt-[max(16px,env(safe-area-inset-top))] [&>div]:pr-[max(16px,env(safe-area-inset-right))] [&>div]:pb-[max(16px,env(safe-area-inset-bottom))] [&>div]:pl-[max(16px,env(safe-area-inset-left))] [&>div>div]:max-h-[calc(100dvh-max(16px,env(safe-area-inset-top))-max(16px,env(safe-area-inset-bottom)))] [&>div>div]:overflow-y-auto [&_button]:min-h-11 [&_button]:min-w-11">
                <ConfirmDialog isOpen={pending !== null} isDaylight={isDaylight}
                title={t(pending === 'clear' ? 'nativeMusicServices.clearConfirmTitle' : 'nativeMusicServices.changeConfirmTitle')}
                description={t(pending === 'clear' ? 'nativeMusicServices.clearConfirmDescription' : 'nativeMusicServices.changeConfirmDescription')}
                confirmText={t(pending === 'clear' ? 'nativeMusicServices.confirmClear' : 'nativeMusicServices.confirmSave')}
                confirmVariant={pending === 'clear' ? 'danger' : 'primary'}
                cancelText={t('nativeMusicServices.cancel')} onConfirm={confirmChange} onClose={() => setPending(null)} />
            </div>, document.body)}
        </SettingsAnchor>
    );
};

const NativeMusicServiceSettings: React.FC<Props> = props => isNativeMusicRuntime() ? <NativeMusicServiceForm {...props} /> : null;
export default NativeMusicServiceSettings;
