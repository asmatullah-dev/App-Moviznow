const fs = require('fs');

const filesToUpdate = [
  'src/contexts/AuthContext.tsx',
  'src/contexts/UsersContext.tsx',
  'src/pages/admin/UserManagement.tsx',
  'src/pages/admin/SelectedContentUsers.tsx',
  'src/pages/admin/UserManagers.tsx',
  'src/pages/Unsubscribe.tsx',
  'src/pages/user/Rewards.tsx'
];

filesToUpdate.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  // Inject serverTimestamp import if not present
  if (content.includes("from 'firebase/firestore'")) {
    if (!content.includes('serverTimestamp')) {
       content = content.replace(/import \{([^}]+)\} from 'firebase\/firestore';/, (match, p1) => {
          return `import { ${p1.trim()}, serverTimestamp } from 'firebase/firestore';`;
       });
    }
  }

  // AuthContext dynamic imports
  if (file.includes('AuthContext.tsx')) {
    content = content.replace(/const \{ setDoc \} = await import\("firebase\/firestore"\);/g, 'const { setDoc, serverTimestamp } = await import("firebase/firestore");');
    content = content.replace(/const \{ writeBatch \} = await import\("firebase\/firestore"\);/g, 'const { writeBatch, serverTimestamp } = await import("firebase/firestore");');
    content = content.replace(/const metaUpdates: Record<string, any> = \{ \[currentUser\.uid\]: getUtcVersion\(\) \};/g, 'const metaUpdates: Record<string, any> = { [currentUser.uid]: serverTimestamp() };');
  }

  // UsersContext
  if (file.includes('UsersContext.tsx')) {
    content = content.replace(/const nowSyncUtc = getUtcVersion\(\);/g, 'const nowSyncUtc = serverTimestamp();');
  }

  // UserManagement
  if (file.includes('UserManagement.tsx')) {
    if (!content.includes('serverTimestamp')) {
      content = content.replace(/import \{([^}]+)\} from 'firebase\/firestore';/, (match, p1) => {
         return `import { ${p1.trim()}, serverTimestamp } from 'firebase/firestore';`;
      });
    }
    content = content.replace(/getUtcVersion\(\)/g, 'serverTimestamp()');
  }

  // SelectedContentUsers, UserManagers, Unsubscribe, Rewards
  if (file.includes('SelectedContentUsers.tsx') || file.includes('UserManagers.tsx') || file.includes('Unsubscribe.tsx') || file.includes('Rewards.tsx')) {
    content = content.replace(/const nowTime = getUtcVersion\(\);/g, 'const nowTime = serverTimestamp();');
    if (!content.includes('serverTimestamp')) {
      content = content.replace(/import \{([^}]+)\} from 'firebase\/firestore';/, (match, p1) => {
         return `import { ${p1.trim()}, serverTimestamp } from 'firebase/firestore';`;
      });
    }
  }

  fs.writeFileSync(file, content);
  console.log(`Updated ${file}`);
});
