"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePlanLimits } from "@/src/hooks/usePlanLimits";
import UpgradeButtons from "@/src/components/UpgradeButtons";
import PlanDetailModal from "@/src/components/PlanDetailModal";
import AppNavbar from "@/src/components/AppNavbar";

// Design system ispirato a Linear/Apple: bianco, spazi, tipografia pulita
const T = {
  pageBg:      "#fafafa",
  panelBg:     "#ffffff",
  panelSoft:   "#f5f5f7",
  text:        "#0a0a0a",
  textSoft:    "#1d1d1f",
  muted:       "#6e6e73",
  mutedLight:  "#86868b",
  border:      "#d2d2d7",
  borderSoft:  "#e8e8ed",
  accent:      "#0d9488",
  accentDark:  "#0f766e",
  blue:        "#2563eb",
  green:       "#16a34a",
  amber:       "#f97316",
  red:         "#dc2626",
  greenSoft:   "#e8f5e9",
  amberSoft:   "#fff4e5",
  redSoft:     "#ffebee",
};

type PlanListItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_monthly_cents: number;
  currency: string;
  is_default: boolean;
  max_patients: number | null;
  max_appointments_per_month: number | null;
  max_operators: number | null;
  max_rooms: number | null;
  patients_limit_mode: "soft" | "hard";
  appointments_limit_mode: "soft" | "hard";
  operators_limit_mode: "soft" | "hard";
  rooms_limit_mode: "soft" | "hard";
  features: { key: string; label: string; category: string | null; enabled: boolean }[];
};

export default function PianoPage() {
  const limits = usePlanLimits();
  const [allPlans, setAllPlans] = useState<PlanListItem[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PlanListItem | null>(null);

  // Carica i piani pubblici solo se necessario (cliente senza piano)
  useEffect(() => {
    if (!limits.loading && !limits.plan?.plan_id) {
      (async () => {
        try {
          const r = await fetch("/api/plans");
          const d = await r.json();
          setAllPlans(d.plans || []);
        } catch {
          /* silent */
        } finally {
          setLoadingPlans(false);
        }
      })();
    }
  }, [limits.loading, limits.plan?.plan_id]);

  return (
    <div style={{ background: T.pageBg, minHeight: "100vh" }}>
      {/* Navbar identica al resto del gestionale */}
      <AppNavbar active="piano" />

      <main style={{ padding: "48px 24px 80px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          {/* Breadcrumb */}
          <div
            style={{
              fontSize: 13,
              color: T.mutedLight,
              marginBottom: 24,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Link
              href="/settings"
              style={{ color: T.mutedLight, textDecoration: "none" }}
            >
              Impostazioni
            </Link>
            <span>/</span>
            <span style={{ color: T.text, fontWeight: 500 }}>Piano e abbonamento</span>
          </div>

          {limits.loading ? (
            <div style={{ color: T.muted, fontSize: 14 }}>Caricamento…</div>
          ) : !limits.plan || !limits.plan.plan_id ? (
            <NoPlanView
              plans={allPlans}
              loading={loadingPlans}
              onSelect={setSelectedPlan}
            />
          ) : (
            <ActivePlanView limits={limits} />
          )}
        </div>
      </main>

      {/* Modal dettaglio piano */}
      {selectedPlan && (
        <PlanDetailModal
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
        />
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════
   VISTA — Piano attivo (cliente già configurato)
   ═════════════════════════════════════════════════════════════════════ */

function ActivePlanView({ limits }: { limits: ReturnType<typeof usePlanLimits> }) {
  const p = limits.plan!;
  const priceMonth = (p.price_monthly_cents ?? 0) / 100;
  const activeFeatures = Object.entries(p.features || {}).filter(([, v]) => v);

  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 700,
            color: T.text,
            margin: 0,
            letterSpacing: -0.5,
          }}
        >
          Piano e abbonamento
        </h1>
        <p
          style={{
            fontSize: 15,
            color: T.muted,
            margin: "8px 0 0",
          }}
        >
          Gestisci il tuo abbonamento, controlla l&apos;utilizzo e richiedi upgrade
        </p>
      </div>

      {/* Card piano attivo — bianca pulita */}
      <div
        style={{
          background: T.panelBg,
          border: `1px solid ${T.borderSoft}`,
          borderRadius: 12,
          padding: 28,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 20,
            marginBottom: 4,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: T.mutedLight,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Piano attivo
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: T.text,
                letterSpacing: -0.5,
                lineHeight: 1.1,
              }}
            >
              {p.plan_name}
            </div>
            <div
              style={{
                fontSize: 16,
                color: T.muted,
                marginTop: 6,
              }}
            >
              {priceMonth > 0 ? (
                <>
                  <span style={{ fontWeight: 600, color: T.text }}>€{priceMonth.toFixed(0)}</span>
                  <span style={{ color: T.muted }}> / mese</span>
                </>
              ) : (
                "Piano gratuito"
              )}
            </div>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              background: T.greenSoft,
              color: "#15803d",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: T.green,
              }}
            />
            Attivo
          </div>
        </div>

        {p.has_active_override && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 14px",
              background: T.panelSoft,
              borderRadius: 8,
              fontSize: 13,
              color: T.muted,
            }}
          >
            ✨ Hai condizioni personalizzate attive
            {p.override_expires_at && (
              <> fino al {new Date(p.override_expires_at).toLocaleDateString("it-IT")}</>
            )}
          </div>
        )}
      </div>

      {/* Card utilizzo */}
      <div
        style={{
          background: T.panelBg,
          border: `1px solid ${T.borderSoft}`,
          borderRadius: 12,
          padding: 28,
          marginBottom: 18,
        }}
      >
        <h2
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: T.text,
            margin: "0 0 20px",
            letterSpacing: -0.2,
          }}
        >
          Utilizzo corrente
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <UsageRow
            label="Pazienti"
            used={limits.usage.patients}
            max={p.max_patients}
            percent={limits.checks.patients.percent}
            status={limits.checks.patients.status}
            mode={limits.checks.patients.mode}
          />
          <UsageRow
            label="Appuntamenti questo mese"
            used={limits.usage.appointments_this_month}
            max={p.max_appointments_per_month}
            percent={limits.checks.appointments.percent}
            status={limits.checks.appointments.status}
            mode={limits.checks.appointments.mode}
          />
          <UsageRow
            label="Operatori"
            used={limits.usage.operators}
            max={p.max_operators}
            percent={limits.checks.operators.percent}
            status={limits.checks.operators.status}
            mode={limits.checks.operators.mode}
          />
        </div>
      </div>

      {/* Card feature */}
      {activeFeatures.length > 0 && (
        <div
          style={{
            background: T.panelBg,
            border: `1px solid ${T.borderSoft}`,
            borderRadius: 12,
            padding: 28,
            marginBottom: 18,
          }}
        >
          <h2
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: T.text,
              margin: "0 0 20px",
              letterSpacing: -0.2,
            }}
          >
            Funzionalità incluse
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              columnGap: 16,
              rowGap: 10,
            }}
          >
            {activeFeatures.map(([key]) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 14,
                  color: T.textSoft,
                }}
              >
                <span style={{ color: T.green, fontSize: 16, flexShrink: 0 }}>✓</span>
                <span>{FEATURE_NAMES[key] ?? key}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Card upgrade */}
      <div
        style={{
          background: T.panelBg,
          border: `1px solid ${T.borderSoft}`,
          borderRadius: 12,
          padding: 28,
        }}
      >
        <h2
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: T.text,
            margin: "0 0 6px",
            letterSpacing: -0.2,
          }}
        >
          Serve più spazio o più funzionalità?
        </h2>
        <p
          style={{
            fontSize: 14,
            color: T.muted,
            margin: "0 0 18px",
            lineHeight: 1.5,
          }}
        >
          Contatta Marco Turchetta per richiedere l&apos;upgrade del tuo piano.
          Risposta entro 24 ore.
        </p>
        <UpgradeButtons size="md" currentPlan={p.plan_name ?? undefined} />
      </div>
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════════
   VISTA — Nessun piano assegnato (confronto tra piani)
   ═════════════════════════════════════════════════════════════════════ */

function NoPlanView({
  plans,
  loading,
  onSelect,
}: {
  plans: PlanListItem[];
  loading: boolean;
  onSelect: (p: PlanListItem) => void;
}) {
  return (
    <>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <h1
          style={{
            fontSize: 40,
            fontWeight: 700,
            color: T.text,
            margin: 0,
            letterSpacing: -0.8,
          }}
        >
          Scegli il piano giusto per il tuo studio
        </h1>
        <p
          style={{
            fontSize: 17,
            color: T.muted,
            margin: "12px 0 0",
            maxWidth: 620,
            marginLeft: "auto",
            marginRight: "auto",
            lineHeight: 1.5,
          }}
        >
          Clicca su un piano per vedere tutti i dettagli.
          Poi contatta Marco per attivarlo.
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: T.muted, padding: 60 }}>
          Caricamento piani…
        </div>
      ) : plans.length === 0 ? (
        <div
          style={{
            background: T.panelBg,
            border: `1px solid ${T.borderSoft}`,
            borderRadius: 12,
            padding: 40,
            textAlign: "center",
            color: T.muted,
          }}
        >
          Nessun piano disponibile al momento. Contatta Marco per informazioni.
          <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
            <UpgradeButtons size="md" />
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(plans.length, 3)}, 1fr)`,
            gap: 16,
          }}
          className="plans-grid"
        >
          {plans.map((p, idx) => (
            <PlanCard
              key={p.id}
              plan={p}
              featured={idx === 1 && plans.length >= 3}
              onSelect={() => onSelect(p)}
            />
          ))}
        </div>
      )}

      {/* Nota fondo */}
      <div
        style={{
          marginTop: 40,
          padding: 24,
          background: T.panelSoft,
          borderRadius: 12,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 14,
            color: T.muted,
            marginBottom: 12,
          }}
        >
          Hai dubbi o vuoi una consulenza personalizzata?
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <UpgradeButtons size="md" />
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .plans-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════════
   CARD PIANO (vista no-plan)
   ═════════════════════════════════════════════════════════════════════ */

function PlanCard({
  plan,
  featured,
  onSelect,
}: {
  plan: PlanListItem;
  featured: boolean;
  onSelect: () => void;
}) {
  const price = plan.price_monthly_cents / 100;
  const enabled = plan.features.filter((f) => f.enabled);

  // Highlight i 4-5 benefit principali
  const topFeatures: string[] = [];
  if (plan.max_patients === null) topFeatures.push("Pazienti illimitati");
  else topFeatures.push(`Fino a ${plan.max_patients} pazienti`);
  if (plan.max_appointments_per_month === null)
    topFeatures.push("Appuntamenti illimitati");
  else topFeatures.push(`${plan.max_appointments_per_month} appuntamenti/mese`);
  if (plan.max_operators === null) topFeatures.push("Operatori illimitati");
  else if (plan.max_operators === 1) topFeatures.push("1 operatore");
  else topFeatures.push(`Fino a ${plan.max_operators} operatori`);
  topFeatures.push(`${enabled.length} funzionalità incluse`);

  return (
    <button
      onClick={onSelect}
      style={{
        background: T.panelBg,
        border: featured ? `2px solid ${T.accent}` : `1px solid ${T.borderSoft}`,
        borderRadius: 14,
        padding: "28px 24px",
        cursor: "pointer",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        transition: "transform 0.15s, box-shadow 0.15s",
        font: "inherit",
        color: "inherit",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 12px 24px rgba(0,0,0,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {featured && (
        <div
          style={{
            position: "absolute",
            top: -11,
            left: "50%",
            transform: "translateX(-50%)",
            background: T.accent,
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            padding: "4px 12px",
            borderRadius: 999,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Consigliato
        </div>
      )}

      {/* Nome piano */}
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: T.text,
          letterSpacing: -0.3,
        }}
      >
        {plan.name}
      </div>

      {/* Descrizione breve */}
      {plan.description && (
        <div
          style={{
            fontSize: 13,
            color: T.muted,
            marginTop: 6,
            minHeight: 36,
            lineHeight: 1.4,
          }}
        >
          {plan.description}
        </div>
      )}

      {/* Prezzo */}
      <div
        style={{
          marginTop: 18,
          marginBottom: 6,
          display: "flex",
          alignItems: "baseline",
          gap: 4,
        }}
      >
        {price > 0 ? (
          <>
            <span style={{ fontSize: 38, fontWeight: 700, color: T.text, letterSpacing: -1 }}>
              €{price.toFixed(0)}
            </span>
            <span style={{ fontSize: 14, color: T.muted }}>/ mese</span>
          </>
        ) : (
          <span style={{ fontSize: 38, fontWeight: 700, color: T.text, letterSpacing: -1 }}>
            Gratis
          </span>
        )}
      </div>

      <div
        style={{
          height: 1,
          background: T.borderSoft,
          margin: "18px 0",
        }}
      />

      {/* Top feature */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {topFeatures.map((f, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
              color: T.textSoft,
            }}
          >
            <span style={{ color: T.accent, fontSize: 14, flexShrink: 0, fontWeight: 700 }}>
              ✓
            </span>
            <span>{f}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div
        style={{
          marginTop: 24,
          padding: "11px 16px",
          background: featured ? T.accent : T.panelSoft,
          color: featured ? "#fff" : T.text,
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          textAlign: "center",
          border: featured ? "none" : `1px solid ${T.borderSoft}`,
        }}
      >
        Vedi dettagli →
      </div>
    </button>
  );
}

/* ═════════════════════════════════════════════════════════════════════
   RIGA UTILIZZO (stile Linear/Apple)
   ═════════════════════════════════════════════════════════════════════ */

function UsageRow({
  label,
  used,
  max,
  percent,
  status,
  mode,
}: {
  label: string;
  used: number;
  max: number | null;
  percent: number;
  status: "ok" | "near" | "over";
  mode: "soft" | "hard";
}) {
  const isUnlimited = max === null;

  const barColor =
    status === "over"
      ? mode === "hard"
        ? T.red
        : T.amber
      : status === "near"
      ? T.amber
      : T.green;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 14, color: T.text, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 14, color: T.muted }}>
          <span style={{ fontWeight: 600, color: T.text }}>{used}</span>
          <span> / </span>
          <span>{isUnlimited ? "∞" : max}</span>
        </div>
      </div>

      {!isUnlimited && (
        <div
          style={{
            background: T.borderSoft,
            borderRadius: 4,
            height: 6,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.min(percent, 100)}%`,
              height: "100%",
              background: barColor,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════
   Mappa feature key -> label italiane
   ═════════════════════════════════════════════════════════════════════ */

const FEATURE_NAMES: Record<string, string> = {
  patient_records: "Schede paziente complete",
  clinical_documents: "Documenti clinici (referti, RMN, ecografie)",
  session_notes: "Note di seduta",
  calendar_advanced: "Calendario avanzato (drag&drop, ricorrenze)",
  multi_operator: "Multi-operatore",
  multi_room: "Multi-stanza",
  online_booking: "Prenotazioni online dal sito",
  google_calendar_sync: "Sync Google Calendar",
  whatsapp_reminders: "Promemoria WhatsApp",
  sms_reminders: "Promemoria SMS",
  email_reminders: "Promemoria email",
  basic_reports: "Report base",
  advanced_reports: "Report avanzati (trend, export Excel)",
  custom_pdf_export: "Export PDF personalizzato",
  cooperative_module: "Gestione cooperative e riepiloghi",
  exercise_sheets: "Schede esercizi per pazienti",
  rental_module: "Modulo noleggio attrezzature",
  soap_notes: "Cartella clinica SOAP",
  invoice_templates: "Template ricevute/fatture personalizzabili",
  patient_export_pdf: "Export scheda paziente in PDF",
};
