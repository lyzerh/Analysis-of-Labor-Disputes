import React, { useState } from 'react';
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
      let msg = `🎉 成功解析并入库 ${newCases.length} 份裁决文书！`;
      if (duplicateCount > 0) msg += ` （其中 ${duplicateCount} 篇检测为内容重复件）`;
      if (scanPdfCount > 0) msg += ` （提示：${scanPdfCount} 个PDF为扫描图像，暂无文字层）`;
      setNotice({ type: 'success', message: msg });
      onImportComplete?.();
    } catch (err: any) {
      setNotice({ type: 'error', message: `导入失败: ${err.message}` });
    } finally {
      setProcessing(false);
    }
  };

  const handlePasteImport = async () => {
    if (!pastedContent.trim()) {
      setNotice({ type: 'warn', message: '请在文本框中粘贴裁决书内容' });
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
        message: `🎉 成功解析文书并入库: ${res.parsedCase.caseNumber} (质量评分: ${res.parsedCase.parseQuality.overall}分)`,
      });
      setPastedContent('');
      setPastedTitle('');
      onImportComplete?.();
    } catch (err: any) {
      setNotice({ type: 'error', message: `解析失败: ${err.message}` });
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
        message: `🎉 成功载入 ${newCases.length} 份合成演示文书！仅用于界面与流程演示，不作为研究分析数据。`,
      });
      onImportComplete?.();
    } catch (err: any) {
      setNotice({ type: 'error', message: `载入测试集失败: ${err.message}` });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-[28px] p-7 shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          数据导入与本地解析中心
        </h2>
        <p className="text-sm text-slate-500 mt-2 leading-6">
          支持从 PC 浏览器将下载或保存的 .html、.txt、.pdf 裁判文书直接拖入，通过本地规则引擎自动提取案号、当事人、仲裁请求与裁判说理并保存至 IndexedDB
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
              查看案例库 <ArrowRight className="w-3 h-3" />
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
          <div className="text-xs font-bold">导入网页 (.html / .mht)</div>
          <div className="text-2xs text-slate-500 mt-0.5">浏览器网页或 MHTML 存档</div>
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
          <div className="text-xs font-bold">导入文本 (.txt)</div>
          <div className="text-2xs text-slate-500 mt-0.5">纯文本格式裁决书</div>
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
          <div className="text-xs font-bold">导入 PDF (.pdf)</div>
          <div className="text-2xs text-slate-500 mt-0.5">提取文字层 (扫描件除外)</div>
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
          <div className="text-xs font-bold">直接粘贴内容</div>
          <div className="text-2xs text-slate-500 mt-0.5">粘贴裁决书或HTML代码</div>
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
              拖拽 {importType.toUpperCase()} 文件至此处，或点击浏览上传
            </h3>
            <p className="text-xs text-slate-500 mt-1">支持批量选择，系统将自动进行内容 Hash 去重与要素解析</p>
          </div>

          <label
            htmlFor="file-upload-input"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-sm transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            选择本地文件
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
                提示：本地 PDF 提取依赖文字层；如 PDF 为纯扫描拍照图片，系统将提示「暂不支持 OCR」，不会虚构内容。
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white/80 p-6 rounded-[24px] border border-white/80 shadow-sm space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              文书标题（可选，留空将自动从内容识别）
            </label>
            <input
              id="input-paste-title"
              type="text"
              value={pastedTitle}
              onChange={(e) => setPastedTitle(e.target.value)}
              placeholder="如：深劳人仲案[2024]1208号裁决书"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              裁决书全文或 HTML 源码
            </label>
            <textarea
              id="textarea-paste-content"
              rows={10}
              value={pastedContent}
              onChange={(e) => setPastedContent(e.target.value)}
              placeholder="在此粘贴裁决书全文（包含案号、当事人、经审理查明、本委认为、裁决如下等完整结构）..."
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
              {processing ? '正在解析并入库...' : '立即解析并存入本地数据库'}
            </button>
          </div>
        </div>
      )}

      {/* Quick Test Demo Dataset Banner */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              离线测试专用
            </span>
              <span className="text-xs text-slate-300 font-bold">合成劳动争议演示集</span>
          </div>
          <p className="text-2xs text-slate-400 mt-1 max-w-xl">
            内置 5 份合成演示文书（含违法解除、年终奖、特殊工时加班费、未签合同二倍工资、调岗降薪争议），仅用于界面与流程演示，不作为研究分析数据。
          </p>
        </div>

        <button
          id="btn-load-sample-dataset"
          disabled={processing}
          onClick={handleLoadSampleData}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-2 shrink-0 transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          一键载入示范数据集
        </button>
      </div>

      {/* Recently Imported List in Current Batch */}
      {importedCases.length > 0 && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-900">本次导入解析结果明细 ({importedCases.length} 篇)</h3>
            <span className="text-2xs text-slate-400">已全部安全写入本地 IndexedDB</span>
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
                      质量: {c.parseQuality.overall}分
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
