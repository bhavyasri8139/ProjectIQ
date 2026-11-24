export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function timeAgo(seconds) {
  if (!seconds) return "never";
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

export function severityClass(value) {
  const v = String(value || "").toLowerCase();
  if (v === "critical") return "critical";
  if (v === "high") return "high";
  if (v === "low") return "low";
  return "medium";
}

export function isFilled(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some(isFilled);
  const text = String(value).trim().toLowerCase();
  return !["", "not specified", "unknown", "n/a", "none"].includes(text);
}

export function scoreColor(score) {
  if (score == null) return "#8490a4";
  if (score >= 75) return "#2eaa75";
  if (score >= 50) return "#d48b28";
  return "#d94c58";
}

export const INITIAL_MESSAGES = [
  {
    role: "assistant",
    content:
      "Hello! I'm your Project Intelligence Assistant. Ask about project status, risks, blockers, deliverables or owners. My answers come only from your uploaded documents.",
  },
];
