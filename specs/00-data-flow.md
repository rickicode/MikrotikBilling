# Data Flow v2.0 - Alur Data Terintegrasi

## 1. Overview

Dokumen ini mendefinisikan alur data lengkap yang menggambarkan bagaimana data bergerak melalui berbagai komponen sistem Mikrotik Billing v2.0.

## 2. System Data Architecture

### 2.1 Data Flow Diagram
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ┌─────────────────┐                           │
│                           │   Web Browser   │                           │
│                           │ (Frontend)      │                           │
│                           └─────────┬───────┘                           │
│                                     │                                     │
│            ┌────────────────┼────────────────┐                     │
│            │              │   Fastify API   │                     │
│            │              └─────┬────────┘                     │
│            │                        │                                 │
│    ┌───────▼───────┐              │  ┌─────────────────────────────────┐     │
│    │   Database    │◄─────────▶│        │      PostgreSQL              │     │
│    │   (PostgreSQL) │           │          │         (Primary Storage)      │     │
│    └──────┬───────┘              │          └─────────────────────────────────┘     │
│           │                        │                                 │
│    ┌──────▼───────┐              │                    ┌─────────────────────┐    │
│    │   Redis       │              │                    │   Session Cache    │    │
    │   (Session/   │◄────────────────▶│   (Login/Rate     │    │
    │    Cache)      │                        │      Limit)         │    │
│    └──────┬───────┘              │                    └─────────────────────┘    │
│           │                        │                                 │
│    ┌──────▼───────┐              │                    ┌─────────────────────┐    │
│    │  Mikrotik    │◄────────────────▶│    │  WhatsApp       │    │
│    │  Router      │               │    │   Service       │    │
│    │  (User Data)  │               │    │  (Messages)      │    │
│    └──────┬───────┘               │    │                   │    │
│           │                        │    │                   │    │
│    ┌──────▼───────┐              │    │                   │    │
│    │  File System │               │    │  Log Files       │    │
│    │  (Backup/    │◄────────────────▶│   (Payment Logs   │    │
    │    Images)    │               │    │  /System Logs)   │    │
│    └─────────────┘              │    └─────────────────┘    │
│                                   │                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Classification
```
┌──────────────────────────────────────────────┐
│ 1. Transactional Data (PostgreSQL)                │
│    - Customer information                        │
│    - Subscriptions                               │
│    - Payments & Invoices                         │
│    - Vouchers & PPPoE users                     │
│    - Financial records                           │
│    - Audit logs                                 │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 2. Session & Cache (Redis)                        │
│    - User sessions                              │
│    - JWT tokens                                  │
│    - API rate limits                            │
│    - Temporary data                             │
│    - Real-time metrics                         │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 3. External Data Sources                         │
│    - Mikrotik Router (User data)               │
│    - WhatsApp Gateway (Message status)          │
│    - Payment Gateways (Transaction status)      │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 4. File Storage                                  │
│    - Backup files                               │
│    - Log archives                              │
│    - QR code images                            │
│    - Print templates                           │
│    - Temporary uploads                         │
└──────────────────────────────────────────────┘
```

## 3. User Registration & Authentication Data Flow

### 3.1 Customer Registration Flow
```
┌──────────────┐
│  Customer    │
│  fills form  │
└─────┬──────┘
      │
      ▼
┌──────────────┐    ┌─────────────────┐
│  Frontend    │───▶│  API Endpoint   │
│  Validation │    │  /api/v2/       │
└─────┬──────┘    │  auth/register  │
      │            └─────────┬───────┘
      ▼                      │
┌──────────────┐              │
│  API Server  │              │
│  - Check     │              │
│    duplicate│              │
│    WhatsApp │              │
│  - Validate │              │
│    email/phone │             │
└─────┬──────┘              │
      │                      │
      ▼                      ▼
┌───────────────────────────────────────┐
│  PostgreSQL Database                    │
│  INSERT INTO customers               │
│  (id, name, whatsapp, email, status)     │
│  RETURNING new customer_id           │
└─────────────────┬─────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────┐
│  Create Default Subscription (Optional)  │
│  INSERT INTO subscriptions           │
│  (customer_id, type, status, created_at)│
└──────────────────────────────────────┘
```

### 3.2 Authentication Flow
```
┌──────────────┐
│  Customer    │
│  Submits     │
│  Login       │
└─────┬──────┘
      │
      ▼
┌──────────────┐    ┌─────────────────┐
│  Frontend    │───▶│  API Endpoint   │
│  Form Submit │    │  /api/v2/       │
└─────┬──────┘    │  auth/login     │
      │            └─────────┬─────┘
      ▼                      │
┌──────────────┐              │
│  API Server  │              │
│  - Hash      │              │
│    password │              │
│  - Check     │              │
│    database │              │
│  - Create    │              │
│    JWT token │              │
└─────┬──────┘              │
      │                      │
      ▼                      ▼
┌───────────────────────────────┐   │
│  PostgreSQL Database            │   │
│  SELECT FROM customers         │   │
│  WHERE username = ?           │   │
│  AND password_hash = ?       │   │
└─────────────────┬─────────────┘   │
                  │              │
                  ▼              ▼
┌──────────────────┐              │
│  API Server    │              │
│  Return JWT   │              │
│  Token + User │              │
└──────────────┬──────┘              │
                  │              │
                  ▼              ▼
┌──────────────┐              │
│  Frontend    │              │
│  Store Token │              │
│  Redirect   │              │
└──────────────┘              │
```

## 4. Voucher Creation & Management Data Flow

### 4.1 Voucher Batch Creation
```
┌──────────────┐
│  Admin       │
│  Creates     │
│  Voucher     │
│  Batch       │
└─────┬──────┘
      │
      ▼
┌──────────────┐    ┌─────────────────┐
│  Frontend    │───▶│  API Endpoint   │
│  Form Submit │    │  /api/v2/       │
└─────┬──────┘    │  vouchers/batch  │
      │            └─────────┬──────┘
      │                      │
      ▼                      ▼
┌──────────────┐              │
│  API Server  │              │
│  - Validate  │              │
│    data     │              │
│  - Generate │              │
│    codes     │              │
│  - Create   │              │
│    database │              │
└─────┬──────┘              │
      │                      │
      ▼                      ▼
┌─────────────────────┐   │
│  PostgreSQL DB     │   │
│  BEGIN TRANSACTION       │   │
│  ├─ INSERT voucher_   │   │
│  │    batches           │   │
│  ├─ INSERT vouchers   │   │
│  │    (100 records)     │   │
│  ├─ Check all      │   │
│  │    uniqueness      │   │
│  └─ Commit          │   │
│                       │   │
│  Return batch_id,     │   │
│  voucher codes       │   │
└─────────────────────┬─┘   │
                    │   │
                    ▼   ▼
┌─────────────────────┐   │
│  API Server       │   │
│  - Send to      │   │
│    Number       │   │
│    Generator   │   │
│  - Update       │   │
│    Mikrotik   │   │
│    API         │   │
└─────────────────┬─┘   │
                    │   │
                    ▼   ▼
┌─────────────────────┐   │
│  Mikrotik Router   │   │
│  Create hotspot │   │
│  users (100)     │   │
│  + Comments     │   │
└─────────────────────┘   │
```

### 4.2 Voucher Activation Flow
```
┌──────────────────┐
│  Scheduler   │
│  Every 30s  │
└─────┬────────┘
      │
      ▼
┌──────────────────┐
│  Monitor Service│
│  getUserList()   │
└─────┬────────┘
      │
      ▼
┌───────────────────────────────────────────────┐
│  Mikrotik Router                             │
│  Active users list                          │
│  ┌─────────────────────────────────────┐   │
│  │Name      │Profile │  │Uptime │  │
│  │WIFI-001  │voucher │  │ 5d 12h │  │
│  │WIFI-002  │voucher │  │  │  │
│  │PPPOE-001│pppoe  │  │ 10d    │  │
│  │...       │...    │  │...    │  │
│  └─────────────────────────────────────┘   │
└───────────────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────┐
│  Filter Voucher Profiles                      │
│  WHERE profile LIKE '*voucher*'            │
└───────────────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────┐
│  Check First Login                          │
│  IF uptime > 0 AND                      │
│  voucher.status = 'created'              │
└─────────────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────┐
│  Update Database                           │
│  vouchers SET                           │
│  status = 'active',                        │
│  first_login_at = NOW(),                   │
│  expires_at = NOW() + INTERVAL '24h'     │
│  WHERE id = ?                             │
└─────────────────────────────────────────────┘
```

## 5. Payment Processing Data Flow

### 5.1 Payment Link Generation
```
┌──────────────┐
│  System/     │
│  Manual      │
│  Invoice     │
│  Generation  │
└─────┬──────┘
      │
      ▼
┌──────────────┐    ┌─────────────────┐
│  Invoice    │───▶│  Payment URL    │
│  Service    │    │  Service        │
└─────┬──────┘    │  .generateURL() │
      │            └─────────┬──────┘
      │                      │
      ▼                      ▼
┌──────────────┐              │
│  Payment   │              │
│  URL       │              │
│  Service    │              │
│  - Generate  │              │
│    JWT token │              │
│  - Save to   │              │
│    database │              │
└─────┬──────┘              │
      │                      │
      ▼                      ▼
┌──────────────┐              │
│  PostgreSQL │              │
│  INSERT INTO │              │
│  payment_urls│              │
│  (token, qr_code,  │              │
│   expires_at) │              │
└─────────────────────┘              │
                               │
      ▼                      │
┌──────────────┐              │
│  QR Code    │              │
│  Generation  │              │
│  Service    │              │
│  - Create    │              │
│    image    │              │
│  - Save path │              │
└──────────────┘              │
```

### 5.2 Payment Processing Flow
```
┌──────────────┐
│  Customer    │
│  Opens      │
│  Payment    │
│  Link       │
└─────┬──────┘
      │
      ▼
┌──────────────┐    ┌─────────────────┐
│  Payment    │───▶│  JWT Verify    │
│  Page UI    │    │  (Check Token  │
└─────┬──────┘    └─────────────────┘
      │                      │
      ▼                      ▼
┌──────────────┐              │
│  Customer   │              │
│  Selects    │              │
│  Payment   │              │
│  Method    │              │
└─────┬──────┘              │
      │                      │
      ▼                      ▼
┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│  Plugin     │───▶│  Payment        │───▶│  Gateway       │
│  Manager   │    │  Plugin        │    │  (DuitK/Manual) │
└─────┬──────┘    └─────────┬──────┘    └──────────────┬─┘
      │                   │            │
      ▼                   │            ▼
┌─────────────────────┐    │            │
│  Payment Gateway   │    │            │
│  - Create       │    │            │
│    transaction │    │            │
│  - Return     │    │            │
│    payment URL │    │            │
└─────────────────┬─┘    │            │
                │            │
                ▼            ▼
┌───────────────────────────────────────┐
│  Update Database                      │
│  INSERT INTO payments               │
│  (reference, amount, status, etc.)      │
└──────────────────────────────────────┘
```

### 5.3 Payment Status Check & Carry Over
```
┌──────────────────┐
│  Scheduler   │
│  Every 5min │
└─────┬────────┘
      │
      ▼
┌──────────────┐    ┌───────────────────────┐
│  Status     │───▶│  Check Pending    │
│  Checker    │    │  Payments       │
│  Service    │    │ (5min interval) │
└─────┬──────┘    └───────────────────────┘
      │                      │
      ▼                      ▼
┌─────────────────────┐   │
│  PostgreSQL     │   │
│  SELECT       │   │
│  payments p  │   │
│  WHERE       │   │
│  status =    │   │
│  'pending'   │   │
└─────────────┬─┘   │
                │   │
                ▼   │
      ┌─────────┴─────┐   │
      │  For each payment    │   │
      │  └─► Get plugin    │   │
      │      │    Check status   │   │
      │      └─► If success: │   │
      │          │         │   │
      │          ▼         │   │
      │  ┌──────────────┐   │   │
      │  │  Update payment│   │
      │  │  status = 'success'│   │
      │  │  Check amount  │   │
      │  │  vs invoice │   │
      │  └─► If partial:│   │
      │      │         │   │
      │      │         └─►│   │
      │      │             │   │
      │      │             └─▶│
      │      │   Update       │   │
      │      │   invoice     │   │
      │      │   status =     │   │
      │      │   'partial'    │   │
      │      │   Call        │   │
      │      │   CarryOver   │   │
      │      └──────────┘   │
└─────────────────────────┘   │
```

## 6. WhatsApp Notification Data Flow

### 6.1 Multi-Session Message Queue
```
┌──────────────────┐
│  System     │
│  Event      │
│  Trigger    │
│  (Payment,  │
│   Expiry,   │
│   etc.)    │
└─────┬────────┘
      │
      ▼
┌──────────────┐    ┌──────────────────┐
│  WhatsApp  │───▶│  Queue Manager   │
│  Service  │    │  (Priority Queue)│
│  .queue()   │    └─────────┬──────┘
└─────┬──────┘              │
      │                      │
      ▼                      ▼
┌──────────────────────┐   │
│  Redis Queue     │   │
│  ┌─────────────┐ │   │
│  │ High Priority│ │   │
│  │ Normal     │ │   │
│  │ Low       │ │   │
│  └─────────────┘ │   │
└─────────────────┬─┘   │
                │   │
                ▼   │
      ┌──────────────┐   │
      │  Session      │   │
      │  Manager    │   │
      │  (Load Balance)│   │
      │  ┌─────────▼┐ │   │
      │  │  Primary   │ │   │
      │  │  Session 1 │ │   │
      │  │  Session 2 │ │   │
      │  │  Session 3 │ │   │
      │  └───────────┘ │   │
      └─────────────────┘   │
                          │
                          ▼
┌─────────────────────┐   │
│  Session     │   │
│  Sends      │   │
│  Message    │   │
└─────┬──────┘   │
      │                │
      ▼                ▼
┌───────────────────────────────┐
│  WhatsApp   │   │
│  API      │   │
│  (Web.js)  │   │
│  Send     │   │
└─────────────────┬─────┘   │
                 │   │
      ▼             ▼   │
┌───────────────────────┐   │
│  Update     │   │
│  Message    │   │
│  Status    │   │
└─────────────────┘   │
```

### 6.2 Message Template Processing
```
┌──────────────┐
│  Template    │
│  Service    │
│  .process() │
└─────┬──────┘
      │
      ▼
┌─────────────────────┐    ┌──────────────────┐
│  Load       │───▶│  Template File   │
│  Template   │    │  │
└─────┬──────┘    │ └─────────┬──────┘
      │                │             │
      ▼                ▼             ▼
┌─────────────────────┐    │             │
│  Parse      │    │   ┌─────────▼──────┐
│  Variables  │    │   │{{customer_name}}│
│  Replace    │    │   │{{invoice_number}││
└─────┬──────┘    │   │{{amount}}       │
      │                │   └───────────────┘
      │                │
      ▼                ▼
┌─────────────────────┐    │
│  Message    │    │
│  Ready    │    │
│  (Text +   │    │
│  Media)   │    │
└─────┬──────┘    │
      │                │
      ▼                ▼
┌─────────────────────┐    │
│  Send via   │    │
│  WhatsApp  │    │
│  API      │    │
└─────┬──────┘    │
```

## 7. Mikrotik Integration Data Flow

### 7.1 Profile Synchronization
```
┌──────────────────┐
│  Scheduler   │
│  Hourly     │
└─────┬────────┘
      │
      ▼
┌──────────────┐    ┌─────────────────┐
│  Sync       │───▶│  Mikrotik API   │
│  Service    │    │  /ip/hotspot/profile │
│  .syncProfiles()│    └──────────────┘
└─────┬──────┘              │
      │                      │
      ▼                      ▼
┌───────────────────────────────────────┐
│  Mikrotik Router                              │
│  All PPPoE/Hotspot Profiles              │
│  ┌─────────────────────────────────────┐ │
│  │ Name     │Rate Limit │Comment          │ │
│  │ 10MB     │10M/10M    │PPPOE_SYSTEM    │ │
│  │ 1MB      │1M/1M      │                 │ │
│  │ ...      │...        │                 │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────┐
│  PostgreSQL Database                        │
│  UPDATE pppoe_profiles                   │
│  SET mikrotik_comment, last_sync          │
│  WHERE name = ?                           │
└─────────────────────────────────────────┘
```

### 7.2 User Creation & Monitoring
```
┌──────────────┐
│  Create     │
│  Voucher/   │
│  PPPoE      │
└─────┬──────┘
      │
      ▼
┌──────────────┐    ┌─────────────────┐
│  Voucher/   │───▶│  Voucher        │
│  PPPoE      │    │  .create()      │
│  Service    │    └──────────────┘
└─────┬──────┘              │
      │                      │
      ▼                      ▼
┌───────────────────────────────────────┐   │
│  PostgreSQL                               │   │
│  INSERT INTO vouchers/                   │   │
│  pppoe_users                             │   │
│  (name, password, profile_id,             │   │
│   mikrotik_comment)                    │   │
│  RETURNING user_id                   │   │
└─────────────────┬─────────────────────┘   │
                │   │
                ▼   │
┌─────────────────────┐   │
│  Create     │   │
│  Mikrotik   │   │
│  Connection   │   │
└─────┬───────┘   │
      │               │
      ▼               ▼
┌─────────────────────┐   │
│  Mikrotik Router   │   │
│  /ppp/secret add │   │
│  OR               │   │
│  /ip/hotspot/user│   │
└─────────────────┘   │
```

## 8. Carry Over Logic Data Flow

### 8.1 Carry Over Calculation
```
┌──────────────────┐
│  Payment    │
│  Status    │
│  Update    │
└─────┬──────┘
      │
      ▼
┌──────────────┐    ┌──────────────────┐
│  Carry Over  │───▶│  Calculate       │
│  Service    │    │  Difference     │
│  .process() │    │  (Invoice Amt  │
│             │    │  │
  │  │   - Payment Amt) │
└─────┬──────┘    └─────────┬──────┘
      │                │
      ▼                ▼
┌───────────────────────────────┐
│  Amount Check  │
│  IF payment < invoice:        │
│    ┌──────────────────────┐│
│    │  Update customer       ││
│    │  balance = balance  ││
    │  - (invoice - payment) ││
│    └──────────────────────┘│
│  ELSE IF payment > invoice:     │
│    ┌──────────────────────┐│
│    │  Update customer       │
    │  balance = balance  │
    │  + (payment - invoice) ││
    └──────────────────────┘│
└─────────────────────────────┘
```

### 8.2 Balance Application to New Invoice
```
┌──────────────┐
│  New        │
│  Invoice    │
│  Generated │
└─────┬──────┘
      │
      ▼
┌──────────────┐    ┌──────────────────┐
│  Carry Over  │───▶│  Balance        │
│  Service    │    │  Service        │
│  .applyToInvoice()│    │  .checkBalance()│
└─────┬──────┘    └─────────┬──────┘
      │                │            │
      ▼                ▼            │
┌─────────────────────┐  │
│  Get Balance   │  │
│  IF balance > 0:     │
│  ┌───────────────┐  │
│  │  Apply       │  │
  │  │  Update       │  │
  │  │  invoice     │  │
  │  │  └─► status = │  │
  │  │      'paid'     │  │
  │  │              │  │
  │  │  Update       │  │
  │  │  balance     │  │
  │  └─────────────┘ │
│  │                   │
  │  │  Return      │  │
  │  │  success =   │  │
  │  │  true      │  │
└  │  │  └───────────┘ │
│ │                   │
│  └─────────────────┘ │
└─────────────────────┘
```

## 9. Data Retention & Cleanup Flow

### 9.1 Automated Cleanup
```
┌──────────────────┐
│  Scheduler   │
│  Daily @ 2 AM │
└─────┬────────┘
      │
      ▼
┌──────────────┐    ┌──────────────────┐
│  Retention  │───▶│  Cleanup Service  │
│  Service    │    │  .runCleanup() │
└─────┬──────┘    └─────────┬──────┘
      │                │            │
      ▼                │            ▼
┌─────────────────────┐   │            │
│  Delete Old Data         │   │            │
│  (30 days ago)          │   │            │
│  ┌─────────────────────┐   │   │
│  │ Notification logs     │   │            │
│  │ (30 days)         │   │            │
│  │ Activity logs      │   │            │
│  │ (180 days)        │   │            │
│  │ Usage logs        │   │            │
  │  (90 days)         │   │            │
│  └─────────────────────┘   │            │
│  │                       │   │            │
│  │ Log cleanup            │   │            │
  │  - Archive to disk     │   │            │
└  └─────────────────┘   │            │
                             │            │
└─────────────────────┘
```

### 9.2 Backup Data Flow
```
┌──────────────┐
│  Scheduler   │
│  Daily @ 2 AM│
└─────┬────────┘
      │
      ▼
┌──────────────┐    ┌─────────────────┐
│  Backup     │───▶│  Backup Service  │
│  Service   │    │  .createBackup()│
└─────┬──────┘    └─────────┬──────┘
      │                │            │
      ▼                │            ▼
┌─────────────────────┐   │            │
│  Postgres   │   │            │
│  Dump      │   │            │
│  (pg_dump)  │   │            │
└─────┬─────┘   │            │
      │                │            │
      ▼                │            ▼
┌─────────────────────┐   │            │
│  Compress   │   │            │
│  (gzip)   │   │            │
│  └─────────────┘   │            │
│                │            │
      ▼                │            ▼
│  ┌─────────────────────┐   │            │
│  Encrypt   │   │            │
│  (AES-256) │   │            │
│  └─────────────┘   │            │
│                │            │
      ▼                │            ▼
│  ┌─────────────────────┐   │            │
│  Store     │   │            │
│  File      │   │            │
│ (Local/   │   │            │
│  S3/FTP) │   │            │
└─────────────────────┘   │            │
                             │            │
      ▼                │            ▼
┌─────────────────────┐   │            │
│  Log       │   │            │
│  Metadata  │   │            │
│  + Send     │   │            │
│  Alerts   │   │            │
└─────────────────────┘   │            │
```

## 10. Monitoring Data Flow

### 10.1 Metrics Collection
```
┌──────────────────┐
│  Every     │
│  30s      │
└─────┬────────┘
      │
      ▼
┌──────────────┐
┌──────────────┐
│  Metrics    │
│  Collector │
│  .collect()│
│            │
└─────┬──────┘
      │
      │
      ▼
┌─────────────────────┐
│  System     │
│  Metrics   │
│  (CPU, RAM, │
│   Disk,    │
│   Network)│
└─────┬──────┘
      │
      ▼
┌──────────────┐
┌──────────────┐
│  App       │
│  Metrics   │
│ (Response │
│  Times,   │
│  Rates)   │
└─────┬──────┘
      │
      ▼
┌──────────────┐
┌──────────────┐
│  DB        │
│  Metrics   │
│ (Queries, │
│  Pool,     │
│  Errors)   │
└─────┬──────┘
      │
      ▼
┌──────────────┐
┌──────────────┐
│  Business  │
│  Metrics   │
│  (Revenue, │
│  Users,   │
│  Growth)  │
└─────┬──────┘
      │
      ▼
┌───────────────────────────────────────┐
│  Prometheus Push                    │
└──────────────────────────────────────┘
```

### 10.2 Health Check Data
```
┌──────────────┐
│  API Health  │
│  Endpoint  │
│  /health   │
└─────┬────────┘
      │
      ▼
┌──────────────┐    ┌──────────────────┐
│  Health     │───▶│  Health Checker │
│  Service   │    │  .runAllChecks()│
└─────┬──────┘    └─────────┬──────┘
      │                │            │
      ▼                │            ▼
┌─────────────────────┐   │            │
│  Database   │   │            │
│  SELECT 1   │   │
│  (Test)     │   │            │
│  └─────────┬─┘   │            │
│  Status: healthy │  │            │
│  Response: 5ms │   │            │
│                               │
└─────────────────┬─┘   │            │
      │                │            │
      ▼                │            ▼
┌─────────────────────┐   │            │
│  Mikrotik   │   │            │
│  API Call   │   │            │
│  /resource/print│  │            │
│  Status: up │   │            │
│  Response: 12ms │   │            │
│                               │
└─────────────────┬─┘   │            │
      │                │            │
      ▼                │            ▼
┌─────────────────────┐   │            │
│  WhatsApp  │   │            │
│  Sessions  │   │            │
│  │ 3/5 Active │ │            │
│  │ 1 Degraded │   │            │
│                               │
└─────────────────┘   │            │
      │                │            ▼
└───────────────────────────────────────┐
│  Overall    │
│  Status:   │
│  healthy   │
└───────────────────────────────────────┘
```

## 11. Error Handling & Recovery Flow

### 11.1 Centralized Error Handler
```
┌──────────────────┐
│  Any        │
│  Component  │
│  Error     │
└─────┬────────┘
      │
      ▼
┌──────────────┐
│  Error      │
│  Handler   │
│  .handle() │
└─────┬──────┘
      │
      ▼
┌─────────────────────┐
│  Categorize│
│  Error     │
│ (Critical/ │
│  High/Med)│
└─────┬──────┘
      │
      ▼
┌──────────────┐
│  Log Error  │
│  (DB, File,  │
│  Slack)    │
└─────┬──────┘
      │
      ▼
┌──────────────┐
│  Attempt   │
│  Recovery │
│  (Reconnect│
│  /Rollback)│
└─────┬──────┘
      │
      ▼
┌──────────────┐
│  Send Alert│
│  (WhatsApp/  │
│  Email)   │
└──────────────┘
```

### 11.2 Transaction Rollback
```
┌─────────────────────┐
┌─────────────────┐│
│  Transaction   │◄─┤│  API Request   │
│  Begins      │    │  │
└────────┬─────────┘│  │
│              │      │
│  ┌─────────▼─────┐│  │
│  Try        │      │  │
└─────────┬─────────┘│  │
      │              │      │
│  │ Success   │      │  │
  │ └─────────────┘│  │
      │              │      ▼
      │ │ Error     │      │  │
      │ └─────────────┘│  │
│  │ Rollback  │      │  │
│  │ Transaction│      │  │
│  └─────────▼─────┘│  │
└─────────────┘│
```

## 12. Real-time Updates Flow

### 12.1 WebSocket Event Broadcasting
```
┌──────────────────┐
│  Event      │
│  Trigger    │
│  (Payment  │
│  Status   │
│  Change)  │
└─────┬────────┘
      │
      ▼
┌──────────────┐
│  WebSocket  │
│  Service  │
│  .emit() │
└─────┬────┘
      │
      ▼
┌──────────────────────────────────────┐
│    WebSocket Server (socket.io)          │
│    ┌─────────────────────────┐    │
│    │ Admin Dashboard Clients         │    │
│    │ └─► Receive update          │    │
│    │ Invoice Manager Clients     │    │
    │ Customer Portal Clients        │    │
│    └───────────────────────────┘    │
└──────────────────────────────────────┘
```

## 13. Integration Matrix Summary

### 13.1 Data Flow Map

| Component | Data Source | Data Destination | Frequency | Notes |
|----------|------------|-----------------|----------|-------|
| Customer | Frontend Form | PostgreSQL | Real-time | CRUD operations |
| Authentication | JWT Token | Redis | Session | Token storage |
| Mikrotik | RouterOS API | PostgreSQL | Polling | User data sync |
| WhatsApp | Message Queue | PostgreSQL | Queue | Delivery status |
| Payment | Gateway API | PostgreSQL | Callback | Transaction status |
| Monitoring | System Metrics | Prometheus | 30s | Health checks |
| Backup | PostgreSQL | File System | Daily | Data backup |

### 13.2 Data Integrity Points
1. **Database Transactions**: All critical operations use ACID transactions
2. **Audit Logs**: All sensitive operations are logged
3. **Data Validation**: Input validation at API level
4. **Error Recovery**: Automatic rollback on failures
5. **Backup Verification**: Regular backup integrity checks

---

*Version: 2.0.0*
*Last Updated: 2025-01-09*
*Status: Complete Integration*