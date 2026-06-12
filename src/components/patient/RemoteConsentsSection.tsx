"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { showToast } from "@/src/components/mobile/ToastProvider";
import { openWhatsApp } from "@/src/lib/whatsapp";
import { openHtmlWindow } from "@/src/lib/openHtmlWindow";
import { getStudioBranding } from "@/src/lib/studioBranding";
import {
  buildConsentTitle, buildConsentBody, consentTypeLabel,
  renderSignedConsentHtml, type ConsentType,
} from "@/src/lib/consents/texts";

// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/RemoteConsentsSection.tsx — v2
// ═══════════════════════════════════════════════════════════════════════
// Consensi a distanza: il paziente firma da casa via link (WhatsApp).
// Usato sia nella scheda paziente desktop (sezione Documenti GDPR) sia
// mobile (tab Referti). Feedback inline (funziona anche senza
// ToastProvider) + toast dove disponibile.
//
// v2: redesign — guida (i) integrata, eliminazione diretta (pending E
// firmati, con conferma rafforzata sui firmati), inserimento data di
// nascita se mancante in anagrafica (necessaria per la verifica
// identità), pill di selezione tipi, righe lista compatte.
// ═══════════════════════════════════════════════════════════════════════

const T = {
  panelBg: "#ffffff", panelSoft: "#f7f9fd", text: "#0f172a", muted: "#334155",
  faint: "#64748b", border: "#cbd5e1", blue: "#2563eb", green: "#16a34a",
  red: "#dc2626", amber: "#d97706", teal: "#0d9488",
  gradient: "linear-gradient(135deg,#0d9488,#2563eb)",
};

type ConsentRow = {
  id: string;
  consent_type: ConsentType;
  title: string;
  body_text: string;
  access_token: string;
  bundle_token: string | null;
  status: "pending" | "signed" | "revoked";
  sent_at: string;
  signed_at: string | null;
  signed_name: string | null;
  signature_data: string | null;
  signer_ip: string | null;
};

type Props = {
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientPhone: string | null;
  patientBirthDate: string | null;
  studio: {
    id?: string;
    name?: string | null;
    address?: string | null;
    signature_name?: string | null;
    signature_title?: string | null;
    multi_operator_enabled?: boolean | null;
  } | null;
};

function fmtD(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export default function RemoteConsentsSection({
  patientId, patientFirstName, patientLastName, patientPhone,
  patientBirthDate, studio,
}: Props) {
  const [consents, setConsents] = useState<ConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const [sendPrivacy, setSendPrivacy] = useState(true);
  const [sendConsenso, setSendConsenso] = useState(true);
  const [sending, setSending] = useState(false);

  // Data di nascita: serve per la verifica identità sul link pubblico
  const [birthDate, setBirthDate] = useState<string | null>(patientBirthDate);
  const [birthInput, setBirthInput] = useState("");
  const [savingBirth, setSavingBirth] = useState(false);
  const [skipVerification, setSkipVerification] = useState(false);

  const [notice, setNotice] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  function notify(kind: "success" | "error", msg: string) {
    showToast[kind](msg);            // no-op se ToastProvider assente
    setNotice({ kind, msg });
    setTimeout(() => setNotice(n => (n?.msg === msg ? null : n)), 3500);
  }

  const load = useCallback(async () => {
    const res = await supabase
      .from("patient_consents")
      .select("*")
      .eq("patient_id", patientId)
      .order("sent_at", { ascending: false });
    if (!res.error) setConsents((res.data ?? []) as ConsentRow[]);
    setLoading(false);
  }, [patientId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setBirthDate(patientBirthDate); }, [patientBirthDate]);

  // ── Data di nascita mancante ──────────────────────────────────────────
  async function saveBirthDate() {
    if (!birthInput) { notify("error", "Seleziona una data"); return; }
    setSavingBirth(true);
    const res = await supabase
      .from("patients")
      .update({ birth_date: birthInput })
      .eq("id", patientId);
    setSavingBirth(false);
    if (res.error) { notify("error", `Errore: ${res.error.message}`); return; }
    setBirthDate(birthInput);
    notify("success", "Data di nascita salvata in anagrafica ✓");
  }

  // ── Invio ─────────────────────────────────────────────────────────────
  async function sendConsents(mode: "wa" | "copy") {
    const studioId = studio?.id ?? null;
    if (!studioId) { notify("error", "Studio non disponibile, ricarica la pagina"); return; }
    const types: ConsentType[] = [];
    if (sendPrivacy)  types.push("gdpr_informativa_privacy");
    if (sendConsenso) types.push("consenso_trattamento");
    if (types.length === 0) { notify("error", "Seleziona almeno un documento"); return; }

    setSending(true);
    const branding = getStudioBranding(studio);
    const studioInfo = {
      signatureName: branding.signatureName,
      signatureTitle: branding.signatureTitle,
      address: studio?.address ?? null,
      name: studio?.name ?? null,
    };
    const patientInfo = { firstName: patientFirstName, lastName: patientLastName };

    let bundleToken: string | null = null;
    if (types.length > 1) {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      bundleToken = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    const rows = types.map(t => ({
      studio_id: studioId,
      patient_id: patientId,
      consent_type: t,
      title: buildConsentTitle(t),
      body_text: buildConsentBody(t, studioInfo, patientInfo),
      bundle_token: bundleToken,
    }));

    const res = await supabase.from("patient_consents").insert(rows).select("*");
    setSending(false);
    if (res.error) { notify("error", `Errore: ${res.error.message}`); return; }

    const created = (res.data ?? []) as ConsentRow[];
    setConsents(prev => [...created, ...prev]);
    if (created.length === 0) { notify("success", "Consenso creato ✓"); return; }

    if (mode === "wa" && patientPhone) {
      notify("success", `${created.length === 1 ? "Consenso creato" : "Consensi creati"} ✓`);
      openWhatsApp(patientPhone, buildWaMessage(created));
    } else {
      try {
        await navigator.clipboard.writeText(consentUrl(created[0]));
        notify("success", "Link copiato negli appunti ✓");
      } catch {
        notify("error", "Creato, ma copia non riuscita: usa Copia link qui sotto");
      }
    }
  }

  function consentUrl(c: ConsentRow): string {
    return `${window.location.origin}/consensi/${c.bundle_token ?? c.access_token}`;
  }

  function buildWaMessage(items: ConsentRow[]): string {
    const branding = getStudioBranding(studio);
    const firma = branding.signatureName ? `\n\n${branding.signatureName}` : "";
    const labels = items.map(c => `• ${consentTypeLabel(c.consent_type)}`).join("\n");
    return (
      `Gentile ${patientFirstName},\n` +
      `prima della prossima seduta ti chiedo di leggere e firmare ` +
      `${items.length === 1 ? "questo documento" : "questi documenti"} ` +
      `(bastano 2 minuti, si firma direttamente dal telefono):\n\n${labels}\n\n` +
      `${consentUrl(items[0])}${firma}`
    );
  }

  async function copyLink(c: ConsentRow) {
    try {
      await navigator.clipboard.writeText(consentUrl(c));
      notify("success", "Link copiato ✓");
    } catch {
      notify("error", "Copia non riuscita");
    }
  }

  function openSigned(c: ConsentRow) {
    const branding = getStudioBranding(studio);
    const html = renderSignedConsentHtml(c, {
      signatureName: branding.signatureName,
      signatureTitle: branding.signatureTitle,
      name: studio?.name ?? null,
    });
    openHtmlWindow(html, { width: 800, height: 900 });
  }

  // ── Eliminazione diretta (pending E firmati) ──────────────────────────
  async function remove(c: ConsentRow) {
    const msg = c.status === "signed"
      ? `⚠️ ATTENZIONE: stai eliminando un consenso FIRMATO da ${c.signed_name ?? "il paziente"}.\n\n` +
        `Il documento firmato è la tua evidenza legale: una volta eliminato non è recuperabile.\n\n` +
        `Eliminare definitivamente?`
      : "Eliminare questo consenso? Il link smetterà di funzionare.";
    if (!confirm(msg)) return;

    const res = await supabase.from("patient_consents").delete().eq("id", c.id);
    if (res.error) { notify("error", `Errore: ${res.error.message}`); return; }
    setConsents(prev => prev.filter(x => x.id !== c.id));
    notify("success", "Consenso eliminato");
  }

  // ── UI helpers ────────────────────────────────────────────────────────
  const pendingCount = consents.filter(c => c.status === "pending").length;
  const signedCount  = consents.filter(c => c.status === "signed").length;
  const needsBirthGate = birthDate === null && !skipVerification;

  const statusDot = (c: ConsentRow) => {
    const col = c.status === "signed" ? T.green : c.status === "pending" ? T.amber : T.faint;
    return <span style={{ width: 9, height: 9, borderRadius: "50%", background: col,
      flexShrink: 0, boxShadow: `0 0 0 3px ${col}1f` }} />;
  };

  const pill = (label: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick} style={{ padding: "7px 13px", borderRadius: 99,
      border: `1.5px solid ${active ? T.teal : T.border}`,
      background: active ? "rgba(13,148,136,0.09)" : "#fff",
      color: active ? T.teal : T.faint, fontSize: 12, fontWeight: 700,
      cursor: "pointer", fontFamily: "inherit", display: "inline-flex",
      alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 13 }}>{active ? "✓" : "○"}</span>{label}
    </button>
  );

  const act = (label: string, onClick: () => void, color: string) => (
    <button onClick={onClick} style={{ padding: "5px 10px", borderRadius: 8,
      border: `1.5px solid ${color}30`, background: `${color}0d`, color,
      fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
      {label}
    </button>
  );

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ background: T.panelBg, border: `1.5px solid ${T.border}`,
      borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "12px 14px 12px 16px", gap: 8 }}>
        <button onClick={() => setOpen(o => !o)} style={{ flex: 1, display: "flex",
          alignItems: "center", gap: 10, background: "transparent", border: "none",
          cursor: "pointer", fontFamily: "inherit", padding: 0, textAlign: "left" }}>
          <span style={{ fontSize: 17 }}>🖊️</span>
          <span>
            <span style={{ display: "block", fontWeight: 700, fontSize: 13, color: T.text }}>
              Consensi a distanza
            </span>
            <span style={{ display: "block", fontSize: 11, color: T.faint, marginTop: 1 }}>
              {loading ? "Caricamento…"
                : consents.length === 0 ? "Firma via link, direttamente dal telefono del paziente"
                : [
                    signedCount > 0 ? `${signedCount} firmat${signedCount === 1 ? "o" : "i"}` : null,
                    pendingCount > 0 ? `${pendingCount} in attesa` : null,
                  ].filter(Boolean).join(" · ") || "Nessun consenso attivo"}
            </span>
          </span>
        </button>
        <button onClick={() => { setShowInfo(s => !s); setOpen(true); }}
          title="Come funziona"
          style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            border: `1.5px solid ${showInfo ? T.blue : T.border}`,
            background: showInfo ? "rgba(37,99,235,0.08)" : "#fff",
            color: showInfo ? T.blue : T.faint, fontSize: 12.5, fontWeight: 800,
            cursor: "pointer", fontFamily: "Georgia,serif", fontStyle: "italic" }}>
          i
        </button>
        <button onClick={() => setOpen(o => !o)} style={{ background: "transparent",
          border: "none", cursor: "pointer", color: T.faint, fontSize: 13, padding: 4,
          transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          ▾
        </button>
      </div>

      {open && (
        <div style={{ borderTop: `1.5px solid ${T.border}` }}>

          {/* Guida */}
          {showInfo && (
            <div style={{ padding: "13px 16px", background: "rgba(37,99,235,0.04)",
              borderBottom: `1.5px solid ${T.border}`, fontSize: 12, color: T.muted,
              lineHeight: 1.65 }}>
              <div style={{ fontWeight: 800, fontSize: 12, color: T.blue, marginBottom: 6 }}>
                Come funziona
              </div>
              <div style={{ marginBottom: 4 }}>
                <strong>1.</strong> Scegli i documenti e genera: il paziente riceve <strong>un solo
                link</strong> (WhatsApp o copiato negli appunti).
              </div>
              <div style={{ marginBottom: 4 }}>
                <strong>2.</strong> Il paziente apre il link, conferma la propria <strong>data di
                nascita</strong> (verifica identità, max 10 tentativi poi il link si blocca),
                legge, spunta la presa visione e digita nome e cognome. La firma col dito è
                facoltativa.
              </div>
              <div style={{ marginBottom: 4 }}>
                <strong>3.</strong> Qui compare il pallino verde: da <em>Apri</em> scarichi o
                stampi il documento firmato con data, ora e IP.
              </div>
              <div style={{ color: T.faint }}>
                Se il link è già in attesa, da <em>WhatsApp</em> o <em>Copia link</em> lo
                rimandi senza crearne uno nuovo. <strong>Elimina</strong> cancella
                definitivamente — sui firmati distrugge anche l'evidenza legale, usalo con
                criterio.
              </div>
            </div>
          )}

          {notice && (
            <div style={{ margin: "12px 16px 0", padding: "9px 13px", borderRadius: 10,
              fontSize: 12.5, fontWeight: 700,
              background: notice.kind === "success" ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.07)",
              border: `1.5px solid ${notice.kind === "success" ? "rgba(22,163,74,0.3)" : "rgba(220,38,38,0.25)"}`,
              color: notice.kind === "success" ? T.green : T.red }}>
              {notice.kind === "success" ? "✓" : "⚠️"} {notice.msg}
            </div>
          )}

          {/* Pannello invio */}
          <div style={{ padding: "14px 16px", background: T.panelSoft }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {pill("Privacy GDPR", sendPrivacy, () => setSendPrivacy(s => !s))}
              {pill("Consenso trattamento", sendConsenso, () => setSendConsenso(s => !s))}
            </div>

            {/* Data di nascita mancante: serve per la verifica identità */}
            {needsBirthGate ? (
              <div style={{ border: `1.5px solid rgba(217,119,6,0.35)`,
                background: "rgba(217,119,6,0.06)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: T.amber, marginBottom: 4 }}>
                  🎂 Data di nascita mancante in anagrafica
                </div>
                <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.55, marginBottom: 10 }}>
                  Serve per la verifica identità sul link di firma. Inseriscila qui
                  (viene salvata in anagrafica) oppure genera senza verifica.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="date" value={birthInput}
                    onChange={e => setBirthInput(e.target.value)}
                    style={{ flex: 1, padding: "9px 12px", borderRadius: 9,
                      border: `1.5px solid ${T.border}`, fontSize: 14,
                      fontFamily: "inherit", color: T.text, background: "#fff",
                      minWidth: 0 }} />
                  <button onClick={saveBirthDate} disabled={savingBirth}
                    style={{ padding: "9px 14px", borderRadius: 9, border: "none",
                      background: T.teal, color: "#fff", fontWeight: 700, fontSize: 12.5,
                      cursor: savingBirth ? "wait" : "pointer", fontFamily: "inherit",
                      opacity: savingBirth ? 0.7 : 1, whiteSpace: "nowrap" }}>
                    {savingBirth ? "…" : "Salva"}
                  </button>
                </div>
                <button onClick={() => setSkipVerification(true)}
                  style={{ marginTop: 8, background: "transparent", border: "none",
                    color: T.faint, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                    fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>
                  Genera comunque senza verifica identità →
                </button>
              </div>
            ) : (
              <>
                {birthDate === null && skipVerification && (
                  <div style={{ fontSize: 11, color: T.amber, fontWeight: 600, marginBottom: 8 }}>
                    ⚠️ Verifica identità disattivata (manca la data di nascita)
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  {patientPhone && (
                    <button onClick={() => sendConsents("wa")} disabled={sending}
                      style={{ flex: 1, padding: "11px 12px", borderRadius: 10,
                        border: "none", background: T.gradient, color: "#fff",
                        fontWeight: 700, fontSize: 12.5, cursor: sending ? "wait" : "pointer",
                        opacity: sending ? 0.7 : 1, fontFamily: "inherit",
                        boxShadow: "0 2px 8px rgba(13,148,136,0.25)" }}>
                      {sending ? "Creazione…" : "📲 Genera + WhatsApp"}
                    </button>
                  )}
                  <button onClick={() => sendConsents("copy")} disabled={sending}
                    style={{ flex: 1, padding: "11px 12px", borderRadius: 10,
                      border: patientPhone ? `1.5px solid ${T.blue}` : "none",
                      background: patientPhone ? "rgba(37,99,235,0.07)" : T.gradient,
                      color: patientPhone ? T.blue : "#fff",
                      fontWeight: 700, fontSize: 12.5, cursor: sending ? "wait" : "pointer",
                      opacity: sending ? 0.7 : 1, fontFamily: "inherit",
                      boxShadow: patientPhone ? "none" : "0 2px 8px rgba(13,148,136,0.25)" }}>
                    {sending ? "Creazione…" : "🔗 Genera + copia link"}
                  </button>
                </div>
                {!patientPhone && (
                  <div style={{ fontSize: 11, color: T.faint, marginTop: 6, textAlign: "center" }}>
                    Nessun telefono in anagrafica: il link verrà copiato negli appunti.
                  </div>
                )}
              </>
            )}
          </div>

          {/* Lista */}
          {consents.length > 0 && (
            <div>
              {consents.map((c, i) => (
                <div key={c.id} style={{ padding: "11px 16px", display: "flex",
                  alignItems: "center", gap: 11,
                  borderTop: i === 0 ? `1.5px solid ${T.border}` : `1px solid #e2e8f0` }}>
                  {statusDot(c)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {consentTypeLabel(c.consent_type)}
                    </div>
                    <div style={{ fontSize: 10.5, color: T.faint, marginTop: 1 }}>
                      {c.status === "signed"
                        ? `Firmato da ${c.signed_name ?? "—"} · ${fmtD(c.signed_at)}`
                        : c.status === "pending"
                          ? `In attesa · inviato ${fmtD(c.sent_at)}`
                          : `Disattivato · ${fmtD(c.sent_at)}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {c.status === "signed" && act("📄 Apri", () => openSigned(c), T.green)}
                    {c.status === "pending" && patientPhone &&
                      act("WhatsApp", () => openWhatsApp(patientPhone, buildWaMessage([c])), T.green)}
                    {c.status === "pending" && act("Copia", () => copyLink(c), T.blue)}
                    {act("🗑", () => remove(c), T.red)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
