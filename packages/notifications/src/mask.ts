/**
 * Masks a recipient identifier (phone number or email) for safe logging.
 * Never log a full phone number, email address, token, or message body
 * containing personal data (CLAUDE.md rule 10).
 */
export function maskRecipient(value: string): string {
  if (!value) {
    return "";
  }
  if (value.includes("@")) {
    const [user, domain] = value.split("@");
    if (!user || !domain) {
      return "***";
    }
    const visible = user.slice(0, 1);
    return `${visible}***@${domain}`;
  }
  if (value.length <= 4) {
    return "***";
  }
  return `${"*".repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`;
}
