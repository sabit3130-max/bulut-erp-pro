from decimal import Decimal
from typing import Any

import requests

from config import WhatsAppConfig
from phone_utils import to_whatsapp_recipient


class WhatsAppClient:
    def __init__(self, config: WhatsAppConfig) -> None:
        self.config = config
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {config.access_token}",
                "Content-Type": "application/json",
            }
        )

    def send_text(self, to_phone: str, message: str) -> dict[str, Any]:
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to_whatsapp_recipient(to_phone),
            "type": "text",
            "text": {"preview_url": False, "body": message},
        }
        return self._post_message(payload)

    def send_balance_template(
        self,
        to_phone: str,
        full_name: str,
        balance: Decimal,
    ) -> dict[str, Any]:
        payload = {
            "messaging_product": "whatsapp",
            "to": to_whatsapp_recipient(to_phone),
            "type": "template",
            "template": {
                "name": self.config.template_name,
                "language": {"code": self.config.template_language},
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": full_name},
                            {"type": "text", "text": f"{balance:.2f}"},
                        ],
                    }
                ],
            },
        }
        return self._post_message(payload)

    def _post_message(self, payload: dict[str, Any]) -> dict[str, Any]:
        url = (
            f"https://graph.facebook.com/{self.config.graph_api_version}/"
            f"{self.config.phone_number_id}/messages"
        )
        response = self.session.post(url, json=payload, timeout=30)
        response.raise_for_status()
        return response.json()
