# Duitku API — Ringkasan Integrasi & Specs

> **Sumber resmi:** Dokumentasi API Duitku (Bahasa Indonesia)

Dokumen ini merangkum langkah awal, skema autentikasi, endpoint penting, alur integrasi, parameter kunci, serta praktik terbaik untuk mengintegrasikan **Payment Gateway Duitku** ke aplikasi/web.

---

## 1) Prasyarat

- **Merchant Code** dan **API Key (Merchant Key)** didapat dari **Duitku Merchant Portal** (menu _My Project_).
- Pilih lingkungan:

  - **Sandbox**: `https://sandbox.duitku.com/`
  - **Production (Passport)**: `https://passport.duitku.com/`

- Pastikan server Anda dapat menerima **Callback** (public URL, HTTPS disarankan).

---

## 2) Skema Keamanan & Signature

Duitku menggunakan **signature** berbasis _hash_ untuk memverifikasi request/response. Format berbeda per endpoint.

- **Get Payment Method**

  - `signature = SHA256(merchantcode + amount + datetime + apiKey)`
  - `datetime` format `YYYY-MM-DD HH:mm:ss` (server time Anda)

- **Create Transaction (Inquiry v2)**

  - `signature = MD5(merchantCode + merchantOrderId + amount + apiKey)`

- **Check Transaction Status**

  - `signature = MD5(merchantCode + merchantOrderId + apiKey)`

- **Callback Validation (server Anda)**

  - Rehitung `calcSignature = MD5(merchantCode + amount + merchantOrderId + apiKey)` dan cocokkan dengan `signature` yang dikirim Duitku.

> **Catatan:** _merchantCode_/_merchantcode_ bersifat **case-sensitive** sesuai contoh di dokumentasi; konsistenkan penamaan kunci JSON di implementasi Anda.

---

## 3) Alur Integrasi Ringkas

1. **(Opsional) Ambil daftar channel** yang aktif via **Get Payment Method** → tampilkan ke user → pilih `paymentMethod`.
2. **Create Transaction (Inquiry)** ke Duitku → terima respons berisi `reference`, `paymentUrl`, `vaNumber` atau `qrString` (tergantung channel).
3. **Arahkan user** ke halaman pembayaran Duitku (`paymentUrl`) **atau** tampilkan VA/QR di halaman Anda sendiri.
4. Setelah user membayar:

   - **Callback**: server Duitku men-_POST_ status ke `callbackUrl` Anda (wajib verifikasi `signature`).
   - **Redirect**: user dibawa kembali ke `returnUrl` Anda dengan query `merchantOrderId`, `reference`, `resultCode` (jangan gunakan redirect untuk update status final).

5. **(Disarankan) Verifikasi** dengan **Check Transaction Status** pada saat menerima callback untuk memastikan status final.

---

## 4) Endpoint Inti & Payload

### 4.1 Get Payment Method

- **POST** `.../webapi/api/merchant/paymentmethod/getpaymentmethod`
- **Body (JSON):**

  ```json
  {
    "merchantcode": "DXXXX",
    "amount": "10000",
    "datetime": "2022-01-25 16:23:08",
    "signature": "<sha256>"
  }
  ```

- **Respons:** daftar `paymentFee[]` berisi `paymentMethod`, `paymentName`, `paymentImage`, `totalFee`.

### 4.2 Create Transaction (Inquiry v2)

- **POST** `.../webapi/api/merchant/v2/inquiry`
- **Body (contoh field utama):**

  ```json
  {
    "merchantCode": "DXXXXX",
    "paymentAmount": 40000,
    "paymentMethod": "VC",
    "merchantOrderId": "<UNIK>",
    "productDetails": "Deskripsi produk",
    "email": "[email protected]",
    "phoneNumber": "08123456789",
    "customerVaName": "John Doe",
    "callbackUrl": "https://example.com/callback",
    "returnUrl": "https://example.com/return",
    "expiryPeriod": 10,
    "signature": "<md5>"
  }
  ```

- **Respons penting:**

  - `reference` (simpan untuk tracking), `paymentUrl` (jika pakai halaman Duitku), `vaNumber` (VA), `qrString` (QRIS), `resultCode`.

### 4.3 Callback (Server → Server ke Merchant)

- **Metode:** `application/x-www-form-urlencoded` (umum)
- **Field umum:** `merchantCode`, `amount`, `merchantOrderId`, `paymentCode`, `resultCode`, `reference`, `publisherOrderId`, `signature`, `settlementDate`, dll.
- **Validasi di server Anda:**

  ```text
  calcSignature = MD5(merchantCode + amount + merchantOrderId + apiKey)
  mustEqual(signature)
  ```

- **Tindakan:**

  - Jika valid & `resultCode == "00"` → tandai **SUCCESS**.
  - Jika selain itu → **FAILED/PENDING** sesuai kode.
  - Lakukan **idempotency** (hindari dobel proses), log minimalis, dan **respon HTTP 200** bila sukses diterima.

### 4.4 Redirect (Browser → Merchant)

- **Contoh:**

  ```http
  GET /return?merchantOrderId=...&resultCode=00&reference=...
  ```

- **Jangan** gunakan redirect untuk update status final (parameter dapat dimodifikasi user). Pakai **callback + cek status**.

### 4.5 Check Transaction Status

- **POST** `.../webapi/api/merchant/transactionStatus`
- **Body (JSON):**

  ```json
  {
    "merchantcode": "DXXXX",
    "merchantOrderId": "abcde12345",
    "signature": "<md5>"
  }
  ```

- **Respons:** `statusCode` (`00` Success, `01` Pending, `02` Canceled), beserta `reference`, `amount`, `fee`.

---

## 5) Objek JSON Opsional (untuk halaman pembayaran kustom)

- **itemDetails[]**: daftar item (name, price, quantity).
- **customerDetail**: info pelanggan (nama, email, phone) dan **address** (billing/shipping).
- **subscriptionDetail** dan channel-specific (mis. **Ovo Detail**, **Shopee Detail**) bila diperlukan.

> Gunakan hanya yang diperlukan oleh channel/metode pembayaran yang Anda aktifkan.

---

## 6) Kode & Channel Pembayaran

- `paymentMethod` mengacu ke daftar **Metode Pembayaran** di dokumentasi. Contoh: `VC` (Kartu Kredit), `VA` (Virtual Account bank tertentu), **`QRIS`** (Quick Response Code Indonesian Standard), e-money (OVO, ShopeePay, dll), Paylater, dsb.
- Untuk **QRIS**:

  - **paymentMethod**: `QRIS`
  - **Inquiry v2**: kirim seperti biasa; respons biasanya mengandung `qrString` (payload QRIS) dan/atau `paymentUrl` untuk menampilkan kode.
  - **Tampilan**: Anda dapat men-_render_ `qrString` menjadi gambar QR di halaman Anda.

---

## 7) Testing (Sandbox)

Dokumentasi menyediakan data uji untuk beberapa channel, antara lain **Kartu Kredit (3DS)**, **Virtual Account (demo)**, **E-Money** (Shopee/JeniusPay), **QRIS** (Shopeepay/Nusapay), **Paylater** (Indodana/Atome). Gunakan sesuai panduan di bagian **Uji Coba**.

---

## 8) Praktik Terbaik Implementasi

- **Catat & simpan**: `merchantOrderId` (unik), `reference` (Duitku), dan _signature_ terkait.
- **Idempotent** pada callback: gunakan unique key (mis. `merchantOrderId`) untuk mencegah _double processing_.
- **Verifikasi status** via **transactionStatus** di callback untuk mengunci status final.
- **Expiry**: atur `expiryPeriod` secukupnya agar pengalaman bayar nyaman dan menghindari _stale invoice_.
- **Clock sync**: pastikan jam server sinkron (NTP) untuk _datetime_ dan perhitungan signature.
- **Observability**: log request/response dengan masking sensitif; monitor error HTTP & _timeout_.

---

## 9) Ringkasan Quickstart (Checklist)

- [ ] Buat project di Merchant Portal → ambil **Merchant Code** & **API Key**.
- [ ] (Opsional) **Get Payment Method** → tentukan `paymentMethod`.
- [ ] **Create Transaction (Inquiry)** → simpan `reference`, tampilkan `paymentUrl` **atau** render `vaNumber`/`qrString`.
- [ ] **Terima Callback** di `callbackUrl` → validasi _signature_ → update status internal.
- [ ] **Redirect** hanya untuk UX, **bukan** sumber kebenaran status.
- [ ] **Check Transaction Status** sebagai verifikasi final.

---

## 10) Kode Status & HTTP

- **statusCode / resultCode** transaksional: `00` Success, `01` Pending, `02` Canceled.
- **HTTP Code**: rujuk tabel di dokumentasi untuk mapping kesalahan API (validasi payload, signature salah, dll.).

---

### Lampiran: Templat Minimal Variabel Lingkungan

```env
DUITKU_MERCHANT_CODE=...
DUITKU_API_KEY=...
DUITKU_ENV=sandbox # atau production
DUITKU_CALLBACK_URL=https://example.com/callback
DUITKU_RETURN_URL=https://example.com/return
```

> Gunakan _base URL_ sesuai `DUITKU_ENV`. Pastikan pemetaan endpoint sandbox vs production konsisten di konfigurasi.
