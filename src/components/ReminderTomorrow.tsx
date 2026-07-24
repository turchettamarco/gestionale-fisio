"use client";

// ═══════════════════════════════════════════════════════════════════════
// ReminderTomorrow — "Da avvisare per domani"
// ═══════════════════════════════════════════════════════════════════════
//
// La regia serale dei promemoria: elenca gli appuntamenti di DOMANI e per
// ognuno apre WhatsApp col promemoria ufficiale (stesso template, stesso
// link di conferma/annulla del calendario). Appena invii, la riga si
// spunta (whatsapp_sent_at) e il contatore scende. Niente invii
// automatici: WhatsApp senza API business non lo consente in modo pulito
// — qui il valore è che NESSUNO viene dimenticato, in due minuti.
//
// Due export:
//   • ReminderTomorrowPanel  — il pannello, controllato (open/onClose)
//   • ReminderTomorrowCard   — card autonoma per la Home: si mostra solo
//     se c'è qualcuno da avvisare, e contiene già il pannello.
// ═══════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";
import { useDisplayPatientName } from "@/src/contexts/PrivacyModeContext";
import { getStudioBranding } from "@/src/lib/studioBranding";
import { normalizePhoneForWA } from "@/src/lib/whatsapp";
import { buildReminderMessage,
  getPatientAreaLink,
} from "@/app/(protected)/calendar/utils/reminderMessage";

const T = {
  teal: "#0d9488", blue: "#2563eb", text: "#0f172a", muted: "#64748b",
  border: "#e2e8f0", soft: "#f8fafc", green: "#16a34a", amber: "#f59e0b",
};

type Row = {
  id: string;
  patient_id: string | null;
  start_at: string;
  location: string | null;
  clinic_site: string | null;
  location_id: string | null;
  domicile_address: string | null;
  whatsapp_sent_at: string | null;
  is_group: boolean | null;
  group_title: string | null;
  patients: { first_name: string | null; last_name: string | null; phone: string | null } | null;
};

function tomorrowRange() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const from = new Date(d); from.setHours(0, 0, 0, 0);
  const to = new Date(d); to.setHours(23, 59, 59, 999);
  return { from, to, day: d };
}

// ─────────────────────────────────────────────────────────────────────────
// Pannello
// ─────────────────────────────────────────────────────────────────────────
export function ReminderTomorrowPanel({
  open, onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { studio: currentStudio, locations: studioLocations } = useCurrentStudio();
  const displayName = useDisplayPatientName();
  const studioId = currentStudio?.id ?? null;

  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tpl, setTpl] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!studioId) return;
    setLoading(true);
    try {
      const { from, to } = tomorrowRange();
      const [apptRes, tplRes] = await Promise.all([
        supabase.from("appointments")
          .select("id, patient_id, start_at, location, clinic_site, location_id, domicile_address, whatsapp_sent_at, is_group, group_title, patients:patient_id(first_name, last_name, phone)")
          .eq("studio_id", studioId)
          .gte("start_at", from.toISOString())
          .lte("start_at", to.toISOString())
          .neq("status", "cancelled")
          .order("start_at"),
        tpl == null
          ? supabase.from("message_templates").select("template").eq("name", "Promemoria").maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setRows(((apptRes.data as unknown) as Row[]) || []);
      const t = (tplRes as { data: { template?: string } | null }).data?.template;
      if (t) setTpl(t);
    } finally {
      setLoading(false);
    }
  }, [studioId, tpl]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const send = useCallback(async (r: Row) => {
    const phone = r.patients?.phone;
    const clean = normalizePhoneForWA(phone);
    if (!clean) return;
    setSending(r.id);

    // Link conferma/annulla: stesso meccanismo del calendario.
    const clientToken = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const linkConferma = `${window.location.origin}/conferma/${clientToken}`;
    fetch("/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointment_id: r.id, client_token: clientToken }),
    }).catch(() => {});

    const fakeEvent = {
      start: new Date(r.start_at),
      end: new Date(r.start_at),
      location: r.location,
      clinic_site: r.clinic_site,
      location_id: r.location_id,
      domicile_address: r.domicile_address,
    } as never;

    // Link all'area riservata del paziente (storico, pagamenti, prenotazioni)
    const linkArea = await getPatientAreaLink(r.patient_id);

    const message = buildReminderMessage({
      appointment: fakeEvent,
      patientFirstName: r.patients?.first_name ?? undefined,
      template: tpl ?? undefined,
      isConfirmation: false,
      linkConferma,
      linkArea,
      studioAddress: currentStudio?.address,
      signatureName: getStudioBranding(currentStudio).signatureName,
      signatureTitle: getStudioBranding(currentStudio).signatureTitle,
      studioLocations,
    });

    // Apertura nativa con fallback web (stesso pattern della Home).
    const enc = encodeURIComponent(message);
    window.location.href = `whatsapp://send?phone=${clean}&text=${enc}`;
    setTimeout(() => {
      if (document.visibilityState === "visible") {
        window.location.href = `https://wa.me/${clean}?text=${enc}`;
      }
    }, 1500);

    // Spunta su DB + ottimistica.
    const nowIso = new Date().toISOString();
    void supabase.from("appointments")
      .update({ whatsapp_sent_at: nowIso, whatsapp_sent: true })
      .eq("id", r.id)
      .then(() => setSending(null));
    setRows(prev => (prev || []).map(x => x.id === r.id ? { ...x, whatsapp_sent_at: nowIso } : x));
  }, [tpl, currentStudio, studioLocations]);

  const { pending, done, groups } = useMemo(() => {
    const all = rows || [];
    const singles = all.filter(r => !r.is_group && r.patient_id);
    return {
      pending: singles.filter(r => !r.whatsapp_sent_at),
      done: singles.filter(r => !!r.whatsapp_sent_at),
      groups: all.filter(r => r.is_group),
    };
  }, [rows]);

  if (!open) return null;

  const { day } = tomorrowRange();
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const nameOf = (r: Row) => displayName(
    { first_name: r.patients?.first_name ?? "", last_name: r.patients?.last_name ?? "" },
    `${r.patients?.first_name ?? ""} ${r.patients?.last_name ?? ""}`.trim(),
  );

  const rowBox = (bg: string): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 10,
    border: `1px solid ${T.border}`, borderRadius: 10,
    padding: "10px 12px", marginBottom: 7, background: bg,
  });

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 240, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, background: "#fff", borderRadius: 14,
          boxShadow: "0 20px 60px rgba(15,23,42,0.3)", overflow: "hidden",
          maxHeight: "88vh", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          padding: "14px 16px", borderBottom: `1px solid ${T.border}`,
          background: "linear-gradient(135deg, rgba(13,148,136,0.06), rgba(37,99,235,0.06))",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>📣 Da avvisare per domani</div>
            <div style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>
              {day.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
              {rows && ` · ${done.length} su ${done.length + pending.length} avvisati`}
            </div>
          </div>
          <button onClick={onClose} aria-label="Chiudi" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 20, color: T.muted, fontWeight: 700 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 14px" }}>
          {loading && !rows && <div style={{ padding: 22, textAlign: "center", color: T.muted, fontSize: 12.5 }}>Carico…</div>}
          {rows && pending.length === 0 && done.length === 0 && groups.length === 0 && (
            <div style={{ padding: "22px 12px", textAlign: "center", color: T.muted, fontSize: 12.5 }}>
              Domani l&apos;agenda è vuota.
            </div>
          )}
          {rows && pending.length === 0 && (done.length > 0 || groups.length > 0) && (
            <div style={{
              padding: "9px 12px", marginBottom: 10, borderRadius: 10,
              background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.25)",
              fontSize: 12.5, fontWeight: 700, color: "#166534",
            }}>✓ Tutti avvisati. Domani nessuna sorpresa.</div>
          )}

          {pending.map(r => (
            <div key={r.id} style={rowBox("#fff")}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: T.text, width: 44, flexShrink: 0 }}>{hhmm(r.start_at)}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {nameOf(r)}
              </span>
              <button
                onClick={() => send(r)}
                disabled={!normalizePhoneForWA(r.patients?.phone) || sending === r.id}
                title={normalizePhoneForWA(r.patients?.phone) ? "Invia promemoria WhatsApp" : "Numero mancante o non valido"}
                style={{
                  padding: "7px 12px", borderRadius: 8, border: "none",
                  background: normalizePhoneForWA(r.patients?.phone) ? "#25D366" : "#cbd5e1",
                  color: "#fff", fontWeight: 700, fontSize: 11.5,
                  cursor: normalizePhoneForWA(r.patients?.phone) ? "pointer" : "default",
                  fontFamily: "inherit", whiteSpace: "nowrap", opacity: sending === r.id ? .6 : 1,
                }}
              >📲 Avvisa</button>
            </div>
          ))}

          {groups.map(r => (
            <div key={r.id} style={rowBox(T.soft)}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: T.text, width: 44, flexShrink: 0 }}>{hhmm(r.start_at)}</span>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: T.muted }}>
                👥 {r.group_title || "Appuntamento di gruppo"} — promemoria dal calendario
              </span>
            </div>
          ))}

          {done.map(r => (
            <div key={r.id} style={rowBox("rgba(22,163,74,0.05)")}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: T.muted, width: 44, flexShrink: 0 }}>{hhmm(r.start_at)}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {nameOf(r)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, color: T.green, whiteSpace: "nowrap" }}>
                ✓ {r.whatsapp_sent_at ? hhmm(r.whatsapp_sent_at) : "inviato"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Card per la Home: si mostra solo quando c'è qualcuno da avvisare.
// ─────────────────────────────────────────────────────────────────────────
export function ReminderTomorrowCard({ variant = "mobile" }: { variant?: "mobile" | "desktop" }) {
  const { studio } = useCurrentStudio();
  const [count, setCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!studio?.id) return;
    const { from, to } = tomorrowRange();
    const { count: c } = await supabase.from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studio.id)
      .gte("start_at", from.toISOString())
      .lte("start_at", to.toISOString())
      .neq("status", "cancelled")
      .eq("is_group", false)
      .not("patient_id", "is", null)
      .is("whatsapp_sent_at", null);
    setCount(c ?? 0);
  }, [studio?.id]);

  useEffect(() => { void refresh(); }, [refresh]);
  // Al rientro dal pannello il contatore si riallinea.
  useEffect(() => { if (!open) void refresh(); }, [open, refresh]);

  if (!count) return <>{open && <ReminderTomorrowPanel open={open} onClose={() => setOpen(false)} />}</>;

  const desktop = variant === "desktop";
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          textAlign: "left", cursor: "pointer", fontFamily: "inherit",
          background: "#fff", border: `1px solid ${T.border}`,
          borderRadius: 12, padding: desktop ? "11px 14px" : "12px 14px",
        }}
      >
        <span style={{ fontSize: desktop ? 17 : 19 }}>📣</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: desktop ? 13 : 13.5, fontWeight: 800, color: T.text }}>
            Da avvisare per domani
          </span>
          <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.muted, marginTop: 1 }}>
            Promemoria WhatsApp con un tocco
          </span>
        </span>
        <span style={{
          background: T.amber, color: "#fff", borderRadius: 999,
          fontSize: 12, fontWeight: 900, padding: "3px 10px", flexShrink: 0,
        }}>{count}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: T.teal }}>›</span>
      </button>
      {open && <ReminderTomorrowPanel open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
