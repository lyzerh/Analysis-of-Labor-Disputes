const fs = require('fs');
let code = fs.readFileSync('src/components/DatasetBuilderTest.tsx', 'utf8');

const newLoadLogic = `
  const loadAndBuildDataset = async () => {
    setIsLoading(true);
    try {
      const allDocs = await DataService.getLaborInfoRawDocuments(100);
      setRawDocs(allDocs);
      
      // 全局强制重新解析以应用最新的 Parser
      const pipelineResult = await LaborAnalysisPipeline.runPipeline({ forceReparse: true });
      
      const buildResult = LaborCaseDatasetBuilder.buildDataset(allDocs, ReviewStorageService.getAllReviews());
      setRecords(pipelineResult.records);
      setSummary(buildResult.summary);

      if (pipelineResult.records.length > 0) {
        setActiveRecord(pipelineResult.records[0]);
      }
    } catch (err) {
      console.error('构建数据集失败:', err);
    } finally {
      setIsLoading(false);
    }
  };
`;

const regex = /const loadAndBuildDataset = async \(\) => \{[\s\S]*?setIsLoading\(false\);\n    \}\n  \};/;
code = code.replace(regex, newLoadLogic.trim());
fs.writeFileSync('src/components/DatasetBuilderTest.tsx', code);
console.log('Patched loadAndBuildDataset in DatasetBuilderTest');
