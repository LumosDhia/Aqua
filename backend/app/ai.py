"""Helper for every AI feature. Requests go to a language model served on our GPU server (gpu.mavubo.com)
through its OpenAI compatible API (Ollama or vLLM): POST {LLM_API_URL}/chat/completions.

Every feature that uses this also works without it: `configured()` tells the UI whether to offer the helper.
"""
import json

import httpx

from .config import settings


class AiUnavailable(Exception):
    pass


def configured() -> bool:
    return bool(settings.llm_api_url)


def inline_refs(schema: dict) -> dict:
    """Copy each #/$defs/... definition into place and close every object, so any model server can follow the schema."""
    defs: dict = {}

    def collect(node):
        if isinstance(node, dict):
            defs.update(node.get("$defs", {}))
            for v in node.values():
                collect(v)
        elif isinstance(node, list):
            for v in node:
                collect(v)

    collect(schema)

    def walk(node, seen=()):
        if isinstance(node, dict):
            ref = node.get("$ref")
            if isinstance(ref, str) and ref.startswith("#/$defs/"):
                name = ref.rsplit("/", 1)[-1]
                if name in defs and name not in seen:
                    return walk(defs[name], seen + (name,))
                return {"type": "object"}
            out = {k: walk(v, seen) for k, v in node.items() if k != "$defs"}
            if out.get("type") == "object" and "properties" in out and "additionalProperties" not in out:
                out["additionalProperties"] = False      # only the declared fields, so the model cannot rename them
            return out
        if isinstance(node, list):
            return [walk(v, seen) for v in node]
        return node

    return walk(schema)


def _parts(content: list[dict]) -> str | list[dict]:
    """Turn the feature's content blocks into OpenAI chat parts: text, images and PDFs."""
    parts: list[dict] = []
    for b in content:
        if b.get("type") == "text":
            parts.append({"type": "text", "text": str(b.get("text", ""))})
        elif b.get("type") in ("image", "document") and isinstance(b.get("source"), dict):
            media, data = b["source"].get("media_type", ""), b["source"].get("data", "")
            uri = f"data:{media};base64,{data}"
            if media == "application/pdf":
                parts.append({"type": "file", "file": {"filename": "document.pdf", "file_data": uri}})
            else:
                parts.append({"type": "image_url", "image_url": {"url": uri}})
    if all(p["type"] == "text" for p in parts):
        return "\n\n".join(p["text"] for p in parts)
    return parts


def call_tool(system: str, content: list[dict], tool: dict, max_tokens: int = 2000) -> dict:
    """Ask the model to answer in the shape of `tool`'s input schema. Returns that object."""
    if not configured():
        raise AiUnavailable("The AI helper is not switched on yet")
    headers = {"Authorization": f"Bearer {settings.llm_api_key}"} if settings.llm_api_key else {}
    body = {
        "model": settings.llm_model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": _parts(content)}],
        "max_tokens": max_tokens,
        "temperature": 0.2,
        "response_format": {"type": "json_schema", "json_schema": {
            "name": tool.get("name", "answer"), "strict": True, "schema": inline_refs(tool["input_schema"])}},
    }
    try:
        r = httpx.post(f"{settings.llm_api_url.rstrip('/')}/chat/completions", headers=headers, json=body, timeout=180)
    except httpx.HTTPError:
        raise AiUnavailable("The AI helper is not reachable right now. Check the GPU server.")
    if r.status_code in (429, 503):
        raise AiUnavailable("The AI helper is busy, try again in a moment")
    if r.status_code != 200:
        raise AiUnavailable("The AI helper could not answer")
    try:
        data = json.loads(r.json()["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError, ValueError):
        raise AiUnavailable("The AI helper gave no answer")
    if not isinstance(data, dict):
        raise AiUnavailable("The AI helper gave no answer")
    return data
