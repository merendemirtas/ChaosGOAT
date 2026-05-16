# Chaos GOAT — Kapsamlı Proje Dokümantasyonu

> **Proje Adı:** Chaos GOAT (Kintsugi Monkey Banking)  
> **Tür:** Kaos Mühendisliği Demo Platformu — Bankacılık Mikroservis Sistemi  
> **Stack:** Node.js · Express · React 19 · SQLite · Docker · Gemini AI  
> **Felsefe:** Kintsugi — "Kırıkları altınla onar, zayıflıkları güce dönüştür"

---

## İçindekiler

1. [Proje Nedir?](#1-proje-nedir)
2. [Mimari Genel Bakış](#2-mimari-genel-bakış)
3. [Servisler ve Portlar](#3-servisler-ve-portlar)
4. [Bağımlılık Grafiği](#4-bağımlılık-grafiği)
5. [Backend API — Tüm Endpointler](#5-backend-api--tüm-endpointler)
6. [Mikroservis Endpointleri](#6-mikroservis-endpointleri)
7. [Kaos Metodları](#7-kaos-metodları)
8. [Risk Modeli](#8-risk-modeli)
9. [Gemini AI Entegrasyonu](#9-gemini-ai-entegrasyonu)
10. [Veritabanı Şeması](#10-veritabanı-şeması)
11. [Frontend Sayfaları](#11-frontend-sayfaları)
12. [Frontend Bileşenleri](#12-frontend-bileşenleri)
13. [Veri Akışı — Bir Deney Nasıl Çalışır?](#13-veri-akışı--bir-deney-nasıl-çalışır)
14. [Güvenli Bozunma Mekanizması](#14-güvenli-bozunma-mekanizması)
15. [Projeyi Çalıştırma](#15-projeyi-çalıştırma)
16. [Sunum Rehberi — 3 Kişilik Bölüm](#16-sunum-rehberi--3-kişilik-bölüm)

---

## 1. Proje Nedir?

**Chaos GOAT**, bankacılık alanında çalışan mikroservis sistemlerinin arızalara karşı dayanıklılığını test etmek için tasarlanmış bir **Kaos Mühendisliği (Chaos Engineering)** platformudur.

### Temel Fikir
Netflix, Google SRE ve AWS gibi büyük teknoloji şirketleri, sistemlerini kasıtlı olarak bozarak zayıf noktaları production'a çıkmadan keşfeder. Chaos GOAT bu yaklaşımı bankacılık senaryosuna uygular:

- 8 mikroservis içeren simüle bir bankacılık sistemi kurulur
- Servisler kontrollü şekilde bozulur (ağ gecikmesi, servis çökmesi, CPU baskısı vb.)
- Gerçek işlem akışı (para transferi) bu bozunma altında test edilir
- Google SRE metodolojisiyle risk skoru hesaplanır
- Google Gemini AI, sonuçları analiz ederek geliştirici önerileri üretir

### Kintsugi Felsefesi
Japon kintsugi sanatında kırık seramik altın eriğiyle onarılır — çatlaklar gizlenmez, görünür kılınır. Chaos GOAT da sistemin kırıklarını bulur ve bunları bilgi olarak değerlendirir.

---

## 2. Mimari Genel Bakış

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                      │
│            localhost:5173 / Vite Dev Server              │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP
┌──────────────────────────▼──────────────────────────────┐
│              CHAOS GOAT API (kintsugi-monkey-api)        │
│                      localhost:4000                      │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  riskModel  │  │ geminiAnalyz │  │     db.js     │  │
│  │    .js      │  │    er.js     │  │   (SQLite)    │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP (Docker network)
         ┌─────────────────┼─────────────────────┐
         │                 │                      │
┌────────▼────────┐ ┌──────▼──────────┐ ┌────────▼────────┐
│account-service  │ │transaction-svc  │ │fraud-check-svc  │
│    :4001        │ │     :4002       │ │     :4003       │
└─────────────────┘ └────────┬────────┘ └────────┬────────┘
                             │                    │
              ┌──────────────┼──────────────┐     │
              │              │              │     │
     ┌────────▼──┐  ┌────────▼──┐  ┌───────▼──┐  │
     │  limit-   │  │beneficiary│  │compliance│  │
     │  service  │  │  service  │  │  service │  │
     │   :4006   │  │   :4007   │  │   :4008  │  │
     └────────┬──┘  └────────┬──┘  └───────┬──┘  │
              │              │              │     │
              └──────────────┴──────────────┘     │
                           account-service ◄───────┘
                                                   │
                                          ┌────────▼────────┐
                                          │risk-profile-svc │
                                          │     :4005       │
                                          └─────────────────┘
```

---

## 3. Servisler ve Portlar

| Servis | Port | Kritiklik | Konteyner Adı | Açıklama |
|--------|------|-----------|---------------|----------|
| **kintsugi-monkey-api** | 4000 | — | `kintsugi-monkey-api` | Ana API gateway, orkestrasyon |
| **account-service** | 4001 | HIGH | `kintsugi-account-service` | Hesap bilgileri ve bakiye |
| **transaction-service** | 4002 | HIGH | `kintsugi-transaction-service` | Para transferi akışı |
| **fraud-check-service** | 4003 | HIGH | `kintsugi-fraud-check-service` | Sahtecilik tespiti |
| **notification-service** | 4004 | LOW | `kintsugi-notification-service` | Bildirim gönderimi |
| **risk-profile-service** | 4005 | MEDIUM | `kintsugi-risk-profile-service` | Müşteri risk profili |
| **limit-service** | 4006 | HIGH | `kintsugi-limit-service` | Günlük transfer limiti |
| **beneficiary-service** | 4007 | HIGH | `kintsugi-beneficiary-service` | Alıcı doğrulama |
| **compliance-service** | 4008 | HIGH | `kintsugi-compliance-service` | Uyumluluk kontrolü |
| **frontend** | 5173 | — | `kintsugi-frontend` | React arayüzü |

---

## 4. Bağımlılık Grafiği

```
transaction-service
  ├── → fraud-check-service    (fraud runtime dependency)
  │         └── → risk-profile-service  (risk profile lookup)
  ├── → limit-service          (limit runtime dependency)
  │         └── → account-service       (account lookup)
  ├── → beneficiary-service    (beneficiary validation dependency)
  │         └── → account-service       (beneficiary account lookup)
  ├── → compliance-service     (compliance approval dependency)
  │         └── → account-service       (compliance account lookup)
  └── → notification-service   (notification side effect)
```

**Kritik gözlem:** `account-service` çöktüğünde limit, beneficiary ve compliance servisleri de etkilenir — bu da transaction akışının tamamen durması demektir. Bu 4 derinlikli bağımlılık zinciri sistemin en kırılgan noktasıdır.

---

## 5. Backend API — Tüm Endpointler

**Base URL:** `http://localhost:4000`

### Sağlık ve Topoloji

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health/services` | Tüm servislerin sağlık durumu + bağımlılık zinciri |
| `GET` | `/topology` | Servis kayıt defteri ve bağımlılık grafiği |

**GET /health/services** Yanıt Örneği:
```json
{
  "services": [
    { "name": "account-service", "status": "UP", "latencyMs": 12 },
    { "name": "fraud-check-service", "status": "DOWN", "latencyMs": 2001 }
  ],
  "dependencyChains": [...],
  "timestamp": "2026-05-16T10:00:00Z"
}
```

### Kaos Metodları

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/chaos/methods` | Tüm kaos metodları ve varsayılan konfigürasyon |

### Bankacılık Operasyonları

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `POST` | `/banking/demo-transaction` | Demo işlem çalıştır (tekli veya toplu) |

**POST /banking/demo-transaction** Body:
```json
{ "count": 1, "concurrency": 1 }
```

### Kaos Deneyleri

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `POST` | `/experiments/run` | Kaos deneyi başlat |
| `POST` | `/experiments/recover` | Aktif deneyi durdur ve sistemi kurtar |
| `POST` | `/experiments/kill-fraud-check` | fraud-check kısa yol durdurma |
| `POST` | `/experiments/recover-fraud-check` | fraud-check kısa yol kurtarma |
| `POST` | `/experiments/:id/analyze` | Gemini AI ile deney analizi |
| `GET` | `/experiments` | Tüm deneyleri listele |
| `GET` | `/experiments/:id` | Deney detayları (metrikler + loglar dahil) |

**POST /experiments/run** Body:
```json
{
  "target_service": "fraud-check-service",
  "chaos_method": "network_delay",
  "config": {
    "latencyMs": 2000,
    "requestCount": 12,
    "concurrency": 3
  }
}
```

**POST /experiments/run** Yanıt:
```json
{
  "id": "exp_1747390000000",
  "target_service": "fraud-check-service",
  "fault_type": "network_delay",
  "status": "running",
  "risk_score": 28.5,
  "risk_level": "LOW",
  "message": "fraud-check-service chaos injection active"
}
```

**POST /experiments/recover** Body:
```json
{ "experimentId": "exp_1747390000000" }
```

**POST /experiments/:id/analyze** — Body gerekmez. Yanıt:
```json
{
  "id": "gt_1747390001000",
  "experiment_id": "exp_1747390000000",
  "chaos_method_classification": "Ağ Gecikmesi deneyi — gecikme kategorisi",
  "summary": "fraud-check-service, 2000ms gecikme enjekte edilerek test edildi...",
  "suspected_weak_point": "...",
  "blast_radius": "...",
  "risk_level": "LOW",
  "risk_score": 28.5,
  "developer_recommendations": ["...", "..."],
  "analyzer": "gemini"
}
```

### Golden Traces (AI Analiz Sonuçları)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/golden-traces` | Tüm AI analiz sonuçları |
| `GET` | `/golden-traces/:id` | Belirli bir analiz kaydı |

---

## 6. Mikroservis Endpointleri

### account-service (Port 4001)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health` | Servis durumu (chaos moduna göre UP/DEGRADED) |
| `GET` | `/accounts/1` | Demo hesap bilgisi (acc_1001, 50.000 TRY) |
| `GET` | `/chaos` | Mevcut chaos konfigürasyonu |
| `POST` | `/chaos/configure` | Chaos enjeksiyonu yapılandır |
| `POST` | `/chaos/reset` | Chaos durumunu sıfırla |

### transaction-service (Port 4002)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health` | 5 bağımlılığın durumunu kontrol eder |
| `POST` | `/transactions/demo` | Tam işlem akışı (limit → beneficiary → compliance → fraud → notification) |

**İşlem Akışı Sonuç Durumları:**
- `approved` — Tüm kontroller geçti, işlem onaylandı
- `pending_manual_review` — Sahtecilik kontrolü başarısız/devre dışı (güvenli bozunma)
- `pending_limit_review` — Limit aşıldı
- `failed` — Kritik bağımlılık hatası

### fraud-check-service (Port 4003)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health` | risk-profile bağımlılığı kontrol |
| `POST` | `/fraud/check` | İşlem için sahtecilik riski değerlendirmesi |
| `GET` | `/chaos` | Chaos durumu |
| `POST` | `/chaos/configure` | Chaos yapılandır |
| `POST` | `/chaos/reset` | Chaos sıfırla |

**POST /fraud/check** Body:
```json
{
  "transactionId": "txn_001",
  "amount": 5000,
  "fromAccount": "acc_1001",
  "toAccount": "acc_2002"
}
```

### notification-service (Port 4004)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health` | Her zaman UP (kritiklik: LOW) |
| `POST` | `/notify` | Bildirim kuyruğa al |

**Not:** notification-service'in çökmesi işlem akışını durdurmaz (side effect, kritik yol değil).

### risk-profile-service (Port 4005)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health` | Cache durumuna göre UP/DEGRADED |
| `GET` | `/risk-profile/:accountId` | Müşteri risk profili |
| `GET` | `/chaos` | Chaos durumu |
| `POST` | `/chaos/configure` | Chaos yapılandır |
| `POST` | `/chaos/reset` | Chaos sıfırla |

**Risk Profil Yanıtı:**
- `acc_1001`: `{ customerTier: "standard", riskBand: "LOW" }`
- `acc_2002`: `{ customerTier: "watch", riskBand: "MEDIUM" }`
- `cache_disconnect` aktifken: fallback path devreye girer, +700ms gecikme

### limit-service (Port 4006)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health` | account-service bağımlılığı kontrol |
| `POST` | `/limits/check` | Günlük transfer limiti kontrol |
| `GET/POST` | `/chaos/*` | Chaos kontrolü |

**Limit:** acc_1001 için günlük 15.000 TRY

### beneficiary-service (Port 4007)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health` | account-service bağımlılığı kontrol |
| `POST` | `/beneficiaries/validate` | Alıcı hesap doğrulama |
| `GET/POST` | `/chaos/*` | Chaos kontrolü |

**Alıcı Durumları:** `verified` (onaylı), `blocked` (engelli)

### compliance-service (Port 4008)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health` | account-service bağımlılığı kontrol |
| `POST` | `/compliance/check` | Uyumluluk kontrolü |
| `GET/POST` | `/chaos/*` | Chaos kontrolü |

**Uyumluluk Kuralı:** `amount <= max(1000, account.balance * 0.70)` ise onaylanır

---

## 7. Kaos Metodları

| Kod | Label | Kategori | Desteklenen Hedefler | Açıklama |
|-----|-------|----------|----------------------|----------|
| `service_kill` | Service Kill | availability | fraud-check, risk-profile, limit, account, beneficiary, compliance | Konteyneri tamamen durdurur |
| `network_delay` | Network Delay | latency | fraud-check, risk-profile, limit, account, beneficiary, compliance | Yanıt gecikmesi enjekte eder |
| `packet_loss` | Packet Loss | network_reliability | fraud-check, risk-profile, limit, account, beneficiary, compliance | Rastgele istekleri düşürür |
| `cpu_stress` | CPU Stress | resource_pressure | fraud-check, risk-profile, limit, account, beneficiary, compliance | CPU döngüsü yakar |
| `memory_stress` | Memory Stress | resource_pressure | fraud-check, risk-profile, limit, account, beneficiary, compliance | Bellek tahsis eder |
| `db_disconnect` | DB Disconnect | dependency_loss | account-service (özel) | Hesap veri deposunu keser |
| `cache_disconnect` | Cache Disconnect | dependency_loss | risk-profile-service (özel) | Risk önbelleğini keser |
| `traffic_surge` | Traffic Surge | load | transaction-service (özel) | Yoğun eşzamanlı trafik gönderir |
| `partial_failure` | Partial Failure | partial_outage | fraud-check, risk-profile, limit, account, beneficiary, compliance | Bazı istekler başarısız, bazıları geçer |

### Varsayılan Chaos Konfigürasyonu

```json
{
  "latencyMs": 1200,
  "packetLossRate": 0.35,
  "cpuStressMs": 450,
  "memoryStressMb": 48,
  "partialFailureRate": 0.70,
  "partialFailurePattern": "alternate",
  "requestCount": 12,
  "concurrency": 6
}
```

### Chaos Middleware Mekanizması

Her mikroservis aynı chaos middleware yapısını destekler:

```
POST /chaos/configure
Body: {
  "mode": "network_delay",
  "latencyMs": 2000,
  "packetLossRate": 0.35,
  "cpuStressMs": 450,
  "memoryStressMb": 48,
  "partialFailureRate": 0.70
}
```

Middleware her istek geldiğinde:
1. `mode === "network_delay"` → `sleep(latencyMs)`
2. `mode === "packet_loss"` → Rastgele `503` döndür
3. `mode === "cpu_stress"` → CPU döngüsü yak
4. `mode === "memory_stress"` → Buffer tahsis et
5. `mode === "partial_failure"` → `partialFailureRate` oranında hata ver

---

## 8. Risk Modeli

**Dosya:** `backend/kintsugi-monkey-api/src/riskModel.js`  
**Metodoloji:** Google SRE Error Budget + Netflix Resilience Score + AWS Resilience Hub

### Risk Eşik Değerleri

| Seviye | Skor Aralığı | Anlamı |
|--------|-------------|--------|
| **LOW (DÜŞÜK)** | 0 – 31 | Fallback çalıştı, kurtarma hızlı, etki alanı dar |
| **MEDIUM (ORTA)** | 32 – 62 | Bozunma gözlemlendi, kurtarma kabul edilebilir |
| **HIGH (YÜKSEK)** | 63 – 100 | Tam kesinti, uzun kurtarma, geniş etki |

### 9 Metrik ve Ağırlıkları

| Metrik | Ağırlık | Açıklama |
|--------|---------|----------|
| MTTR (Kurtarma Süresi) | 0.20 | < 15s: 8, < 30s: 18, < 60s: 32, < 120s: 50, < 300s: 70, > 300s: 90 |
| Servis Kritikliği | 0.12 | HIGH: 85, MEDIUM: 55, LOW: 30 (normalize edilmiş) |
| Blast Radius (Etki Alanı) | 0.18 | Etkilenen servis sayısı / toplam servis sayısı |
| Hata Oranı | 0.20 | Başarısız istek yüzdesi |
| Bozunma Oranı | 0.12 | Fallback'e düşen istek yüzdesi |
| P95 Gecikme | 0.08 | Kuyruk gecikmesi |
| Bağımlılık Zinciri Derinliği | 0.06 | Bağımlılık grafında etki derinliği |
| Kaos Metodu Şiddeti | 0.06 | service_kill: 1.0, cache_disconnect: 0.66 |
| Eşzamanlı Hedef Sayısı | 0.08 | Aynı anda kaç servis hedeflendi |
| **Güvenli Bozunma (Safe Degradation)** | **-0.10** | Aktif fallback riski düşürür |

### Skor Hesaplama

```javascript
score = (Σ (normalizedValue[i] / 100 * weight[i])) / (Σ |weight[i]|) * 100
```

### Sistem Resilience Skoru (Frontend)

```javascript
// Kritiklik ağırlıkları: HIGH=1.5, MEDIUM=1.0, LOW=0.5
weightedSum += (100 - experiment.risk_score) * criticalityWeight;
systemScore = weightedSum / totalWeight;
```

---

## 9. Gemini AI Entegrasyonu

**Dosya:** `backend/kintsugi-monkey-api/src/geminiAnalyzer.js`  
**Model:** `gemini-2.5-flash` (fallback: `gemini-2.0-flash`, `gemini-1.5-flash`)  
**API Key:** Environment variable `GEMINI_API_KEY`

### Gemini'ye Gönderilen Veri

```json
{
  "experiment": { "fault_type", "target_service", "recovery_time_ms", ... },
  "topology": { "services", "dependencies" },
  "service_metrics": [...],
  "incident_logs": [...],
  "risk_profile": {
    "score": 28.5,
    "level": "LOW",
    "metrics": [...]
  }
}
```

### Gemini Çıktısı (JSON)

```json
{
  "chaos_method_classification": "Ağ Gecikmesi deneyi — gecikme kategorisi",
  "summary": "...",
  "suspected_weak_point": "...",
  "blast_radius": "...",
  "risk_level": "DÜŞÜK | ORTA | YÜKSEK",
  "risk_level_reasoning": "...",
  "safe_degradation_review": "...",
  "developer_recommendations": ["...", "..."],
  "next_experiments": ["...", "..."],
  "kintsugi_lesson": "...",
  "current_failure_probability": 25,
  "improved_failure_probability": 12,
  "probability_reasoning": "..."
}
```

### Hata Olasılığı Hesaplama Kuralları

- **LOW risk:** current_failure_probability = 5–28
- **MEDIUM risk:** current_failure_probability = 28–60
- **HIGH risk:** current_failure_probability = 60–90
- **Improved probability:** Öneriler uygulandıktan sonra beklenen, mevcut değerden 12–45 puan düşük

### Fallback Analizör

Gemini API erişilemez olduğunda `buildFallbackAnalysis()` devreye girer:
- Tüm alanlar Türkçe, hardcoded
- Risk skoru `riskModel.js` çıktısından alınır
- Hata olasılığı MTTR + hata oranı + fallback kullanımına göre hesaplanır

---

## 10. Veritabanı Şeması

**Veritabanı:** SQLite  
**Dosya:** `backend/kintsugi-monkey-api/data/kintsugi-monkey.db`

### Tablolar

**experiments**
```
id, domain, target_service, target_services (JSON),
affected_service, affected_services (JSON),
fault_type, chaos_method_category, status,
started_at, ended_at, recovery_time_ms,
safe_degradation, chaos_config (JSON),
request_count, success_count, failed_count, degraded_count,
average_latency_ms, p95_latency_ms, peak_latency_ms,
risk_score, risk_level, risk_metrics (JSON),
impact_chain (JSON), created_at
```

**service_metrics**
```
id, experiment_id, service_name, status,
latency_ms, error_count, degraded_count,
failed_requests, fallback_used, success_count,
packet_loss_count, timeout_count,
notes (JSON), timestamp
```

**incident_logs**
```
id, experiment_id, level (INFO/WARN/ERROR),
message, metadata_json, created_at
```

**golden_traces** (AI Analiz Sonuçları)
```
id, experiment_id, chaos_method_classification,
summary, suspected_weak_point, blast_radius,
risk_level, risk_score, risk_level_reasoning,
safe_degradation_review, developer_recommendations (JSON),
next_experiments (JSON), risk_metrics (JSON),
kintsugi_lesson, translated_to,
raw_ai_response, created_at
```

**service_status**
```
name, status, criticality, last_checked
```

---

## 11. Frontend Sayfaları

**Base URL:** `http://localhost:5173`  
**Router:** React Router v6

### Rota Haritası

| Rota | Sayfa | Açıklama |
|------|-------|----------|
| `/onboarding` | Onboarding | İlk açılış ekranı, proje tanıtımı |
| `/` | Dashboard | Topoloji grafiği + özet metrikler |
| `/scenarios` | Senaryolar | Chaos engine + deney geçmişi |
| `/reports` | Raporlar | Sistem skoru + risk grafikleri |
| `/ai-suggests` | AI Önerileri | Gemini analizi + hata olasılığı |

### Onboarding Sayfası
- İlk ziyarette otomatik gösterilir (`localStorage` kontrolü)
- Projeyi ve Kintsugi felsefesini tanıtır
- "Başla" butonuyla Dashboard'a yönlendirir
- Tamamlandıktan sonra bir daha gösterilmez

### Dashboard Sayfası
- **Topology Graph:** 8 servisi ve bağımlılıkları SVG force-layout ile gösterir
  - UP: Yeşil nabız animasyonu
  - DOWN: Kırmızı
  - DEGRADED: Sarı
- **Stat Kartları:** Toplam deney sayısı, başarı oranı, ortalama MTTR
- **"Senaryo Oluştur" Butonu:** /scenarios'a yönlendirir

### Senaryolar Sayfası
- **Servis Durumu Grid'i:** 8 servis, gerçek zamanlı UP/DOWN/DEGRADED
- **Chaos Engine Formu:**
  - Kaos Metodu seçici (9 seçenek)
  - Hedef servis listesi (metoda göre dinamik)
  - Config sliders (gecikme, paket kaybı, CPU/bellek, vb.)
  - "Chaos Başlat" / "Kurtarma Başlat" butonları
  - Yüklenme durumları: "Başlatılıyor..." / "Kurtarılıyor..."
- **Deney Geçmişi:** Son 5 deney, sayfalama ile

### Raporlar Sayfası
- **Sistem Resilience Skoru:** Kritiklik ağırlıklı ortalama (0–100)
- **Risk Dağılım Barları:** LOW / MEDIUM / HIGH deney sayıları
- **Trend Grafiği:** Zaman içinde resilience skoru (Recharts LineChart)
- **"AI ile Analiz Et" Butonu:** Son deneyi `/experiments/:id/analyze` ile gönderir, ardından AI Önerileri sayfasına geçer

### AI Önerileri Sayfası
- **"Son Deneyi Analiz Et" Butonu:** Gemini analizi tetikler
- **TraceCard Bölümleri:**
  - Kaos Metodu Sınıflandırması
  - Deney Özeti
  - Şüpheli Zayıf Nokta
  - Etki Alanı (Blast Radius)
  - Risk Seviyesi ve Gerekçesi
  - Güvenli Bozunma Değerlendirmesi
  - Geliştirici Önerileri (madde madde)
  - Sonraki Önerilen Deneyler
  - Kintsugi Dersi
- **Hata Olasılığı Kartı:**
  - Apple tarzı animasyonlu donut chart (SVG + requestAnimationFrame)
  - Mevcut hata ihtimali (%)
  - Öneriler uygulanırsa beklenen iyileşme (%)
  - Gemini AI'ın gerekçesi
- **Golden Trace Geçmişi:** Son 5 analiz, sayfalama ile

---

## 12. Frontend Bileşenleri

### Layout.jsx
- Üst navigasyon çubuğu (80px yükseklik)
- Logo (logo3.png, 63x63px) + "CHAOS GOAT" brand
- Aktif sekme: gradient arka plan + glow efekti
- "CANLI" yeşil göstergesi
- Ana içerik: `paddingTop: 92px`

### TopologyGraph.jsx
- SVG tabanlı force-layout servis topolojisi
- 8 düğüm: servis adı + kritiklik seviyesi
- Yönlü oklar + Türkçe kenar etiketleri
- UP servislerde nabız animasyonu
- DOWN servislerde kırmızı renk
- Gerçek zamanlı health polling

### AnimatedBackground.jsx
- Canvas tabanlı animasyonlu arka plan
- Koyu taban (#010205)
- 3 ambient orb (altın, mavi, teal) — yavaş sürükleme
- Yıldız alanı
- Altın parçacık ağı
- Vignette efekti

---

## 13. Veri Akışı — Bir Deney Nasıl Çalışır?

```
Kullanıcı: "Chaos Başlat" → fraud-check-service + network_delay
        ↓
POST /experiments/run
{target_service: "fraud-check-service", chaos_method: "network_delay"}
        ↓
runChaosExperiment()
  1. Aktif deney kontrolü (409 if exists)
  2. Deney kaydı oluştur (SQLite)
  3. POST /chaos/configure → fraud-check-service:4003
     {mode: "network_delay", latencyMs: 1200}
  4. 12 demo transaction gönder (seri)
     → transaction-service → fraud-check (1200ms gecikme)
     → Her istek: approved / pending_manual_review / failed
  5. Tüm servislerin snapshot'ını al
  6. computeRiskProfile() ile skor hesapla
  7. Deney kaydını güncelle (risk_score, risk_level)
        ↓
Yanıt: {id: "exp_xxx", risk_score: 28.5, risk_level: "LOW"}
        ↓
Kullanıcı: "Kurtarma Başlat"
        ↓
POST /experiments/recover
  1. POST /chaos/reset → fraud-check-service
  2. Tüm servisler UP olana kadar bekle (max 20s)
  3. recovery_time_ms hesapla
  4. Deney status = "completed"
  5. Final risk skoru hesapla
        ↓
Kullanıcı: "Analiz Et"
        ↓
POST /experiments/:id/analyze
  1. Deney detaylarını çek
  2. computeRiskProfile() çalıştır
  3. analyzeWithGemini(payload) — Türkçe prompt
  4. Gemini: JSON yanıt (risk, öneriler, olasılıklar)
  5. Golden Trace kaydı oluştur
  6. Yanıt frontend'e
```

---

## 14. Güvenli Bozunma Mekanizması

**Safe Degradation Message:**  
`"Transactions moved to pending manual review instead of auto-approval."`

### Nasıl Çalışır?

`fraud-check-service` çöktüğünde veya yavaşladığında, `transaction-service` işlemi reddetmek yerine **manuel inceleme** kuyruğuna alır:

```
Normal akış:        transaction → fraud-check → APPROVED
Bozunma altında:    transaction → fraud-check (DOWN) → pending_manual_review
```

Bu bankacılık açısından güvenlidir çünkü:
- İşlem reddedilmez (müşteri deneyimi korunur)
- Otomatik onaylanmaz (güvenlik korunur)
- Bir insan inceleyene kadar bekler

### Risk Modeline Etkisi
`safe_degradation_relief` metriği ağırlığı **-0.10** (negatif, skoru düşürür). Fallback aktifse LOW risk mümkün hale gelir.

---

## 15. Projeyi Çalıştırma

### Gereksinimler
- Docker & Docker Compose
- Node.js 18+ (yerel geliştirme için)
- Gemini API Key

### Başlatma

```bash
# Proje dizinine git
cd GOATS-kintsugimonkey

# Tüm servisleri başlat
docker compose up --build

# Frontend: http://localhost:5173
# API:      http://localhost:4000
```

### Ortam Değişkenleri

`backend/kintsugi-monkey-api/.env`:
```
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.5-flash
PORT=4000
```

### Servis Durumu Kontrolü

```bash
curl http://localhost:4000/health/services
```

### Manuel Kaos Testi (Terminal)

```bash
# Chaos başlat
curl -X POST http://localhost:4000/experiments/run \
  -H "Content-Type: application/json" \
  -d '{"target_service":"fraud-check-service","chaos_method":"service_kill","config":{}}'

# Kurtarma
curl -X POST http://localhost:4000/experiments/recover \
  -H "Content-Type: application/json" \
  -d '{"experimentId":"exp_XXXXX"}'

# Analiz
curl -X POST http://localhost:4000/experiments/exp_XXXXX/analyze
```

---

## 16. Sunum Rehberi — 3 Kişilik Bölüm

### Kişi 1 — "Problem ve Mimari" (3–4 dk)

**Anlat:**
- Bankacılık sistemlerinde neden kaos mühendisliği gerekli?
  - Production'da bir servis çökerse ne olur? (Netflix 2008, AWS 2012 örnekleri)
  - BDDK/PCI-DSS uyumu için sistem dayanıklılık testleri zorunlu hale geliyor
- Kintsugi felsefesi: "Kırıkları gizlemek yerine görünür kıl, güçlendir"
- Mimari: 8 mikroservis, nasıl birbirine bağlı?

**Göster:** Dashboard → Topology Graph üzerinde bağımlılık zincirini anlat

**Kritik mesaj:** "account-service çöktüğünde neden 4 servis etkilenir?" sorusunu cevapla

---

### Kişi 2 — "Chaos Engine ve Canlı Demo" (4–5 dk)

**Anlat:**
- 9 kaos metodu ve kategorileri (availability, latency, load...)
- Chaos middleware: Her servis kendi kaos enjeksiyonunu yönetir
- `/chaos/configure` → Middleware devreye girer → İstekler bozulur

**Demo:**
1. Senaryolar → `notification-service` + `network_delay` → "Chaos Başlat"
2. "Başlatılıyor..." spinner'ı izlet
3. Risk skorunu göster (LOW olmalı — notification-service kritiklik LOW)
4. "Kurtarma Başlat" → recovery_time_ms izlet

**Kritik mesaj:** "Risk skoru Google SRE metodolojisiyle 9 metrikten hesaplanıyor — sadece downtime'a bakılmıyor"

---

### Kişi 3 — "AI Analizi ve Değer" (3–4 dk)

**Anlat:**
- Raporlar: Sistem Resilience Skoru nasıl hesaplanıyor?
  - Kritiklik ağırlıklı ortalama (HIGH servisleri daha fazla etkiler)
  - LOW/MEDIUM/HIGH dağılımı
- AI Önerileri: Gemini 2.5 Flash Türkçe analiz
  - Zayıf nokta tespiti, geliştirici önerileri, sonraki deneyler
  - Donut chart: "Şu an %XX hata ihtimali → öneriler uygulanırsa %YY"
- Kintsugi dersi: Her deney bir ders

**Göster:** Raporlar → "AI ile Analiz Et" → AI Önerileri sayfası açılır → Donut chart animasyonu

**Kritik mesaj:** "Deterministik skor (riskModel.js) AI'dan bağımsız çalışır — Gemini sadece yorumlar, objektif metrik değişmez"

---

### Jüri Soruları İçin Hazırlık

**"Gerçek production'da nasıl kullanılır?"**  
→ Chaos endpoint'leri feature flag ile kontrol edilir. Test/staging ortamında aktif, production'da devre dışı. Netflix'in ChAOS aracı da bu prensibi kullanır.

**"Gemini analizi ne kadar güvenilir?"**  
→ Deterministic risk skoru (riskModel.js) AI'dan bağımsız hesaplanır. Gemini sadece yorumlama yapar. Eğer Gemini erişilemezse fallback analyzer devreye girer — sistem çalışmayı sürdürür.

**"Neden 8 servis? Gerçekçi mi?"**  
→ Gerçek bankacılık sistemleri 200+ mikroservis içerir. Bu 8 servis; hesap, işlem, sahtecilik, bildirim, risk profili, limit, alıcı ve uyumluluk — bankacılık para transferinin minimal ama eksiksiz modelidir.

**"Safe degradation her zaman işe yarar mı?"**  
→ Hayır. Sahtecilik kontrolü hiç çalışmadan onaylama güvenlik riski yaratır. Bu yüzden pending_manual_review seçildi — işlemi ne reddet ne de otomatik onayla, bir insan baksın.

**"Sistem Resilience Skoru 58-65 — iyi mi?"**  
→ Google SRE'de %99.9 SLO hedefi vardır; buraya göre 85+ "iyi"dir. 58-65 "geliştirme alanı var" demektir — bu hackathon demo'sunda kasıtlı olarak orta seviye tutulmuştur, gerçek sistemde Kintsugi önerileri uygulanınca 80+'a çıkacağı hesaplanmaktadır.

---

*Bu dokümantasyon Chaos GOAT v1.0 için hazırlanmıştır. Tüm servisler Türkçe arayüz ile sunulmaktadır.*
