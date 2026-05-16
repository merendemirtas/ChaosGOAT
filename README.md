# Chaos GOAT — Kaos Mühendisliği Platformu

> **Kintsugi felsefesi:** Kırıkları altınla onar — zayıflıkları güce dönüştür.

Bankacılık mikroservis sistemleri için kontrollü kaos deneyi, deterministik risk skorlama ve Gemini AI destekli analiz platformu.

---

## Hızlı Başlangıç

```bash
# API anahtarını ayarla
export GEMINI_API_KEY=your_gemini_api_key_here

# Tüm stack'i başlat (ilk seferinde ~2 dakika)
docker compose up --build

# Frontend → http://localhost:5173
# API      → http://localhost:4000
```

---

## Mimari

```
Frontend (5173) → kintsugi-monkey-api (4000)
                        │
        ┌───────────────┼───────────────────┐
        │               │                   │
  account (4001)  transaction (4002)  fraud-check (4003)
        │               │                   │
  limit (4006)    beneficiary (4007)  risk-profile (4005)
  compliance (4008)  notification (4004)
```

**Bağımlılık zinciri:**
- `transaction → fraud-check → risk-profile`
- `transaction → limit → account`
- `transaction → beneficiary → account`
- `transaction → compliance → account`
- `transaction → notification`

---

## Servisler

| Servis | Port | Kritiklik |
|--------|------|-----------|
| kintsugi-monkey-api | 4000 | Gateway |
| account-service | 4001 | HIGH |
| transaction-service | 4002 | HIGH |
| fraud-check-service | 4003 | HIGH |
| notification-service | 4004 | LOW |
| risk-profile-service | 4005 | MEDIUM |
| limit-service | 4006 | HIGH |
| beneficiary-service | 4007 | HIGH |
| compliance-service | 4008 | HIGH |

---

## Kaos Metodları

| Kod | Kategori | Açıklama |
|-----|----------|----------|
| `service_kill` | availability | Docker container durdurur |
| `network_delay` | latency | Yanıt gecikmesi enjekte eder |
| `packet_loss` | network_reliability | Rastgele istekleri düşürür |
| `cpu_stress` | resource_pressure | CPU döngüsü yakar |
| `memory_stress` | resource_pressure | Bellek baskısı uygular |
| `db_disconnect` | dependency_loss | account-service veri deposunu keser |
| `cache_disconnect` | dependency_loss | risk-profile önbelleğini keser |
| `traffic_surge` | load | Eşzamanlı istek patlaması |
| `partial_failure` | partial_outage | Kısmi başarısızlık enjekte eder |

---

## Risk Modeli

9 metrik, Google SRE + Netflix + AWS metodolojisi:

| Eşik | Aralık |
|------|--------|
| **DÜŞÜK** | 0 – 28 |
| **ORTA** | 28 – 50 |
| **YÜKSEK** | > 50 |

Risk skoru deterministik hesaplanır. Gemini AI sadece yorumlama yapar.

---

## API Endpointleri

```bash
# Servis sağlığı
GET  /health/services
GET  /topology

# Kaos deneyleri
POST /experiments/run         { target_service, chaos_method, config }
POST /experiments/recover     { experimentId }
GET  /experiments
GET  /experiments/:id

# AI Analizi
POST /experiments/:id/analyze

# Sonuçlar
GET  /golden-traces
GET  /golden-traces/:id

# Test işlemi
POST /banking/demo-transaction { count, concurrency }
```

---

## Örnek Kullanım

```bash
# Servis durumu
curl http://localhost:4000/health/services

# account-service durdur (HIGH risk senaryosu)
curl -X POST http://localhost:4000/experiments/run \
  -H "Content-Type: application/json" \
  -d '{"target_service":"account-service","chaos_method":"service_kill","config":{}}'

# Kurtarma
curl -X POST http://localhost:4000/experiments/recover \
  -H "Content-Type: application/json" \
  -d '{"experimentId":"exp_XXXX"}'

# fraud-check ağ gecikmesi (MEDIUM risk senaryosu)
curl -X POST http://localhost:4000/experiments/run \
  -H "Content-Type: application/json" \
  -d '{"target_service":"fraud-check-service","chaos_method":"network_delay","config":{"latencyMs":1800}}'

# risk-profile cache kesintisi (LOW risk senaryosu)
curl -X POST http://localhost:4000/experiments/run \
  -H "Content-Type: application/json" \
  -d '{"target_service":"risk-profile-service","chaos_method":"cache_disconnect","config":{}}'

# AI analizi
curl -X POST http://localhost:4000/experiments/<EXPERIMENT_ID>/analyze
```

---

## Frontend Sayfaları

| Sayfa | URL | İçerik |
|-------|-----|--------|
| Onboarding | `/onboarding` | Proje tanıtımı |
| Dashboard | `/` | Topoloji grafiği + istatistikler |
| Senaryolar | `/scenarios` | Chaos Engine + deney geçmişi |
| Raporlar | `/reports` | Resilience skoru + trend grafikleri |
| AI Önerileri | `/ai-suggests` | Gemini analizi + hata olasılığı |

---

## Önemli Not

`kintsugi-monkey-api`, `service_kill` deneyleri için Docker socket'e (`/var/run/docker.sock`) erişir. Bu yalnızca demo ortamı içindir.

Kaynak kodu değiştirdiğinizde `docker restart` **yetmez**, rebuild gerekir:

```bash
docker compose up --build kintsugi-monkey-api -d
```

##Ekler

<img width="1710" height="983" alt="Ekran Resmi 2026-05-16 20 29 39" src="https://github.com/user-attachments/assets/57ece715-ed3b-4019-9ed8-4b8621fe723b" />

<img width="1710" height="983" alt="Ekran Resmi 2026-05-16 20 31 25" src="https://github.com/user-attachments/assets/19279034-5bfd-4597-be86-733460340a3a" />

<img width="1710" height="983" alt="Ekran Resmi 2026-05-16 20 31 33" src="https://github.com/user-attachments/assets/dc64d44d-cbff-44af-b395-d7e11623ca64" />

<img width="1710" height="983" alt="Ekran Resmi 2026-05-16 20 32 22" src="https://github.com/user-attachments/assets/ed6ccf08-3e26-4062-a8ca-c7c3ff6c2bde" />

<img width="1710" height="983" alt="Ekran Resmi 2026-05-16 20 32 41" src="https://github.com/user-attachments/assets/85034061-c41f-436f-9882-69dac16d0841" />


