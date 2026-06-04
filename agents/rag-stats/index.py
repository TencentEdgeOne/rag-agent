"""POST /rag-stats - Knowledge base statistics.

EdgeOne agents/ runtime is POST-only (the platform rejects GET at the
routing layer with 400 before this handler is invoked). The frontend
(`src/components/KnowledgeBaseSummary.tsx`) calls this with method:'POST'
and an empty body — the body is unused; it's purely for the platform
contract.
"""

from typing import Any

from .._loader import get_rag_index
from .._logger import create_logger

logger = create_logger("rag-stats")


async def handler(context: Any):
    """Return RAG knowledge base statistics."""
    try:
        idx = get_rag_index()
        docs = idx.get("documents", []) if idx else []

        total_bytes = sum(d.get("totalBytes", 0) for d in docs)
        total_entries = sum(
            1 + (1 if d.get("hasStructure") else 0) + d.get("pages", 0)
            for d in docs
        )

        body = {
            "total": total_entries,
            "totalBytes": total_bytes,
            "documents": [
                {
                    "docId": d.get("docId", ""),
                    "meta": 1,
                    "structure": 1 if d.get("hasStructure") else 0,
                    "pages": d.get("pages", 0),
                    "total": 1 + (1 if d.get("hasStructure") else 0) + d.get("pages", 0),
                    "metaBytes": d.get("metaBytes", 0),
                    "structureBytes": d.get("structureBytes", 0),
                    "pageBytes": d.get("pageBytes", 0),
                    "totalBytes": d.get("totalBytes", 0),
                }
                for d in docs
            ],
        }

        logger.log(f"Returning stats: {len(docs)} docs, {total_entries} entries")
        return body

    except Exception as e:
        logger.error(f"Failed to get RAG stats: {e}")
        return {"error": str(e)}
