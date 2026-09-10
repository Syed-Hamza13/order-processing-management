// Converts an ISO date string (yyyy-mm-dd) to Indian standard display format (dd/mm/yyyy).
export function toIndianDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
