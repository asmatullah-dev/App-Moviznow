const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkgLockPath = path.join(__dirname, '..', 'package-lock.json');

try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version || '4.0.09';

  const parts = currentVersion.split('.');
  if (parts.length === 3) {
    let patchNum = parseInt(parts[2], 10);
    if (!isNaN(patchNum)) {
      patchNum += 1;
      const newPatchStr = patchNum < 10 ? `0${patchNum}` : `${patchNum}`;
      const newVersion = `${parts[0]}.${parts[1]}.${newPatchStr}`;

      // Calculate Pakistan Standard Time (PKT, UTC+5)
      const now = new Date();
      const pktFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      const pktFormatted = `${pktFormatter.format(now)} (PKT)`;

      pkg.version = newVersion;
      pkg.versionUpdatedAt = pktFormatted;
      pkg.versionTimestamp = now.getTime();

      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log(`Bumped version from ${currentVersion} to ${newVersion} (Updated at: ${pktFormatted}) in package.json`);

      if (fs.existsSync(pkgLockPath)) {
        try {
          const pkgLock = JSON.parse(fs.readFileSync(pkgLockPath, 'utf8'));
          pkgLock.version = newVersion;
          if (pkgLock.packages && pkgLock.packages['']) {
            pkgLock.packages[''].version = newVersion;
          }
          fs.writeFileSync(pkgLockPath, JSON.stringify(pkgLock, null, 2) + '\n');
          console.log(`Updated package-lock.json version to ${newVersion}`);
        } catch (e) {
          console.error('Could not update package-lock.json:', e);
        }
      }
    }
  }
} catch (err) {
  console.error('Error bumping version:', err);
  process.exit(1);
}
