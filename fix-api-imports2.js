import fs from 'fs';
let content = fs.readFileSync('api/index.ts', 'utf-8');

// remove ANY import translate from ... anywhere in the file
content = content.replace(/import translate from "google-translate-api-x";/g, '');
content = content.replace(/import \{ UrduMagic \} from "urdumagic";/g, '');

// now add exactly one at the top
content = 'import translate from "google-translate-api-x";\nimport { UrduMagic } from "urdumagic";\n' + content;

fs.writeFileSync('api/index.ts', content);
