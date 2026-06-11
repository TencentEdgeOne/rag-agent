import { useState, useRef, useEffect, useCallback } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sendMessageStream, fetchConversationHistory, stopAgent } from "../api";
import CitationCard from "./CitationCard";
import { useT } from "../i18n";
import "./RagChat.css";

const CONVERSATION_ID_KEY = "rag_conversation_id";

/**
 * Some LLMs (especially fast/streaming tiers) emit Markdown tables as a
 * single squashed line — the `|` row boundaries arrive without the line
 * breaks GFM needs to recognise the block as a table. Result: react-markdown
 * just renders pipes as plain text.
 *
 * The two helpers below split a "| ... | | --- | --- | | a | b |" line back
 * into one row per line — but only when the second logical row is the
 * `| --- | --- |` separator (so this can't fire on prose that happens to
 * contain a pipe). Code fences are passed through verbatim so we don't
 * mangle inline shell snippets like `ls | grep foo`.
 */
const TABLE_ROW_BOUNDARY = /\|\s+\|/g;
const TABLE_SEPARATOR_ROW = /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function normalizeCompactTableLine(line: string): string {
  if (!line.includes("| |")) return line;

  const pipeIndexes = [...line.matchAll(/\|/g)]
    .map((match) => match.index ?? -1)
    .filter((index) => index >= 0);

  for (const index of pipeIndexes) {
    const table = line.slice(index);
    const normalizedTable = table.replace(TABLE_ROW_BOUNDARY, "|\n|");
    const rows = normalizedTable
      .split("\n")
      .map((row) => row.trim())
      .filter(Boolean);

    if (rows.length >= 2 && TABLE_SEPARATOR_ROW.test(rows[1])) {
      const prefix = line.slice(0, index).trimEnd();
      return prefix ? `${prefix}\n${normalizedTable}` : normalizedTable;
    }
  }

  return line;
}

function normalizeMarkdown(content: string): string {
  let inCodeFence = false;

  return content
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inCodeFence = !inCodeFence;
        return line;
      }

      return inCodeFence ? line : normalizeCompactTableLine(line);
    })
    .join("\n");
}

function getExistingConversationId() {
  return localStorage.getItem(CONVERSATION_ID_KEY);
}

function getOrCreateConversationId() {
  const cached = getExistingConversationId();
  if (cached) return cached;
  const id = crypto.randomUUID();
  localStorage.setItem(CONVERSATION_ID_KEY, id);
  return id;
}

// Module-level dedup flag — outside React lifecycle, unaffected by StrictMode
let _historyFetchInFlight = false;

export default function RagChat() {
  const { t } = useT();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle"); // idle | streaming
  const [error, setError] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const abortCtrlRef = useRef(null);
  const conversationIdRef = useRef(getOrCreateConversationId());
  const currentMsgIdRef = useRef("");

  // Load history on mount
  useEffect(() => {
    // First visit: no existing conversation → skip history fetch for instant load
    if (!getExistingConversationId()) {
      setHistoryLoading(false);
      return;
    }

    if (_historyFetchInFlight) return;
    _historyFetchInFlight = true;

    fetchConversationHistory(conversationIdRef.current)
      .then((history) => {
        if (history.length > 0) {
          // Convert flat history messages to parts format
          const converted = history.map((h) => ({
            id: h.id,
            role: h.role,
            parts: [{ type: "text", text: h.content }],
            timestamp: h.timestamp,
          }));
          setMessages(converted);
        }
      })
      .finally(() => {
        _historyFetchInFlight = false;
        setHistoryLoading(false);
      });
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, status]);

  const handleSend = useCallback(
    (text) => {
      const trimmed = (text || input).trim();
      if (!trimmed) return;
      setInput("");
      setError(null);

      // Create user message
      const userMsg = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: trimmed }],
        timestamp: Date.now(),
      };

      // Create placeholder assistant message
      const botMsgId = crypto.randomUUID();
      currentMsgIdRef.current = botMsgId;
      const botMsg = {
        id: botMsgId,
        role: "assistant",
        parts: [],
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg, botMsg]);
      setStatus("streaming");

      const ctrl = sendMessageStream(
        trimmed,
        {
          onTextDelta(delta) {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== currentMsgIdRef.current) return m;
                const parts = [...m.parts];
                // Find or create the text part
                const lastPart = parts[parts.length - 1];
                if (lastPart && lastPart.type === "text") {
                  parts[parts.length - 1] = {
                    ...lastPart,
                    text: lastPart.text + delta,
                  };
                } else {
                  parts.push({ type: "text", text: delta });
                }
                return { ...m, parts };
              })
            );
          },

          onToolInput(toolCallId, toolName, inputData) {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== currentMsgIdRef.current) return m;
                return {
                  ...m,
                  parts: [
                    ...m.parts,
                    {
                      type: `tool-${toolName}`,
                      toolCallId,
                      toolName,
                      input: inputData,
                      state: "input-available",
                    },
                  ],
                };
              })
            );
          },

          onToolOutput(toolCallId, output) {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== currentMsgIdRef.current) return m;
                // Find matching tool-input part and update its state, or add new part
                const parts = m.parts.map((p) => {
                  if (p.toolCallId === toolCallId && p.state === "input-available") {
                    return { ...p, output, state: "output-available" };
                  }
                  return p;
                });
                return { ...m, parts };
              })
            );
          },

          onFinish(stopped) {
            setStatus("idle");
            abortCtrlRef.current = null;
            if (stopped) {
              // Add stopped indicator to the message
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== currentMsgIdRef.current) return m;
                  const parts = [...m.parts];
                  const lastPart = parts[parts.length - 1];
                  if (lastPart && lastPart.type === "text") {
                    parts[parts.length - 1] = {
                      ...lastPart,
                      text: lastPart.text + "\n\n" + t("chat.stopped"),
                    };
                  }
                  return { ...m, parts };
                })
              );
            }
          },

          onError(err) {
            setError(err);
            setStatus("idle");
            abortCtrlRef.current = null;
            // Set error message in bot placeholder
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== currentMsgIdRef.current) return m;
                if (m.parts.length === 0 || getTextContent(m.parts) === "") {
                  return {
                    ...m,
                    parts: [{ type: "text", text: t("chat.error") }],
                  };
                }
                return m;
              })
            );
          },
        },
        conversationIdRef.current
      );

      abortCtrlRef.current = ctrl;
    },
    [input]
  );

  const handleStop = useCallback(() => {
    // 1. Immediately abort frontend SSE read
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }

    // 2. Optimistic UI update
    setStatus("idle");
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== currentMsgIdRef.current) return m;
        const parts = [...m.parts];
        const lastPart = parts[parts.length - 1];
        if (lastPart && lastPart.type === "text") {
          parts[parts.length - 1] = {
            ...lastPart,
            text: (lastPart.text || "") + "\n\n" + t("chat.stopped"),
          };
        } else if (parts.length === 0) {
          parts.push({ type: "text", text: t("chat.stopped") });
        }
        return { ...m, parts };
      })
    );

    // 3. Backend abort async
    stopAgent(conversationIdRef.current);
  }, []);

  const handleClear = useCallback(() => {
    // Reset conversation — new UUID
    localStorage.removeItem(CONVERSATION_ID_KEY);
    const newId = crypto.randomUUID();
    localStorage.setItem(CONVERSATION_ID_KEY, newId);
    conversationIdRef.current = newId;
    setMessages([]);
    setError(null);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePreset = (question) => {
    setInput("");
    handleSend(question);
  };

  const isStreaming = status === "streaming";

  // Extract citations from assistant message parts
  const extractCitations = (parts) => {
    if (!parts) return [];
    return parts
      .filter(
        (part) =>
          part.type &&
          part.type.startsWith("tool-") &&
          part.state === "output-available"
      )
      .filter((part) => {
        const toolName = part.type.slice("tool-".length);
        return toolName === "fetchPages";
      })
      .map((part) => part.output);
  };

  return (
    <div className="rag-chat">
      <div className="chat-header">
        <div className="chat-header-left">
          <div className="chat-indicator" />
          <span className="chat-title">{t("chat.title")}</span>
        </div>
        {messages.length > 0 && (
          <button className="chat-clear-btn" onClick={handleClear}>
            {t("chat.newSession")}
          </button>
        )}
      </div>

      <div className="chat-messages" ref={messagesContainerRef}>
        {historyLoading && messages.length === 0 && (
          <div className="chat-empty">
            <div className="streaming-dots">
              <span />
              <span />
              <span />
            </div>
            <p className="chat-empty-desc" style={{ marginTop: 16 }}>
              {t("chat.loadingHistory")}
            </p>
          </div>
        )}

        {!historyLoading && messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <p className="chat-empty-title">{t("chat.emptyTitle")}</p>
            <p className="chat-empty-desc">
              {t("chat.emptyDesc")}
            </p>
            <div className="preset-chips">
              {[t("preset.1"), t("preset.2")].map((q) => (
                <button
                  key={q}
                  className="preset-chip"
                  onClick={() => handlePreset(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message chat-message--${msg.role}`}>
            <div className="message-role-tag">
              {msg.role === "user" ? t("chat.you") : t("chat.agent")}
            </div>
            <div className="message-content">
              {msg.role === "assistant" ? (
                <Markdown remarkPlugins={[remarkGfm]}>{normalizeMarkdown(getTextContent(msg.parts))}</Markdown>
              ) : (
                getTextContent(msg.parts)
              )}
            </div>
            {msg.role === "assistant" &&
              extractCitations(msg.parts).map((citation, idx) => (
                <CitationCard
                  key={idx}
                  docName={citation.docName}
                  docId={citation.docId}
                  pages={citation.pages}
                  pageCount={citation.pageCount}
                  totalChars={citation.totalChars}
                  content={citation.content}
                />
              ))}
          </div>
        ))}

        {isStreaming && (
          <div className="streaming-indicator">
            <div className="streaming-dots">
              <span />
              <span />
              <span />
            </div>
            <span className="streaming-text">{t("chat.streaming")}</span>
            <button className="stop-btn" onClick={handleStop}>
              {t("chat.stop")}
            </button>
          </div>
        )}

        {error && (
          <div className="chat-error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span>{error.message || "An error occurred"}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {messages.length > 0 && (
        <div className="preset-chips preset-chips--inline">
          {[t("preset.1"), t("preset.2")].map((q) => (
            <button
              key={q}
              className="preset-chip preset-chip--small"
              onClick={() => handlePreset(q)}
              disabled={isStreaming}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input-bar">
        <input
          type="text"
          className="chat-input"
          placeholder={t("chat.placeholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
        />
        <button
          className="chat-send-btn"
          onClick={() => handleSend()}
          disabled={!input.trim() || isStreaming}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
        <button
          className="chat-clear-circle-btn"
          onClick={handleClear}
          disabled={isStreaming}
          title={t("aria.clearConversation")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Get text content from message parts
function getTextContent(parts) {
  if (!parts) return "";
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}
