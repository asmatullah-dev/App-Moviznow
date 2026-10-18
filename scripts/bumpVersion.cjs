const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkgLockPath = path.join(__dirname, '..', 'package-lock.json');

try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version || '5.4.0';

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

  // Keep app version unchanged (SemVer: Major.Minor.Patch)
  // Only update timestamp metadata
  pkg.version = currentVersion;
  pkg.versionUpdatedAt = pktFormatted;
  pkg.versionTimestamp = now.getTime();

  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Updated timestamp in package.json at ${pktFormatted} (Version kept at ${currentVersion})`);
} catch (err) {
  console.error('Error updating version timestamp:', err);
  process.exit(1);
}
