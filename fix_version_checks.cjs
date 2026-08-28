const fs = require('fs');

const file = 'src/contexts/AdminContentContext.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace .version with .updatedAt
content = content.replace(/\.version/g, '.updatedAt');

fs.writeFileSync(file, content);
console.log('Fixed .version in AdminContentContext');
