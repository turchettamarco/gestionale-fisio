"use client";
// ═══════════════════════════════════════════════════════════════════════
// src/components/packages/EventPackageBox.tsx
// ═══════════════════════════════════════════════════════════════════════
// Box informativo che appare nel SelectedEventModal quando l'appuntamento
// è collegato a un pacchetto. Mostra: titolo pacchetto, sedute usate/totali,
// stato pagamento (incassato/totale).
//
// Click sul box → apre il dettaglio completo del pacchetto in un overlay,
// così l'utente può aggiungere versamenti senza uscire dal calendario.
// ═══════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from "react";
import type {
  PatientPackageEnriched,
  PackagePaymentRow,
} from "@/src/lib/packages/types";

const T = {
  text: "#0f172a",
  muted: "#334155",
  borderSoft: "#e2e8f0",
  teal: "#0d9488",
  tealDark: "#115e59",
  blue: "#2563eb",
  green: "#16a34a",
  amber: "#f97316",
};

function formatEUR(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

export type EventPackageBoxProps = {
  packageId: string;
};

export default function EventPackageBox({ packageId }: EventPackageBoxProps) {
  const [pkg, setPkg] = useState<PatientPackageEnriched | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/packages/${packageId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setPkg(d?.package ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [packageId]);

  if (loading) {
    return (
      <div
        style={{
          background: "rgba(13,148,136,0.06)",
          border: `1.5px solid rgba(13,148,136,0.20)`,
          borderRadius: 10,
          padding: "10px 14px",
          marginBottom: 16,
          fontSize: 12,
          color: T.muted,
          fontWeight: 600,
        }}
      >
        Caricamento info pacchetto…
      </div>
    );
  }

  if (!pkg) {
    return (
      <div
        style={{
          background: "rgba(249,115,22,0.06)",
          border: `1.5px solid rgba(249,115,22,0.25)`,
          borderRadius: 10,
          padding: "10px 14px",
          marginBottom: 16,
          fontSize: 12,
          color: T.amber,
          fontWeight: 700,
        }}
      >
        ⚠ Pacchetto collegato non trovato (forse eliminato)
      </div>
    );
  }

  const sessionsLabel =
    pkg.total_sessions !== null
      ? `${pkg.sessions_used}/${pkg.total_sessions} sedute`
      : `${pkg.sessions_used} sedute (acconto libero)`;

  const remainingLabel =
    pkg.total_sessions !== null && pkg.sessions_remaining !== null
      ? pkg.sessions_remaining > 0
        ? `${pkg.sessions_remaining} rimaste`
        : "esaurito"
      : null;

  return (
    <>
      <div
        onClick={() => setShowDetail(true)}
        style={{
          background: "linear-gradient(135deg, rgba(13,148,136,0.08), rgba(37,99,235,0.06))",
          border: `1.5px solid rgba(13,148,136,0.25)`,
          borderRadius: 10,
          padding: "12px 14px",
          marginBottom: 16,
          cursor: "pointer",
          transition: "all 0.15s",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = T.teal;
          e.currentTarget.style.boxShadow = "0 4px 14px rgba(13,148,136,0.15)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "rgba(13,148,136,0.25)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <div style={{ fontSize: 22 }}>📦</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: T.tealDark,
              marginBottom: 3,
            }}
          >
            Seduta scalata da pacchetto
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: T.text,
              marginBottom: 4,
            }}
          >
            {pkg.title}
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              fontSize: 11,
              fontWeight: 700,
              color: T.muted,
            }}
          >
            <span>📋 {sessionsLabel}</span>
            {remainingLabel && (
              <span
                style={{
                  color: pkg.sessions_remaining === 0 ? T.amber : T.teal,
                }}
              >
                · {remainingLabel}
              </span>
            )}
            <span>
              · 💶 {formatEUR(pkg.paid_cents)} / {formatEUR(pkg.total_amount_cents)}
            </span>
            {pkg.remaining_cents > 0 && (
              <span style={{ color: T.amber }}>
                ({formatEUR(pkg.remaining_cents)} da incassare)
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: T.teal,
            whiteSpace: "nowrap",
          }}
        >
          Apri →
        </div>
      </div>

      {showDetail && (
        <PackageQuickDetail
          packageId={packageId}
          onClose={() => {
            setShowDetail(false);
            // Refetch al chiudere per riflettere eventuali nuovi versamenti
            fetch(`/api/packages/${packageId}`, { cache: "no-store" })
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => {
                if (d?.package) setPkg(d.package);
              })
              .catch(() => {});
          }}
        />
      )}
    </>
  );
}

// ─── Mini-modal dettaglio inline ────────────────────────────────────────
// Lightweight: mostra info essenziali e versamenti, con bottone per
// aprire la sezione completa nella scheda paziente.
function PackageQuickDetail({
  packageId,
  onClose,
}: {
  packageId: string;
  onClose: () => void;
}) {
  const [pkg, setPkg] = useState<PatientPackageEnriched | null>(null);
  const [payments, setPayments] = useState<PackagePaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPayment, setShowAddPayment] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/packages/${packageId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) {
          setPkg(null);
        } else {
          setPkg(d.package);
          setPayments(d.payments || []);
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageId]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          width: "100%",
          maxWidth: 520,
          maxHeight: "calc(100vh - 40px)",
          overflow: "auto",
          padding: 24,
          boxShadow: "0 20px 60px rgba(15,23,42,0.30)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0 }}>
            {pkg?.title || "Pacchetto"}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 22,
              cursor: "pointer",
              color: T.muted,
              padding: 4,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {loading && (
          <div style={{ padding: 20, textAlign: "center", color: T.muted }}>
            Caricamento…
          </div>
        )}

        {pkg && !loading && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <KpiSmall
                label="SEDUTE"
                value={
                  pkg.total_sessions !== null
                    ? `${pkg.sessions_used}/${pkg.total_sessions}`
                    : `${pkg.sessions_used}`
                }
              />
              <KpiSmall
                label="INCASSATO"
                value={formatEUR(pkg.paid_cents)}
                accent={pkg.is_fully_paid ? T.green : T.blue}
              />
              <KpiSmall
                label="DA INCASSARE"
                value={formatEUR(pkg.remaining_cents)}
                accent={pkg.remaining_cents > 0 ? T.amber : T.green}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <h4
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: T.muted,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                Versamenti ({payments.length})
              </h4>
              {pkg.status === "active" && (
                <button
                  onClick={() => setShowAddPayment(true)}
                  style={{
                    background: "linear-gradient(135deg,#0d9488,#2563eb)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "7px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  + Versamento
                </button>
              )}
            </div>

            {payments.length === 0 ? (
              <div
                style={{
                  padding: "12px",
                  textAlign: "center",
                  background: "#f7f9fd",
                  borderRadius: 8,
                  fontSize: 12,
                  color: T.muted,
                  fontWeight: 600,
                }}
              >
                Nessun versamento ancora.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {payments.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      padding: "8px 10px",
                      background: "#f7f9fd",
                      border: `1px solid ${T.borderSoft}`,
                      borderRadius: 7,
                      fontSize: 12,
                    }}
                  >
                    <strong style={{ color: T.text }}>
                      {formatEUR(p.amount_cents)}
                    </strong>
                    <span style={{ color: T.muted, fontWeight: 600 }}>
                      {" "}
                      · {p.payment_method === "cash"
                        ? "Contanti"
                        : p.payment_method === "pos"
                        ? "POS"
                        : "Bonifico"}
                      {p.label && ` · ${p.label}`}
                      {" · "}
                      {new Date(p.paid_at).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: `1px solid ${T.borderSoft}`,
                fontSize: 11,
                color: T.muted,
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              Per modificare il pacchetto o vedere tutti i dettagli, vai alla
              scheda paziente → sezione Pacchetti.
            </div>
          </>
        )}

        {showAddPayment && pkg && (
          <QuickAddPayment
            packageId={packageId}
            remainingCents={pkg.remaining_cents}
            defaultMethod={pkg.default_payment_method || "cash"}
            onClose={() => setShowAddPayment(false)}
            onSaved={() => {
              setShowAddPayment(false);
              load();
            }}
          />
        )}
      </div>
    </div>
  );
}

function KpiSmall({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "#f7f9fd",
        borderRadius: 8,
        padding: "8px 10px",
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: T.muted,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          color: accent || T.text,
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Mini-form per aggiungere versamento velocemente ──────────────────
function QuickAddPayment({
  packageId,
  remainingCents,
  defaultMethod,
  onClose,
  onSaved,
}: {
  packageId: string;
  remainingCents: number;
  defaultMethod: "cash" | "pos" | "bank_transfer";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState<string>(
    remainingCents > 0 ? (remainingCents / 100).toFixed(2).replace(".", ",") : ""
  );
  const [method, setMethod] =
    useState<"cash" | "pos" | "bank_transfer">(defaultMethod);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const cents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setErr("Importo non valido");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/packages/${packageId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_cents: cents,
          payment_method: method,
          label: label.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Errore");
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.6)",
        zIndex: 2100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          width: "100%",
          maxWidth: 380,
          padding: 20,
          boxShadow: "0 20px 60px rgba(15,23,42,0.30)",
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14, color: T.text }}>
          Nuovo versamento
        </h3>

        {err && (
          <div
            style={{
              background: "rgba(220,38,38,0.08)",
              color: "#dc2626",
              borderRadius: 7,
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            {err}
          </div>
        )}

        <label
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 700,
            color: T.muted,
            marginBottom: 5,
          }}
        >
          IMPORTO (€)
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
          style={{
            width: "100%",
            padding: "9px 11px",
            border: `1.5px solid ${T.borderSoft}`,
            borderRadius: 8,
            fontSize: 14,
            marginBottom: 12,
          }}
        />

        <label
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 700,
            color: T.muted,
            marginBottom: 5,
          }}
        >
          METODO
        </label>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {(["cash", "pos", "bank_transfer"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              style={{
                flex: 1,
                padding: "8px 6px",
                border: `1.5px solid ${method === m ? T.blue : T.borderSoft}`,
                background: method === m ? "rgba(37,99,235,0.10)" : "#fff",
                color: method === m ? T.blue : T.muted,
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {m === "cash" ? "Contanti" : m === "pos" ? "POS" : "Bonifico"}
            </button>
          ))}
        </div>

        <label
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 700,
            color: T.muted,
            marginBottom: 5,
          }}
        >
          ETICHETTA (opzionale)
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Saldo, 1ª rata…"
          style={{
            width: "100%",
            padding: "9px 11px",
            border: `1.5px solid ${T.borderSoft}`,
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 16,
          }}
        />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "9px 14px",
              borderRadius: 8,
              border: `1.5px solid ${T.borderSoft}`,
              background: "#fff",
              color: T.muted,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Annulla
          </button>
          <button
            onClick={submit}
            disabled={saving}
            style={{
              padding: "9px 14px",
              borderRadius: 8,
              border: "none",
              background: "linear-gradient(135deg,#0d9488,#2563eb)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {saving ? "…" : "Registra"}
          </button>
        </div>
      </div>
    </div>
  );
}
