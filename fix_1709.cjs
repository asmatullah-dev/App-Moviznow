const fs = require('fs');
let content = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8');
content = content.replace(/\|\| getUtcVersion\(\)\)\.toString\(\),/g, '(serverVersion || getUtcVersion()),');
fs.writeFileSync('src/contexts/AuthContext.tsx', content);
