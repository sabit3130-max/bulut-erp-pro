import argparse
import random
import time

from bizimhesap_client import BizimHesapClient
from config import load_config
from phone_utils import normalize_tr_phone
from whatsapp_client import WhatsAppClient


def build_message(template: str, full_name: str, balance: object) -> str:
    return template.format(full_name=full_name, balance=f"{balance:.2f}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="BizimHesap cari listesini cekip WhatsApp bakiye mesaji gonderir."
    )
    parser.add_argument(
        "--send",
        action="store_true",
        help="Gercek WhatsApp gonderimi yapar. Varsayilan sadece ekrana yazar.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Test icin ilk N cariye islem yapar. 0 tum liste demektir.",
    )
    args = parser.parse_args()

    config = load_config()
    if config.min_delay_seconds > config.max_delay_seconds:
        raise RuntimeError("MIN_DELAY_SECONDS, MAX_DELAY_SECONDS degerinden buyuk olamaz.")

    bizimhesap = BizimHesapClient(config.bizimhesap)
    whatsapp = WhatsAppClient(config.whatsapp)

    customers = bizimhesap.fetch_customers()
    if args.limit:
        customers = customers[: args.limit]

    print(f"{len(customers)} cari islenecek.")

    sent_count = 0
    skipped_count = 0

    for index, customer in enumerate(customers, start=1):
        try:
            phone = normalize_tr_phone(customer.phone, config.default_country_code)
            full_name = customer.full_name or "Musterimiz"
            message = build_message(config.message_template, full_name, customer.balance)
        except Exception as exc:
            skipped_count += 1
            print(f"[{index}] Atlandi: {customer.phone!r} - {exc}")
            continue

        if not args.send:
            print(f"[DRY-RUN] {phone} -> {message}")
        elif config.whatsapp.template_name:
            result = whatsapp.send_balance_template(phone, full_name, customer.balance)
            print(f"[{index}] Template gonderildi: {phone} - {result}")
            sent_count += 1
        else:
            result = whatsapp.send_text(phone, message)
            print(f"[{index}] Mesaj gonderildi: {phone} - {result}")
            sent_count += 1

        if args.send and index < len(customers):
            delay = random.uniform(config.min_delay_seconds, config.max_delay_seconds)
            print(f"{delay:.1f} saniye bekleniyor...")
            time.sleep(delay)

    print(f"Bitti. Gonderilen: {sent_count}, atlanan: {skipped_count}")


if __name__ == "__main__":
    main()
