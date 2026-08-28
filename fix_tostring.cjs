const fs = require('fs');

let content = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8');

content = content.replace(/newVersion\.toString\(\)/g, 'getUtcVersion()');
content = content.replace(/verTime\.toString\(\)/g, 'getUtcVersion()');
content = content.replace(/signupTime\.toString\(\)/g, 'getUtcVersion()');
content = content.replace(/loginVerTime\.toString\(\)/g, 'getUtcVersion()');
content = content.replace(/updateVerTime\.toString\(\)/g, 'getUtcVersion()');
content = content.replace(/\(serverVersion || getUtcVersion\(\)\)\.toString\(\)/g, '(serverVersion || getUtcVersion())');
content = content.replace(/effectiveServerVersion\.toString\(\)/g, 'effectiveServerVersion.toString()'); // If this is an object, it will fail. Wait, parseVersionTime? 
// Let's replace effectiveServerVersion.toString() with getUtcVersion(effectiveServerVersion) or similar. Or just String(effectiveServerVersion). But serverVersion might be an object...
// earlier: const effectiveServerVersion = serverVersionTime > 0 ? (typeof serverVersion === 'object' ? (serverVersion.updatedAt || serverVersion.version) : serverVersion) : 1;
// So it is safe to use String(effectiveServerVersion) because it's extracted. But let's leave it as is or change to String().

fs.writeFileSync('src/contexts/AuthContext.tsx', content);
console.log('Fixed toString issues completely');
