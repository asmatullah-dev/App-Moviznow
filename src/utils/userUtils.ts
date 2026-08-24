export function getUserDisplayName(user?: { displayName?: string | null; phone?: string | null; email?: string | null; uid?: string | null } | null): string {
  if (!user) return 'User';
  
  if (user.displayName && typeof user.displayName === 'string') {
    const trimmed = user.displayName.trim();
    if (trimmed !== '' && trimmed !== 'No Name' && trimmed !== 'null' && trimmed !== 'undefined' && trimmed !== 'Anonymous') {
      return trimmed;
    }
  }

  if (user.phone && typeof user.phone === 'string' && user.phone.trim() !== '') {
    return `User (${user.phone.trim()})`;
  }

  if (user.email && typeof user.email === 'string' && user.email.trim() !== '' && !user.email.endsWith('@moviznow.com')) {
    return user.email.split('@')[0];
  }

  if (user.uid && typeof user.uid === 'string') {
    return `User (${user.uid.slice(0, 6)})`;
  }

  return 'User';
}
