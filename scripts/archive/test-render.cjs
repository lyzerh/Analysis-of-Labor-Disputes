require('ts-node').register({
  compilerOptions: {
    module: 'commonjs',
    jsx: 'react',
    esModuleInterop: true
  }
});
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const { CaseAnalysisView } = require('./src/components/CaseAnalysisView');

try {
  const html = ReactDOMServer.renderToString(React.createElement(CaseAnalysisView));
  console.log("Render successful!");
} catch (e) {
  console.error("Render failed:");
  console.error(e);
}
