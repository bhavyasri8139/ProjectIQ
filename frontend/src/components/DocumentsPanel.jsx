import { ChevronRight, FileText, LoaderCircle, Search, Trash2 } from "lucide-react";
import { FileIcon } from "./Common";
import { formatBytes } from "../utils";

function StatusCell({ doc }) {
  if (doc.status === "processing") {
    return <span className="status-pill pending"><LoaderCircle className="spin" size={11} /> Indexing...</span>;
  }
  if (doc.status === "failed") {
    return <span className="status-pill failed" title={doc.error || ""}><span /> Failed</span>;
  }
  return <span className="status-pill success"><span /> Indexed</span>;
}

export default function DocumentsPanel({
  documents, search, setSearch, onSelect, onDelete, onToggle, onViewAll, full = false, title = "Recent documents",
}) {
  return (
    <section className={`panel documents-panel ${full ? "full-library" : ""}`}>
      <div className="panel-heading documents-heading">
        <div>
          <h2>{title}</h2>
          <p>Only documents marked "In project" feed the analysis and the dashboard.</p>
        </div>
        <div className="document-tools">
          <label className="search-field">
            <Search size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents" />
          </label>
          {!full && <button className="text-button" onClick={onViewAll}>View all <ChevronRight size={15} /></button>}
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="empty-state">
          <strong>No documents yet</strong>
          <span>Upload a project file or load the sample project to start.</span>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="documents-table">
            <thead>
              <tr><th>DOCUMENT</th><th>STATUS</th><th>IN PROJECT</th><th>CHUNKS</th><th>SIZE</th><th>ACTIONS</th></tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id || doc.filename}>
                  <td>
                    <button className="file-cell" onClick={() => onSelect(doc)}>
                      <div className="file-icon"><FileIcon name={doc.filename} /></div>
                      <div><strong>{doc.filename}</strong><span>{doc.file_type || "DOCUMENT"}</span></div>
                    </button>
                  </td>
                  <td><StatusCell doc={doc} />{doc.status === "failed" && doc.error && <div className="row-error">{doc.error}</div>}</td>
                  <td>
                    <label className="switch" title="Include this document in the project analysis">
                      <input
                        type="checkbox"
                        checked={doc.in_project !== false}
                        disabled={doc.status !== "processed"}
                        onChange={(e) => onToggle(doc, e.target.checked)}
                      />
                      <span className="slider" />
                    </label>
                  </td>
                  <td>{doc.status === "processed" ? doc.chunks : "—"}</td>
                  <td>{formatBytes(doc.file_size)}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="icon-button small" title="View summary" onClick={() => onSelect(doc)}><FileText size={16} /></button>
                      <button className="icon-button small danger-hover" title="Delete document" onClick={() => onDelete(doc)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
