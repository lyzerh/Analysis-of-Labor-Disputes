import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { CaseAnalysisView } from './src/components/CaseAnalysisView';

try {
  const html = ReactDOMServer.renderToString(React.createElement(CaseAnalysisView));
  console.log("Render successful!");
} catch (e) {
  console.error("Render failed:");
  console.error(e);
}
