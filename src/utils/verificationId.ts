export function generateVerificationId() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DUGI-${yyyy}${mm}${dd}-${randomPart}`;
}
