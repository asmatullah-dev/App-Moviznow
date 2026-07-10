import fs from 'fs';
let content = fs.readFileSync('api/index.ts', 'utf-8');

if (!content.includes('translateRouter')) {
    content = content.replace(
        'import { linkExtractionRouter } from "./LinkExtractionModal.js";',
        'import { linkExtractionRouter } from "./LinkExtractionModal.js";\nimport { translateRouter } from "./translate.js";'
    );
    
    content = content.replace(
        'app.use(linkExtractionRouter);',
        'app.use(linkExtractionRouter);\n  app.use("/api", translateRouter);'
    );
    fs.writeFileSync('api/index.ts', content);
}
