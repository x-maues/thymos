const fs = require('fs');

const files = [
  'README.md',
  'frontend/src/Dashboard.tsx',
  'frontend/src/Landing.tsx',
  'frontend/index.html',
  'package.json'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/OpenMandate/g, 'Thymos');
  content = content.replace(/openmandate/g, 'thymos');
  content = content.replace(/OPENMANDATE/g, 'THYMOS');
  fs.writeFileSync(file, content);
  console.log(`Updated ${file}`);
}
