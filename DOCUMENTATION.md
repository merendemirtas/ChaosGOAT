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
- Google SRE metodolojisiyle 9 metrikli deterministik risk skoru hesaplanır
- Google Gemini AI, sonuçları Türkçe analiz ederek geliştirici önerileri üretir

### Kintsugi Felsefesi

Japon kintsugi sanatında kırık seramik altın eriğiyle onarılır — çatlaklar gizlenmez, görünür kılınır. Chaos GOAT da sistemin kırıklarını bulur ve bunları kalıcı bilgiye (Golden Trace) dönüştürür.

---

## 2. Mimari Genel Bakış

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React 19)                   │
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
         ┌─────────────────┼───────────────────────┐
         │                 │                        │
┌────────▼────────┐ ┌──────▼──────────┐  ┌─────────▼───────┐
│account-service  │ │transaction-svc  │  │fraud-check-svc  │
│    :4001        │ │     :4002       │  │     :4003       │
└─────────────────┘ └────────┬────────┘  └─────────┬───────┘
                             │                      │
              ┌──────────────┼──────────────┐       │
              │              │              │       │
     ┌────────▼──┐  ┌────────▼──┐  ┌───────▼──┐    │
     │  limit-   │  │beneficiary│  │compliance│    │
     │  service  │  │  service  │  │  service │    │
     │   :4006   │  │   :4007   │  │   :4008  │    │
     └────────┬──┘  └────────┬──┘  └──────────┘    │
              └──────────────┴──► account-service   │
                                                    │
                                          ┌─────────▼───────┐
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

**Kritik gözlem:** `account-service` çöktüğünde limit, beneficiary ve compliance servisleri de etkilenir → transaction akışı tamamen durur. Bu 4-derinlikli bağımlılık zinciri sistemin en kırılgan noktasıdır ve `account-service kill` senaryosunu **HIGH** risk yapar.

---

## 5. Backend API — Tüm Endpointler

**Base URL:** `http://localhost:4000`

### Sağlık ve Topoloji

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health/services` | Tüm servislerin sağlık durumu + bağımlılık zinciri |
| `GET` | `/topology` | Servis kayıt defteri ve bağımlılık grafiği |

### Kaos Metodları

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/chaos/methods` | Tüm kaos metodları ve varsayılan konfigürasyon |

### Bankacılık Operasyonları

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `POST` | `/banking/demo-transaction` | Demo işlem çalıştır (tekli veya toplu) |

Body: `{ "count": 1, "concurrency": 1 }`

### Kaos Deneyleri

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `POST` | `/experiments/run` | Kaos deneyi başlat |
| `POST` | `/experiments/recover` | Aktif deneyi durdur ve sistemi kurtar |
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
  "risk_score": 30.1,
  "risk_level": "MEDIUM",
  "message": "fraud-check-service chaos injection active"
}
```

### Golden Traces

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/golden-traces` | Tüm AI analiz sonuçları |
| `GET` | `/golden-traces/:id` | Belirli bir analiz kaydı |

---

## 6. Mikroservis Endpointleri

### account-service (Port 4001)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health` | Servis durumu |
| `GET` | `/accounts/1` | Demo hesap (acc_1001, 50.000 TRY) |
| `GET` | `/chaos` | Mevcut chaos konfigürasyonu |
| `POST` | `/chaos/configure` | Chaos enjeksiyonu yapılandır |
| `POST` | `/chaos/reset` | Chaos durumunu sıfırla |

### transaction-service (Port 4002)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health` | 5 bağımlılığın durumunu kontrol eder |
| `POST` | `/transactions/demo` | Tam işlem akışı: limit → beneficiary → compliance → fraud → notification |

**İşlem sonuç durumları:**
- `approved` — Tüm kontroller geçti
- `pending_manual_review` — Fraud kontrolü başarısız/devre dışı (güvenli bozunma)
- `pending_limit_review` — Limit aşıldı
- `failed` — Kritik bağımlılık hatası

### fraud-check-service (Port 4003)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health` | risk-profile bağımlılığı kontrol |
| `POST` | `/fraud/check` | Sahtecilik riski değerlendirmesi |
| `GET` | `/chaos` | Chaos durumu |
| `POST` | `/chaos/configure` | Chaos yapılandır |
| `POST` | `/chaos/reset` | Chaos sıfırla |

### notification-service (Port 4004)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health` | Her zaman UP (kritiklik: LOW) |
| `POST` | `/notify` | Bildirim kuyruğa al |

**Not:** Çökmesi işlem akışını durdurmaz — transaction side effect, kritik yol değil.

### risk-profile-service (Port 4005)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health` | Cache durumuna göre UP/DEGRADED |
| `GET` | `/risk-profile/:accountId` | Müşteri risk profili |
| `GET/POST` | `/chaos/*` | Chaos kontrolü |

Profiller: `acc_1001` → LOW risk, `acc_2002` → MEDIUM risk. `cache_disconnect` aktifken +700ms fallback gecikmesi.

### limit-service (Port 4006)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health` | account-service bağımlılığı kontrol |
| `POST` | `/limits/check` | Günlük transfer limiti kontrol (acc_1001: 15.000 TRY) |
| `GET/POST` | `/chaos/*` | Chaos kontrolü |

### beneficiary-service (Port 4007)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health` | account-service bağımlılığı kontrol |
| `POST` | `/beneficiaries/validate` | Alıcı hesap doğrulama |
| `GET/POST` | `/chaos/*` | Chaos kontrolü |

### compliance-service (Port 4008)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/health` | account-service bağımlılığı kontrol |
| `POST` | `/compliance/check` | Uyumluluk kontrolü |
| `GET/POST` | `/chaos/*` | Chaos kontrolü |

Kural: `amount <= max(1000, balance * 0.70)` ise onaylanır.

---

## 7. Kaos Metodları

| Kod | Label | Kategori | Desteklenen Hedefler |
|-----|-------|----------|----------------------|
| `service_kill` | Service Kill | availability | fraud-check, risk-profile, limit, account, beneficiary, compliance |
| `network_delay` | Network Delay | latency | fraud-check, risk-profile, limit, account, beneficiary, compliance |
| `packet_loss` | Packet Loss | network_reliability | fraud-check, risk-profile, limit, account, beneficiary, compliance |
| `cpu_stress` | CPU Stress | resource_pressure | fraud-check, risk-profile, limit, account, beneficiary, compliance |
| `memory_stress` | Memory Stress | resource_pressure | fraud-check, risk-profile, limit, account, beneficiary, compliance |
| `db_disconnect` | DB Disconnect | dependency_loss | account-service (özel) |
| `cache_disconnect` | Cache Disconnect | dependency_loss | risk-profile-service (özel) |
| `traffic_surge` | Traffic Surge | load | transaction-service (özel) |
| `partial_failure` | Partial Failure | partial_outage | fraud-check, risk-profile, limit, account, beneficiary, compliance |

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

Her servis `/chaos/configure` ile konfigüre edilir. Middleware her istekte:

1. `network_delay` → `sleep(latencyMs)`
2. `packet_loss` → Rastgele `%packetLossRate` oranında `503`
3. `cpu_stress` → CPU döngüsü yak (cpuStressMs ms)
4. `memory_stress` → Buffer tahsis et (memoryStressMb MB)
5. `partial_failure` → `partialFailureRate` oranında hata
6. `service_kill` → Docker container'ı durdurur (middleware değil, Docker API)

---

## 8. Risk Modeli

**Dosya:** `backend/kintsugi-monkey-api/src/riskModel.js`
**Metodoloji:** Google SRE Error Budget + Netflix Resilience Score + AWS Resilience Hub

### Risk Eşik Değerleri

| Seviye | Skor Aralığı | Tipik Senaryo |
|--------|-------------|---------------|
| **LOW (DÜŞÜK)** | 0 – 28 | notification-service kill, risk-profile cache_disconnect |
| **MEDIUM (ORTA)** | 28 – 50 | fraud-check network_delay, limit-service kill |
| **HIGH (YÜKSEK)** | 50 – 100 | account-service kill, fraud-check %70 packet_loss |

### 10 Metrik ve Ağırlıkları

| Metrik | Ağırlık | Normalizasyon |
|--------|---------|---------------|
| MTTR (Kurtarma Süresi) | **0.20** | <15s→8, <30s→18, <60s→32, <120s→50, <300s→70, >300s→90 |
| Servis Kritikliği | 0.12 | HIGH→85, MEDIUM→55, LOW→30 |
| Blast Radius | **0.20** | (etkilenen/toplam)*100 |
| **Hata/Bozunma Oranı** | **0.25** | (failed+degraded)/total — en dominant metrik |
| Bozunma Oranı | 0.10 | degraded/total |
| P95 Gecikme | 0.08 | latency/2000*100 |
| Bağımlılık Zinciri Derinliği | 0.06 | depth/4*100 |
| Kaos Metodu Şiddeti | 0.06 | service_kill=100, cache_disconnect=66 |
| Eşzamanlı Hedef Sayısı | 0.07 | targets/3*100 |
| **Güvenli Bozunma Kalitesi** | **-0.07** | Aktif fallback skoru düşürür (negatif ağırlık) |

> **Önemli:** "Hata/Bozunma Oranı" `failedCount + degradedCount` kullanır. 70% packet_loss → 70% degraded → bu metrik 100 normalize edilir → HIGH risk tetiklenir.

> **Önemli:** `safe_degradation_relief` yalnızca gerçekten `degradedCount > 0` olduğunda aktif olur. Statik mesaj alanına bakılmaz.

### Skor Hesaplama Formülü

```
score = (Σ normalizedValue[i]/100 * weight[i]) / (Σ |weight[i]|) * 100
```

### Sistem Resilience Skoru (Frontend)

```javascript
// Kritiklik ağırlıkları: HIGH=1.5, MEDIUM=1.0, LOW=0.5
weightedSum += (100 - experiment.risk_score) * criticalityWeight;
systemScore = weightedSum / totalWeight;  // 0-100 arası
```

### Gerçek Test Sonuçları

| Senaryo | Risk Skoru | Seviye |
|---------|-----------|--------|
| account-service service_kill | ~57 | **HIGH** |
| fraud-check packet_loss %70 | ~52 | **HIGH** |
| limit-service service_kill | ~50 | **MEDIUM** |
| fraud-check network_delay 1200ms | ~30 | **MEDIUM** |
| risk-profile cache_disconnect | ~26 | **LOW** |

---

## 9. Gemini AI Entegrasyonu

**Dosya:** `backend/kintsugi-monkey-api/src/geminiAnalyzer.js`
**Model:** `gemini-2.5-flash` (fallback: `gemini-2.0-flash`, `gemini-1.5-flash`)
**Dil:** Tüm yanıtlar Türkçe

### Gemini'ye Gönderilen Veri

```json
{
  "experiment": { "fault_type", "target_service", "recovery_time_ms", ... },
  "topology": { "services", "dependencies" },
  "service_metrics": [...],
  "incident_logs": [...],
  "risk_profile": {
    "score": 57.5,
    "level": "HIGH",
    "metrics": [...]
  }
}
```

### Gemini Çıktısı (JSON — Türkçe)

```json
{
  "chaos_method_classification": "Servis Durdurma deneyi — erişilebilirlik kategorisi",
  "summary": "...",
  "suspected_weak_point": "...",
  "blast_radius": "...",
  "risk_level": "DÜŞÜK | ORTA | YÜKSEK",
  "risk_level_reasoning": "...",
  "safe_degradation_review": "...",
  "developer_recommendations": ["...", "..."],
  "next_experiments": ["...", "..."],
  "kintsugi_lesson": "...",
  "current_failure_probability": 62,
  "improved_failure_probability": 28,
  "probability_reasoning": "..."
}
```

### Hata Olasılığı Aralıkları

| Risk Seviyesi | current_failure_probability |
|---------------|----------------------------|
| DÜŞÜK | 5 – 25 |
| ORTA | 25 – 55 |
| YÜKSEK | 50 – 90 |

`improved_failure_probability` = mevcut değerden 12–45 puan düşük (öneriler uygulanınca).

### Fallback Analizör

Gemini API erişilemezse `buildFallbackAnalysis()` devreye girer — Türkçe hardcoded analiz üretir, riskModel.js skorunu kullanır.

---

## 10. Veritabanı Şeması

**Veritabanı:** SQLite
**Dosya:** `backend/kintsugi-monkey-api/data/kintsugi-monkey.db`

### experiments
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

### service_metrics
```
id, experiment_id, service_name, status,
latency_ms, error_count, degraded_count,
failed_requests, fallback_used, success_count,
packet_loss_count, timeout_count, notes (JSON), timestamp
```

### incident_logs
```
id, experiment_id, level (INFO/WARN/ERROR),
message, metadata_json, created_at
```

### golden_traces
```
id, experiment_id, chaos_method_classification,
summary, suspected_weak_point, blast_radius,
risk_level, risk_score, risk_level_reasoning,
safe_degradation_review, developer_recommendations (JSON),
next_experiments (JSON), risk_metrics (JSON),
kintsugi_lesson, translated_to, raw_ai_response, created_at
```

### service_status
```
name, status, criticality, last_checked
```

---

## 11. Frontend Sayfaları

**Router:** React Router v6 | **Bileşenler:** Recharts, Lucide React

### Rota Haritası

| Rota | Sayfa | Açıklama |
|------|-------|----------|
| `/onboarding` | Onboarding | İlk açılış ekranı |
| `/` | Dashboard | Topoloji + istatistikler |
| `/scenarios` | Senaryolar | Chaos Engine + geçmiş |
| `/reports` | Raporlar | Resilience skoru + grafikler |
| `/ai-suggests` | AI Önerileri | Gemini analizi + donut chart |

### Onboarding
- `localStorage` kontrolüyle bir kez gösterilir
- Kintsugi felsefesi ve proje tanıtımı
- "Başla" → Dashboard

### Dashboard
- **TopologyGraph**: 8 servis SVG force-layout, UP/DOWN/DEGRADED renk kodlaması, nabız animasyonu
- Toplam deney, başarı oranı, ortalama MTTR sayaçları
- "Senaryo Oluştur" flow butonu

### Senaryolar
- **ServiceStatusGrid**: 8 servis gerçek zamanlı durum kartları (4s polling)
- **İşlem Akışı**: Limit → Beneficiary → Fraud → Compliance → Notify → Tamamlandı
- **Chaos Engine**:
  - Kaos Metodu seçici (metoda göre desteklenen servisler güncellenir)
  - Config slider'ları (gecikme, paket kaybı, CPU stres vb.)
  - **Chaos Başlat**: Flame ikonu, kırmızı gradient, shimmer animasyonu
  - **Kurtarmayı Başlat**: ShieldCheck ikonu, yeşil gradient, aktif deney nabız göstergesi
- Deney geçmişi (5'li sayfalama)

### Raporlar
- **Sistem Resilience Skoru**: Kritiklik ağırlıklı (HIGH=1.5, MEDIUM=1.0, LOW=0.5)
- **Risk Dağılım Barları**: LOW/MEDIUM/HIGH deney sayıları
- **Trend Grafik**: Zaman içinde resilience (Recharts LineChart)
- **"AI ile Analiz Et"**: Son deney analiz edilip AI Önerileri'ne yönlendirir

### AI Önerileri
- **TraceCard**: Zayıf nokta, etki alanı, risk gerekçesi, güvenli bozunma, öneriler, sonraki deneyler, Kintsugi dersi
- **Hata Olasılığı Kartı**:
  - Apple tarzı animasyonlu SVG donut chart (`requestAnimationFrame`)
  - Mevcut vs öneriler uygulandıktan sonra hata ihtimali
  - Gemini AI gerekçesi
- Golden Trace geçmişi (5'li sayfalama)
- Raporlar sayfasından tetiklenebilir (`sessionStorage` flag)

---

## 12. Frontend Bileşenleri

### Layout.jsx
- Üst nav (80px), `paddingTop: 92px` içerik
- Logo (logo3.png, 63×63), "CHAOS GOAT" brand
- Aktif sekme: gradient + glow + border efekti
- "CANLI" yeşil nabız göstergesi

### TopologyGraph.jsx
- SVG force-layout, 8 düğüm
- UP: yeşil nabız animasyonu | DOWN: kırmızı | DEGRADED: sarı
- Yönlü oklar + Türkçe kenar etiketleri
- 4s polling ile gerçek zamanlı güncelleme

### AnimatedBackground.jsx
- Canvas: koyu taban (#010205)
- 3 ambient orb (altın, mavi, teal) yavaş sürükleme
- Yıldız alanı + altın parçacık ağı + vignette

---

## 13. Veri Akışı — Bir Deney Nasıl Çalışır?

```
Kullanıcı: Chaos Başlat → fraud-check-service + network_delay (1200ms)
        ↓
POST /experiments/run
        ↓
runChaosExperiment()
  1. Aktif deney var mı? → 409 hatası
  2. SQLite'a experiment kaydı oluştur
  3. POST /chaos/configure → fraud-check:4003 { mode: "network_delay", latencyMs: 1200 }
  4. 12 demo transaction gönder (seri)
     → her biri: transaction → fraud-check (1200ms gecikme) → approved / pending / failed
  5. Tüm 8 servisin snapshot'ını al
  6. computeRiskProfile() → 10 metrik, skor: 30.1, level: MEDIUM
  7. Experiment kaydını güncelle
        ↓
Yanıt: { id: "exp_xxx", risk_score: 30.1, risk_level: "MEDIUM" }
        ↓
Kullanıcı: Kurtarmayı Başlat
        ↓
POST /experiments/recover
  1. POST /chaos/reset → fraud-check:4003
  2. Tüm servisler UP olana kadar bekle (max 20s)
  3. recovery_time_ms hesapla
  4. status = "completed", final risk skoru hesapla
        ↓
Kullanıcı: AI ile Analiz Et (Raporlar) veya Son Deneyi Analiz Et (AI Önerileri)
        ↓
POST /experiments/:id/analyze
  1. computeRiskProfile() → deterministik skor
  2. analyzeWithGemini(payload) → Türkçe JSON yanıt
  3. Golden Trace kaydı oluştur (SQLite)
  4. Frontend'e dön: öneriler + hata olasılıkları + Kintsugi dersi
```

---

## 14. Güvenli Bozunma Mekanizması

**Safe Degradation Message:** `"Transactions moved to pending manual review instead of auto-approval."`

### Nasıl Çalışır?

`fraud-check-service` çöktüğünde / yavaşladığında, `transaction-service` işlemi reddetmek yerine **manuel inceleme** kuyruğuna alır:

```
Normal akış:        transaction → fraud-check → APPROVED
Bozunma altında:    transaction → fraud-check (DOWN/SLOW) → pending_manual_review
```

Bu bankacılık açısından güvenlidir:
- İşlem reddedilmez (müşteri deneyimi korunur)
- Otomatik onaylanmaz (güvenlik korunur)
- İnsan inceleyene kadar bekler

### Risk Modeline Etkisi

`safe_degradation_relief` metriği (ağırlık: **-0.07**) yalnızca `degradedCount > 0` olduğunda aktif olur. Aktif fallback skoru düşürür — fakat `failure_rate` metriği artık `failed + degraded` saydığı için yüksek bozunma oranı skoru yine de HIGH'a çeker.

---

## 15. Projeyi Çalıştırma

### Gereksinimler
- Docker & Docker Compose
- Gemini API Key

### Başlatma

```bash
cd GOATS-kintsugimonkey

# .env dosyası oluştur
echo "GEMINI_API_KEY=AIzaSy..." > .env

# Tüm servisleri başlat
docker compose up --build

# Frontend: http://localhost:5173
# API:      http://localhost:4000
```

### Kritik: Kaynak Kod Değişikliklerini Uygulamak

`kintsugi-monkey-api` kaynak kodunu image içine kopyalar. `docker restart` **yetmez**:

```bash
docker compose up --build kintsugi-monkey-api -d
```

### Örnek Terminal Deneyleri

```bash
# HIGH risk: account-service durdur
curl -X POST http://localhost:4000/experiments/run \
  -H "Content-Type: application/json" \
  -d '{"target_service":"account-service","chaos_method":"service_kill","config":{}}'

# MEDIUM risk: fraud-check ağ gecikmesi
curl -X POST http://localhost:4000/experiments/run \
  -H "Content-Type: application/json" \
  -d '{"target_service":"fraud-check-service","chaos_method":"network_delay","config":{"latencyMs":1800}}'

# LOW risk: risk-profile cache kesintisi
curl -X POST http://localhost:4000/experiments/run \
  -H "Content-Type: application/json" \
  -d '{"target_service":"risk-profile-service","chaos_method":"cache_disconnect","config":{}}'

# Kurtarma
curl -X POST http://localhost:4000/experiments/recover \
  -H "Content-Type: application/json" \
  -d '{"experimentId":"exp_XXXX"}'

# AI analizi
curl -X POST http://localhost:4000/experiments/exp_XXXX/analyze
```

---

## 16. Sunum Rehberi — 3 Kişilik Bölüm

### Kişi 1 — "Problem ve Mimari" (3–4 dk)

**Anlat:**
- Bankacılık sistemlerinde neden kaos mühendisliği gerekli?
  - Production'da servis çöktüğünde ne olur?
  - BDDK/PCI-DSS uyumu için dayanıklılık testleri zorunlu hale geliyor
- Kintsugi felsefesi: "Kırıkları gizlemek yerine görünür kıl"
- Mimari: 8 mikroservis, dependency zinciri neden önemli?

**Göster:** Dashboard → Topology Graph

**Kritik mesaj:** "account-service çöktüğünde neden 4 servis etkilenir?"

---

### Kişi 2 — "Chaos Engine ve Canlı Demo" (4–5 dk)

**Anlat:**
- 9 kaos metodu ve kategorileri
- Chaos middleware: `/chaos/configure` → middleware devreye girer
- Risk modeli: 9 metrik, Google SRE metodolojisi

**Demo (sırasıyla):**
1. `risk-profile + cache_disconnect` → LOW (26/100)
2. `fraud-check + network_delay` → MEDIUM (~30/100)
3. `account-service + service_kill` → HIGH (~57/100)

**Kritik mesaj:** "Skor deterministik — sadece recovery time'a bakılmıyor, 9 metrik var"

---

### Kişi 3 — "AI Analizi ve Değer" (3–4 dk)

**Anlat:**
- Raporlar: Sistem Resilience Skoru (0–100)
  - Kritiklik ağırlıklı ortalama
  - LOW/MEDIUM/HIGH dağılımı
- AI Önerileri: Gemini 2.5 Flash Türkçe analiz
  - Zayıf nokta, öneriler, sonraki deneyler
  - Donut chart: "Şu an %XX → öneriler ile %YY"
- Kintsugi dersi: her deney bir Golden Trace

**Göster:** Raporlar → "AI ile Analiz Et" → AI Önerileri sayfası → Donut animasyonu

**Kritik mesaj:** "Deterministik skor AI'dan bağımsız — Gemini sadece yorumlar, nesnel metrik değişmez"

---

### Jüri Soruları için Hazırlık

**"Gerçek production'da nasıl kullanılır?"**
→ `/chaos/configure` endpoint'leri feature flag ile kontrol edilir. Test/staging'de aktif, production'da devre dışı. Netflix'in ChAOS aracı da bu prensibi kullanır.

**"Gemini analizi ne kadar güvenilir?"**
→ Deterministik skor riskModel.js'ten bağımsız hesaplanır. Gemini sadece yorumlama yapar. Gemini erişilemezse fallback analyzer devreye girer.

**"Neden bankacılık?"**
→ Finans sektöründe BDDK/PCI-DSS uyumu için sistem dayanıklılık testleri zorunlu hale geliyor. 8 servis, bankacılık para transferinin minimal ama eksiksiz modelidir.

**"Safe degradation her zaman işe yarar mı?"**
→ Hayır. Fraud kontrolü olmadan otomatik onay güvenlik riski. Bu yüzden pending_manual_review — ne reddet, ne otomatik onayla.

**"Sistem Resilience Skoru 58–65 — iyi mi?"**
→ Google SRE'de 85+ iyi kabul edilir. 58–65 "geliştirme alanı var" demektir. Kintsugi önerileri uygulanınca 80+'a çıkması hesaplanmaktadır.

---

*Chaos GOAT v1.0 — Tüm arayüz Türkçe, servis isimleri İngilizce.*
