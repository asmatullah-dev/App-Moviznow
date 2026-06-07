const fs = require('fs');
let file = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8');

file = file.replace(/safeStorage\.setItem\(\s*"profile_cache"\s*,([^;]+)\);/g, 'safeStorage.setItem("profile_cache",$1);\n      safeStorage.setItem("profile_cache_timestamp", Date.now().toString());');

fs.writeFileSync('src/contexts/AuthContext.tsx', file);
console.log('Replaced successfully');
