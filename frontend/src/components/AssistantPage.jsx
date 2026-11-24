import { useEffect, useRef, useState } from "react";
import { Bot, Files, FileText, Send, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "../api";
import Markdown from "./Markdown";
import { INITIAL_MESSAGES } from "../utils";

const SAMPLE_QUESTIONS = [
  "Are we on track?",
  "What are our biggest risks?",
  "What blockers or pending decisions exist?",
  "What are the key deliverables and timelines?",
  "Who is responsible for the SSO integration?",
];

export default function AssistantPage({ documents, messages, setMessages, draft, setDraft }) {
  const [asking, setAsking] = useState(false);
  const [scope, setScope] = useState("");
  const end = useRef(null);
  const indexed = documents.filter((d) => d.status === "processed");

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, asking]);

  async function ask(text) {
    const content = (text ?? draft).trim();
    if (!content || asking) return;
    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMessages((old) => [...old, { role: "user", content }]);
    setDraft("");
    setAsking(true);
    try {
      const data = await api.chat({ question: content, document_id: scope || null, history });
      setMessages((old) => [...old, { role: "assistant", content: data.answer, sources: data.sources || [] }]);
    } catch (err) {
      setMessages((old) => [
        ...old,
        { role: "assistant", content: `I couldn't retrieve an answer: ${err.message}. Make sure documents are indexed and the AI settings are correct.` },
      ]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <>
      <section className="welcome-row chat-title-row">
        <div>
          <div className="eyebrow"><Sparkles size={14} /> MILESTONE 3 · CONVERSATIONAL ASSISTANT</div>
          <h1>AI Assistant</h1>
          <p className="page-subtitle">Ask about status, risks, blockers and deliverables. Every answer cites its source documents.</p>
        </div>
        <div className="chat-scope">
          <label htmlFor="doc-scope">Search scope</label>
          <select id="doc-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">All project documents</option>
            {indexed.map((d) => <option key={d.id} value={d.id}>{d.filename}</option>)}
          </select>
        </div>
      </section>

      <div className="panel chat-panel">
        <div className="chat-panel-heading">
          <div className="chat-avatar"><Bot size={22} /></div>
          <div><strong>Project Intelligence Assistant</strong><span><span className="status-dot online" /> Answers grounded in retrieved content</span></div>
          <button className="secondary-button clear-chat" onClick={() => setMessages(INITIAL_MESSAGES)}>New conversation</button>
        </div>

        <div className="chat-messages">
          {messages.map((msg, index) => (
            <div className={`message-row ${msg.role}`} key={index}>
              {msg.role === "assistant" && <div className="message-avatar"><Bot size={18} /></div>}
              <div className="message-content">
                <div className="message-bubble">
                  {msg.role === "assistant" ? <Markdown text={msg.content} /> : msg.content}
                </div>
                {msg.sources?.length > 0 && (
                  <div className="sources">
                    <strong><Files size={14} /> Sources used</strong>
                    {msg.sources.map((s, i) => (
                      <div className="source-item" key={`${s.filename}-${s.chunk_index}-${i}`}>
                        <FileText size={15} /><span>{s.filename}</span><small>{s.location}</small>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {asking && (
            <div className="message-row assistant">
              <div className="message-avatar"><Bot size={18} /></div>
              <div className="message-bubble typing"><span /><span /><span /></div>
            </div>
          )}
          <div ref={end} />
        </div>

        <div className="sample-questions">
          {SAMPLE_QUESTIONS.map((q) => (
            <button key={q} type="button" className="chip" disabled={asking || !indexed.length} onClick={() => ask(q)}>{q}</button>
          ))}
        </div>

        <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask a question about your project documents..."
            rows={2}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
          />
          <div className="composer-bottom">
            <span><ShieldCheck size={14} /> Responses are grounded in retrieved document content</span>
            <button className="send-button" disabled={asking || !draft.trim()}><Send size={16} /> Send</button>
          </div>
        </form>
      </div>
    </>
  );
}
