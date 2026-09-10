// Builds the ", District, State" suffix that PIN Code auto-fill appends to an Address field.
export function buildLocationSuffix(district, state) {
  const parts = [district, state].filter(Boolean);
  return parts.length ? `, ${parts.join(", ")}` : "";
}

export function appendLocationSuffix(address, suffix) {
  return `${address || ""}${suffix || ""}`;
}

// Removes a specific previously-appended suffix from the end of an address, so re-fetching
// (PIN changed) or unchecking the auto-fill box can cleanly undo exactly what was added —
// without guessing or accidentally eating part of the user's own address text.
export function removeLocationSuffix(address, suffix) {
  const value = address || "";
  if (!suffix) return value;
  return value.endsWith(suffix) ? value.slice(0, value.length - suffix.length) : value;
} 