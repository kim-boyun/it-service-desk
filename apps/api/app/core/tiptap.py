import json
import re
from typing import Any

EMPTY_DOC = {"type": "doc", "content": []}


def dump_tiptap(doc: Any) -> str:
    if doc is None:
        return json.dumps(EMPTY_DOC, ensure_ascii=False)
    return json.dumps(doc, ensure_ascii=False)


def _strip_html(raw: str) -> str:
    return re.sub(r"<[^>]*>", "", raw).strip()


def load_tiptap(raw: str | None) -> dict:
    if not raw:
        return dict(EMPTY_DOC)
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass
    text = _strip_html(raw)
    if not text:
        return dict(EMPTY_DOC)
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


def is_empty_doc(doc: Any) -> bool:
    if not isinstance(doc, dict):
        return True
    content = doc.get("content")
    if not isinstance(content, list) or not content:
        return True
    # Look for any non-empty text node.
    def _has_text(node: Any) -> bool:
        if isinstance(node, dict):
            if node.get("type") == "text" and node.get("text"):
                return True
            for child in node.get("content", []) or []:
                if _has_text(child):
                    return True
        elif isinstance(node, list):
            return any(_has_text(n) for n in node)
        return False

    return not _has_text(content)


def extract_image_sources(raw: Any) -> list[str]:
    if raw is None:
        return []
    doc: Any = raw
    if isinstance(raw, str):
        try:
            doc = json.loads(raw)
        except Exception:
            doc = load_tiptap(raw)

    sources: list[str] = []

    def _walk(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "image":
                src = (node.get("attrs") or {}).get("src")
                if isinstance(src, str) and src:
                    sources.append(src)
            for child in node.get("content") or []:
                _walk(child)
        elif isinstance(node, list):
            for child in node:
                _walk(child)

    _walk(doc)
    return sources


def rewrite_image_sources(doc: Any, *, rewrite_src: callable) -> Any:
    """
    Tiptap doc 내 image node attrs.src를 rewrite_src(src)->new_src 로 치환.
    rewrite_src가 None을 반환하면 변경하지 않음.
    """
    if doc is None:
        return doc

    def _walk(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "image":
                attrs = node.get("attrs") or {}
                src = attrs.get("src")
                if isinstance(src, str) and src:
                    next_src = rewrite_src(src)
                    if isinstance(next_src, str) and next_src and next_src != src:
                        attrs = dict(attrs)
                        attrs["src"] = next_src
                        node["attrs"] = attrs
            for child in node.get("content") or []:
                _walk(child)
        elif isinstance(node, list):
            for child in node:
                _walk(child)

    _walk(doc)
    return doc
