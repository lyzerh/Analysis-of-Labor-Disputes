const fs = require('fs');

let code = fs.readFileSync('src/components/CaseAnalysisView.tsx', 'utf8');

// 1. Change State
code = code.replace(
  /const \[selectedIds, setSelectedIds\] = useState<Set<string>>\(new Set\(\)\);/g,
  "const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);"
);

// 2. Change useEffect for auto-selection
const autoSelectEffectOld = `  // Handle auto-selection when filtered list changes
  useEffect(() => {
    if (!filteredRecords || filteredRecords.length === 0) {
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
      }
      return;
    }
    
    // Check if any currently selected case is in filteredRecords
    let hasValidSelection = false;
    for (const record of filteredRecords) {
      if (selectedIds.has(record.caseId)) {
        hasValidSelection = true;
        break;
      }
    }
    
    // If not, auto select the first one
    if (!hasValidSelection && filteredRecords.length > 0) {
      setSelectedIds(new Set([filteredRecords[0].caseId]));
    }
  }, [filteredRecords]);`;

const autoSelectEffectNew = `  // Handle auto-selection when filtered list changes
  useEffect(() => {
    if (!filteredRecords || filteredRecords.length === 0) {
      if (selectedCaseId !== null) {
        setSelectedCaseId(null);
      }
      return;
    }
    
    // Check if any currently selected case is in filteredRecords
    let hasValidSelection = false;
    for (const record of filteredRecords) {
      if (record.caseId === selectedCaseId) {
        hasValidSelection = true;
        break;
      }
    }
    
    // If not, auto select the first one
    if (!hasValidSelection && filteredRecords.length > 0) {
      setSelectedCaseId(filteredRecords[0].caseId);
    }
  }, [filteredRecords, selectedCaseId]);`;

code = code.replace(autoSelectEffectOld, autoSelectEffectNew);

// 3. Change selectedRecords memo to selectedCase
const selectedRecordsOld = `  const selectedRecords = useMemo(() => {
    return (Array.isArray(records) ? records : []).filter(r => selectedIds.has(r.caseId));
  }, [records, selectedIds]);`;

const selectedCaseNew = `  const selectedCase = useMemo(() => {
    return (Array.isArray(records) ? records : []).find(r => r.caseId === selectedCaseId) || null;
  }, [records, selectedCaseId]);`;

code = code.replace(selectedRecordsOld, selectedCaseNew);

// 4. Change toggleSelect to nothing or just inline
const toggleSelectOld = `  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      // Allow clearing selection only if it's not the last one? Or just allow empty selection.
      next.delete(id);
    } else {
            next.add(id);
    }
    setSelectedIds(next);
  };`;

code = code.replace(toggleSelectOld, '');

// 5. Update left panel mapped records
code = code.replace(/const isSelected = selectedIds\.has\(record\.caseId\);/g, "const isSelected = selectedCaseId === record.caseId;");
code = code.replace(/onClick=\{\(\) => toggleSelect\(record\.caseId\)\}/g, "onClick={() => setSelectedCaseId(record.caseId)}");
code = code.replace(/bg-indigo-50 border-indigo-200/g, "bg-indigo-50 border-indigo-200 border-l-4 border-l-indigo-600");

// 6. Update Right panel logic
code = code.replace(/selectedRecords\.length === 0 \? \(/g, "!selectedCase ? (");
code = code.replace(/\{filteredRecords\.length === 0 \? '暂无可分析案例' : '请在左侧选择案例进行分析'\}/g, "{filteredRecords.length === 0 ? '暂无可分析案例' : '请在左侧选择案例进行分析'}");

// Now we need to remove the map array logic for the right side.
const mapStartOld = `            ) : (
              <div className="space-y-6">
                {(Array.isArray(selectedRecords) ? selectedRecords : []).map(record => (
                  <div key={record.caseId} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">`;

const mapStartNew = `            ) : (() => {
              const record = selectedCase;
              return (
              <div className="space-y-6 h-full">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-[10px] rounded font-bold">当前案例</span>
                    </div>`;

code = code.replace(mapStartOld, mapStartNew);

// Find the end of the map and replace it
const mapEndOld = `                    </div>
                    
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>`;

const mapEndNew = `                    </div>
                    
                  </div>
              </div>
              );
            })()}
          </div>
        </main>`;

code = code.replace(mapEndOld, mapEndNew);


fs.writeFileSync('src/components/CaseAnalysisView.tsx', code);
console.log('Update complete.');
