const fs = require('fs');
let code = fs.readFileSync('src/components/CaseAnalysisView.tsx', 'utf8');

const regex = /export const CaseAnalysisView: React\.FC<CaseAnalysisViewProps> = \(\{ records \}\) => \{/;

const newCode = `import { LaborAnalysisPipeline } from '../services/data/LaborAnalysisPipeline';

export const CaseAnalysisView: React.FC<Partial<CaseAnalysisViewProps>> = ({ records: initialRecords }) => {
  const [records, setRecords] = useState<AnalysisCaseRecord[]>(initialRecords || []);
  const [loading, setLoading] = useState(!initialRecords);

  useEffect(() => {
    if (!initialRecords) {
      LaborAnalysisPipeline.getAllAnalysisRecords(false).then((recs) => {
        setRecords(recs.filter(r => r.isIncludedInAnalysisSet));
        setLoading(false);
      }).catch(err => {
        console.error('Failed to load analysis records', err);
        setLoading(false);
      });
    }
  }, [initialRecords]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">正在加载数据...</div>;
  }
`;

code = code.replace(regex, newCode);

fs.writeFileSync('src/components/CaseAnalysisView.tsx', code);
console.log('Fixed CaseAnalysisView data loading');
