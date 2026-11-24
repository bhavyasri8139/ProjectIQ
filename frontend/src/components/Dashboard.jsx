import { Activity, ArrowUpRight, Bot, CheckCircle2, ChevronRight, CircleHelp, Database, Files, LoaderCircle, MessageSquare, ShieldCheck, Target } from "lucide-react";
import { StatCard } from "./Common";
import DocumentsPanel from "./DocumentsPanel";
import UploadPanel from "./UploadPanel";

/** Overview page: upload, recent documents and a one-line analysis status. The full
 *  Milestone 4 insights dashboard lives on its own page ("Project Insights"). */
export default function Dashboard({
  dashboard, documents, search, setSearch, onFiles, uploading, onLoadSample,
  onSelect, onDelete, onToggle, goto, onAsk,
}) {
  const docs = dashboard?.documents;
  const state = dashboard?.state;
  const health = dashboard?.results?.health_report;
  const running = state?.status === "running";
  const indexing = (docs?.processing || 0) > 0;
  const chunks = docs?.chunks ?? 0;

  let line = "No analysis yet. Upload documents to start.";
  if (indexing) line = `Indexing ${docs.processing} document(s)...`;
  else if (running) line = `${state.message} (${state.progress}%)`;
  else if (state?.status === "error") line = state.error || "The analysis could not run.";
  else if (health) line = dashboard.stale ? "Documents changed since the last analysis." : "Analysis is up to date.";

  return (
    <>
      <section className="welcome-row">
        <div>
          <div className="eyebrow"><Bot size={14} /> AI-POWERED DOCUMENT INTELLIGENCE</div>
          <h1>Project overview</h1>
          <p className="page-subtitle">Upload project documents and open the other pages for insights, agents and the assistant.</p>
        </div>
        <button className="secondary-button" onClick={() => goto("Project Insights")} disabled={!docs?.in_project}>
          <Target size={16} /> Open Project Insights
        </button>
      </section>

      <section className="stats-grid">
        <StatCard icon={Files} label="Total documents" value={documents.length} note={`${docs?.in_project ?? 0} in project`} tone="blue" />
        <StatCard icon={CheckCircle2} label="Successfully indexed" value={docs?.indexed ?? 0} note={indexing ? `${docs.processing} indexing...` : "Ready to query"} tone="green" />
        <StatCard icon={Database} label="Knowledge chunks" value={chunks} note="Indexed text segments" tone="violet" />
        <StatCard icon={Activity} label="Project health score" value={health?.overall_score != null ? `${health.overall_score}/100` : "—"} note={health?.health_status || "Not scored yet"} tone="amber" />
      </section>

      <div className={`status-banner ${running || indexing ? "busy" : state?.status === "error" ? "error" : "ok"} compact`}>
        <div className="status-banner-main">
          {running || indexing ? <LoaderCircle className="spin" size={18} /> : <Activity size={18} />}
          <div><strong>{line}</strong></div>
          <button className="text-button" onClick={() => goto("Project Insights")}>View insights <ChevronRight size={15} /></button>
        </div>
        {running && <div className="progress-track"><span style={{ width: `${state.progress || 0}%` }} /></div>}
      </div>

      <section className="dashboard-grid">
        <UploadPanel onFiles={onFiles} onLoadSample={onLoadSample} uploading={uploading} hasDocuments={documents.length > 0} />
        <div className="panel assistant-card">
          <div className="assistant-glow"><Bot size={29} /></div>
          <span className="mini-label">YOUR AI ASSISTANT</span>
          <h2>Ask your documents anything.</h2>
          <p>Find answers, check delivery readiness, and explore risks and requirements across your indexed files.</p>
          <div className="suggestion-list">
            <button onClick={() => onAsk("Are we on track?")}><MessageSquare size={16} /> Are we on track? <ArrowUpRight size={15} /></button>
            <button onClick={() => onAsk("What are our biggest risks?")}><ShieldCheck size={16} /> What are our biggest risks? <ArrowUpRight size={15} /></button>
            <button onClick={() => onAsk("What are the key project deliverables?")}><CircleHelp size={16} /> Find key deliverables <ArrowUpRight size={15} /></button>
          </div>
        </div>
      </section>

      <DocumentsPanel
        documents={documents.slice(0, 5)} search={search} setSearch={setSearch}
        onSelect={onSelect} onDelete={onDelete} onToggle={onToggle} onViewAll={() => goto("Documents")}
      />
    </>
  );
}
