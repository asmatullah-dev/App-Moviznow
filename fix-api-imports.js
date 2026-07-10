import fs from 'fs';
let content = fs.readFileSync('api/index.ts', 'utf-8');

// remove imports from inside startServer
content = content.replace(/import translate from "google-translate-api-x";\\n\\s*import { UrduMagic } from "urdumagic";/, '');

// put them at the top
content = 'import translate from "google-translate-api-x";\nimport { UrduMagic } from "urdumagic";\n' + content;

fs.writeFileSync('api/index.ts', content);
