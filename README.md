# Bulut ERP Pro

React, TypeScript, TailwindCSS ve NestJS tabanli ERP / on muhasebe / B2B bayi yonetim sistemi.

Bu surum canli kullanim icin hazirlanmistir. Backend acilista otomatik demo cari, urun, satis, tahsilat veya teklif olusturmaz. Varsayilan gelistirme modunda veriler `data/erp-store.json` dosyasinda kalici saklanir; PostgreSQL/Prisma semasi ve migration komutlari canli veritabani gecisi icin hazirdir.

## Hizli Baslangic

```bash
npm install
npm run dev
```

- Web panel: http://localhost:5173
- API: http://localhost:3000/api

## Production Build

```bash
npm run build
npm --workspace apps/api run build
npm --workspace apps/web run build
node apps/api/dist/main.js
```

Frontend build ciktisi `apps/web/dist` klasorundedir. API varsayilan olarak `PORT=3000` ile calisir.

## Ortam Degiskenleri

Kok dizindeki `.env.example` dosyasini `.env` olarak kopyalayin.

```bash
PORT=3000
JWT_SECRET=change-this-in-production
DATABASE_URL=postgresql://erp:erp_password@localhost:5432/erp_b2b?schema=public
WEB_ORIGIN=https://erp.siteniz.com
VITE_API_URL=https://api.erp.siteniz.com
ADMIN_EMAIL=admin@siteniz.com
ADMIN_USERNAME=admin
ADMIN_PASSWORD=guclu-gecici-sifre
ADMIN_NAME=Sistem Yoneticisi
ADMIN_MUST_CHANGE_PASSWORD=true
AUTO_BACKUP_ENABLED=true
AUTO_BACKUP_INTERVAL_HOURS=24
```

`JWT_SECRET` production ortaminda mutlaka guclu ve gizli bir deger olmalidir.

## Kullanici Girisleri

Canli sistemde varsayilan demo kullanici olusturulmaz. Ilk admin kullanicisi sadece `ADMIN_EMAIL` ve `ADMIN_PASSWORD` ortam degiskenleri verilirse otomatik olusturulur. Bu islem demo veri eklemez; ayni e-posta veya kullanici adi varsa mevcut canli kullanici korunur.

Sifreler API tarafinda hashlenmis olarak tutulur; login JWT token dondurur. Musteri/bayi girisi icin ayrica:

- Admin girisi: `http://localhost:5173/admin-giris`
- Bayi/musteri girisi: `http://localhost:5173/bayi-giris`
- Genel login: `http://localhost:5173/login`
- Admin paneli > `Kullanicilar`
- Cari detay sayfasi > `Kullanici hesabi olustur`
- Roller: `ADMIN`, `PERSONEL`, `CUSTOMER`, `DEALER`
- Admin gecici sifre uretebilir; ilk giriste musteri yeni sifre belirler.
- Kullanici adi veya e-posta ile giris desteklenir.
- Portal endpointleri token uzerindeki `accountId` ile calisir; musteri/bayi baska carinin verisini gormez.
- Kullanici ve yedek endpointleri admin token ister; pasif kullanici giris yapamaz.

## Kalici Veri

Gelistirme ve tek sunucu kullaniminda veriler:

```text
data/erp-store.json
```

dosyasina yazilir. Uygulama kapanip acildiginda cari, urun, satis, alis, tahsilat, teklif, kategori, siparis ve odeme bildirimleri korunur. Store dosyasi yoksa sistem bos baslar; otomatik demo veri olusturulmaz.

Otomatik yedek icin `AUTO_BACKUP_ENABLED=true` yapin. Yedekler varsayilan olarak `data/backups` klasorune JSON dosyasi olarak yazilir. Bu klasoru VPS uzerinde kalici volume/disk olarak baglayin.

## PostgreSQL / Prisma

PostgreSQL servisini baslatmak icin:

```bash
docker compose up -d db
npm --workspace apps/api run db:migrate
```

Prisma semasi `apps/api/prisma/schema.prisma` icindedir. Canli kurulumda onerilen yol, mevcut JSON store verisini yedekleyip PostgreSQL migration sonrasi import etmektir.

## B2B Bayi Akisi

1. `B2B Bayi` ekraninda bayi kullanicisi giris yapar.
2. Sadece kendi cari bilgilerini, bakiyesini, siparislerini ve ekstresini gorur.
3. Urunleri bayi fiyatlariyla sepete ekler.
4. Siparis `Beklemede` olarak admin paneline duser.
5. Admin siparisi onaylayinca siparis satisa donusur, stok duser ve cari borc artar.
6. Havale/EFT veya nakit bildirimi admin onayina duser.
7. Online kart odemesi ayri modalda sandbox POS olarak denenir; basariliysa tahsilat aninda olusur ve cari bakiye duser.
8. Admin bildirimi onaylayinca tahsilat olusur ve cari bakiye duser.

### Online Odeme

- `Online kart odeme` butonu kart formu acar; kart bilgileri veritabanina kaydedilmez.
- Sandbox basarili test karti: `4242 4242 4242 4242`, CVV `123`, ileri tarih.
- Sonu `0001` olan kart numaralari basarisiz odeme simule eder.
- Havale/EFT ve nakit bildirimi `beklemede` log olarak kalir, admin onayi sonrasi tahsilata donusur.
- PayTR / iyzico / Param icin `.env.example` icinde anahtar alanlari hazirdir.

## Panel Test

`Panel Test` modulu tek tusla su kontrolleri calistirir:

- Cari, tedarikci ve urun olusturma
- Satis, tahsilat, alis ve teklif olusturma
- Stok dusus/artis kontrolu
- Veri kaliciligi icin API yeniden okuma
- Bayi login testi
- Siparis olusturma ve onay/satisa donusum
- Odeme bildirimi ve odeme onayi/tahsilat

## Kritik Is Kurallari

- Satis stok dusurur ve cari borcu artirir.
- Tahsilat cari borcunu TL/USD kur mantigiyla dusurur.
- Alis stok artirir ve tedarikci bakiyesine isler.
- Tedarikci odemesi tedarikci bakiyesini dusurur.
- Siparis stok dusurmez; admin onayladiginda satisa donusur.
- Kur islem aninda satis/alis kaydinda saklanir.
- Hareketi olan urun kalici silinmez; pasife/arşive alinir.

## Canliya Alma Notlari

- HTTPS/SSL arkasinda calistirin.
- `JWT_SECRET` degerini degistirin.
- `WEB_ORIGIN` alanini gercek domain ile ayarlayin.
- `data/erp-store.json` icin duzenli yedek alin veya PostgreSQL’e gecin.
- POS entegrasyonu icin Iyzico/PayTR/Param/Tosla gercek merchant bilgilerini `.env` uzerinden tanimlayin.

## Canli Domain, SSL ve Pilot Sirasi

1. Demo veri otomatik olusmadigini dogrulayin.
2. `ADMIN_EMAIL` / `ADMIN_PASSWORD` ile ilk admini olusturun.
3. Admin olarak girip `Kullanicilar` ekranindan personel ve bayi kullanicilarini acin.
4. `/bayi-giris` uzerinden bir bayi ile giris testi yapin.
5. `AUTO_BACKUP_ENABLED=true` ile otomatik yedegi acip ilk yedek dosyasinin olustugunu kontrol edin.
6. Gercek domain ve SSL'i Nginx/Caddy/Traefik/Coolify reverse proxy uzerinden aktif edin.
7. Frontend icin `VITE_API_URL=https://api.erp.siteniz.com` kullanin.
8. Test senaryosunu uygulayin: urun ekle, cari ekle, bayi siparisi ver, admin onayla, satisa donustur, tahsilat gir.
9. Once 3-5 bayiyle pilot kullanima alin.
10. Pilot siparis/odeme/veri kaliciligi sorunsuzsa tum bayilere acin.
