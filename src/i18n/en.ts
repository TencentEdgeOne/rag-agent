const en = {
  // App header
  "app.title": "Enterprise RAG Agent",
  "app.subtitle": "Traceable Q&A powered by enterprise knowledge base",

  // Knowledge Base Summary
  "kb.title": "Knowledge Base",
  "kb.documents": "Documents",
  "kb.pages": "Pages",
  "kb.dataSize": "Data Size",
  "kb.indexed": "Indexed",
  "kb.entries": "entries",
  "kb.retry": "Retry",

  // RagChat
  "chat.title": "Knowledge Query",
  "chat.newSession": "New Session",
  "chat.loadingHistory": "Loading conversation history...",
  "chat.emptyTitle": "Ask about your knowledge base",
  "chat.emptyDesc": "Query documents with full citation traceability",
  "chat.placeholder": "Ask a question about your documents...",
  "chat.streaming": "Retrieving & generating...",
  "chat.stop": "Stop",
  "chat.you": "You",
  "chat.agent": "Agent",
  "chat.error": "Request failed. Please check if the backend service is running.",
  "chat.stopped": "⏹ *Generation stopped*",

  // Preset questions
  "preset.1": "What is context.store provided by EdgeOne Makers?",
  "preset.2": "What are EdgeOne Makers' file-based routing rules?",

  // Citation
  "citation.badge": "VERIFIED SOURCE",
  "citation.id": "ID:",
  "citation.range": "Range:",
  "citation.chars": "Chars:",
  "citation.page": "Page",
  "citation.expand": "Expand",
  "citation.collapse": "Collapse",
  "citation.unknownDoc": "Unknown Document",

  // Aria labels (button hover/screen-reader)
  "aria.refreshStats": "Refresh stats",
  "aria.clearConversation": "Clear conversation",
  "aria.copyContent": "Copy content",

  // Language toggle
  "lang.switch": "中文",
} as const;

export default en;
