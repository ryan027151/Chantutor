export function scoreBadgeClass(score: number | null): string {
  if (score === null) return "bg-amber-100 text-amber-600";
  if (score >= 90)   return "bg-emerald-100 text-emerald-700";
  if (score >= 75)   return "bg-blue-100 text-blue-700";
  return "bg-orange-100 text-orange-700";
}

export function formatScore(score: number | null): string {
  if (score === null) return "In Progress";
  if (score > 100)   return String(score);
  return `${score}%`;
}