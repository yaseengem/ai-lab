"""
Amazon Nova Sonic voice loop for agent5.

Nova Sonic is a real-time speech-to-speech model reached over the Bedrock
**bidirectional** stream (HTTP/2). Unlike the text path it is NOT driven through
Strands — this module owns the event protocol directly and acts as the *supervisor*
that, on a Sonic `toolUse` event, dispatches into the same tool layer the text chat
uses (knowledge / sales / scheduling), then streams the result back so Sonic can speak.

Transport (see apis/routes.py `WS /voice/{session_id}`):
    browser mic ──16 kHz PCM, base64──▶ WS ──▶ SonicSession ──▶ Bedrock bidi stream
    browser speaker ◀──24 kHz PCM, base64── WS ◀── SonicSession ◀── Bedrock

The bidirectional client ships in AWS's experimental ``aws-sdk-bedrock-runtime``
package. It is imported lazily and guarded: if it (or AWS credentials) is missing,
``available()`` is False and the WS endpoint tells the client to use text instead — the
rest of the agent is unaffected.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator

from commons.logger import get_logger

from . import knowledge
from .model import resolve_region, resolve_sonic_model_id

logger = get_logger(__name__)

# 16 kHz mono PCM in, 24 kHz mono PCM out — Nova Sonic's standard audio config.
INPUT_SAMPLE_RATE = 16000
OUTPUT_SAMPLE_RATE = 24000
DEFAULT_VOICE_ID = "matthew"


# ── tool specs advertised to Nova Sonic on promptStart ────────────────────────

TOOL_SPECS = [
    {
        "toolSpec": {
            "name": "search_trianz_knowledge",
            "description": "Search Trianz's knowledge base for facts about offerings, the "
                           "Concierto platform, services, SI work, or industries.",
            "inputSchema": {"json": json.dumps({
                "type": "object",
                "properties": {"query": {"type": "string", "description": "The question or topic."}},
                "required": ["query"],
            })},
        }
    },
    {
        "toolSpec": {
            "name": "recommend_offering",
            "description": "Recommend the right Trianz offering for a stated business need.",
            "inputSchema": {"json": json.dumps({
                "type": "object",
                "properties": {"need": {"type": "string", "description": "The visitor's goal/problem."}},
                "required": ["need"],
            })},
        }
    },
    {
        "toolSpec": {
            "name": "capture_lead",
            "description": "Capture a qualified sales lead once the visitor expresses interest.",
            "inputSchema": {"json": json.dumps({
                "type": "object",
                "properties": {
                    "email": {"type": "string"},
                    "name": {"type": "string"},
                    "company": {"type": "string"},
                    "interest": {"type": "string"},
                    "notes": {"type": "string"},
                },
                "required": ["email"],
            })},
        }
    },
    {
        "toolSpec": {
            "name": "request_human_meeting",
            "description": "Book a conversation with a Trianz human and email the visitor a "
                           "calendar invite.",
            "inputSchema": {"json": json.dumps({
                "type": "object",
                "properties": {
                    "email": {"type": "string"},
                    "name": {"type": "string"},
                    "topic": {"type": "string"},
                    "preferred_time": {"type": "string"},
                    "notes": {"type": "string"},
                },
                "required": ["email"],
            })},
        }
    },
]


def available() -> tuple[bool, str]:
    """Return (ok, detail): whether the bidirectional Sonic SDK can be imported."""
    try:
        import aws_sdk_bedrock_runtime  # noqa: F401
        return True, "aws-sdk-bedrock-runtime present"
    except Exception as exc:  # ImportError or transitive failure
        return False, f"voice backend unavailable: {exc}"


# ── tool dispatch (Sonic toolUse → shared tool layer) ─────────────────────────

async def dispatch_tool(name: str, tool_input: dict, *, default_email: str = "") -> str:
    """Run a Sonic tool call against the shared tool layer; return a JSON string result."""
    tool_input = tool_input or {}
    if default_email and not tool_input.get("email"):
        tool_input["email"] = default_email

    def _run() -> str:
        if name == "search_trianz_knowledge":
            results = knowledge.search(tool_input.get("query", ""), int(tool_input.get("k", 4)))
            return json.dumps({"count": len(results), "results": results}, ensure_ascii=False)
        if name == "recommend_offering":
            from .sales_agent import recommend_offering
            return _as_text(recommend_offering(need=tool_input.get("need", "")))
        if name == "capture_lead":
            from .sales_agent import capture_lead
            return _as_text(capture_lead(
                email=tool_input.get("email", ""), name=tool_input.get("name", ""),
                company=tool_input.get("company", ""), interest=tool_input.get("interest", ""),
                notes=tool_input.get("notes", "")))
        if name == "request_human_meeting":
            from .scheduling_agent import request_human_meeting
            return _as_text(request_human_meeting(
                email=tool_input.get("email", ""), name=tool_input.get("name", ""),
                topic=tool_input.get("topic", ""), preferred_time=tool_input.get("preferred_time", ""),
                notes=tool_input.get("notes", "")))
        return json.dumps({"error": f"unknown tool '{name}'"})

    # Tools touch the filesystem / SES; run off the event loop.
    return await asyncio.to_thread(_run)


def _as_text(result) -> str:
    """Strands @tool callables may return a dict or a string — normalise to a JSON string."""
    if isinstance(result, str):
        return result
    try:
        return json.dumps(result, ensure_ascii=False)
    except TypeError:
        return str(result)


# ── the bidirectional session ─────────────────────────────────────────────────

class SonicSession:
    """
    One live Nova Sonic conversation. Lifecycle:
        start() → (send_audio()/send_text() while reading events()) → close()

    `events()` is an async generator of normalised dicts the WS forwards to the browser:
        {"type": "ready"}
        {"type": "transcript", "role": "user"|"assistant", "text": "..."}
        {"type": "audio", "audio": "<base64 24kHz pcm>"}
        {"type": "tool", "name": "...", "status": "running"|"done"}
        {"type": "error", "message": "..."}
        {"type": "done"}
    """

    def __init__(self, *, system_prompt: str, visitor_email: str = "", voice_id: str = DEFAULT_VOICE_ID):
        self.system_prompt = system_prompt
        self.visitor_email = visitor_email
        self.voice_id = voice_id
        self.prompt_name = uuid.uuid4().hex
        self.audio_content_name = uuid.uuid4().hex
        self._stream = None
        self._client = None
        self._active = False
        self._out: asyncio.Queue = asyncio.Queue()

    # -- low-level send ---------------------------------------------------------

    async def _send_event(self, payload: dict) -> None:
        from aws_sdk_bedrock_runtime.models import (
            InvokeModelWithBidirectionalStreamInputChunk,
            BidirectionalInputPayloadPart,
        )
        data = json.dumps(payload).encode("utf-8")
        chunk = InvokeModelWithBidirectionalStreamInputChunk(
            value=BidirectionalInputPayloadPart(bytes_=data)
        )
        await self._stream.input_stream.send(chunk)

    async def start(self) -> None:
        """Open the bidirectional stream and send session/prompt initialisation events."""
        from aws_sdk_bedrock_runtime.client import (
            BedrockRuntimeClient, InvokeModelWithBidirectionalStreamOperationInput,
        )
        from aws_sdk_bedrock_runtime.config import Config as BRConfig
        from smithy_aws_core.identity.environment import EnvironmentCredentialsResolver

        region = resolve_region()
        model_id = resolve_sonic_model_id()
        config = BRConfig(
            endpoint_uri=f"https://bedrock-runtime.{region}.amazonaws.com",
            region=region,
            aws_credentials_identity_resolver=EnvironmentCredentialsResolver(),
        )
        self._client = BedrockRuntimeClient(config=config)
        self._stream = await self._client.invoke_model_with_bidirectional_stream(
            InvokeModelWithBidirectionalStreamOperationInput(model_id=model_id)
        )
        self._active = True

        session_start: dict = {"inferenceConfiguration": {
            "maxTokens": 1024, "topP": 0.9, "temperature": 0.7}}
        # Turn-taking control is a Nova 2 Sonic feature. HIGH makes the model switch to
        # listening (and emit the barge-in interruption signal) as soon as the user speaks
        # over it. Only send it for Nova 2 — v1 has no such field — so switching the model
        # id in config stays seamless in both directions.
        if "nova-2-sonic" in model_id:
            session_start["turnDetectionConfiguration"] = {"endpointingSensitivity": "HIGH"}
        await self._send_event({"event": {"sessionStart": session_start}})
        await self._send_event({"event": {"promptStart": {
            "promptName": self.prompt_name,
            "textOutputConfiguration": {"mediaType": "text/plain"},
            "audioOutputConfiguration": {
                "mediaType": "audio/lpcm", "sampleRateHertz": OUTPUT_SAMPLE_RATE,
                "sampleSizeBits": 16, "channelCount": 1, "voiceId": self.voice_id,
                "encoding": "base64", "audioType": "SPEECH",
            },
            "toolUseOutputConfiguration": {"mediaType": "application/json"},
            "toolConfiguration": {"tools": TOOL_SPECS},
        }}})
        await self._send_system_text(self.system_prompt)

        asyncio.create_task(self._read_loop())
        await self._out.put({"type": "ready"})
        logger.info("[SONIC] session_started  model=%s region=%s", model_id, region)

    async def _send_system_text(self, text: str) -> None:
        """Send the system prompt as a SYSTEM text content block."""
        cname = uuid.uuid4().hex
        await self._send_event({"event": {"contentStart": {
            "promptName": self.prompt_name, "contentName": cname, "type": "TEXT",
            "interactive": True, "role": "SYSTEM",
            "textInputConfiguration": {"mediaType": "text/plain"},
        }}})
        await self._send_event({"event": {"textInput": {
            "promptName": self.prompt_name, "contentName": cname, "content": text}}})
        await self._send_event({"event": {"contentEnd": {
            "promptName": self.prompt_name, "contentName": cname}}})

    # -- audio input ------------------------------------------------------------

    async def begin_audio(self) -> None:
        await self._send_event({"event": {"contentStart": {
            "promptName": self.prompt_name, "contentName": self.audio_content_name,
            "type": "AUDIO", "interactive": True, "role": "USER",
            "audioInputConfiguration": {
                "mediaType": "audio/lpcm", "sampleRateHertz": INPUT_SAMPLE_RATE,
                "sampleSizeBits": 16, "channelCount": 1, "audioType": "SPEECH", "encoding": "base64",
            },
        }}})

    async def send_audio(self, audio_b64: str) -> None:
        if not self._active:
            return
        await self._send_event({"event": {"audioInput": {
            "promptName": self.prompt_name, "contentName": self.audio_content_name,
            "content": audio_b64}}})

    async def end_audio(self) -> None:
        await self._send_event({"event": {"contentEnd": {
            "promptName": self.prompt_name, "contentName": self.audio_content_name}}})

    # -- tool result ------------------------------------------------------------

    async def _send_tool_result(self, tool_use_id: str, result_json: str) -> None:
        cname = uuid.uuid4().hex
        await self._send_event({"event": {"contentStart": {
            "promptName": self.prompt_name, "contentName": cname, "type": "TOOL",
            "interactive": False, "role": "TOOL",
            "toolResultInputConfiguration": {"toolUseId": tool_use_id, "type": "TEXT",
                                             "textInputConfiguration": {"mediaType": "text/plain"}},
        }}})
        await self._send_event({"event": {"toolResult": {
            "promptName": self.prompt_name, "contentName": cname, "content": result_json}}})
        await self._send_event({"event": {"contentEnd": {
            "promptName": self.prompt_name, "contentName": cname}}})

    # -- output read loop -------------------------------------------------------

    async def _read_loop(self) -> None:
        """Pump Bedrock output events into the normalised queue; dispatch tool calls."""
        pending_tool: dict | None = None
        try:
            while self._active:
                output = await self._stream.await_output()
                result = await output[1].receive()
                if result.value is None or result.value.bytes_ is None:
                    continue
                event = json.loads(result.value.bytes_.decode("utf-8")).get("event", {})

                if "textOutput" in event:
                    to = event["textOutput"]
                    role = (to.get("role") or "ASSISTANT").lower()
                    content = to.get("content", "")
                    # Nova Sonic signals a barge-in by emitting a textOutput whose content
                    # is the marker {"interrupted": true}. Forward it as an interruption so
                    # the browser flushes any AI audio still queued for playback — instead
                    # of letting the (now-stale) turn play out to the end.
                    if '"interrupted"' in content and "true" in content:
                        logger.info("[SONIC] barge_in_detected  via=textOutput_marker")
                        await self._out.put({"type": "interrupted"})
                    else:
                        await self._out.put({"type": "transcript", "role": role, "text": content})
                elif "audioOutput" in event:
                    await self._out.put({"type": "audio", "audio": event["audioOutput"].get("content", "")})
                elif "toolUse" in event:
                    pending_tool = {
                        "toolUseId": event["toolUse"].get("toolUseId"),
                        "name": event["toolUse"].get("toolName"),
                        "input": event["toolUse"].get("content"),
                    }
                elif "contentEnd" in event:
                    ce = event["contentEnd"]
                    # A turn cut short by the user (barge-in) ends with stopReason INTERRUPTED.
                    if ce.get("stopReason") == "INTERRUPTED":
                        logger.info("[SONIC] barge_in_detected  via=contentEnd_INTERRUPTED type=%s",
                                    ce.get("type"))
                        await self._out.put({"type": "interrupted"})
                    elif ce.get("type") == "TOOL" and pending_tool:
                        await self._handle_tool(pending_tool)
                        pending_tool = None
                elif "completionEnd" in event:
                    await self._out.put({"type": "done"})
        except Exception as exc:  # pragma: no cover - depends on live AWS
            logger.error("[SONIC] read_loop_error  %s", exc)
            await self._out.put({"type": "error", "message": str(exc)})
        finally:
            await self._out.put({"type": "done"})

    async def _handle_tool(self, tool: dict) -> None:
        name = tool.get("name", "")
        raw = tool.get("input")
        try:
            tool_input = json.loads(raw) if isinstance(raw, str) else (raw or {})
        except json.JSONDecodeError:
            tool_input = {}
        await self._out.put({"type": "tool", "name": name, "status": "running"})
        result_json = await dispatch_tool(name, tool_input, default_email=self.visitor_email)
        await self._send_tool_result(tool.get("toolUseId", ""), result_json)
        await self._out.put({"type": "tool", "name": name, "status": "done"})

    async def events(self) -> AsyncIterator[dict]:
        while True:
            event = await self._out.get()
            yield event
            if event.get("type") == "done":
                break

    async def close(self) -> None:
        if not self._active:
            return
        self._active = False
        try:
            await self._send_event({"event": {"promptEnd": {"promptName": self.prompt_name}}})
            await self._send_event({"event": {"sessionEnd": {}}})
            await self._stream.input_stream.close()
        except Exception as exc:  # pragma: no cover
            logger.warning("[SONIC] close_error  %s", exc)
        logger.info("[SONIC] session_closed")
