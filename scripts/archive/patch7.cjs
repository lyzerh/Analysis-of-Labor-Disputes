const fs = require('fs');
let code = fs.readFileSync('src/components/CaseAnalysisView.tsx', 'utf-8');
code = code.replace(
  '    loadRecords();\n    return () => {\n      cancelled = true;\n    };\n  }, []);',
  `    loadRecords();
    
    const handleUpdate = () => {
      if (!cancelled) loadRecords();
    };
    window.addEventListener('labor-data-updated', handleUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener('labor-data-updated', handleUpdate);
    };
  }, []);`
);
fs.writeFileSync('src/components/CaseAnalysisView.tsx', code);
