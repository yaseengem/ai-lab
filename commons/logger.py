"""Custom logger with millisecond timestamps."""
from __future__ import annotations
import logging
import sys

_FORMAT = "%(asctime)s.%(msecs)03d [%(levelname)-5s] %(name)s - %(message)s"
_DATE_FORMAT = "%H:%M:%S"
_configured = False


def setup_logging(level: int = logging.INFO) -> None:
    global _configured
    if _configured:
        return
    if getattr(sys.stdout, "encoding", "utf-8").lower() != "utf-8":
        sys.stdout = open(sys.stdout.fileno(), mode="w", encoding="utf-8", buffering=1, closefd=False)
    if getattr(sys.stderr, "encoding", "utf-8").lower() != "utf-8":
        sys.stderr = open(sys.stderr.fileno(), mode="w", encoding="utf-8", buffering=1, closefd=False)
    stream = open(sys.stdout.fileno(), mode="w", encoding="utf-8", buffering=1, closefd=False)
    handler = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter(_FORMAT, datefmt=_DATE_FORMAT))
    root = logging.getLogger()
    root.setLevel(level)
    root.addHandler(handler)
    _configured = True


def get_logger(name: str) -> logging.Logger:
    setup_logging()
    return logging.getLogger(name)
