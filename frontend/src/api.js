export const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : data.message;
    throw new Error(detail || `Request failed (${response.status}).`);
  }
  return data;
}

const post = (path, body) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

export const api = {
  health: () => request("/api/health"),
  documents: () => request("/api/documents"),
  dashboard: () => request("/api/dashboard"),
  analysis: (documentId) =>
    request(`/api/analysis${documentId ? `?document_id=${encodeURIComponent(documentId)}` : ""}`),
  runAnalysis: () => post("/api/analysis/run", {}),
  upload: (files) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    return request("/api/documents/upload", { method: "POST", body: form });
  },
  loadSample: () => post("/api/demo/load", {}),
  deleteDocument: (id) => request(`/api/documents/${encodeURIComponent(id)}`, { method: "DELETE" }),
  setInProject: (id, inProject) =>
    request(`/api/documents/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ in_project: inProject }),
    }),
  runScope: (documentId) => post("/api/agents/scope", { document_id: documentId || null }),
  runRisk: (documentId) => post("/api/agents/risk", { document_id: documentId || null }),
  runBlockers: (documentId) => post("/api/agents/blockers", { document_id: documentId || null }),
  generateDoc: (documentId, documentType, refresh = false) =>
    post("/api/agents/documentation", {
      document_id: documentId || null,
      document_type: documentType,
      refresh,
    }),
  healthScore: () => post("/api/agents/health-score", {}),
  chat: (payload) => post("/api/chat", payload),
};
