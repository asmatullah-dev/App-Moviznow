import fs from 'fs';
let content = fs.readFileSync('api/index.ts', 'utf-8');

content = content.replace(
  'const translatedArray = results.map((result) => {',
  'const translatedArray = (results as any[]).map((result: any) => {'
);
content = content.replace(
  'let t = result.text;',
  'let t = (result as any).text;'
);

fs.writeFileSync('api/index.ts', content);
