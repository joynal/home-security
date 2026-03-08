# Stub for Telegram Alerting
import numpy as np

from src.alerts.base import AlertManager


class TelegramAlert(AlertManager):
    def __init__(self, bot_token: str, chat_id: str):
        self.bot_token = bot_token
        self.chat_id = chat_id

    def send_alert(self, message: str, image_frame: np.ndarray = None):
        # TODO: Implement API POST request to Telegram with message and optional photo
        pass
