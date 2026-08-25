const fs = require('fs');

let code = fs.readFileSync('src/components/CaseAnalysisView.tsx', 'utf8');

// Replace the current useEffect and useState initialization
const hookBlockOld = `  const [records, setRecords] = useState<AnalysisCaseRecord[]>(initialRecords || []);
  const [loading, setLoading] = useState(!initialRecords);
  useEffect(() => {
    if (!initialRecords) {
      LaborAnalysisPipeline.getAllAnalysisRecords(false).then((recs) => {
        setRecords((Array.isArray(recs) ? recs : []).filter(r => r && r.isIncludedInAnalysisSet));
        setLoading(false);
      }).catch(err => {
        console.error('Failed to load analysis records', err);
        setLoading(false);
      });
    }
  }, [initialRecords]);`;

const hookBlockNew = `  const [records, setRecords] = useState<AnalysisCaseRecord[]>(Array.isArray(initialRecords) ? initialRecords : []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (Array.isArray(initialRecords) && initialRecords.length > 0) {
      setRecords(initialRecords);
      setLoading(false);
      return;
    }

    const loadRecords = async () => {
      try {
        setLoading(true);
        const recs = await LaborAnalysisPipeline.getAllAnalysisRecords(false);
        if (!cancelled) {
          setRecords((Array.isArray(recs) ? recs : []).filter(r => r && r.isIncludedInAnalysisSet));
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load analysis records', err);
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadRecords();

    return () => {
      cancelled = true;
    };
  }, [initialRecords]);`;

// Need to remove `import React, { useMemo, useState, useEffect } from 'react';`
// because it's already there, wait, I'm just replacing the hookBlock.

if (code.includes(hookBlockOld)) {
  code = code.replace(hookBlockOld, hookBlockNew);
  fs.writeFileSync('src/components/CaseAnalysisView.tsx', code);
  console.log("Successfully updated hooks.");
} else {
  console.log("Could not find the old hook block. Maybe spacing is different?");
  
  // Try regex replace
  const regex = /  const \[records, setRecords\] = useState<AnalysisCaseRecord\[\]>[\s\S]*?}, \[initialRecords\]\);/;
  if (code.match(regex)) {
    code = code.replace(regex, hookBlockNew);
    fs.writeFileSync('src/components/CaseAnalysisView.tsx', code);
    console.log("Successfully updated hooks via Regex.");
  } else {
    console.log("Failed to match via regex too.");
  }
}
