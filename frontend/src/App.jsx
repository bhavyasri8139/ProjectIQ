import { useEffect, useRef, useState } from "react";
import {
  Activity, AlertCircle, ArrowUpRight, Bot, CheckCircle2,
  ChevronDown, ChevronRight, CircleHelp, Database, File,
  FileSpreadsheet, FileText, FileUp, Files, LayoutDashboard,
  LoaderCircle, MessageSquare, MoreHorizontal, Plus, RefreshCw,
  Search, Send, ShieldCheck, Sparkles, Trash2, UploadCloud,
  X, Zap,
} from "lucide-react";
import "./App.css";

const API = "http://localhost:8000";

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ name = "" }) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["csv", "xls", "xlsx"].includes(ext))
    return <FileSpreadsheet size={21} />;
  if (ext === "pdf") return <FileText size={21} />;
  return <File size={21} />;
}

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState("Dashboard");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hello! I'm your Project Intelligence Assistant. Upload your project documents, then ask me questions about their content, deliverables, risks, or requirements.",
    },
  ]);
  const [asking, setAsking] = useState(false);
  const [health, setHealth] = useState(null);
  const fileInput = useRef(null);
  const chatEnd = useRef(null);

  async function loadDocuments() {
    setLoadingDocs(true);
    try {
      const response = await fetch(`${API}/api/documents`);
      if (!response.ok) throw new Error("Unable to load documents.");
      const data = await response.json();
      setDocuments(data);
      setError("");
    } catch {
      setError("Cannot connect to the backend. Start FastAPI on port 8000.");
    } finally {
      setLoadingDocs(false);
    }
  }

  async function loadHealth() {
    try {
      const response = await fetch(`${API}/api/health`);

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const data = await response.json();
      setHealth({ ...data, api_reachable: true });
    } catch (err) {
      console.error("Backend health check failed:", err);
      setHealth({
        status: "offline",
        api_reachable: false,
        embedding_model_available: false,
      });
    }
  }

  useEffect(() => {
    loadDocuments();
    loadHealth();

    const healthInterval = setInterval(() => {
      loadHealth();
    }, 10000);

    return () => clearInterval(healthInterval);
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, asking]);

  function addFiles(fileList) {
    const allowed = /\.(pdf|docx|txt|csv|xlsx|xls)$/i;
    const incoming = Array.from(fileList || []);
    const valid = incoming.filter((file) => allowed.test(file.name));
    if (valid.length !== incoming.length) {
      setError("Some files were skipped. Use PDF, DOCX, TXT, CSV, XLSX, or XLS.");
    } else {
      setError("");
    }
    setFiles((old) => [
      ...old,
      ...valid.filter(
        (file) => !old.some(
          (existing) => existing.name === file.name &&
            existing.size === file.size
        )
      ),
    ]);
  }

  async function uploadFiles() {
    if (!files.length || uploading) return;
    setUploading(true);
    setError("");

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch(`${API}/api/documents/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Upload failed.");
      }

      const results = data.results || [];
      const failed = results.filter((item) => item.status === "failed");
      const succeeded = results.filter((item) => item.status === "processed");

      setFiles([]);
      if (failed.length) {
        setError(
          failed.map((item) => `${item.filename}: ${item.error}`).join(" | ")
        );
      }
      await loadDocuments();
      await loadHealth();

      if (succeeded.length) {
        setPage("Documents");
        setSelected(succeeded[0].id);
      }
    } catch (err) {
      setError(
        `${err.message}. Check that FastAPI and Ollama are running.`
      );
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(doc) {
    if (!window.confirm(`Delete "${doc.filename}" and its indexed chunks?`))
      return;

    try {
      const response = await fetch(
        `${API}/api/documents/${encodeURIComponent(doc.id)}`,
        { method: "DELETE" }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Delete failed.");
      if (selected === doc.id) setSelected(null);
      await loadDocuments();
      await loadHealth();
    } catch (err) {
      setError(err.message);
    }
  }

  async function askQuestion(event) {
    event?.preventDefault();
    const text = question.trim();
    if (!text || asking) return;

    setMessages((old) => [...old, { role: "user", content: text }]);
    setQuestion("");
    setAsking(true);

    try {
      const response = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          ...(selected ? { document_id: selected } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Question failed.");

      setMessages((old) => [
        ...old,
        {
          role: "assistant",
          content: data.answer,
          sources: data.sources || [],
        },
      ]);
    } catch (err) {
      setMessages((old) => [
        ...old,
        {
          role: "assistant",
          content: `I couldn't retrieve an answer: ${err.message}. Make sure your documents are indexed and Ollama is running.`,
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  const totalChunks = documents.reduce(
    (sum, doc) => sum + (doc.chunks || 0), 0
  );
  const filtered = documents.filter((doc) =>
    doc.filename.toLowerCase().includes(search.toLowerCase())
  );
  const selectedDoc = documents.find((doc) => doc.id === selected);

  function openChat() {
    setPage("AI Assistant");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={23} /></div>
          <div className="brand-copy">
            <strong>ProjectIQ</strong>
            <span>INTELLIGENCE PLATFORM</span>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="navigation">
          {[
            { name: "Dashboard", icon: LayoutDashboard },
            { name: "Documents", icon: Files },
            { name: "Knowledge Base", icon: Database },
            { name: "AI Assistant", icon: MessageSquare },
          ].map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${page === name ? "active" : ""}`}
              onClick={() => setPage(name)}
            >
              <Icon size={18} />
              <span>{name}</span>
              {name === "Documents" && documents.length > 0 && (
                <span className="nav-count">{documents.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="system-card">
            <div className="system-heading">
              <span className={`status-dot ${health?.api_reachable ? "online" : ""}`} />
              <strong>Local AI system</strong>
            </div>
            <p>
              {health?.api_reachable
                ? "Backend connected"
                : "Waiting for backend"}
            </p>
            <div className="system-progress">
              <span style={{ width: health?.api_reachable ? "100%" : "15%" }} />
            </div>
            <span className="system-caption">Powered by FastAPI + Ollama</span>
          </div>
          <div className="profile">
            <div className="profile-avatar">PI</div>
            <div className="profile-copy">
              <strong>Project Workspace</strong>
              <span>Document intelligence</span>
            </div>
            <MoreHorizontal size={19} />
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />{" "}
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className={`connection ${health?.api_reachable ? "connected" : ""}`}>
              <span className="status-dot" />
              {health?.api_reachable ? "System connected" : "Checking connection"}
            </span>
            <button
              className="icon-button"
              title="Refresh documents"
              onClick={() => { loadDocuments(); loadHealth(); }}
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>

        <div className="page-content">
          {error && (
            <div className="error-banner">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}

          {page === "Dashboard" && (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow"><Zap size={14} /> AI-POWERED DOCUMENT INTELLIGENCE</div>
                  <h1>Project overview</h1>
                  <p className="page-subtitle">
                    Turn your project documents into knowledge you can act on.
                  </p>
                </div>
                <button className="primary-button" onClick={() => fileInput.current?.click()}>
                  <Plus size={18} /> Add documents
                </button>
              </section>

              <section className="stats-grid">
                <StatCard icon={Files} label="Total documents" value={documents.length} note="Uploaded to workspace" tone="blue" />
                <StatCard icon={CheckCircle2} label="Successfully indexed" value={documents.filter((d) => d.status === "processed").length} note="Ready to query" tone="green" />
                <StatCard icon={Database} label="Knowledge chunks" value={totalChunks} note="Indexed text segments" tone="violet" />
                <StatCard icon={Activity} label="System status" value={health?.api_reachable ? "Online" : "Offline"} note="Local RAG service" tone="amber" />
              </section>

              <section className="dashboard-grid">
                <div className="panel upload-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Build your knowledge base</h2>
                      <p>Upload project files to begin extracting insights.</p>
                    </div>
                    <div className="heading-icon"><UploadCloud size={21} /></div>
                  </div>

                  <div
                    className={`dropzone ${dragging ? "dragging" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      addFiles(e.dataTransfer.files);
                    }}
                    onClick={() => fileInput.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") fileInput.current?.click();
                    }}
                  >
                    <div className="upload-illustration"><FileUp size={27} /></div>
                    <strong>Drop your documents here</strong>
                    <span>or <span className="browse-link">browse files</span> from your computer</span>
                    <div className="format-list">
                      {["PDF", "DOCX", "TXT", "CSV", "XLSX", "XLS"].map((f) => (
                        <span key={f}>{f}</span>
                      ))}
                    </div>
                    <small>Maximum 20 MB per file</small>
                  </div>

                  <input
                    ref={fileInput}
                    type="file"
                    hidden
                    multiple
                    accept=".pdf,.docx,.txt,.csv,.xlsx,.xls"
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />

                  {files.length > 0 && (
                    <div className="pending-files">
                      <div className="pending-heading">
                        <strong>{files.length} file(s) selected</strong>
                        <button className="text-button" onClick={() => setFiles([])}>Clear all</button>
                      </div>
                      {files.map((file, i) => (
                        <div className="pending-file" key={`${file.name}-${i}`}>
                          <FileIcon name={file.name} />
                          <span>{file.name}</span>
                          <small>{formatBytes(file.size)}</small>
                          <button className="icon-button small" onClick={() => setFiles((old) => old.filter((_, j) => j !== i))}>
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                      <button className="primary-button full-button" onClick={uploadFiles} disabled={uploading}>
                        {uploading ? <LoaderCircle className="spin" size={18} /> : <UploadCloud size={18} />}
                        {uploading ? "Processing documents..." : "Upload and analyze"}
                      </button>
                    </div>
                  )}
                </div>

                <div className="panel assistant-card">
                  <div className="assistant-glow"><Bot size={29} /></div>
                  <span className="mini-label">YOUR AI ASSISTANT</span>
                  <h2>Ask your documents anything.</h2>
                  <p>
                    Find answers, explore project requirements, and understand
                    important details across your indexed files.
                  </p>
                  <div className="suggestion-list">
                    <button onClick={() => { setQuestion("Summarize my uploaded project documents."); openChat(); }}>
                      <MessageSquare size={16} /> Summarize my documents <ArrowUpRight size={15} />
                    </button>
                    <button onClick={() => { setQuestion("What project risks are mentioned in the documents?"); openChat(); }}>
                      <ShieldCheck size={16} /> Identify project risks <ArrowUpRight size={15} />
                    </button>
                    <button onClick={() => { setQuestion("What are the key project deliverables?"); openChat(); }}>
                      <CircleHelp size={16} /> Find key deliverables <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <button className="assistant-cta" onClick={openChat}>
                    Open AI assistant <ChevronRight size={17} />
                  </button>
                </div>
              </section>

              <DocumentsPanel
                documents={filtered.slice(0, 5)}
                loading={loadingDocs}
                search={search}
                setSearch={setSearch}
                onSelect={(doc) => { setSelected(doc.id); setPage("Documents"); }}
                onDelete={deleteDocument}
                onViewAll={() => setPage("Documents")}
              />
            </>
          )}

          {page === "Documents" && (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow"><Files size={14} /> DOCUMENT LIBRARY</div>
                  <h1>Your documents</h1>
                  <p className="page-subtitle">Browse, review, and manage your indexed project files.</p>
                </div>
                <button className="primary-button" onClick={() => fileInput.current?.click()}>
                  <Plus size={18} /> Add documents
                </button>
              </section>
              <div className="panel library-panel">
                <DocumentsPanel
                  documents={filtered}
                  loading={loadingDocs}
                  search={search}
                  setSearch={setSearch}
                  onSelect={(doc) => setSelected(doc.id)}
                  onDelete={deleteDocument}
                  onViewAll={() => {}}
                  full
                />
              </div>
              {selectedDoc && (
                <div className="panel detail-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="mini-label">DOCUMENT SUMMARY</span>
                      <h2>{selectedDoc.filename}</h2>
                    </div>
                    <button className="icon-button" onClick={() => setSelected(null)}><X size={18} /></button>
                  </div>
                  <p className="summary-text">{selectedDoc.summary || "No summary is available for this document."}</p>
                  <div className="summary-meta">
                    <span><Database size={15} /> {selectedDoc.chunks || 0} chunks indexed</span>
                    <span><CheckCircle2 size={15} /> {selectedDoc.status}</span>
                  </div>
                  <button className="secondary-button" onClick={() => setPage("AI Assistant")}>
                    Ask about this document <MessageSquare size={16} />
                  </button>
                </div>
              )}
              <input
                ref={fileInput}
                type="file"
                hidden
                multiple
                accept=".pdf,.docx,.txt,.csv,.xlsx,.xls"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
              />
              {files.length > 0 && (
                <div className="panel pending-files">
                  <strong>{files.length} file(s) ready to upload</strong>
                  {files.map((f, i) => <div className="pending-file" key={`${f.name}-${i}`}>{f.name} <small>{formatBytes(f.size)}</small></div>)}
                  <button className="primary-button" disabled={uploading} onClick={uploadFiles}>
                    {uploading ? "Processing..." : "Upload and analyze"}
                  </button>
                </div>
              )}
            </>
          )}

          {page === "Knowledge Base" && (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow"><Database size={14} /> RETRIEVAL & INDEXING</div>
                  <h1>Knowledge base</h1>
                  <p className="page-subtitle">Inspect the status of your vector index and indexed documents.</p>
                </div>
                <button className="secondary-button" onClick={() => { loadDocuments(); loadHealth(); }}>
                  <RefreshCw size={16} /> Refresh index
                </button>
              </section>
              <section className="stats-grid">
                <StatCard icon={Database} label="Indexed chunks" value={totalChunks} note="Across all documents" tone="violet" />
                <StatCard icon={Files} label="Documents" value={documents.length} note="In the workspace" tone="blue" />
                <StatCard icon={Activity} label="API status" value={health?.api_reachable ? "Online" : "Offline"} note="FastAPI service" tone="green" />
                <StatCard icon={Zap} label="Embedding model" value={health?.embedding_model_available ? "Ready" : "Check model"} note="Ollama embeddings" tone="amber" />
              </section>
              <div className="panel knowledge-info">
                <Database size={26} />
                <h2>Persistent vector storage</h2>
                <p>
                  Documents are split into text chunks, converted into embeddings,
                  and stored in ChromaDB. The assistant retrieves relevant chunks
                  to ground its answers in your uploaded content.
                </p>
                <div className="knowledge-row"><span>Vector collection</span><strong>project_documents</strong></div>
                <div className="knowledge-row"><span>Chat model</span><strong>llama3.2:3b</strong></div>
                <div className="knowledge-row"><span>Embedding model</span><strong>nomic-embed-text</strong></div>
              </div>
            </>
          )}

          {page === "AI Assistant" && (
            <>
              <section className="welcome-row chat-title-row">
                <div>
                  <div className="eyebrow"><Sparkles size={14} /> GROUNDED QUESTION ANSWERING</div>
                  <h1>AI Assistant</h1>
                  <p className="page-subtitle">Ask questions and get answers from your indexed documents.</p>
                </div>
                <div className="chat-scope">
                  <label htmlFor="doc-scope">Search scope</label>
                  <select id="doc-scope" value={selected || ""} onChange={(e) => setSelected(e.target.value || null)}>
                    <option value="">All documents</option>
                    {documents.map((doc) => <option value={doc.id} key={doc.id}>{doc.filename}</option>)}
                  </select>
                </div>
              </section>
              <div className="panel chat-panel">
                <div className="chat-panel-heading">
                  <div className="chat-avatar"><Bot size={22} /></div>
                  <div><strong>Project Intelligence Assistant</strong><span><span className="status-dot online" /> Answers grounded in retrieved content</span></div>
                  <button className="secondary-button clear-chat" onClick={() => setMessages([{ role: "assistant", content: "What would you like to know about your uploaded documents?" }])}>New conversation</button>
                </div>
                <div className="chat-messages">
                  {messages.map((msg, index) => (
                    <div className={`message-row ${msg.role}`} key={index}>
                      {msg.role === "assistant" && <div className="message-avatar"><Bot size={18} /></div>}
                      <div className="message-content">
                        <div className="message-bubble">{msg.content}</div>
                        {msg.sources?.length > 0 && (
                          <div className="sources">
                            <strong><Files size={14} /> Sources used</strong>
                            {msg.sources.map((source, i) => (
                              <div className="source-item" key={`${source.filename}-${source.chunk_index}-${i}`}>
                                <FileText size={15} />
                                <span>{source.filename}</span>
                                <small>{source.location}</small>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {asking && <div className="message-row assistant"><div className="message-avatar"><Bot size={18} /></div><div className="message-bubble typing"><span /><span /><span /></div></div>}
                  <div ref={chatEnd} />
                </div>
                <form className="chat-composer" onSubmit={askQuestion}>
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask a question about your project documents..."
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        askQuestion();
                      }
                    }}
                  />
                  <div className="composer-bottom">
                    <span><ShieldCheck size={14} /> Responses are based on retrieved document content</span>
                    <button className="send-button" disabled={asking || !question.trim()}>
                      <Send size={16} /> Send
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, note, tone }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={20} /></div>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-note">{note}</span>
    </div>
  );
}

function DocumentsPanel({
  documents, loading, search, setSearch,
  onSelect, onDelete, onViewAll, full = false,
}) {
  return (
    <section className={`panel documents-panel ${full ? "full-library" : ""}`}>
      <div className="panel-heading documents-heading">
        <div>
          <h2>Recent documents</h2>
          <p>Files processed by your knowledge pipeline.</p>
        </div>
        <div className="document-tools">
          <label className="search-field">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents"
            />
          </label>
          {!full && (
            <button className="text-button" onClick={onViewAll}>
              View all <ChevronRight size={15} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><LoaderCircle className="spin" size={23} /><span>Loading documents...</span></div>
      ) : documents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Files size={24} /></div>
          <strong>No documents found</strong>
          <span>Upload a project file to start building your knowledge base.</span>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="documents-table">
            <thead>
              <tr><th>DOCUMENT</th><th>STATUS</th><th>CHUNKS</th><th>FILE SIZE</th><th>ACTIONS</th></tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <button className="file-cell" onClick={() => onSelect(doc)}>
                      <div className="file-icon"><FileIcon name={doc.filename} /></div>
                      <div><strong>{doc.filename}</strong><span>{doc.file_type || "DOCUMENT"}</span></div>
                    </button>
                  </td>
                  <td><span className={`status-pill ${doc.status === "processed" ? "success" : "pending"}`}><span />{doc.status || "Unknown"}</span></td>
                  <td>{doc.chunks ?? "—"}</td>
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
