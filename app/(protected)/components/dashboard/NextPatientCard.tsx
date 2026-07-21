"use client";
// app/(protected)/components/dashboard/NextPatientCard.tsx
// ═══════════════════════════════════════════════════════════════════════
// Home v2 — Card "Adesso": il prossimo appuntamento come primo cittadino.
// Orario grande, countdown, paziente, trattamento, incasso e azioni rapide
// (Fatto ✓ · WhatsApp · Sposta orario inline).
// ═══════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { THEME, inpStyle } from "./shared/theme";
import { fmtTime, patientName, pickPatient } from "./shared/utils";
import { usePrivacyMode, usePrivacyDisplay } from "@/src/contexts/PrivacyModeContext";
import { StatusPill } from "./shared/StatusPill";
import PaidPill from "@/src/components/PaidPill";
import type { PaymentMethod } from "@/src/components/PaidPopover";
import type { AppointmentRow, Status } from "./shared/types";

export type NextPatientCardProps = {
  focusNext: AppointmentRow | null;
  nextCountdown: string;
  editNextTime: boolean;
  setEditNextTime: (v: boolean) => void;
  editDate: string; setEditDate: (v: string) => void;
  editStart: string; setEditStart: (v: string) => void;
  editDuration: "0.5" | "0.75" | "1" | "1.5" | "2";
  setEditDuration: (v: "0.5" | "0.75" | "1" | "1.5" | "2") => void;
  savingTime: boolean;
  onSaveNextTime: () => void;
  onSetStatus: (id: string, s: Status) => void;
  onSendWA: (a: AppointmentRow) => void;
  onUpdatePayment: (id: string, next: { is_paid: boolean; paid_at: string | null; payment_method: PaymentMethod | null }) => void;
};

export default function NextPatientCard(p: NextPatientCardProps) {
  const { privacyMode } = usePrivacyMode();
  const { maskName } = usePrivacyDisplay();
  const a = p.focusNext;

  const card: React.CSSProperties = {
    background: "var(--fh-card)", border: `1px solid ${THEME.border}`, borderRadius: 16,
    boxShadow: "0 1px 3px rgba(15,23,42,0.05)", overflow: "hidden",
  };

  if (!a) {
    return (
      <div style={{ ...card, padding: "18px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 22 }}>✨</span>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--fh-ink)" }}>Nessun altro appuntamento oggi</div>
          <div style={{ fontSize: 12, color: "var(--fh-mut)", marginTop: 2 }}>
            Goditi la pausa o <Link href="/calendar" style={{ color: THEME.blue, fontWeight: 700 }}>dai un'occhiata a domani →</Link>
          </div>
        </div>
      </div>
    );
  }

  const name = privacyMode ? maskName(pickPatient(a.patients)) : patientName(a.patients);
  const amountNum = a.amount != null && a.amount !== "" ? Number(a.amount) : null;

  return (
    <div style={card}>
      {/* Riga accento */}
      <div style={{ height: 4, background: "linear-gradient(90deg,#0d9488,#2563eb)" }} />

      <div style={{ padding: "16px 20px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          {/* Orario + countdown */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 27, fontWeight: 700, color: "var(--fh-ink)", letterSpacing: -0.3, lineHeight: 1.05 }}>
              {fmtTime(a.start_at)}
            </span>
            {p.nextCountdown && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0d9488", background: "rgba(13,148,136,0.1)", borderRadius: 999, padding: "4px 11px" }}>
                {p.nextCountdown}
              </span>
            )}
            <StatusPill status={a.status} />
          </div>

          {/* Azioni */}
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {a.status !== "done" && (
              <button
                onClick={() => p.onSetStatus(a.id, "done")}
                style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: THEME.green, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >✓ Fatto</button>
            )}
            {a.status === "booked" && (
              <button
                onClick={() => p.onSetStatus(a.id, "confirmed")}
                style={{ padding: "8px 14px", borderRadius: 9, border: `1.5px solid ${THEME.blue}`, background: "var(--fh-card)", color: THEME.blue, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >Conferma</button>
            )}
            <button
              onClick={() => p.onSendWA(a)}
              style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: "#25D366", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >📲 WhatsApp</button>
            <button
              onClick={() => p.setEditNextTime(!p.editNextTime)}
              style={{ padding: "8px 12px", borderRadius: 9, border: `1px solid ${THEME.border}`, background: "var(--fh-card)", color: "var(--fh-mut)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >✏️ Sposta</button>
          </div>
        </div>

        {/* Paziente + dettagli */}
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/patients/${a.patient_id}`} style={{ fontSize: 15.5, fontWeight: 700, color: "var(--fh-ink)" }}>
            {name}
          </Link>
          {a.treatment_type && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fh-mut)", background: "var(--fh-soft)", borderRadius: 999, padding: "3px 10px" }}>
              {a.treatment_type}
            </span>
          )}
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--fh-mut)" }}>
            {a.location === "domicile" ? `🚗 Domicilio${a.domicile_address ? ` · ${a.domicile_address}` : ""}` : `🏥 ${a.clinic_site || "Studio"}`}
          </span>
          {amountNum != null && !Number.isNaN(amountNum) && (
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: THEME.text }}>{amountNum.toFixed(0)} €</span>
              <PaidPill
                data={{
                  is_paid: !!a.is_paid,
                  paid_at: a.paid_at ?? null,
                  payment_method: a.payment_method ?? null,
                  price_type: a.price_type ?? null,
                }}
                onUpdate={async (next) => p.onUpdatePayment(a.id, next)}
              />
            </span>
          )}
        </div>

        {/* Form sposta orario */}
        {p.editNextTime && (
          <div style={{ marginTop: 12, padding: "12px 14px", background: "var(--fh-soft)", border: `1px solid ${THEME.border}`, borderRadius: 12, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--fh-mut)", marginBottom: 4 }}>Data</div>
              <input type="date" value={p.editDate} onChange={e => p.setEditDate(e.target.value)} style={inpStyle} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--fh-mut)", marginBottom: 4 }}>Ora</div>
              <input type="time" step={900} value={p.editStart} onChange={e => p.setEditStart(e.target.value)} style={inpStyle} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--fh-mut)", marginBottom: 4 }}>Durata</div>
              <select value={p.editDuration} onChange={e => p.setEditDuration(e.target.value as NextPatientCardProps["editDuration"])} style={inpStyle}>
                <option value="0.5">30 min</option>
                <option value="0.75">45 min</option>
                <option value="1">1 ora</option>
                <option value="1.5">1,5 ore</option>
                <option value="2">2 ore</option>
              </select>
            </div>
            <button
              onClick={p.onSaveNextTime}
              disabled={p.savingTime}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: `linear-gradient(135deg,${THEME.teal},${THEME.blue})`, color: "#fff", fontWeight: 700, fontSize: 12, cursor: p.savingTime ? "wait" : "pointer", opacity: p.savingTime ? 0.7 : 1 }}
            >{p.savingTime ? "Salvo…" : "Salva"}</button>
            <button
              onClick={() => p.setEditNextTime(false)}
              style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${THEME.border}`, background: "var(--fh-card)", color: "var(--fh-mut)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
            >Annulla</button>
          </div>
        )}
      </div>
    </div>
  );
}
