const fs = require('fs');

let content = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8');
content = content.split('(serverVersion || getUtcVersion())').join('');

fs.writeFileSync('src/contexts/AuthContext.tsx', content);
console.log('Fixed spam');
