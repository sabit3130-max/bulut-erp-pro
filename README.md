# Bulut ERP Pro

React, TypeScript, TailwindCSS ve NestJS tabanli ERP / on muhasebe / B2B bayi yonetim sistemi.

Bu surum demo ekrandan cikartilip kalici veri, JWT giris, bayi siparis akisi, odeme bildirimi ve panel testleriyle canli kuruluma hazirlanmistir. Varsayilan gelistirme modunda veriler `data/erp-store.json` dosyasinda kalici saklanir; PostgreSQL/Prisma semasi ve migration komutlari canli veritabani gecisi icin hazirdir.

## Hizli Baslangic

```bash
npm install
npm run dev
```

- Web panel: http://localhost:5173
- API: http://localhost:3001/api

## Production Build

```bash
npm run build
npm --workspace apps/api run build
npm --workspace apps/web run build
node apps/api/dist/main.js
```

Frontend build ciktisi `apps/web/dist` klasorundedir. API varsayilan olarak `PORT=3001` ile calisir.

## Ortam Degiskenleri

Kok dizindeki `.env.example` dosyasini `.env` olarak kopyalayin.

```bash
PORT=3001
JWT_SECRET=change-this-in-production
DATABASE_URL=postgresql://erp:erp_password@localhost:5432/erp_b2b?schema=public
WEB_ORIGIN=https://erp.siteniz.com
VITE_API_URL=https://erp.siteniz.com/api
```

`JWT_SECRET` production ortaminda mutlaka guclu ve gizli bir deger olmalidir.

## Kullanici Girisleri

Varsayilan seed kullanicilari:

- Admin: `admin@demo.local` / `admin123`
- Muhasebe: `muhasebe@demo.local` / `muhasebe123`
- Satis: `satis@demo.local` / `satis123`
- Depo: `depo@demo.local` / `depo123`
- Bayi: `bayi@demo.local` / `bayi123`

Sifreler API tarafinda hashlenmis olarak tutulur; login JWT token dondurur. Musteri/bayi girisi icin ayrica:

- Login sayfasi: `http://localhost:5173/login`
- Cari detay sayfasi > `Kullanici hesabi olustur`
- Roller: `CUSTOMER` ve `DEALER`
- Admin gecici sifre uretebilir; ilk giriste musteri yeni sifre belirler.
- Kullanici adi veya e-posta ile giris desteklenir.
- Portal endpointleri token uzerindeki `accountId` ile calisir; musteri/bayi baska carinin verisini gormez.

## Kalici Veri

Gelistirme ve tek sunucu kullaniminda veriler:

```text
data/erp-store.json
```

dosyasina yazilir. Uygulama kapanip acildiginda cari, urun, satis, alis, tahsilat, teklif, kategori, siparis ve odeme bildirimleri korunur. Demo seed sadece store dosyasi yoksa ilk kurulumda olusur.

## PostgreSQL / Prisma

PostgreSQL servisini baslatmak icin:

```bash
docker compose up -d db
npm --workspace apps/api run db:migrate
npm --workspace apps/api run db:seed
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
