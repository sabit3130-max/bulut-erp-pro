import re


def normalize_tr_phone(raw_phone: str, default_country_code: str = "90") -> str:
    """Telefonu +90XXXXXXXXXX bicimine getirir."""
    if not raw_phone:
        raise ValueError("Telefon numarasi bos.")

    digits = re.sub(r"\D", "", raw_phone)

    if digits.startswith("00"):
        digits = digits[2:]

    if digits.startswith(default_country_code) and len(digits) == 12:
        return f"+{digits}"

    if digits.startswith("0") and len(digits) == 11:
        return f"+{default_country_code}{digits[1:]}"

    if len(digits) == 10:
        return f"+{default_country_code}{digits}"

    if raw_phone.strip().startswith("+") and 10 <= len(digits) <= 15:
        return f"+{digits}"

    raise ValueError(f"Gecersiz telefon formati: {raw_phone}")


def to_whatsapp_recipient(e164_phone: str) -> str:
    """Meta Cloud API 'to' alani icin arti isaretini kaldirir."""
    return e164_phone.lstrip("+")
