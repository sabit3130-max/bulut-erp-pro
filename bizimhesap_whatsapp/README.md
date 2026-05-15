# BizimHesap Cari Bakiye WhatsApp Gonderimi

Bu klasor, BizimHesap API'sinden cari bilgilerini alip WhatsApp Cloud API ile kisisellestirilmis bakiye mesaji gondermek icin hazir Python iskeletidir.

## Kurulum

```powershell
cd "C:\Users\ozlem\Documents\New project\bizimhesap_whatsapp"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Sonra `.env` dosyasindaki BizimHesap ve WhatsApp degerlerini doldurun.

## Calistirma

Once gercek gonderim yapmadan kontrol edin:

```powershell
python send_balance_messages.py --limit 5
```

Gercek gonderim:

```powershell
python send_balance_messages.py --send
```

## Onemli Notlar

- `BIZIMHESAP_CUSTOMERS_ENDPOINT` degeri BizimHesap hesabinizdaki API dokumaninda verilen cari/musteri liste endpoint'i ile ayni olmalidir.
- WhatsApp Cloud API, yeni sohbet baslatirken genellikle onayli mesaj template'i gerektirir. Bu durumda Meta'da ornegin `balance_update` adli bir template olusturup `.env` icindeki `WHATSAPP_TEMPLATE_NAME` alanini doldurun.
- Musterilerinizden WhatsApp ile ticari/finansal bildirim almak icin acik riza/opt-in aldiginizdan emin olun.
