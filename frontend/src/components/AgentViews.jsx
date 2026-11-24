import { Download } from "lucide-react";
import { EmptyNote, Pending, Pill } from "./Common";
import { SeverityBars } from "./HealthView";
import Markdown from "./Markdown";
import { isFilled, severityClass } from "../utils";

function List({ items, empty = "Not specified in the documents." }) {
  const clean = (items || []).map((i) => (typeof i === "string" ? i : JSON.stringify(i))).filter(isFilled);
  if (!clean.length) return <EmptyNote>{empty}</EmptyNote>;
  return <ul className="plain-list">{clean.map((item, i) => <li key={i}>{item}</li>)}</ul>;
}

function Field({ label, value }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <p>{isFilled(value) ? value : <em className="muted">Not specified</em>}</p>
    </div>
  );
}

export function SourceNote({ sources = [], count }) {
  const files = [...new Set((sources || []).map((s) => s.filename))];
  if (!files.length && count == null) return null;
  return (
    <p className="source-note">
      Grounded in {count ?? files.length} document(s){files.length ? `: ${files.join(", ")}` : ""}
    </p>
  );
}

export function ScopeView({ scope, sources, count, error, running }) {
  if (!scope) return <Pending what="Scope analysis" error={error} running={running} />;
  return (
    <div className="agent-view">
      <div className="scope-header">
        <div>
          <span className="mini-label">PROJECT</span>
          <h3>{isFilled(scope.project_name) ? scope.project_name : "Name not specified"}</h3>
        </div>
      </div>
      <Field label="Objective" value={scope.objective} />
      <Field label="Summary" value={scope.summary} />
      <div className="two-col">
        <div><span className="field-label">Goals</span><List items={scope.goals} /></div>
        <div><span className="field-label">Deliverables</span><List items={scope.deliverables} /></div>
        <div><span className="field-label">Milestones</span><List items={scope.milestones} /></div>
        <div><span className="field-label">Timeline</span><List items={scope.timeline} /></div>
      </div>
      <div><span className="field-label">Team responsibilities</span><List items={scope.responsibilities} /></div>
      {(scope.missing_information || []).filter(isFilled).length > 0 && (
        <div className="gap-box">
          <span className="field-label">Information gaps</span>
          <List items={scope.missing_information} />
        </div>
      )}
      <SourceNote sources={sources} count={count} />
    </div>
  );
}

export function RiskList({ risks = [], limit }) {
  const shown = limit ? risks.slice(0, limit) : risks;
  if (!shown.length) return <EmptyNote>No risks were detected in the documents.</EmptyNote>;
  return (
    <div>
      {shown.map((risk, i) => (
        <div className="risk-item" key={i}>
          <div className="risk-item-header">
            <h4>{risk.title || "Untitled risk"}</h4>
            <Pill tone={severityClass(risk.severity)}>{String(risk.severity || "Medium").toUpperCase()}</Pill>
          </div>
          {risk.description && <p>{risk.description}</p>}
          <div className="risk-meta">
            <span>Category: {risk.category || "Other"}</span>
            <span>Probability: {risk.probability || "Not specified"}</span>
            <span>Impact: {risk.impact || "Not specified"}</span>
          </div>
          {isFilled(risk.mitigation) && (
            <div className="risk-mitigation"><strong>Recommended mitigation</strong><p>{risk.mitigation}</p></div>
          )}
          {isFilled(risk.evidence) && <div className="risk-evidence"><strong>Evidence: </strong>{risk.evidence}</div>}
        </div>
      ))}
    </div>
  );
}

export function ForecastCard({ forecast }) {
  const status = forecast?.status || "Insufficient Evidence";
  const tone = status === "On Track" ? "low" : status === "Delayed" ? "critical" : status === "At Risk" ? "high" : "medium";
  return (
    <div className="forecast">
      <div className="forecast-head">
        <span className="field-label">Delivery forecast</span>
        <Pill tone={tone}>{status.toUpperCase()}</Pill>
      </div>
      {["schedule_observations", "dependency_observations", "recommendations"].map((key) => (
        (forecast?.[key] || []).length > 0 && (
          <div key={key}>
            <span className="field-sub">{key.replace("_", " ")}</span>
            <List items={forecast[key]} />
          </div>
        )
      ))}
    </div>
  );
}

export function RiskView({ risk, sources, count, error, running }) {
  if (!risk) return <Pending what="Risk analysis" error={error} running={running} />;
  return (
    <div className="agent-view">
      {risk.overall_summary && <p className="lead-text">{risk.overall_summary}</p>}
      <div className="two-col">
        <div className="sub-card"><span className="field-label">Risks by severity</span><SeverityBars risks={risk.risks} /></div>
        <div className="sub-card"><ForecastCard forecast={risk.delivery_forecast} /></div>
      </div>
      <RiskList risks={risk.risks} />
      {(risk.missing_information || []).filter(isFilled).length > 0 && (
        <div className="gap-box"><span className="field-label">Missing information</span><List items={risk.missing_information} /></div>
      )}
      <SourceNote sources={sources} count={count} />
    </div>
  );
}

function statusTone(status) {
  const s = String(status || "").toLowerCase();
  if (["open", "blocked", "pending", "overdue"].includes(s)) return "high";
  if (["resolved", "completed", "done"].includes(s)) return "low";
  return "medium";
}

export function ActionTable({ items = [], limit }) {
  const shown = limit ? items.slice(0, limit) : items;
  if (!shown.length) return <EmptyNote>No action items were found.</EmptyNote>;
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Action</th><th>Owner</th><th>Due</th><th>Status</th><th>Priority</th></tr></thead>
        <tbody>
          {shown.map((a, i) => (
            <tr key={i}>
              <td className="wrap">{a.task}</td>
              <td className={isFilled(a.owner) ? "" : "muted"}>{isFilled(a.owner) ? a.owner : "Unassigned"}</td>
              <td className={isFilled(a.due_date) ? "" : "muted"}>{isFilled(a.due_date) ? a.due_date : "No date"}</td>
              <td><Pill tone={statusTone(a.status)}>{a.status || "Unclear"}</Pill></td>
              <td>{a.priority || "Not specified"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BlockerList({ blockers = [], limit }) {
  const shown = limit ? blockers.slice(0, limit) : blockers;
  if (!shown.length) return <EmptyNote>No explicit blockers were found.</EmptyNote>;
  return (
    <div>
      {shown.map((b, i) => (
        <div className="risk-item" key={i}>
          <div className="risk-item-header">
            <h4>{b.title}</h4>
            <Pill tone={statusTone(b.status)}>{String(b.status || "Unclear").toUpperCase()}</Pill>
          </div>
          {b.description && <p>{b.description}</p>}
          <div className="risk-meta">
            <span>Owner: {isFilled(b.owner) ? b.owner : "Unassigned"}</span>
            <span>Priority: {b.priority || "Not specified"}</span>
          </div>
          {isFilled(b.evidence) && <div className="risk-evidence"><strong>Evidence: </strong>{b.evidence}</div>}
        </div>
      ))}
    </div>
  );
}

export function DecisionList({ decisions = [] }) {
  if (!decisions.length) return <EmptyNote>No pending decisions were found.</EmptyNote>;
  return (
    <ul className="plain-list">
      {decisions.map((d, i) => (
        <li key={i}>
          <strong>{d.decision}</strong>
          <span className="muted"> · Owner: {isFilled(d.owner) ? d.owner : "Unassigned"}</span>
        </li>
      ))}
    </ul>
  );
}

export function BlockerView({ blockers, sources, count, error, running }) {
  if (!blockers) return <Pending what="Blocker analysis" error={error} running={running} />;
  return (
    <div className="agent-view">
      {blockers.summary && <p className="lead-text">{blockers.summary}</p>}
      <div><span className="field-label">Blockers</span><BlockerList blockers={blockers.blockers} /></div>
      <div><span className="field-label">Pending decisions</span><DecisionList decisions={blockers.pending_decisions} /></div>
      <div><span className="field-label">Action items</span><ActionTable items={blockers.action_items} /></div>
      <SourceNote sources={sources} count={count} />
    </div>
  );
}

export function downloadMarkdown(doc) {
  if (!doc?.content) return;
  const blob = new Blob([doc.content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = doc.filename || "projectiq-document.md";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function DocumentView({ doc }) {
  if (!doc) return <EmptyNote>This document has not been generated yet.</EmptyNote>;
  return (
    <div className="agent-view">
      <div className="doc-bar">
        <div>
          <strong>{doc.title}</strong>
          <span className="muted"> · {doc.method === "llm" ? "AI generated" : doc.method === "fallback" ? "Template (model unavailable)" : "Rendered from agent output"}</span>
        </div>
        <button className="secondary-button" onClick={() => downloadMarkdown(doc)}><Download size={15} /> Download .md</button>
      </div>
      <div className="doc-body"><Markdown text={doc.content} /></div>
      <SourceNote sources={doc.sources} count={doc.documents_analyzed} />
    </div>
  );
}
