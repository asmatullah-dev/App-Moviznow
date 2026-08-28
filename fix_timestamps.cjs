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

  // Revert serverTimestamp() to getUtcVersion()
  content = content.replace(/serverTimestamp\(\)/g, 'getUtcVersion()');
  
  // Remove serverTimestamp from imports
  content = content.replace(/, serverTimestamp \} from 'firebase\/firestore'/g, "} from 'firebase/firestore'");
  content = content.replace(/, serverTimestamp \} = await import\("firebase\/firestore"\)/g, "} = await import(\"firebase/firestore\")");

  fs.writeFileSync(file, content);
  console.log(`Reverted serverTimestamp in ${file}`);
});
