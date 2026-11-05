import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RawDocument } from '../types';
import { DataService } from '../services/data/dataService';
import { judgmentTranslationService } from '../services/translation/JudgmentTranslationService';
import type { TranslationViewStatus } from '../services/translation/TranslationTypes';

/** Reads translated text for presentation only; it never writes to case or analysis records. */
export function JudgmentTranslationReader({ rawDocumentId, document }: { rawDocumentId?: string; document?: RawDocument | null }) {
  const { t } = useTranslation();
  const [rawDoc, setRawDoc] = useState<RawDocument | null>(document ?? null);
  const [view, setView] = useState<'original' | 'english'>('original');
  const [status, setStatus] = useState<TranslationViewStatus>('not_translated');
  const [translatedText, setTranslatedText] = useState('');

  useEffect(() => {
    let active = true;
    setRawDoc(document ?? null);
    setView('original');
    setStatus('not_translated');
    setTranslatedText('');
    if (!document && rawDocumentId) {
      DataService.getRawDocumentById(rawDocumentId).then((value) => {
        if (active) setRawDoc(value ?? null);
      }).catch(() => { if (active) setRawDoc(null); });
    }
    return () => { active = false; };
  }, [rawDocumentId, document]);

  useEffect(() => {
    if (!rawDoc?.rawText) return;
    let active = true;
    Promise.all([
      judgmentTranslationService.getValidTranslation(rawDoc.id, rawDoc.rawText),
      judgmentTranslationService.getTranslationRecord(rawDoc.id, rawDoc.rawText),
      judgmentTranslationService.hasStaleTranslation(rawDoc.id, rawDoc.rawText),
    ]).then(([cached, record, stale]) => {
      if (!active) return;
      if (cached) {
        setTranslatedText(cached.translatedText);
        setStatus('completed');
      } else {
        setStatus(record?.status === 'failed' || record?.status === 'partial' ? 'failed' : stale ? 'stale' : 'not_translated');
      }
    }).catch(() => { if (active) setStatus('failed'); });
    return () => { active = false; };
  }, [rawDoc]);

  if (!rawDoc?.rawText) return null;

  const translate = async () => {
    if (!window.confirm(t('judgmentTranslation.providerNotice'))) return;
    setStatus('translating');
    try {
      const result = await judgmentTranslationService.translate(rawDoc.id, rawDoc.rawText);
      setTranslatedText(result.translatedText);
      setStatus('completed');
      setView('english');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-label={t('judgmentTranslation.heading')}>
      <h3 className="text-sm font-semibold text-slate-900">{t('judgmentTranslation.heading')}</h3>
      <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label={t('judgmentTranslation.heading')}>
        <button type="button" role="tab" aria-selected={view === 'original'} onClick={() => setView('original')} className={`rounded-lg px-3 py-1.5 text-xs ${view === 'original' ? 'bg-indigo-100 text-indigo-900 font-semibold' : 'text-slate-600 hover:bg-slate-100'}`}>{t('judgmentTranslation.original')}</button>
        <button type="button" role="tab" aria-selected={view === 'english'} onClick={() => setView('english')} className={`rounded-lg px-3 py-1.5 text-xs ${view === 'english' ? 'bg-indigo-100 text-indigo-900 font-semibold' : 'text-slate-600 hover:bg-slate-100'}`}>{t('judgmentTranslation.english')}</button>
      </div>
      {view === 'original' ? (
        <div className="mt-4 whitespace-pre-wrap break-words text-xs leading-6 text-slate-800">{rawDoc.rawText}</div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-amber-800">{t('judgmentTranslation.disclaimer')}</p>
          {status === 'completed' ? (
            <div className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-800">{translatedText}</div>
          ) : (
            <div className="space-y-2 text-xs text-slate-600">
              {status === 'stale' && <p>{t('judgmentTranslation.stale')}</p>}
              {status === 'failed' && <p role="alert">{t('judgmentTranslation.failed')}</p>}
              {status === 'translating' ? <p role="status">{t('judgmentTranslation.translating')}</p> : (
                <button type="button" onClick={translate} className="rounded-lg border border-indigo-200 bg-indigo-100/80 px-3 py-2 font-semibold text-indigo-900 hover:bg-indigo-200/80">{t(status === 'failed' ? 'judgmentTranslation.retry' : 'judgmentTranslation.translate')}</button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
