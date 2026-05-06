"use client";
// ═══════════════════════════════════════════════════════════════════════
// src/components/packages/PatientPackagesSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Pacchetti" mostrata dentro la scheda paziente.
//
// Funziona sia per desktop che per mobile (mode prop). Differenze visive:
//  - desktop: card più larghe, drawer a destra per il dettaglio
//  - mobile : layout verticale full-width, modal full-screen per dettaglio
//
// Si appoggia agli endpoint:
//  - GET    /api/packages?patient_id=X&status=active|all
//  - POST   /api/packages
//  - GET    /api/packages/[id]
//  - PATCH  /api/packages/[id]
//  - DELETE /api/packages/[id]
//  - POST   /api/packages/[id]/payments
//  - DELETE /api/packages/[id]/payments/[pid]
// ═══════════════════════════════════════════════════════════════════════

import React, { useEffect, useState, useCallback } from "react";
import type {
  PatientPackageEnriched,
  PackagePaymentRow,
  PaymentMethod,
  PackageStatus,
} from "@/src/lib/packages/types";

// ─── Theme ─────────────────────────────────────────────────────────────
const T = {
  panelBg: "#ffffff",
  panelSoft: "#f7f9fd",
  text: "#0f172a",
  muted: "#334155",
  border: "#cbd5e1",
  borderSoft: "#e2e8f0",
  blue: "#2563eb",
  blueDark: "#1e40af",
  teal: "#0d9488",
  green: "#16a34a",
  red: "#dc2626",
  amber: "#f97316",
  gray: "#94a3b8",
};

// ─── Helpers ───────────────────────────────────────────────────────────
function formatEUR(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(s: PackageStatus): { label: string; bg: string; fg: string } {
  switch (s) {
    case "active":
      return { label: "Attivo", bg: "rgba(22,163,74,0.10)", fg: T.green };
    case "completed":
      return { label: "Completato", bg: "rgba(37,99,235,0.10)", fg: T.blue };
    case "expired":
      return { label: "Scaduto", bg: "rgba(249,115,22,0.10)", fg: T.amber };
    case "refunded":
      return { label: "Rimborsato", bg: "rgba(148,163,184,0.18)", fg: T.muted };
    case "cancelled":
      return { label: "Annullato", bg: "rgba(220,38,38,0.10)", fg: T.red };
  }
}

function paymentMethodLabel(m: PaymentMethod): string {
  if (m === "cash") return "Contanti";
  if (m === "pos") return "POS";
  return "Bonifico";
}

// ─── Props ─────────────────────────────────────────────────────────────
export type PatientPackagesSectionProps = {
  patientId: string;
  mode?: "desktop" | "mobile";
};

// ═══════════════════════════════════════════════════════════════════════
// Componente principale
// ═══════════════════════════════════════════════════════════════════════
export default function PatientPackagesSection({
  patientId,
  mode = "desktop",
}: PatientPackagesSectionProps) {
  const isMobile = mode === "mobile";

  const [packages, setPackages] = useState<PatientPackageEnriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // ─── Load lista ──────────────────────────────────────────────────────
  const loadPackages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/packages?patient_id=${patientId}&status=${showAll ? "all" : "active"}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Errore caricamento pacchetti");
      }
      const data = await res.json();
      setPackages(data.packages || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoading(false);
    }
  }, [patientId, showAll]);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  // ─── Stili condivisi ─────────────────────────────────────────────────
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };

  const btnPrimary: React.CSSProperties = {
    background: "linear-gradient(135deg,#0d9488,#2563eb)",
    color: "#fff",
    border: "none",
    borderRadius: 9,
    padding: isMobile ? "11px 16px" : "9px 16px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(13,148,136,0.25)",
  };

  const btnGhost: React.CSSProperties = {
    background: "#fff",
    color: T.muted,
    border: `1px solid ${T.border}`,
    borderRadius: 9,
    padding: isMobile ? "10px 14px" : "8px 14px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <div style={containerStyle}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>
          {showAll
            ? `${packages.length} pacchetti totali`
            : `${packages.length} ${packages.length === 1 ? "pacchetto attivo" : "pacchetti attivi"}`}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowAll((v) => !v)}
            style={btnGhost}
            title={showAll ? "Mostra solo attivi" : "Mostra tutti (anche completati)"}
          >
            {showAll ? "Solo attivi" : "Mostra tutti"}
          </button>
          <button onClick={() => setShowCreateForm(true)} style={btnPrimary}>
            + Nuovo pacchetto
          </button>
        </div>
      </div>

      {/* Errore */}
      {error && (
        <div
          style={{
            background: "rgba(220,38,38,0.08)",
            border: `1px solid rgba(220,38,38,0.25)`,
            color: T.red,
            borderRadius: 9,
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && packages.length === 0 && (
        <div
          style={{
            padding: 20,
            textAlign: "center",
            color: T.muted,
            fontSize: 13,
          }}
        >
          Caricamento…
        </div>
      )}

      {/* Empty */}
      {!loading && packages.length === 0 && (
        <div
          style={{
            padding: "26px 16px",
            textAlign: "center",
            background: T.panelSoft,
            borderRadius: 12,
            border: `1px dashed ${T.border}`,
            color: T.muted,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {showAll
            ? "Nessun pacchetto registrato per questo paziente."
            : "Nessun pacchetto attivo. Crea il primo pacchetto per iniziare a tracciare sedute e pagamenti."}
        </div>
      )}

      {/* Lista pacchetti */}
      {packages.map((pkg) => (
        <PackageCard
          key={pkg.id}
          pkg={pkg}
          isMobile={isMobile}
          onClick={() => setSelectedPackageId(pkg.id)}
        />
      ))}

      {/* Form di creazione */}
      {showCreateForm && (
        <CreatePackageModal
          patientId={patientId}
          isMobile={isMobile}
          onClose={() => setShowCreateForm(false)}
          onCreated={() => {
            setShowCreateForm(false);
            loadPackages();
          }}
        />
      )}

      {/* Dettaglio pacchetto */}
      {selectedPackageId && (
        <PackageDetailModal
          packageId={selectedPackageId}
          isMobile={isMobile}
          onClose={() => setSelectedPackageId(null)}
          onChanged={loadPackages}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Card singolo pacchetto
// ═══════════════════════════════════════════════════════════════════════
function PackageCard({
  pkg,
  isMobile,
  onClick,
}: {
  pkg: PatientPackageEnriched;
  isMobile: boolean;
  onClick: () => void;
}) {
  const status = statusBadge(pkg.status);
  const sessionPct =
    pkg.total_sessions !== null && pkg.total_sessions > 0
      ? Math.min(100, (pkg.sessions_used / pkg.total_sessions) * 100)
      : 0;
  const paymentPct =
    pkg.total_amount_cents > 0
      ? Math.min(100, (pkg.paid_cents / pkg.total_amount_cents) * 100)
      : 0;

  const isArrears = pkg.remaining_cents > 0 && pkg.status === "active";
  const isExhausted = pkg.is_session_exhausted;

  return (
    <div
      onClick={onClick}
      style={{
        background: T.panelBg,
        border: `1px solid ${T.borderSoft}`,
        borderRadius: 12,
        padding: isMobile ? 14 : 16,
        cursor: "pointer",
        transition: "all 0.12s",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = T.blue;
        e.currentTarget.style.boxShadow = "0 3px 10px rgba(37,99,235,0.10)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = T.borderSoft;
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(15,23,42,0.04)";
      }}
    >
      {/* Header card */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: isMobile ? 15 : 14,
              fontWeight: 800,
              color: T.text,
              marginBottom: 3,
              wordBreak: "break-word",
            }}
          >
            {pkg.title}
          </div>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>
            Iniziato {formatDate(pkg.starts_at)}
            {pkg.expires_at && ` · scade ${formatDate(pkg.expires_at)}`}
          </div>
        </div>
        <span
          style={{
            background: status.bg,
            color: status.fg,
            fontSize: 11,
            fontWeight: 800,
            padding: "3px 9px",
            borderRadius: 99,
            whiteSpace: "nowrap",
          }}
        >
          {status.label}
        </span>
      </div>

      {/* KPI: sedute */}
      {pkg.total_sessions !== null ? (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            <span style={{ color: T.muted }}>SEDUTE</span>
            <span style={{ color: isExhausted ? T.amber : T.text }}>
              {pkg.sessions_used} / {pkg.total_sessions}
              {pkg.sessions_remaining !== null && pkg.sessions_remaining > 0 && (
                <span style={{ color: T.muted, fontWeight: 600 }}>
                  {" "}
                  · {pkg.sessions_remaining} rimaste
                </span>
              )}
            </span>
          </div>
          <div
            style={{
              height: 6,
              background: T.borderSoft,
              borderRadius: 99,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${sessionPct}%`,
                height: "100%",
                background: isExhausted ? T.amber : T.teal,
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>
      ) : (
        <div
          style={{
            marginBottom: 10,
            fontSize: 11,
            fontWeight: 700,
            color: T.muted,
          }}
        >
          SEDUTE: {pkg.sessions_used} usate (acconto libero, nessun limite)
        </div>
      )}

      {/* KPI: pagamento */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          <span style={{ color: T.muted }}>PAGAMENTO</span>
          <span style={{ color: isArrears ? T.amber : T.text }}>
            {formatEUR(pkg.paid_cents)} / {formatEUR(pkg.total_amount_cents)}
            {isArrears && (
              <span style={{ color: T.amber, fontWeight: 800 }}>
                {" "}
                · -{formatEUR(pkg.remaining_cents)}
              </span>
            )}
          </span>
        </div>
        <div
          style={{
            height: 6,
            background: T.borderSoft,
            borderRadius: 99,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${paymentPct}%`,
              height: "100%",
              background: pkg.is_fully_paid ? T.green : T.blue,
              transition: "width 0.3s",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Modal di creazione
// ═══════════════════════════════════════════════════════════════════════
function CreatePackageModal({
  patientId,
  isMobile,
  onClose,
  onCreated,
}: {
  patientId: string;
  isMobile: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [hasSessionsLimit, setHasSessionsLimit] = useState(true);
  const [totalSessions, setTotalSessions] = useState<string>("10");
  const [totalAmount, setTotalAmount] = useState<string>("");
  const [hasInitialPayment, setHasInitialPayment] = useState(false);
  const [initialAmount, setInitialAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!title.trim()) {
      setErr("Inserisci un titolo (es: 10 sedute fisioterapia)");
      return;
    }
    const amountCents = Math.round(parseFloat(totalAmount.replace(",", ".")) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      setErr("Importo totale non valido");
      return;
    }

    let sessions: number | null = null;
    if (hasSessionsLimit) {
      const n = parseInt(totalSessions, 10);
      if (!Number.isFinite(n) || n <= 0) {
        setErr("Numero sedute non valido");
        return;
      }
      sessions = n;
    }

    let initialPayment: { amount_cents: number; payment_method: PaymentMethod; label: string } | undefined;
    if (hasInitialPayment) {
      const ic = Math.round(parseFloat(initialAmount.replace(",", ".")) * 100);
      if (!Number.isFinite(ic) || ic <= 0) {
        setErr("Acconto non valido");
        return;
      }
      if (ic > amountCents) {
        setErr("L'acconto non può superare il totale");
        return;
      }
      initialPayment = {
        amount_cents: ic,
        payment_method: paymentMethod,
        label: ic === amountCents ? "Saldato" : "Acconto",
      };
    }

    setSaving(true);
    try {
      const res = await fetch("/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          title: title.trim(),
          notes: notes.trim() || null,
          total_sessions: sessions,
          total_amount_cents: amountCents,
          default_payment_method: paymentMethod,
          initial_payment: initialPayment,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Errore creazione");
      onCreated();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell isMobile={isMobile} onClose={onClose} title="Nuovo pacchetto">
      {err && <ErrorBox msg={err} />}

      <Field label="Titolo del pacchetto *">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Es. 10 sedute fisioterapia"
          style={inputStyle}
          autoFocus
        />
      </Field>

      <Field label="Tipo di pacchetto">
        <div style={{ display: "flex", gap: 8 }}>
          <SegmentedBtn
            active={hasSessionsLimit}
            onClick={() => setHasSessionsLimit(true)}
            label="Numero sedute fisso"
          />
          <SegmentedBtn
            active={!hasSessionsLimit}
            onClick={() => setHasSessionsLimit(false)}
            label="Acconto libero"
          />
        </div>
      </Field>

      {hasSessionsLimit && (
        <Field label="Numero sedute *">
          <input
            type="number"
            min="1"
            value={totalSessions}
            onChange={(e) => setTotalSessions(e.target.value)}
            style={inputStyle}
          />
        </Field>
      )}

      <Field label="Importo totale (€) *">
        <input
          type="text"
          inputMode="decimal"
          value={totalAmount}
          onChange={(e) => setTotalAmount(e.target.value)}
          placeholder="350,00"
          style={inputStyle}
        />
      </Field>

      <Field label="Metodo di pagamento predefinito">
        <div style={{ display: "flex", gap: 8 }}>
          {(["cash", "pos", "bank_transfer"] as PaymentMethod[]).map((m) => (
            <SegmentedBtn
              key={m}
              active={paymentMethod === m}
              onClick={() => setPaymentMethod(m)}
              label={paymentMethodLabel(m)}
            />
          ))}
        </div>
      </Field>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 0",
        }}
      >
        <input
          type="checkbox"
          id="has-initial"
          checked={hasInitialPayment}
          onChange={(e) => setHasInitialPayment(e.target.checked)}
          style={{ width: 16, height: 16, cursor: "pointer" }}
        />
        <label
          htmlFor="has-initial"
          style={{ fontSize: 13, fontWeight: 600, color: T.text, cursor: "pointer" }}
        >
          Registra un acconto/saldo iniziale subito
        </label>
      </div>

      {hasInitialPayment && (
        <Field label="Importo versato adesso (€)">
          <input
            type="text"
            inputMode="decimal"
            value={initialAmount}
            onChange={(e) => setInitialAmount(e.target.value)}
            placeholder="100,00"
            style={inputStyle}
          />
        </Field>
      )}

      <Field label="Note (opzionale)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: "vertical", minHeight: 50 }}
          placeholder="Es. trattamento post-intervento spalla destra"
        />
      </Field>

      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 14,
          flexDirection: isMobile ? "column-reverse" : "row",
          justifyContent: "flex-end",
        }}
      >
        <button onClick={onClose} disabled={saving} style={btnSecondary(isMobile)}>
          Annulla
        </button>
        <button onClick={submit} disabled={saving} style={btnPrimary(isMobile)}>
          {saving ? "Creazione…" : "Crea pacchetto"}
        </button>
      </div>
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Modal dettaglio + storico versamenti + aggiungi versamento
// ═══════════════════════════════════════════════════════════════════════
function PackageDetailModal({
  packageId,
  isMobile,
  onClose,
  onChanged,
}: {
  packageId: string;
  isMobile: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [pkg, setPkg] = useState<PatientPackageEnriched | null>(null);
  const [payments, setPayments] = useState<PackagePaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/packages/${packageId}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Errore caricamento");
      }
      const data = await res.json();
      setPkg(data.package);
      setPayments(data.payments || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoading(false);
    }
  }, [packageId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeletePayment = async (paymentId: string) => {
    if (!window.confirm("Eliminare questo versamento? L'azione non si può annullare.")) return;
    try {
      const res = await fetch(`/api/packages/${packageId}/payments/${paymentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Errore eliminazione");
      }
      await load();
      onChanged();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Errore");
    }
  };

  const handleChangeStatus = async (newStatus: PackageStatus) => {
    const labels: Record<PackageStatus, string> = {
      active: "Attivo",
      completed: "Completato",
      expired: "Scaduto",
      refunded: "Rimborsato",
      cancelled: "Annullato",
    };
    if (!window.confirm(`Cambiare stato del pacchetto a "${labels[newStatus]}"?`)) return;
    try {
      const res = await fetch(`/api/packages/${packageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Errore");
      }
      await load();
      onChanged();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Errore");
    }
  };

  const handleDelete = async () => {
    if (!pkg) return;
    if (
      !window.confirm(
        `Eliminare definitivamente il pacchetto "${pkg.title}"? Questa azione cancella anche tutti i versamenti registrati.`
      )
    )
      return;
    try {
      const res = await fetch(`/api/packages/${packageId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Errore eliminazione");
      }
      onChanged();
      onClose();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Errore");
    }
  };

  return (
    <ModalShell
      isMobile={isMobile}
      onClose={onClose}
      title={pkg?.title || "Dettaglio pacchetto"}
      width={isMobile ? undefined : 600}
    >
      {err && <ErrorBox msg={err} />}
      {loading && <div style={{ padding: 20, textAlign: "center", color: T.muted }}>Caricamento…</div>}

      {pkg && (
        <>
          {/* Status + actions */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              padding: "10px 0",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                background: statusBadge(pkg.status).bg,
                color: statusBadge(pkg.status).fg,
                fontSize: 12,
                fontWeight: 800,
                padding: "5px 12px",
                borderRadius: 99,
              }}
            >
              {statusBadge(pkg.status).label}
            </span>
            {pkg.status === "active" && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => handleChangeStatus("cancelled")} style={btnTinyDanger}>
                  Annulla
                </button>
                <button onClick={() => handleChangeStatus("refunded")} style={btnTinyDanger}>
                  Rimborsa
                </button>
              </div>
            )}
            {(pkg.status === "cancelled" || pkg.status === "refunded") && (
              <button onClick={() => handleChangeStatus("active")} style={btnTiny}>
                Riattiva
              </button>
            )}
          </div>

          {/* KPI grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <KpiBox
              label="SEDUTE USATE"
              value={
                pkg.total_sessions !== null
                  ? `${pkg.sessions_used} / ${pkg.total_sessions}`
                  : `${pkg.sessions_used}`
              }
              hint={
                pkg.total_sessions !== null && pkg.sessions_remaining !== null
                  ? `${pkg.sessions_remaining} rimaste`
                  : "acconto libero"
              }
            />
            <KpiBox
              label="INCASSATO"
              value={formatEUR(pkg.paid_cents)}
              hint={`su ${formatEUR(pkg.total_amount_cents)}`}
              accent={pkg.is_fully_paid ? T.green : T.blue}
            />
            <KpiBox
              label="DA INCASSARE"
              value={formatEUR(pkg.remaining_cents)}
              hint={pkg.remaining_cents > 0 ? "in arretrato" : "saldato"}
              accent={pkg.remaining_cents > 0 ? T.amber : T.green}
            />
          </div>

          {pkg.notes && (
            <div
              style={{
                background: T.panelSoft,
                borderRadius: 9,
                padding: "10px 12px",
                fontSize: 13,
                color: T.muted,
                marginBottom: 14,
                lineHeight: 1.4,
              }}
            >
              <strong style={{ color: T.text }}>Note:</strong> {pkg.notes}
            </div>
          )}

          {/* Storico versamenti */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <h4 style={{ fontSize: 13, fontWeight: 800, color: T.text, margin: 0 }}>
              Storico versamenti ({payments.length})
            </h4>
            {pkg.status !== "cancelled" && pkg.status !== "refunded" && (
              <button onClick={() => setShowAddPayment(true)} style={btnPrimary(isMobile)}>
                + Aggiungi versamento
              </button>
            )}
          </div>

          {payments.length === 0 && (
            <div
              style={{
                padding: "16px 12px",
                textAlign: "center",
                background: T.panelSoft,
                borderRadius: 9,
                fontSize: 13,
                color: T.muted,
                fontWeight: 600,
              }}
            >
              Nessun versamento ancora registrato.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {payments.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  background: T.panelBg,
                  border: `1px solid ${T.borderSoft}`,
                  borderRadius: 9,
                  gap: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
                    {formatEUR(p.amount_cents)}{" "}
                    <span
                      style={{
                        fontSize: 11,
                        color: T.muted,
                        fontWeight: 600,
                      }}
                    >
                      · {paymentMethodLabel(p.payment_method)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginTop: 2 }}>
                    {p.label && (
                      <span
                        style={{
                          background: "rgba(37,99,235,0.10)",
                          color: T.blue,
                          padding: "1px 7px",
                          borderRadius: 99,
                          marginRight: 6,
                          fontWeight: 700,
                        }}
                      >
                        {p.label}
                      </span>
                    )}
                    {formatDateTime(p.paid_at)}
                  </div>
                </div>
                <button
                  onClick={() => handleDeletePayment(p.id)}
                  title="Elimina versamento"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: T.red,
                    cursor: "pointer",
                    fontSize: 16,
                    padding: 6,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Footer: delete pacchetto */}
          {pkg.sessions_used === 0 && (
            <div
              style={{
                marginTop: 18,
                paddingTop: 14,
                borderTop: `1px solid ${T.borderSoft}`,
              }}
            >
              <button onClick={handleDelete} style={btnDangerOutline}>
                Elimina pacchetto definitivamente
              </button>
              <div
                style={{
                  fontSize: 11,
                  color: T.muted,
                  marginTop: 6,
                  fontWeight: 600,
                }}
              >
                Disponibile solo se nessuna seduta è stata consumata. Altrimenti usa
                &quot;Annulla&quot; o &quot;Rimborsa&quot;.
              </div>
            </div>
          )}
        </>
      )}

      {showAddPayment && pkg && (
        <AddPaymentModal
          packageId={packageId}
          remainingCents={pkg.remaining_cents}
          defaultMethod={pkg.default_payment_method || "cash"}
          isMobile={isMobile}
          onClose={() => setShowAddPayment(false)}
          onSaved={() => {
            setShowAddPayment(false);
            load();
            onChanged();
          }}
        />
      )}
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Modal aggiunta versamento
// ═══════════════════════════════════════════════════════════════════════
function AddPaymentModal({
  packageId,
  remainingCents,
  defaultMethod,
  isMobile,
  onClose,
  onSaved,
}: {
  packageId: string;
  remainingCents: number;
  defaultMethod: PaymentMethod;
  isMobile: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState<string>(
    remainingCents > 0 ? (remainingCents / 100).toFixed(2).replace(".", ",") : ""
  );
  const [method, setMethod] = useState<PaymentMethod>(defaultMethod);
  const [label, setLabel] = useState<string>("");
  const [paidAt, setPaidAt] = useState<string>(() => {
    const d = new Date();
    // datetime-local: YYYY-MM-DDTHH:MM
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
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
          paid_at: new Date(paidAt).toISOString(),
          label: label.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Errore registrazione");
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell isMobile={isMobile} onClose={onClose} title="Nuovo versamento">
      {err && <ErrorBox msg={err} />}

      {remainingCents > 0 && (
        <div
          style={{
            background: "rgba(37,99,235,0.06)",
            border: `1px solid rgba(37,99,235,0.18)`,
            borderRadius: 9,
            padding: "9px 12px",
            fontSize: 12,
            color: T.blueDark,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Residuo da incassare: {formatEUR(remainingCents)}
        </div>
      )}

      <Field label="Importo (€) *">
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="100,00"
          style={inputStyle}
          autoFocus
        />
      </Field>

      <Field label="Metodo *">
        <div style={{ display: "flex", gap: 8 }}>
          {(["cash", "pos", "bank_transfer"] as PaymentMethod[]).map((m) => (
            <SegmentedBtn
              key={m}
              active={method === m}
              onClick={() => setMethod(m)}
              label={paymentMethodLabel(m)}
            />
          ))}
        </div>
      </Field>

      <Field label="Data e ora del versamento *">
        <input
          type="datetime-local"
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="Etichetta (opzionale)">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Es. Acconto, Saldo, 1ª rata"
          style={inputStyle}
        />
      </Field>

      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 14,
          flexDirection: isMobile ? "column-reverse" : "row",
          justifyContent: "flex-end",
        }}
      >
        <button onClick={onClose} disabled={saving} style={btnSecondary(isMobile)}>
          Annulla
        </button>
        <button onClick={submit} disabled={saving} style={btnPrimary(isMobile)}>
          {saving ? "Salvataggio…" : "Registra versamento"}
        </button>
      </div>
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Helper UI condivisi
// ═══════════════════════════════════════════════════════════════════════
function ModalShell({
  isMobile,
  onClose,
  title,
  width,
  children,
}: {
  isMobile: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 20,
        overflow: "auto",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: isMobile ? 0 : 14,
          width: isMobile ? "100%" : width || 480,
          maxWidth: isMobile ? "100%" : "calc(100vw - 40px)",
          maxHeight: isMobile ? "100vh" : "calc(100vh - 40px)",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(15,23,42,0.30)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 20px",
            borderBottom: `1px solid ${T.borderSoft}`,
            position: "sticky",
            top: 0,
            background: "#fff",
            zIndex: 1,
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0 }}>
            {title}
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
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 11,
          fontWeight: 700,
          color: T.muted,
          marginBottom: 5,
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function SegmentedBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "9px 10px",
        background: active ? "rgba(37,99,235,0.10)" : "#fff",
        border: `1.5px solid ${active ? T.blue : T.borderSoft}`,
        color: active ? T.blue : T.muted,
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        transition: "all 0.12s",
      }}
    >
      {label}
    </button>
  );
}

function KpiBox({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: T.panelSoft,
        borderRadius: 9,
        padding: "10px 12px",
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: T.muted,
          letterSpacing: 0.3,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 800,
          color: accent || T.text,
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 11,
            color: T.muted,
            fontWeight: 600,
            marginTop: 2,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div
      style={{
        background: "rgba(220,38,38,0.08)",
        border: `1px solid rgba(220,38,38,0.25)`,
        color: T.red,
        borderRadius: 9,
        padding: "10px 12px",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {msg}
    </div>
  );
}

// ─── Stili button helpers ──────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: `1.5px solid ${T.border}`,
  borderRadius: 9,
  fontSize: 14,
  fontFamily: "inherit",
  color: T.text,
  background: "#fff",
  outline: "none",
};

function btnPrimary(isMobile: boolean): React.CSSProperties {
  return {
    background: "linear-gradient(135deg,#0d9488,#2563eb)",
    color: "#fff",
    border: "none",
    borderRadius: 9,
    padding: isMobile ? "12px 18px" : "9px 16px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(13,148,136,0.25)",
  };
}

function btnSecondary(isMobile: boolean): React.CSSProperties {
  return {
    background: "#fff",
    color: T.muted,
    border: `1.5px solid ${T.border}`,
    borderRadius: 9,
    padding: isMobile ? "12px 18px" : "9px 16px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  };
}

const btnTiny: React.CSSProperties = {
  background: "#fff",
  color: T.blue,
  border: `1px solid ${T.blue}`,
  borderRadius: 7,
  padding: "5px 10px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
};

const btnTinyDanger: React.CSSProperties = {
  background: "#fff",
  color: T.red,
  border: `1px solid rgba(220,38,38,0.30)`,
  borderRadius: 7,
  padding: "5px 10px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
};

const btnDangerOutline: React.CSSProperties = {
  background: "#fff",
  color: T.red,
  border: `1.5px solid rgba(220,38,38,0.40)`,
  borderRadius: 9,
  padding: "9px 16px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
