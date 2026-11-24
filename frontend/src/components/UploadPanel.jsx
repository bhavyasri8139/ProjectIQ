import { useRef, useState } from "react";
import { FileUp, FlaskConical, LoaderCircle, UploadCloud } from "lucide-react";

const ALLOWED = /\.(pdf|docx|txt|csv|xlsx|xls)$/i;

/**
 * Drop zone that uploads immediately on selection. The server answers at once
 * and indexes in the background, so there is no "wait for processing" step.
 */
export default function UploadPanel({ onFiles, onLoadSample, uploading, compact = false, hasDocuments }) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");

  function handle(fileList) {
    const incoming = Array.from(fileList || []);
    const valid = incoming.filter((f) => ALLOWED.test(f.name));
    setNotice(valid.length !== incoming.length ? "Some files were skipped. Use PDF, DOCX, TXT, CSV, XLSX or XLS." : "");
    if (valid.length) onFiles(valid);
  }

  return (
    <div className="panel upload-panel">
      <div className="panel-heading">
        <div>
          <h2>{hasDocuments ? "Add new project documents" : "Build your knowledge base"}</h2>
          <p>
            {hasDocuments
              ? "New meeting notes or progress updates are indexed automatically and the analysis refreshes itself."
              : "Upload project files. Indexing starts immediately in the background."}
          </p>
        </div>
        <div className="heading-icon"><UploadCloud size={21} /></div>
      </div>

      <div
        className={`dropzone ${compact ? "compact" : ""} ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}
      >
        <div className="upload-illustration">
          {uploading ? <LoaderCircle className="spin" size={27} /> : <FileUp size={27} />}
        </div>
        <strong>{uploading ? "Uploading..." : "Drop documents here or click to browse"}</strong>
        <div className="format-list">
          {["PDF", "DOCX", "TXT", "CSV", "XLSX", "XLS"].map((f) => <span key={f}>{f}</span>)}
        </div>
        <small>Maximum 20 MB per file · uploads start automatically</small>
      </div>
      <input
        ref={input} type="file" hidden multiple accept=".pdf,.docx,.txt,.csv,.xlsx,.xls"
        onChange={(e) => { handle(e.target.files); e.target.value = ""; }}
      />
      {notice && <p className="upload-notice">{notice}</p>}

      {onLoadSample && (
        <button className="secondary-button full-button sample-button" onClick={onLoadSample} disabled={uploading}>
          <FlaskConical size={16} /> Load sample project (TXT, CSV, DOCX)
        </button>
      )}
    </div>
  );
}
