from dataclasses import dataclass
from pathlib import Path
import os

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _get_required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} .env dosyasinda tanimli degil.")
    return value


def _get_int(name: str, default: int) -> int:
    value = os.getenv(name, "").strip()
    return int(value) if value else default


def _get_float(name: str, default: float) -> float:
    value = os.getenv(name, "").strip()
    return float(value) if value else default


@dataclass(frozen=True)
class BizimHesapConfig:
    base_url: str
    customers_endpoint: str
    api_key: str
    auth_header: str
    auth_scheme: str
    timeout_seconds: int
    page_param: str
    limit_param: str
    limit: int


@dataclass(frozen=True)
class WhatsAppConfig:
    graph_api_version: str
    phone_number_id: str
    access_token: str
    template_name: str
    template_language: str


@dataclass(frozen=True)
class AppConfig:
    bizimhesap: BizimHesapConfig
    whatsapp: WhatsAppConfig
    message_template: str
    min_delay_seconds: float
    max_delay_seconds: float
    default_country_code: str


def load_config() -> AppConfig:
    return AppConfig(
        bizimhesap=BizimHesapConfig(
            base_url=_get_required("BIZIMHESAP_BASE_URL").rstrip("/"),
            customers_endpoint=_get_required("BIZIMHESAP_CUSTOMERS_ENDPOINT"),
            api_key=_get_required("BIZIMHESAP_API_KEY"),
            auth_header=os.getenv("BIZIMHESAP_AUTH_HEADER", "Authorization").strip(),
            auth_scheme=os.getenv("BIZIMHESAP_AUTH_SCHEME", "Bearer").strip(),
            timeout_seconds=_get_int("BIZIMHESAP_TIMEOUT_SECONDS", 30),
            page_param=os.getenv("BIZIMHESAP_PAGE_PARAM", "page").strip(),
            limit_param=os.getenv("BIZIMHESAP_LIMIT_PARAM", "limit").strip(),
            limit=_get_int("BIZIMHESAP_LIMIT", 100),
        ),
        whatsapp=WhatsAppConfig(
            graph_api_version=os.getenv("WHATSAPP_GRAPH_API_VERSION", "v23.0").strip(),
            phone_number_id=_get_required("WHATSAPP_PHONE_NUMBER_ID"),
            access_token=_get_required("WHATSAPP_ACCESS_TOKEN"),
            template_name=os.getenv("WHATSAPP_TEMPLATE_NAME", "").strip(),
            template_language=os.getenv("WHATSAPP_TEMPLATE_LANGUAGE", "tr").strip(),
        ),
        message_template=os.getenv(
            "MESSAGE_TEMPLATE",
            "Sayin {full_name}, guncel bakiyeniz {balance} TL'dir.",
        ),
        min_delay_seconds=_get_float("MIN_DELAY_SECONDS", 3),
        max_delay_seconds=_get_float("MAX_DELAY_SECONDS", 9),
        default_country_code=os.getenv("DEFAULT_COUNTRY_CODE", "90").strip(),
    )
