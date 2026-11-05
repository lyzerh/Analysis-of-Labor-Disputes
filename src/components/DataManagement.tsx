import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HardDrive,
  Download,
  Upload,
  Trash2,
  FileSpreadsheet,
  FileCode,
  ShieldAlert,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Layers,
  CloudDownload,
  UploadCloud,
  ShieldCheck,
  BarChart3
} from 'lucide-react';
import { DataService } from '../services/data/dataService';
import { db } from '../db';
import { LaborInfoCrawlerComponent } from './LaborInfoCrawler';
import { ImportCases } from './ImportCases';
import { LaborInfoReview } from './LaborInfoReview';
import { LaborInfoApiTest } from './LaborInfoApiTest';
import { LaborInfoParserTest } from './LaborInfoParserTest';
import { DatasetBuilderTest } from './DatasetBuilderTest';
import { SemanticReviewWorkspace } from './SemanticReviewWorkspace';

interface DataManagementProps {
  onDataChanged?: () => void;
}

export const DataManagement: React.FC<DataManagementProps> = ({ onDataChanged }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'backup' | 'crawler' | 'import' | 'quality' | 'semanticReview' | 'advanced'>('crawler');

  return (
    <div className="flex flex-col h-full bg-slate-50/80">
      {/* Management Top Nav */}
      <div className="bg-white/90 backdrop-blur-xl border-b border-white/80 px-6 py-4 flex items-center gap-4 shrink-0 overflow-x-auto">
        <h2 className="text-lg font-bold text-slate-900 mr-4">
          {t('dataManagement.title')}
        </h2>
        
        <button
          onClick={() => setActiveTab('crawler')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'crawler'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 border border-transparent'
          }`}
        >
          <CloudDownload className="w-4 h-4" />
          {t('dataManagement.crawler')}
        </button>
        
        <button
          onClick={() => setActiveTab('import')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'import'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 border border-transparent'
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          {t('dataManagement.import')}
        </button>

        <button
          onClick={() => setActiveTab('backup')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'backup'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 border border-transparent'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          {t('dataManagement.backup')}
        </button>
        
        <button
          onClick={() => setActiveTab('quality')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'quality'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 border border-transparent'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          {t('dataManagement.quality')}
        </button>

        <button
          onClick={() => setActiveTab('semanticReview')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'semanticReview'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 border border-transparent'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          {t('dataManagement.semanticReview')}
        </button>

        <button
          onClick={() => setActiveTab('advanced')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'advanced'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 border border-transparent'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          {t('dataManagement.tools')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
        {activeTab === 'crawler' && <LaborInfoCrawlerComponent />}
        {activeTab === 'import' && <ImportCases onImportComplete={() => onDataChanged?.()} onNavigateToDatabase={() => {}} />}
        {activeTab === 'quality' && <LaborInfoReview onDataChanged={onDataChanged} />}
        {activeTab === 'semanticReview' && <SemanticReviewWorkspace />}
        {activeTab === 'backup' && <BackupRestorePanel onDataChanged={onDataChanged} />}
        {activeTab === 'advanced' && <AdvancedToolsPanel />}
      </div>
    </div>
  );
};

const BackupRestorePanel: React.FC<{ onDataChanged?: () => void }> = ({ onDataChanged }) => {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const allCases = await db.arbitrationCases.toArray();
      const csv = DataService.exportToCsv(allCases);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lawlens-cases-full-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: t('dataManagement.exportSuccess', { count: allCases.length }) });
    } catch (err: any) {
      setMessage({ type: 'error', text: `${t('dataManagement.exportFailed')}: ${err.message}` });
    } finally {
      setExporting(false);
    }
  };

  const handleExportJson = async () => {
    setExporting(true);
    try {
      const allCases = await db.arbitrationCases.toArray();
      const blob = new Blob([JSON.stringify(allCases, null, 2)], {
        type: 'application/json;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lawlens-cases-structured-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: t('dataManagement.exportSuccess', { count: allCases.length }) });
    } catch (err: any) {
      setMessage({ type: 'error', text: `${t('dataManagement.exportFailed')}: ${err.message}` });
    } finally {
      setExporting(false);
    }
  };

  const handleExportFullBackup = async () => {
    setExporting(true);
    try {
      const backupJson = await DataService.exportFullDatabaseBackup();
      const blob = new Blob([backupJson], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lawlens-cases-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: t('dataManagement.backupSuccess') });
    } catch (err: any) {
      setMessage({ type: 'error', text: `${t('dataManagement.exportFailed')}: ${err.message}` });
    } finally {
      setExporting(false);
    }
  };

  const handleRestoreBackup = async (file: File | null) => {
    if (!file) return;
    setRestoring(true);
    setMessage(null);
    try {
      const content = await file.text();
      const result = await DataService.restoreDatabaseBackup(content);
      setMessage({
        type: 'success',
        text: t('dataManagement.restoreSuccess', { cases: result.importedCount }),
      });
      onDataChanged?.();
    } catch (err: any) {
      setMessage({ type: 'error', text: `${t('dataManagement.exportFailed')}: ${err.message}` });
    } finally {
      setRestoring(false);
    }
  };

  const handleClearAll = async () => {
    try {
      await DataService.clearAllDatabase();
      setShowClearConfirm(false);
      setMessage({ type: 'success', text: t('dataManagement.clearSuccess') });
      onDataChanged?.();
    } catch (err: any) {
      setMessage({ type: 'error', text: t('dataManagement.closure.clearFailed', { message: err.message }) });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-blue-600" />
          {t('dataManagement.backup')}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          {t('dataManagement.backupDescription')}
        </p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2 border ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Export Section */}
      <div className="bg-white/80 border border-white/80 p-6 rounded-[24px] shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <Download className="w-4 h-4 text-blue-600" />
            {t('dataManagement.exportCases')}
          </h3>
          <span className="text-2xs text-slate-400">{t('dataManagement.spreadsheet')}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            disabled={exporting}
            onClick={handleExportCsv}
            className="p-4 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 text-left transition-all group"
          >
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 mb-2" />
            <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-700">{t('dataManagement.exportCsv')}</div>
          </button>

          <button
            disabled={exporting}
            onClick={handleExportJson}
            className="p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 text-left transition-all group"
          >
            <FileCode className="w-5 h-5 text-blue-600 mb-2" />
            <div className="text-xs font-bold text-slate-900 group-hover:text-blue-700">{t('dataManagement.exportJson')}</div>
          </button>

          <button
            disabled={exporting}
            onClick={handleExportFullBackup}
            className="p-4 rounded-xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50 text-left transition-all group"
          >
            <Layers className="w-5 h-5 text-purple-600 mb-2" />
            <div className="text-xs font-bold text-slate-900 group-hover:text-purple-700">{t('dataManagement.exportBackup')}</div>
          </button>
        </div>
      </div>

      {/* Restore Section */}
      <div className="bg-white/80 border border-white/80 p-6 rounded-[24px] shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <Upload className="w-4 h-4 text-blue-600" />
            {t('dataManagement.restoreCases')}
          </h3>
        </div>

        <div className="p-6 border-2 border-dashed border-slate-200 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/50 rounded-xl transition-colors relative cursor-pointer text-center">
          <input
            type="file"
            accept=".json"
            disabled={restoring}
            onChange={(e) => handleRestoreBackup(e.target.files?.[0] || null)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
          {restoring ? (
            <div className="flex flex-col items-center gap-2">
              <RotateCcw className="w-6 h-6 text-blue-600 animate-spin" />
              <span className="text-xs text-blue-700 font-bold">{t('dataManagement.restoring')}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-xs text-blue-600 border border-slate-200">
                <UploadCloud className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-slate-700 mt-2">{t('dataManagement.clickRestore')}</span>
              <span className="text-2xs text-slate-500">{t('dataManagement.overwrite')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AdvancedToolsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [tool, setTool] = useState<'api' | 'parser' | 'dataset'>('api');

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-rose-600" />
          {t('dataManagement.closure.advancedHeading')}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          {t('dataManagement.advancedWarning')}
        </p>
      </div>

      <div className="flex items-center gap-3 border-b border-slate-200 pb-2">
        <button
          onClick={() => setTool('api')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            tool === 'api' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {t('dataManagement.apiTest')}
        </button>
        <button
          onClick={() => setTool('parser')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            tool === 'parser' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {t('dataManagement.parserTest')}
        </button>
        <button
          onClick={() => setTool('dataset')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            tool === 'dataset' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {t('dataManagement.rebuild')}
        </button>
      </div>

      <div>
        {tool === 'api' && <LaborInfoApiTest />}
        {tool === 'parser' && <LaborInfoParserTest />}
        {tool === 'dataset' && <DatasetBuilderTest />}
      </div>
    </div>
  );
};
