from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Iterable

import requests

from config import BizimHesapConfig


@dataclass(frozen=True)
class Customer:
    first_name: str
    last_name: str
    phone: str
    balance: Decimal

    @property
    def full_name(self) -> str:
        return " ".join(part for part in [self.first_name, self.last_name] if part).strip()


class BizimHesapClient:
    def __init__(self, config: BizimHesapConfig) -> None:
        self.config = config
        self.session = requests.Session()
        token = (
            f"{config.auth_scheme} {config.api_key}"
            if config.auth_scheme
            else config.api_key
        )
        self.session.headers.update(
            {
                config.auth_header: token,
                "Accept": "application/json",
                "Content-Type": "application/json",
            }
        )

    def fetch_customers(self) -> list[Customer]:
        url = f"{self.config.base_url}/{self.config.customers_endpoint.lstrip('/')}"
        customers: list[Customer] = []
        page = 1

        while True:
            response = self.session.get(
                url,
                params={
                    self.config.page_param: page,
                    self.config.limit_param: self.config.limit,
                },
                timeout=self.config.timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
            rows = self._extract_rows(payload)

            if not rows:
                break

            customers.extend(self._parse_customer(row) for row in rows)

            if not self._has_next_page(payload):
                break
            page += 1

        return customers

    @staticmethod
    def _extract_rows(payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]

        if not isinstance(payload, dict):
            return []

        for key in ("data", "items", "customers", "cariler", "CariListesi", "result"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
            if isinstance(value, dict):
                nested = BizimHesapClient._extract_rows(value)
                if nested:
                    return nested

        return []

    @staticmethod
    def _has_next_page(payload: Any) -> bool:
        if not isinstance(payload, dict):
            return False

        for key in ("has_more", "hasMore", "hasNextPage", "next"):
            value = payload.get(key)
            if isinstance(value, bool):
                return value
            if value:
                return True

        total_pages = payload.get("total_pages") or payload.get("totalPages")
        current_page = payload.get("page") or payload.get("currentPage")
        if total_pages and current_page:
            return int(current_page) < int(total_pages)

        return False

    @staticmethod
    def _parse_customer(row: dict[str, Any]) -> Customer:
        return Customer(
            first_name=str(_first(row, ["ad", "Ad", "firstName", "name", "Name"]) or "").strip(),
            last_name=str(_first(row, ["soyad", "Soyad", "lastName", "surname"]) or "").strip(),
            phone=str(_first(row, ["telefon", "Telefon", "phone", "gsm", "mobile"]) or "").strip(),
            balance=_to_decimal(
                _first(row, ["bakiye", "Bakiye", "balance", "Balance", "currentBalance"]) or 0
            ),
        )


def _first(row: dict[str, Any], keys: Iterable[str]) -> Any:
    for key in keys:
        if key in row and row[key] not in (None, ""):
            return row[key]
    return None


def _to_decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    text = str(value).strip()
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    elif "," in text:
        text = text.replace(",", ".")
    return Decimal(text or "0")
