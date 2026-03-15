import asyncio
import io
import time

import cv2
import httpx
import numpy as np

import src.api.state as state
from src.alerts.base import AlertManager


class TelegramAlert(AlertManager):
    """
    Sends alerts to a Telegram chat using async HTTP requests on the main event loop.
    Includes a cooldown mechanism to prevent spam.
    """

    def __init__(self, bot_token: str, chat_id: str, cooldown_seconds: float = 5.0):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.cooldown_seconds = cooldown_seconds
        self.last_alert_time = 0.0
        self.api_url = f"https://api.telegram.org/bot{self.bot_token}"

        if not self.bot_token or not self.chat_id:
            print("[Warning] TelegramAlert initialized without bot token or chat ID.")
        else:
            print(f"TelegramAlert initialized (Cooldown: {cooldown_seconds}s)")

    def send_alert(self, message: str, image_frame: np.ndarray = None):
        if not self.bot_token or not self.chat_id or state.main_loop is None:
            return

        current_time = time.time()
        if (current_time - self.last_alert_time) < self.cooldown_seconds:
            # Still in cooldown phase, skip alerting
            return

        self.last_alert_time = current_time

        if image_frame is not None:
            # Encode frame to JPEG in memory
            success, buffer = cv2.imencode(".jpg", image_frame)
            if success:
                photo_bytes = buffer.tobytes()
                # Schedule the async POST on the main FastAPI event loop
                asyncio.run_coroutine_threadsafe(
                    self._send_photo_async(message, photo_bytes),
                    state.main_loop
                )
            else:
                asyncio.run_coroutine_threadsafe(
                    self._send_text_async(message),
                    state.main_loop
                )
        else:
            asyncio.run_coroutine_threadsafe(
                self._send_text_async(message),
                state.main_loop
            )

    async def _send_photo_async(self, caption: str, photo_bytes: bytes):
        try:
            url = f"{self.api_url}/sendPhoto"
            files = {"photo": ("alert.jpg", photo_bytes, "image/jpeg")}
            data = {"chat_id": self.chat_id, "caption": caption}
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, data=data, files=files)
                response.raise_for_status()
            print(f"[TelegramAlert] Sent photo alert: {caption}")
        except Exception as e:
            print(f"[TelegramAlert] Failed to send photo: {e}")

    async def _send_text_async(self, text: str):
        try:
            url = f"{self.api_url}/sendMessage"
            data = {"chat_id": self.chat_id, "text": text}
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, data=data)
                response.raise_for_status()
            print(f"[TelegramAlert] Sent text alert: {text}")
        except Exception as e:
            print(f"[TelegramAlert] Failed to send text: {e}")
