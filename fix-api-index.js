import fs from 'fs';
let content = fs.readFileSync('api/index.ts', 'utf-8');

if (!content.includes('translateRouter')) {
    content = content.replace(
        'import { authRouter } from "./auth.js";',
        'import { authRouter } from "./auth.js";\nimport { translateRouter } from "./translate.js";'
    );
    
    content = content.replace(
        'app.use("/api", authRouter);',
        'app.use("/api", authRouter);\n  app.use("/api", translateRouter);'
    );
    fs.writeFileSync('api/index.ts', content);
}
