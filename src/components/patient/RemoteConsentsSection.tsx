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
// src/components/patient/RemoteConsentsSection.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Sezione "Consensi a distanza" nella tab Referti della scheda paziente.
//
// COMPLEMENTA il flusso in-studio (modal desktop con firma su tablet):
// qui il consenso viene INVIATO via link e il paziente firma da casa.
//
// Funzioni:
//   • Invia: crea righe in patient_consents (snapshot testo + token DB)
//   • Lista con badge stato (In attesa / Firmato / Revocato)
//   • Azioni: WhatsApp, Copia link, Apri firmato (HTML stampabile), Revoca
// ═══════════════════════════════════════════════════════════════════════

const T = {
  panelBg: "#ffffff", panelSoft: "#f7f9fd", text: "#0f172a", muted: "#334155",
  border: "#cbd5e1", blue: "#2563eb", green: "#16a34a", red: "#dc2626",
  amber: "#f97316", teal: "#0d9488", gradient: "linear-gradient(135deg,#0d9488,#2563eb)",
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
  studio: {
    id?: string;
    name?: string | null;
    address?: string | null;
    signature_name?: string | null;
    signature_title?: string | null;
    multi_operator_enabled?: boolean | null;
  } | null;
};

function fmtDT(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function RemoteConsentsSection({
  patientId, patientFirstName, patientLastName, patientPhone, studio,
}: Props) {
  const [consents, setConsents] = useState<ConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendPrivacy, setSendPrivacy] = useState(true);
  const [sendConsenso, setSendConsenso] = useState(true);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  // Feedback inline: visibile anche dove ToastProvider non è montato (desktop)
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

  // ── Invio ─────────────────────────────────────────────────────────────
  async function sendConsents() {
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

    // Più documenti insieme → bundle_token condiviso: il paziente riceve
    // UN solo link e firma una volta sola per tutti.
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
    notify("success", `${created.length === 1 ? "Consenso creato" : "Consensi creati"} ✓`);

    // Apri subito WhatsApp con il messaggio completo (se c'è il telefono)
    if (patientPhone && created.length > 0) {
      const msg = buildWaMessage(created);
      openWhatsApp(patientPhone, msg);
    }
  }

  function consentUrl(c: ConsentRow): string {
    // Documenti inviati insieme condividono il link del bundle: firma unica
    return `${window.location.origin}/consensi/${c.bundle_token ?? c.access_token}`;
  }

  function buildWaMessage(items: ConsentRow[]): string {
    const branding = getStudioBranding(studio);
    const firma = branding.signatureName ? `\n\n${branding.signatureName}` : "";
    const sameBundle = items.length > 1 &&
      items[0].bundle_token != null &&
      items.every(c => c.bundle_token === items[0].bundle_token);

    if (sameBundle || items.length === 1) {
      const labels = items.map(c => `• ${consentTypeLabel(c.consent_type)}`).join("\n");
      return (
        `Gentile ${patientFirstName},\n` +
        `prima della prossima seduta ti chiedo di leggere e firmare ` +
        `${items.length === 1 ? "questo documento" : "questi documenti"} ` +
        `(bastano 2 minuti, si firma direttamente dal telefono):\n\n${labels}\n\n` +
        `${consentUrl(items[0])}${firma}`
      );
    }

    const links = items
      .map(c => `• ${consentTypeLabel(c.consent_type)}:\n${consentUrl(c)}`)
      .join("\n\n");
    return (
      `Gentile ${patientFirstName},\n` +
      `prima della prossima seduta ti chiedo di leggere e firmare ` +
      `questi documenti (bastano 2 minuti, si firma direttamente dal telefono):\n\n${links}${firma}`
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

  async function revoke(c: ConsentRow) {
    if (!confirm("Disattivare questo link? Il paziente non potrà più firmare con questo link.")) return;
    const res = await supabase
      .from("patient_consents")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", c.id)
      .eq("status", "pending");
    if (res.error) { notify("error", `Errore: ${res.error.message}`); return; }
    notify("success", "Link disattivato");
    await load();
  }

  // ── UI ────────────────────────────────────────────────────────────────
  const pendingCount = consents.filter(c => c.status === "pending").length;
  const signedCount  = consents.filter(c => c.status === "signed").length;

  const badge = (c: ConsentRow) => {
    const map = {
      pending: { bg: "rgba(249,115,22,0.1)",  bd: "rgba(249,115,22,0.35)", col: T.amber, lbl: "In attesa" },
      signed:  { bg: "rgba(22,163,74,0.1)",   bd: "rgba(22,163,74,0.35)",  col: T.green, lbl: "Firmato" },
      revoked: { bg: "rgba(148,163,184,0.15)", bd: "rgba(148,163,184,0.4)", col: "#64748b", lbl: "Disattivato" },
    }[c.status];
    return (
      <span style={{ padding: "2px 9px", borderRadius: 99, fontSize: 10.5, fontWeight: 800,
        background: map.bg, border: `1.5px solid ${map.bd}`, color: map.col,
        whiteSpace: "nowrap" }}>
        {map.lbl}
      </span>
    );
  };

  const miniBtn = (label: string, onClick: () => void, color: string = T.blue): React.ReactNode => (
    <button onClick={onClick} style={{ padding: "6px 11px", borderRadius: 8,
      border: `1.5px solid ${color}33`, background: `${color}11`, color,
      fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
      {label}
    </button>
  );

  return (
    <div style={{ background: T.panelBg, border: `1.5px solid ${T.border}`,
      borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>

      {/* Header collassabile */}
      <button onClick={() => setOpen(o => !o)} style={{ width: "100%", display: "flex",
        alignItems: "center", justifyContent: "space-between", padding: "13px 16px",
        background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: T.text }}>
            🖊️ Consensi a distanza
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
            {loading ? "Caricamento…"
              : consents.length === 0 ? "Invia privacy e consenso da firmare via link"
              : `${signedCount} firmati${pendingCount > 0 ? ` · ${pendingCount} in attesa` : ""}`}
          </div>
        </div>
        <span style={{ fontSize: 13, color: T.muted, transform: open ? "rotate(180deg)" : "none",
          transition: "transform 0.15s" }}>▾</span>
      </button>

      {open && (
        <div style={{ borderTop: `1.5px solid ${T.border}` }}>

          {notice && (
            <div style={{ margin: "12px 16px 0", padding: "9px 13px", borderRadius: 10,
              fontSize: 12.5, fontWeight: 700,
              background: notice.kind === "success" ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.07)",
              border: `1.5px solid ${notice.kind === "success" ? "rgba(22,163,74,0.3)" : "rgba(220,38,38,0.25)"}`,
              color: notice.kind === "success" ? T.green : T.red }}>
              {notice.kind === "success" ? "✓" : "⚠️"} {notice.msg}
            </div>
          )}

          {/* Invio */}
          <div style={{ padding: "14px 16px", background: T.panelSoft }}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 7,
                fontSize: 12.5, color: T.text, fontWeight: 600, cursor: "pointer" }}>
                <input type="checkbox" checked={sendPrivacy}
                  onChange={e => setSendPrivacy(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: T.teal }} />
                Informativa Privacy GDPR
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 7,
                fontSize: 12.5, color: T.text, fontWeight: 600, cursor: "pointer" }}>
                <input type="checkbox" checked={sendConsenso}
                  onChange={e => setSendConsenso(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: T.teal }} />
                Consenso al trattamento
              </label>
            </div>
            <button onClick={sendConsents} disabled={sending}
              style={{ width: "100%", padding: "11px 16px", borderRadius: 10,
                border: "none", background: T.gradient, color: "#fff",
                fontWeight: 700, fontSize: 13, cursor: sending ? "wait" : "pointer",
                opacity: sending ? 0.7 : 1, fontFamily: "inherit",
                boxShadow: "0 2px 8px rgba(13,148,136,0.25)" }}>
              {sending ? "Creazione…" : patientPhone ? "📲 Genera link e invia su WhatsApp" : "🔗 Genera link"}
            </button>
            {!patientPhone && (
              <div style={{ fontSize: 11, color: T.muted, marginTop: 6, textAlign: "center" }}>
                Nessun telefono in anagrafica: potrai copiare il link manualmente.
              </div>
            )}
          </div>

          {/* Lista */}
          {consents.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {consents.map((c, i) => (
                <div key={c.id} style={{ padding: "12px 16px",
                  borderTop: i === 0 ? `1.5px solid ${T.border}` : `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>
                      {consentTypeLabel(c.consent_type)}
                    </div>
                    {badge(c)}
                  </div>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 9 }}>
                    {c.status === "signed"
                      ? `Firmato da ${c.signed_name ?? "—"} · ${fmtDT(c.signed_at)}`
                      : `Inviato il ${fmtDT(c.sent_at)}`}
                  </div>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {c.status === "signed" && miniBtn("📄 Apri documento", () => openSigned(c), T.green)}
                    {c.status === "pending" && (
                      <>
                        {patientPhone && miniBtn("WhatsApp", () =>
                          openWhatsApp(patientPhone, buildWaMessage([c])), T.green)}
                        {miniBtn("Copia link", () => copyLink(c))}
                        {miniBtn("Disattiva", () => revoke(c), T.red)}
                      </>
                    )}
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
