/**
 * Validates if an email address is a correctly formatted Gmail address.
 * Excludes missing/empty emails, non-Gmail domains, and app dummy domains (e.g., @moviznow.com).
 * Only returns true for valid Gmail addresses ending with @gmail.com or @googlemail.com.
 */
export function isValidGmailAddress(email?: string | null): boolean {
  if (!email || typeof email !== "string") return false;
  const cleanEmail = email.trim().toLowerCase();

  // Exclude dummy app emails (e.g., abc123@moviznow.com)
  if (cleanEmail.endsWith("@moviznow.com")) return false;

  // Strict regex for valid Gmail username + @gmail.com or @googlemail.com
  const gmailRegex = /^[a-zA-Z0-9._%+-]+@g(oogle)?mail\.com$/;
  return gmailRegex.test(cleanEmail);
}
