const fs = require('fs');

const filesToUpdate = [
  'src/contexts/AdminContentContext.tsx',
  'src/contexts/NotificationContext.tsx',
  'src/pages/admin/AdminSettings.tsx',
  'src/utils/chunkUtils.ts',
  'src/utils/staticContentLoader.ts'
];

filesToUpdate.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  // Replace { version: var, updatedAt: var, ... } with { updatedAt: var, ... }
  content = content.replace(/\{ version: ([^,]+), updatedAt: ([^,]+), count: ([^\}]+) \}/g, '{ updatedAt: $2, count: $3 }');
  content = content.replace(/\{ version: ([^,]+), updatedAt: ([^,]+) \}/g, '{ updatedAt: $2 }');
  
  // Replace version: utcNow, \n updatedAt: utcNow, with updatedAt: utcNow,
  content = content.replace(/version: ([^,]+),\s*updatedAt: ([^,]+),/g, 'updatedAt: $2,');
  content = content.replace(/version: ([^,]+),\s*updatedAt: ([^,]+)/g, 'updatedAt: $2');

  // Any remaining single-line version fields inside chunk_meta assignments?
  content = content.replace(/\{ version: ([^,]+), count:/g, '{ updatedAt: $1, count:');
  
  fs.writeFileSync(file, content);
  console.log(`Removed version field in ${file}`);
});
