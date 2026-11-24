import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Bot, FileText, LoaderCircle, RefreshCw, ShieldAlert, Sparkles, X } from "lucide-react";
import { api } from "../api";
import { BlockerView, DocumentView, RiskView, ScopeView } from "./AgentViews";

const TABS = [
  { id: "scope", label: "Scope & Deliverables", icon: Bot },
  { id: "risk", label: "Risks & Forecast", icon: ShieldAlert },
  { id: "blockers", label: "Blockers & Actions", icon: AlertCircle },
  { id: "docs", label: "Generated Documents", icon: FileText },
];

const DOC_TYPES = [
  ["user_stories", "User stories"],
  ["risk_register", "Risk register"],
  ["action_items", "Action items"],
  ["project_summary", "Project summary"],
];

export default function AgentsPage({ documents, dashboard, onChanged }) {
  const [tab, setTab] = useState("scope");
  const [scopeDoc, setScopeDoc] = useState("");
  const [docType, setDocType] = useState("user_stories");
  const [docResults, setDocResults] = useState({ key: null, data: null });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  // Project scope comes from the polled dashboard. A single-document scope is fetched on demand.
  const [single, setSingle] = useState({ key: null, results: null });
  const loadSingle = useCallback(async (id) => {
    try {
      const data = await api.analysis(id);
      setSingle({ key: id, results: data.results });
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (scopeDoc) loadSingle(scopeDoc);
  }, [scopeDoc, loadSingle]);

  const results = scopeDoc ? (single.key === scopeDoc ? single.results : null) || {} : dashboard?.results || {};
  const indexed = documents.filter((d) => d.status === "processed");
  const analysing = !scopeDoc && dashboard?.state?.status === "running";

  async function run(name, fn) {
    setBusy(name);
    setError("");
    try {
      await fn();
      if (scopeDoc) await loadSingle(scopeDoc);
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const generated = results.documents?.[docType];
  const shownDoc = docResults.key === `${scopeDoc}|${docType}` ? docResults.data : generated;

  async function generate(refresh) {
    await run("docs", async () => {
      const data = await api.generateDoc(scopeDoc, docType, refresh);
      setDocResults({ key: `${scopeDoc}|${docType}`, data });
    });
  }

  const rerun = {
    scope: () => run("scope", () => api.runScope(scopeDoc)),
    risk: () => run("risk", () => api.runRisk(scopeDoc)),
    blockers: () => run("blockers", () => api.runBlockers(scopeDoc)),
  };

  return (
    <>
      <section className="welcome-row">
        <div>
          <div className="eyebrow"><Bot size={14} /> MILESTONE 2 & 3 · MULTI-AGENT PIPELINE</div>
          <h1>AI Agents</h1>
          <p className="page-subtitle">
            Results are saved and shown instantly. Use Re-run only when you want a fresh pass by a single agent.
          </p>
        </div>
        <label className="scope-select">
          <span>Analysis scope</span>
          <select value={scopeDoc} onChange={(e) => setScopeDoc(e.target.value)}>
            <option value="">All project documents</option>
            {indexed.map((d) => <option key={d.id} value={d.id}>{d.filename}</option>)}
          </select>
        </label>
      </section>

      {error && (
        <div className="error-banner">
          <AlertCircle size={18} /><span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button>
        </div>
      )}

      <div className="tabs" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="panel card">
        {tab !== "docs" && (
          <div className="card-head">
            <span className="mini-label">{TABS.find((t) => t.id === tab).label.toUpperCase()}</span>
            <button className="secondary-button" onClick={rerun[tab]} disabled={!!busy || !indexed.length}>
              {busy === tab ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
              {busy === tab ? "Running..." : "Re-run agent"}
            </button>
          </div>
        )}

        {tab === "scope" && <ScopeView scope={results.scope_analysis} sources={results.sources} count={results.documents_analyzed} error={results.stage_errors?.scope} running={analysing} />}
        {tab === "risk" && <RiskView risk={results.risk_analysis} sources={results.sources} count={results.documents_analyzed} error={results.stage_errors?.risk} running={analysing} />}
        {tab === "blockers" && <BlockerView blockers={results.blocker_analysis} sources={results.sources} count={results.documents_analyzed} error={results.stage_errors?.blockers} running={analysing} />}

        {tab === "docs" && (
          <>
            <div className="card-head wrap-head">
              <div className="chips">
                {DOC_TYPES.map(([id, label]) => (
                  <button key={id} className={`chip ${docType === id ? "active" : ""}`} onClick={() => setDocType(id)}>{label}</button>
                ))}
              </div>
              <button className="secondary-button" onClick={() => generate(true)} disabled={!!busy || !indexed.length}>
                {busy === "docs" ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
                {shownDoc ? "Regenerate" : "Generate"}
              </button>
            </div>
            <DocumentView doc={shownDoc} />
            {!shownDoc && !busy && indexed.length > 0 && (
              <button className="primary-button" onClick={() => generate(false)}><Sparkles size={15} /> Generate {DOC_TYPES.find((d) => d[0] === docType)[1].toLowerCase()}</button>
            )}
          </>
        )}
      </div>
    </>
  );
}
