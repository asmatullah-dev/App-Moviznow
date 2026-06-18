export function getHumanReadableDeviceName(userAgent: string): string {
  if (!userAgent) return "Unknown Device";
  
  // Browser APIs primarily provide the OS version and browser engine.
  // Specific device hardware names require string matching against known model patterns.
  
  // Common Android patterns
  const match = userAgent.match(/\b(SM-[A-Z0-9]+|Redmi[\s\w]+|Pixel[\s\w]+|Nexus[\s\w]+|Moto[\s\w]+|CPH[\d]+|RMX[\d]+|POCO[\s\w]+)\b/i);
  if (match) {
    let model = match[0];
    
    // Expand some known raw model IDs to Human-readable ones
    // E.g. SM-G998B -> Samsung Galaxy S21 Ultra
    // For Redmi Note 14 4G, if it appears literally as "Redmi Note 14 4G", the regex grabs it.
    if (model.startsWith("SM-G998")) return "Samsung Galaxy S21 Ultra";
    if (model.startsWith("SM-G991")) return "Samsung Galaxy S21";
    // ... add more mappings as needed
    
    return model;
  }
  
  // iOS patterns
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/iPod/i.test(userAgent)) return "iPod";
  
  // Desktop
  if (/Windows NT 10.0/i.test(userAgent)) return "Windows 10/11";
  if (/Windows NT 11.0/i.test(userAgent)) return "Windows 11";
  if (/Mac OS X/i.test(userAgent)) return "Mac";
  if (/CrOS/i.test(userAgent)) return "Chrome OS";
  if (/Linux/i.test(userAgent)) return "Linux";
  
  return "Unknown Device";
}
