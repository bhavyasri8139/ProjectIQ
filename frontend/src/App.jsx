import { useState } from "react";
import {
  Activity, AlertCircle, Bot, CheckCircle2, ChevronRight, Database, Files,
  LayoutDashboard, MessageSquare, Plus, RefreshCw, ShieldCheck, Target, X, Zap,
} from "lucide-react";
import "./App.css";
import "./Dashboard.css";
import "./colors.css";
import { api } from "./api";
import { useWorkspace } from "./hooks";
import { INITIAL_MESSAGES } from "./utils";
import { StatCard } from "./components/Common";
import AgentsPage from "./components/AgentsPage";
import AssistantPage from "./components/AssistantPage";
import Dashboard from "./components/Dashboard";
import InsightsPage from "./components/InsightsPage";
import DocumentsPanel from "./components/DocumentsPanel";
import HealthPage from "./components/HealthPage";
import Markdown from "./components/Markdown";
import UploadPanel from "./components/UploadPanel";

const NAV = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Documents", icon: Files },
  { name: "Knowledge Base", icon: Database },
  { name: "Project Insights", icon: Target },
  { name: "Project Health", icon: Activity },
  { name: "AI Agents", icon: Bot },
  { name: "AI Assistant", icon: MessageSquare },
];

export default function App() {
  const { dashboard, documents, health, offline, refresh, removeLocal, patchLocal } = useWorkspace();
  const [page, setPage] = useState("Dashboard");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [draft, setDraft] = useState("");

  const state = dashboard?.state;
  const running = state?.status === "running";
  const filtered = documents.filter((d) => d.filename.toLowerCase().includes(search.toLowerCase()));
  const selectedDoc = documents.find((d) => d.id === selectedId);
  const totalChunks = documents.reduce((sum, d) => sum + (d.status === "processed" ? d.chunks || 0 : 0), 0);

  async function uploadFiles(files) {
    setUploading(true);
    setError("");
    try {
      const data = await api.upload(files);
      const failed = (data.results || []).filter((r) => r.status === "failed");
      if (failed.length) setError(failed.map((f) => `${f.filename}: ${f.error}`).join(" | "));
      refresh();
    } catch (err) {
      setError(`${err.message} Check that FastAPI is running on port 8000.`);
    } finally {
      setUploading(false);
    }
  }

  async function loadSample() {
    setUploading(true);
    setError("");
    try {
      const data = await api.loadSample();
      if (!data.loaded) setError("The sample project is already loaded.");
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function runAnalysis() {
    setError("");
    try {
      await api.runAnalysis();
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteDocument(doc) {
    if (!window.confirm(`Delete "${doc.filename}" and its indexed chunks? The analysis will refresh.`)) return;
    removeLocal(doc.id);                       // disappears at once
    if (selectedId === doc.id) setSelectedId(null);
    try {
      await api.deleteDocument(doc.id);
    } catch (err) {
      setError(err.message);
    }
    refresh();                                 // not awaited: confirm in the background
  }

  async function toggleProject(doc, value) {
    patchLocal(doc.id, { in_project: value }); // the switch moves at once
    try {
      await api.setInProject(doc.id, value);
    } catch (err) {
      patchLocal(doc.id, { in_project: !value });
      setError(err.message);
    }
    refresh();
  }

  function askAssistant(text) {
    setDraft(text);
    setPage("AI Assistant");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={23} /></div>
          <div className="brand-copy"><strong>ProjectIQ</strong><span>INTELLIGENCE PLATFORM</span></div>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="navigation">
          {NAV.map(({ name, icon: Icon }) => (
            <button key={name} className={`nav-item ${page === name ? "active" : ""}`} onClick={() => setPage(name)}>
              <Icon size={18} />
              <span>{name}</span>
              {name === "Documents" && documents.length > 0 && <span className="nav-count">{documents.length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="system-card">
            <div className="system-heading">
              <span className={`status-dot ${!offline ? "online" : ""}`} />
              <strong>{health?.llm_provider && health.llm_provider !== "ollama" ? "Cloud AI system" : "Local AI system"}</strong>
            </div>
            <p>
              {offline ? "Waiting for backend"
                : running ? `Analyzing project... ${state.progress}%`
                : health?.status === "ok" ? "Backend and models ready"
                : health?.problems?.length ? health.problems[0]
                : health ? "Starting up..." : "Backend connected"}
            </p>
            <div className="system-progress">
              <span style={{ width: offline ? "15%" : running ? `${state.progress}%` : "100%" }} />
            </div>
            <span className="system-caption">{health?.chat_model || "..."} + {health?.embedding_model || "..."}</span>
            {health?.llm_note && <span className="system-caption" style={{ color: "#e0a03a" }}>{health.llm_note}</span>}
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Workspace <ChevronRight size={14} /> <strong>{page}</strong></div>
          <div className="topbar-right">
            <span className={`connection ${!offline ? "connected" : ""}`}>
              <span className="status-dot" />
              {offline ? "Backend offline" : "System connected"}
            </span>
            <button className="icon-button" title="Refresh" onClick={refresh}><RefreshCw size={17} /></button>
          </div>
        </header>

        <div className="page-content">
          {(error || offline) && (
            <div className="error-banner">
              <AlertCircle size={18} />
              <span>{error || "Cannot connect to the backend. Start FastAPI on port 8000."}</span>
              {error && <button onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button>}
            </div>
          )}

          {page === "Dashboard" && (
            <Dashboard
              dashboard={dashboard} documents={documents} search={search} setSearch={setSearch}
              onFiles={uploadFiles} uploading={uploading} onLoadSample={loadSample}
              onSelect={(doc) => { setSelectedId(doc.id); setPage("Documents"); }}
              onDelete={deleteDocument} onToggle={toggleProject} goto={setPage} onAsk={askAssistant}
            />
          )}

          {page === "Project Insights" && (
            <InsightsPage
              dashboard={dashboard} onFiles={uploadFiles} uploading={uploading}
              onLoadSample={loadSample} onRunAnalysis={runAnalysis} goto={setPage}
            />
          )}

          {page === "Documents" && (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow"><Files size={14} /> MILESTONE 1 · INGESTION & KNOWLEDGE BASE</div>
                  <h1>Your documents</h1>
                  <p className="page-subtitle">Upload returns instantly. Indexing runs in the background and the table updates live.</p>
                </div>
              </section>
              <DocumentsPanel
                documents={filtered} search={search} setSearch={setSearch} full title="Document library"
                onSelect={(doc) => setSelectedId(doc.id)} onDelete={deleteDocument} onToggle={toggleProject}
                onViewAll={() => {}}
              />
              {selectedDoc && (
                <div className="panel card detail-panel">
                  <div className="card-head">
                    <div><span className="mini-label">DOCUMENT SUMMARY</span><h2>{selectedDoc.filename}</h2></div>
                    <button className="icon-button" onClick={() => setSelectedId(null)}><X size={18} /></button>
                  </div>
                  <div className="doc-body">
                    <Markdown text={selectedDoc.summary || (selectedDoc.status === "processing" ? "Indexing in progress..." : "No summary is available.")} />
                  </div>
                  <div className="summary-meta">
                    <span><Database size={15} /> {selectedDoc.chunks || 0} chunks indexed</span>
                    <span><CheckCircle2 size={15} /> {selectedDoc.status}</span>
                    {selectedDoc.processing_seconds != null && <span><Zap size={15} /> indexed in {selectedDoc.processing_seconds}s</span>}
                  </div>
                  <button className="secondary-button" onClick={() => setPage("AI Assistant")}>
                    Ask about this project <MessageSquare size={16} />
                  </button>
                </div>
              )}
              <UploadPanel onFiles={uploadFiles} onLoadSample={loadSample} uploading={uploading} compact hasDocuments={documents.length > 0} />
            </>
          )}

          {page === "Knowledge Base" && (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow"><Database size={14} /> MILESTONE 1 · RAG PIPELINE</div>
                  <h1>Knowledge base</h1>
                  <p className="page-subtitle">Chunking, embedding and vector indexing status.</p>
                </div>
                <button className="primary-button" onClick={() => setPage("Documents")}><Plus size={16} /> Add documents</button>
              </section>
              <section className="stats-grid">
                <StatCard icon={Database} label="Indexed chunks" value={totalChunks} note="800 characters, 120 overlap" tone="violet" />
                <StatCard icon={Files} label="Documents" value={documents.length} note={`${dashboard?.documents.in_project ?? 0} in project`} tone="blue" />
                <StatCard icon={Activity} label="API status" value={offline ? "Offline" : "Online"} note="FastAPI service" tone="green" />
                <StatCard icon={Zap} label="Embedding model" value={health?.embedding_model_available ? "Ready" : "Loading..."} note={health?.embedding_model || "..."} tone="amber" />
              </section>
              <div className="panel knowledge-info">
                <Database size={26} />
                <h2>Persistent vector storage</h2>
                <p>
                  Documents are split into overlapping chunks, embedded locally and stored in ChromaDB. The agents and the
                  assistant retrieve only the most relevant chunks, so answers stay grounded in your uploaded content. New uploads
                  are added to the index without rebuilding it.
                </p>
                <div className="knowledge-row"><span>Vector collection</span><strong>{health?.collection || "project_documents"}</strong></div>
                <div className="knowledge-row"><span>Chat model</span><strong>{health?.chat_model || "..."}{health?.llm_provider ? ` (${health.llm_provider})` : ""}</strong></div>
                <div className="knowledge-row"><span>Embedding model</span><strong>{health?.embedding_model || "..."}</strong></div>
                <div className="knowledge-row"><span>Supported formats</span><strong>PDF, DOCX, TXT, CSV, XLSX, XLS</strong></div>
              </div>
            </>
          )}

          {page === "Project Health" && <HealthPage dashboard={dashboard} onChanged={refresh} goto={setPage} />}
          {page === "AI Agents" && <AgentsPage documents={documents} dashboard={dashboard} onChanged={refresh} />}
          {page === "AI Assistant" && (
            <AssistantPage documents={documents} messages={messages} setMessages={setMessages} draft={draft} setDraft={setDraft} />
          )}
        </div>
      </main>
    </div>
  );
}
