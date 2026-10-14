export function getUserDisplayName(user?: { displayName?: string | null; phone?: string | null; email?: string | null; uid?: string | null } | null): string {
  if (!user) return 'User';
  
  if (user.displayName && typeof user.displayName === 'string') {
    const trimmed = user.displayName.trim();
    const lower = trimmed.toLowerCase();
    const invalidNames = ['no name', 'null', 'undefined', 'anonymous', 'unknown', 'none', 'n/a', ''];
    if (!invalidNames.includes(lower) && !lower.startsWith('user (')) {
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

export function safeFormat(dateStr: string | null | undefined, fmt: string = 'MMM dd, yyyy'): string {
  if (!dateStr) return 'N/A';
  if (dateStr === 'Lifetime') return '👑 Lifetime Access';

  const trimmed = String(dateStr).trim();
  const dateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const yyyy = dateMatch[1];
    const mm = parseInt(dateMatch[2], 10) - 1;
    const dd = parseInt(dateMatch[3], 10);
    if (fmt.includes('MMM')) {
      return `${months[mm] || ''} ${String(dd).padStart(2, '0')}, ${yyyy}`;
    }
    return `${yyyy}-${dateMatch[2]}-${dateMatch[3]}`;
  }

  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
  }
  return trimmed;
}
