import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  UploadCloud,
  FileText,
  FileCode,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Play,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { DataService } from '../services/data/dataService';
import { MockDataSourceAdapter } from '../services/dataSource/MockDataSourceAdapter';
import { ArbitrationCase } from '../types';

interface ImportCasesProps {
  onImportComplete?: () => void;
  onNavigateToDatabase?: () => void;
}

export const ImportCases: React.FC<ImportCasesProps> = ({
  onImportComplete,
  onNavigateToDatabase,
}) => {
  const { t } = useTranslation();
  const [importType, setImportType] = useState<'html' | 'txt' | 'pdf' | 'paste'>('html');
  const [pastedContent, setPastedContent] = useState('');
  const [pastedTitle, setPastedTitle] = useState('');
  const [processing, setProcessing] = useState(false);
  const [importedCases, setImportedCases] = useState<ArbitrationCase[]>([]);
  const [notice, setNotice] = useState<{ type: 'success' | 'warn' | 'error'; message: string } | null>(
    null
  );

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProcessing(true);
    setNotice(null);
    const newCases: ArbitrationCase[] = [];
    let duplicateCount = 0;
    let scanPdfCount = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop()?.toLowerCase();

        if (ext === 'html' || ext === 'htm') {
          const text = await file.text();
          const res = await DataService.importHtmlDocument(
            text,
            file.name.replace(/\.html?$/i, ''),
            file.name
          );
          newCases.push(res.parsedCase);
          if (res.isDuplicate) duplicateCount++;
        } else if (ext === 'mht' || ext === 'mhtml') {
          const res = await DataService.importMhtDocument(file);
          newCases.push(res.parsedCase);
          if (res.isDuplicate) duplicateCount++;
        } else if (ext === 'txt') {
          const text = await file.text();
          const res = await DataService.importTextDocument(
            text,
            file.name.replace(/\.txt$/i, ''),
            file.name
          );
          newCases.push(res.parsedCase);
          if (res.isDuplicate) duplicateCount++;
        } else if (ext === 'pdf') {
          const res = await DataService.importPdfDocument(file);
          newCases.push(res.parsedCase);
          if (res.isScanned) scanPdfCount++;
        } else {
          // 兜底尝试纯文本
          const text = await file.text();
          const res = await DataService.importTextDocument(text, file.name, file.name);
          newCases.push(res.parsedCase);
        }
      }

      setImportedCases(newCases);
      let msg = t('dataManagement.importUi.importSuccess', { count: newCases.length });
      if (duplicateCount > 0) msg += ` ${t('dataManagement.importUi.duplicates', { count: duplicateCount })}`;
      if (scanPdfCount > 0) msg += ` ${t('dataManagement.importUi.scannedPdf', { count: scanPdfCount })}`;
      setNotice({ type: 'success', message: msg });
      onImportComplete?.();
    } catch (err: any) {
      setNotice({ type: 'error', message: t('dataManagement.importUi.importFailed', { message: err.message }) });
    } finally {
      setProcessing(false);
    }
  };

  const handlePasteImport = async () => {
    if (!pastedContent.trim()) {
      setNotice({ type: 'warn', message: t('dataManagement.importUi.pasteRequired') });
      return;
    }

    setProcessing(true);
    setNotice(null);
    try {
      const isHtml = /<[a-z][\s\S]*>/i.test(pastedContent);
      let res;
      if (isHtml) {
        res = await DataService.importHtmlDocument(pastedContent, pastedTitle || '粘贴网页文书');
      } else {
        res = await DataService.importTextDocument(pastedContent, pastedTitle || '粘贴文本裁决书');
      }

      setImportedCases([res.parsedCase]);
      setNotice({
        type: 'success',
        message: t('dataManagement.importUi.pasteSuccess', { caseNumber: res.parsedCase.caseNumber, score: res.parsedCase.parseQuality.overall }),
      });
      setPastedContent('');
      setPastedTitle('');
      onImportComplete?.();
    } catch (err: any) {
      setNotice({ type: 'error', message: t('dataManagement.importUi.parseFailed', { message: err.message }) });
    } finally {
      setProcessing(false);
    }
  };

  const handleLoadSampleData = async () => {
    setProcessing(true);
    setNotice(null);
    try {
      const adapter = new MockDataSourceAdapter();
      const samples = await adapter.getAllSampleRawDocuments();
      const newCases: ArbitrationCase[] = [];

      for (const doc of samples) {
        const res = await DataService.importTextDocument(
          doc.rawText,
          doc.title,
          doc.fileName,
          '合成演示数据（Synthetic Demo Fixture）'
        );
        newCases.push(res.parsedCase);
      }

      setImportedCases(newCases);
      setNotice({
        type: 'success',
        message: t('dataManagement.importUi.demoLoaded', { count: newCases.length }),
      });
      onImportComplete?.();
    } catch (err: any) {
      setNotice({ type: 'error', message: t('dataManagement.importUi.demoLoadFailed', { message: err.message }) });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-[28px] p-7 shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          {t('dataManagement.importUi.title')}
        </h2>
        <p className="text-sm text-slate-500 mt-2 leading-6">
          {t('dataManagement.importUi.description')}
        </p>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center justify-between gap-3 border ${
            notice.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : notice.type === 'warn'
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{notice.message}</span>
          </div>
          {importedCases.length > 0 && onNavigateToDatabase && (
            <button
              onClick={onNavigateToDatabase}
              className="px-3 py-1 bg-white text-slate-800 rounded font-semibold border border-slate-200 hover:bg-slate-50 flex items-center gap-1 shrink-0"
            >
              {t('dataManagement.importUi.viewLibrary')} <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Mode Selector Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          id="btn-import-tab-html"
          onClick={() => setImportType('html')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            importType === 'html'
              ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-2xs font-semibold'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <FileCode className="w-5 h-5 text-blue-600 mb-1.5" />
          <div className="text-xs font-bold">{t('dataManagement.importUi.html')}</div>
          <div className="text-2xs text-slate-500 mt-0.5">{t('dataManagement.importUi.htmlDescription')}</div>
        </button>

        <button
          id="btn-import-tab-txt"
          onClick={() => setImportType('txt')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            importType === 'txt'
              ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-2xs font-semibold'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-5 h-5 text-indigo-600 mb-1.5" />
          <div className="text-xs font-bold">{t('dataManagement.importUi.text')}</div>
          <div className="text-2xs text-slate-500 mt-0.5">{t('dataManagement.importUi.textDescription')}</div>
        </button>

        <button
          id="btn-import-tab-pdf"
          onClick={() => setImportType('pdf')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            importType === 'pdf'
              ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-2xs font-semibold'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <FileSpreadsheet className="w-5 h-5 text-emerald-600 mb-1.5" />
          <div className="text-xs font-bold">{t('dataManagement.importUi.pdf')}</div>
          <div className="text-2xs text-slate-500 mt-0.5">{t('dataManagement.importUi.pdfDescription')}</div>
        </button>

        <button
          id="btn-import-tab-paste"
          onClick={() => setImportType('paste')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            importType === 'paste'
              ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-2xs font-semibold'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Sparkles className="w-5 h-5 text-purple-600 mb-1.5" />
          <div className="text-xs font-bold">{t('dataManagement.importUi.paste')}</div>
          <div className="text-2xs text-slate-500 mt-0.5">{t('dataManagement.importUi.pasteDescription')}</div>
        </button>
      </div>

      {/* Main Upload Box */}
      {importType !== 'paste' ? (
        <div className="bg-white/80 p-8 rounded-[24px] border-2 border-dashed border-slate-300 hover:border-blue-500 transition-colors text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <UploadCloud className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {t('dataManagement.importUi.dropFiles', { type: importType.toUpperCase() })}
            </h3>
            <p className="text-xs text-slate-500 mt-1">{t('dataManagement.importUi.batchHint')}</p>
          </div>

          <label
            htmlFor="file-upload-input"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-sm transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            {t('dataManagement.importUi.chooseFiles')}
            <input
              id="file-upload-input"
              type="file"
              multiple
              accept={
                importType === 'html'
                  ? '.html,.htm,.mht,.mhtml'
                  : importType === 'txt'
                  ? '.txt'
                  : '.pdf'
              }
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
            />
          </label>

          {importType === 'pdf' && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-2xs text-amber-800 max-w-md mx-auto flex items-center gap-2 text-left">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                {t('dataManagement.importUi.pdfNote')}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white/80 p-6 rounded-[24px] border border-white/80 shadow-sm space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              {t('dataManagement.importUi.documentTitle')}
            </label>
            <input
              id="input-paste-title"
              type="text"
              value={pastedTitle}
              onChange={(e) => setPastedTitle(e.target.value)}
              placeholder={t('dataManagement.importUi.documentTitlePlaceholder')}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              {t('dataManagement.importUi.documentContent')}
            </label>
            <textarea
              id="textarea-paste-content"
              rows={10}
              value={pastedContent}
              onChange={(e) => setPastedContent(e.target.value)}
              placeholder={t('dataManagement.importUi.documentContentPlaceholder')}
              className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end">
            <button
              id="btn-submit-paste"
              disabled={processing}
              onClick={handlePasteImport}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors"
            >
              {processing ? t('dataManagement.importUi.processing') : t('dataManagement.importUi.submit')}
            </button>
          </div>
        </div>
      )}

      {/* Quick Test Demo Dataset Banner */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              {t('dataManagement.importUi.offlineDemo')}
            </span>
              <span className="text-xs text-slate-300 font-bold">{t('dataManagement.importUi.demoSet')}</span>
          </div>
          <p className="text-2xs text-slate-400 mt-1 max-w-xl">
            {t('dataManagement.importUi.demoDescription')}
          </p>
        </div>

        <button
          id="btn-load-sample-dataset"
          disabled={processing}
          onClick={handleLoadSampleData}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-2 shrink-0 transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          {t('dataManagement.importUi.loadDemo')}
        </button>
      </div>

      {/* Recently Imported List in Current Batch */}
      {importedCases.length > 0 && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-900">{t('dataManagement.importUi.importedDetails', { count: importedCases.length })}</h3>
            <span className="text-2xs text-slate-400">{t('dataManagement.importUi.savedLocally')}</span>
          </div>

          <div className="divide-y divide-slate-100">
            {importedCases.map((c) => (
              <div key={c.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-700 font-mono">{c.caseNumber}</span>
                    <span className="text-2xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                      {c.arbitrationCommittee}
                    </span>
                    <span className="text-2xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-mono font-semibold">
                      {t('dataManagement.importUi.qualityScore', { score: c.parseQuality.overall })}
                    </span>
                  </div>
                  <p className="text-slate-700 text-2xs truncate mt-0.5">{c.title}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-2xs font-semibold text-slate-900">{c.decisionOutcome}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
