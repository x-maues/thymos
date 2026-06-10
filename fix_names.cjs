const fs = require('fs');

const targets = [
  'README.md',
  'agents/src/demo.ts',
  'agents/src/deploy-somnia.ts',
  'deployments/somnia-testnet.json',
  'deployments/somnia-testnet.example.json',
  'frontend/public/demo-state.json',
  'package.json',
];

for (const file of targets) {
  let content;
  try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }

  // Replace display text but NOT Solidity artifact names (those reference .sol files on disk)
  // "OpenMandate" as a contract artifact name must stay for loadArtifact("OpenMandate")
  // and deployment keys must stay consistent with somnia-testnet.json.
  // We replace only text references, not code symbol references.
  content = content
    // README prose references
    .replace(/`OpenMandate`/g, '`Thymos`')
    .replace(/`OpenMandate\.sol`/g, '`OpenMandate.sol` (Thymos)')
    // package name
    .replace(/"name": "openmandate"/g, '"name": "thymos"')
    // schema names in deploy script
    .replace(/openmandate-evidence-v1/g, 'thymos-evidence-v1')
    .replace(/openmandate-proposal-v1/g, 'thymos-proposal-v1');

  fs.writeFileSync(file, content);
  console.log(`Updated ${file}`);
}
