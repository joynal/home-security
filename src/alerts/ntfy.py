"""
src/alerts/ntfy.py
──────────────────
Push notifications via ntfy.sh — free, no account needed.
Subscribe on your phone to https://ntfy.sh/<topic> to receive alerts.
"""

import asyncio

import cv2
import httpx
import numpy as np

import src.api.state as state
from src.alerts.base import AlertManager


class NtfyAlert(AlertManager):
    """Send push notifications via ntfy.sh."""

    def __init__(self, topic: str, server: str = "https://ntfy.sh", cooldown_seconds: float = 30.0):
        super().__init__(cooldown_seconds=cooldown_seconds)
        self.topic = topic
        self.server = server
        self.url = f"{server}/{topic}"
        print(f"[NtfyAlert] Initialized — subscribe at: {self.url}")

    def send_alert(self, message: str, image_frame: np.ndarray = None, person_key: str | None = None):
        if state.main_loop is None:
            return
        if self._within_cooldown(person_key):
            return

        if image_frame is not None:
            success, buffer = cv2.imencode(".jpg", image_frame)
            if success:
                asyncio.run_coroutine_threadsafe(
                    self._send_with_image(message, buffer.tobytes()), state.main_loop
                )
                return

        asyncio.run_coroutine_threadsafe(self._send_text(message), state.main_loop)

    async def _send_text(self, message: str):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    self.url,
                    content=message.encode(),
                    headers={
                        "Title": "🚨 Aegis Vision Alert",
                        "Priority": "high",
                        "Tags": "warning,rotating_light",
                    },
                )
        except Exception as e:
            print(f"[NtfyAlert] Failed: {e}")

    async def _send_with_image(self, message: str, image_bytes: bytes):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.put(
                    self.url,
                    content=image_bytes,
                    headers={
                        "Title": "🚨 Aegis Vision Alert",
                        "Filename": "alert.jpg",
                        "Message": message,
                        "Priority": "high",
                        "Tags": "warning,rotating_light",
                    },
                )
        except Exception as e:
            print(f"[NtfyAlert] Failed: {e}")
