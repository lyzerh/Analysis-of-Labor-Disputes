import { db } from './src/db/index';
import { LaborInfoParserAdapter } from './src/services/parser/LaborInfoParserAdapter';

async function main() {
  const testIds = [276057, 276056, 276055, 271694, 276061];
  
  for (const id of testIds) {
    const doc = await db.rawDocuments.get(id.toString());
    if (!doc) {
      console.log(`Document ${id} not found in DB`);
      continue;
    }
    const parsed = LaborInfoParserAdapter.parseDetailed(doc);
    console.log(`\n=== Case ${id} ===`);
    console.log(`City: ${parsed.city}`);
    console.log(`courtReasoning chars: ${parsed.courtReasoning?.length || 0}`);
    console.log(`keyLegalPoints count: ${parsed.keyLegalPoints?.length || 0}`);
    console.log(`Employer Defenses: ${parsed.employerDefenses?.length || 0}`);
    console.log(`Evidence: ${parsed.evidence?.length || 0}`);
    console.log(`Outcomes: Employee=${parsed.employeeOutcome}, Employer=${parsed.employerOutcome}, Overall=${parsed.overallResult}`);
  }
}
main().catch(console.error);
