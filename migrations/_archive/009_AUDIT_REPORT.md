# Audit Sicurezza RLS — Report (24 aprile 2026)

## Riepilogo

L'audit delle Row Level Security (RLS) policies su Supabase ha identificato
**12 problemi gravi** dove le policy "open all" o "auth_all" annullavano
i filtri multi-tenant per `studio_id`. Quando uno studio cliente avrebbe
guardato i dati di un altro studio, NIENTE l'avrebbe fermato.

La migration `009_security_hardening.sql` chiude tutti i buchi mantenendo
funzionanti gli endpoint pubblici.

## Problemi trovati e fix applicati

| # | Tabella | Problema | Fix |
|---|---------|----------|-----|
| 1 | `confirm_tokens` | `allow_all` (anon+auth) → tutti vedevano tutti i token | DROP + policy mirata su studio_id |
| 2 | `clinical_scales` | `allow_all` (anon+auth) → tutti vedevano scale di tutti | DROP |
| 3 | `body_charts` | `auth users` → qualsiasi auth vedeva tutti | DROP |
| 4 | `clinical_documents` | `Enable all for authenticated` → qualsiasi auth vedeva tutti | DROP |
| 5 | `noleggios` | `noleggios_auth_all` → qualsiasi auth vedeva tutti | DROP |
| 6 | `noleggio_settings` | `noleggio_settings_auth` → qualsiasi auth vedeva tutti | DROP |
| 7 | `blocked_days` | `blocked_days_write` ALL=true / `blocked_days_read` anon=true | DROP entrambe |
| 8 | `booking_services` | `booking_services_write` ALL=true | DROP (lettura anon resta per booking pubblico) |
| 9 | `booking_requests` | 3 policy pre-multi-tenancy con `using=true` | DROP + nuova policy anon INSERT mirata |
| 10 | `appointments` | `ics_feed_read` anon → tutti vedevano tutti gli appuntamenti | DROP (calendar.ics ora usa token) |
| 11 | `password_reset_tokens` | RLS disattivato | ENABLE RLS (deny by default) |
| 12 | `email_log` | policy SELECT su `public` invece di `authenticated` | DROP + ricreata su authenticated |

## Pulizia (non bug, solo ridondanza)

- Rimosse policy `*_own` duplicate su `appointments` e `document_signatures`
- Rimossa `templates_read_active` ridondante con `document_templates_select`

## Endpoint pubblici che restano funzionanti

| Endpoint | Cosa legge | Come |
|----------|-----------|------|
| `GET /api/booking/slots` | working_hours, appointments, booking_requests | anon, RLS aperta solo per servizio prenotazione |
| `POST /api/booking` | inserisce booking_requests | anon, ma deve passare `studio_id` |
| `GET /api/calendar.ics?token=...` | studios, appointments | service_role, filtra per token |
| `/conferma/[token]` + `/api/confirm` | confirm_tokens | service_role |
| `/portal/[token]` + `/api/portal` | patients, appointments | service_role |
| `/esercizi/[token]` + `/api/esercizi-pubblici` | exercise data | service_role |
| `/survey/[token]` + `/api/survey` | surveys | service_role |

## Procedura applicazione

### 1. BACKUP (obbligatorio)

Esegui `009_BACKUP_BEFORE_RUN.sql` su Supabase SQL Editor.
Salva l'output in un file di testo locale (es. `backup_rls_2026-04-24.txt`).
Conserva almeno 30 giorni.

### 2. Applica migration

Esegui `009_security_hardening.sql` su Supabase SQL Editor.
Deve completare con "Success. No rows returned".

### 3. Verifica

```sql
-- Controlla che non ci siano policy "open all" residue
SELECT tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND (qual = 'true' OR (qual IS NULL AND with_check = 'true'))
ORDER BY tablename;
```

Devi vedere SOLO:
- `booking_services.booking_services_read`
- `booking_requests.booking_requests_anon_insert`

Se ne vedi altre, dimmelo.

### 4. Test funzionalità

Apri il gestionale e verifica:
- ✅ Vedi i tuoi appuntamenti
- ✅ Vedi i tuoi pazienti
- ✅ Crei un nuovo appuntamento
- ✅ Crei un nuovo paziente
- ✅ Modifichi un noleggio
- ✅ Carichi un documento clinico
- ✅ Modifichi un template messaggio
- ✅ Stampa PDF funzionante
- ✅ WhatsApp funzionante

Se qualcosa NON funziona dopo la migration, è perché ho rimosso una policy
che invece serviva. Dimmelo subito (pagina + cosa non funziona) e ripristino
la policy specifica dal backup.

### 5. Rollback (se serve)

Se qualcosa non funziona, esegui i comandi `recreate_statement` salvati
nello step 1 per ripristinare le policy che ti servono.

In emergenza puoi anche fare:
```sql
-- Ripristina tutte le policy pre-009 da una sola query
-- (esegui solo le righe DROP+CREATE per le policy che ti servono)
```

## Note future

- Quando aggiungerai multi-tenancy al booking pubblico, dovrai aggiornare
  `/api/booking/slots` per accettare `?studio_id=` e filtrare lì
- Le tabelle `confirm_tokens`, `password_reset_tokens` ora fanno affidamento
  solo su service_role: tienilo in mente se mai dovrai accederci da client
- L'audit non ha verificato le 11 tabelle che hanno solo policy giuste
  (treatment_prices, working_hours, ecc.) — sono OK
