"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// ═══════════════════════════════════════════════════════════════════════
// app/conferma/[token]/page.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Pagina pubblica di conferma appuntamenti via link WhatsApp.
//
// Flusso:
//   1. Il paziente clicca un link tipo turchettamarco.com/conferma/{token}
//   2. La pagina chiama GET /api/confirm?token={token}
//   3. La risposta contiene:
//      • dati appuntamento "principale" (quello legato al token)
//      • lista TUTTI gli appuntamenti futuri del paziente (max 30 giorni)
//      • dati studio per branding
//   4. Mostra una card per ogni appuntamento, con bottoni Conferma/Annulla
//      individuali (booked/not_paid hanno entrambi; confirmed mostra solo
//      Annulla; cancelled è read-only).
//   5. Click su un bottone → POST /api/confirm con
//      { token, action, appointment_id }. L'API verifica che l'appuntamento
//      target appartenga al paziente del token.
//
// Aggiornamento ottimistico: l'UI cambia subito, poi la risposta del server
// conferma. In caso di errore, ripristino lo stato precedente.
//
// ═══════════════════════════════════════════════════════════════════════

type ApiAppointment = {
  id: string;
  start_at: string;
  status: string;
  location: string | null;
  clinic_site: string | null;
  domicile_address: string | null;
};

type ApiResponse = {
  id: string;
  start_at: string;
  status: string;
  location: string | null;
  clinic_site: string | null;
  domicile_address: string | null;
  patient: { first_name?: string; last_name?: string } | null;
  patient_id: string | null;
  already_used: boolean;
  studio: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    signature_name?: string | null;
    signature_title?: string | null;
    google_review_link?: string | null;
    website?: string | null;
    logo_base64?: string | null;
  } | null;
  appointments_list: ApiAppointment[];
};

export default function ConfirmPage() {
  const params = useParams();
  const token = params?.token as string;
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // ID degli appuntamenti su cui c'è un'azione in corso (per disabilitare i bottoni)
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());
  // Modal "Avvisa lo studio su WhatsApp" dopo cancellazione (se attivo studio-side)
  const [waRedirectInfo, setWaRedirectInfo] = useState<{
    url: string;
    appointmentDate: string;
  } | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/confirm?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d as ApiResponse);
      })
      .catch(e => setError(e?.message || "Errore"))
      .finally(() => setLoading(false));
  }, [token]);

  async function actOn(appointmentId: string, action: "confirm" | "cancel") {
    if (!data) return;
    const verb = action === "confirm" ? "confermare" : "annullare";
    if (!confirm(`Vuoi ${verb} questo appuntamento?`)) return;

    // Aggiornamento ottimistico (UI reattiva, ripristino se errore)
    const newStatus = action === "confirm" ? "confirmed" : "cancelled";
    const previousData = data;
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        status: prev.id === appointmentId ? newStatus : prev.status,
        appointments_list: prev.appointments_list.map(a =>
          a.id === appointmentId ? { ...a, status: newStatus } : a
        ),
      };
    });
    setActingIds(prev => new Set(prev).add(appointmentId));

    try {
      const r = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action, appointment_id: appointmentId }),
      });
      const d = await r.json();
      if (d.error) {
        alert(d.error);
        setData(previousData);
      } else if (action === "cancel" && d.wa_redirect_url) {
        // Cancellazione riuscita + studio ha abilitato WA redirect
        // → mostra modal con bottone "Avvisa lo studio".
        // Ricavo la data formattata dell'appuntamento appena annullato.
        const cancelledAppt = previousData?.appointments_list.find(a => a.id === appointmentId)
          ?? (previousData?.id === appointmentId ? previousData : null);
        const dateStr = cancelledAppt
          ? new Date(cancelledAppt.start_at).toLocaleString("it-IT", {
              weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
            })
          : "il tuo appuntamento";
        setWaRedirectInfo({ url: d.wa_redirect_url, appointmentDate: dateStr });
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Errore");
      setData(previousData);
    } finally {
      setActingIds(prev => {
        const next = new Set(prev);
        next.delete(appointmentId);
        return next;
      });
    }
  }

  const studioHeader = data?.studio
    ? [data.studio.name, data.studio.signature_name].filter(Boolean).join(" · ")
    : "Conferma Appuntamento";

  if (loading) {
    return (
      <Wrapper studioHeader={studioHeader} logoBase64={data?.studio?.logo_base64}>
        <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>Caricamento…</div>
      </Wrapper>
    );
  }

  if (error) {
    return (
      <Wrapper studioHeader={studioHeader} logoBase64={data?.studio?.logo_base64}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 20, color: "#dc2626" }}>Appuntamento non trovato</h2>
          <p style={{ color: "#64748b", fontSize: 13 }}>{error}</p>
        </div>
      </Wrapper>
    );
  }

  if (!data) return null;

  const patientName = `${data.patient?.first_name || ""} ${data.patient?.last_name || ""}`.trim();
  const firstName = data.patient?.first_name || "";

  // Lista da mostrare. Se appointments_list è vuoto (es. token vecchio non
  // refreshato dopo aggiornamento), fallback al singolo appuntamento del token.
  const listToShow: ApiAppointment[] = data.appointments_list.length > 0
    ? data.appointments_list
    : [{
        id: data.id,
        start_at: data.start_at,
        status: data.status,
        location: data.location,
        clinic_site: data.clinic_site,
        domicile_address: data.domicile_address,
      }];

  const isMulti = listToShow.length > 1;

  return (
    <Wrapper studioHeader={studioHeader} logoBase64={data?.studio?.logo_base64}>
      {/* Modal "Avvisa lo studio su WhatsApp" mostrato dopo cancellazione */}
      {waRedirectInfo && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: 20,
          }}
          onClick={() => setWaRedirectInfo(null)}
        >
          <div
            style={{
              background: "#fff", borderRadius: 14, padding: 24, maxWidth: 420,
              width: "100%", boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 44, textAlign: "center", marginBottom: 8 }}>✓</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: "#0f172a", textAlign: "center" }}>
              Annullamento registrato
            </h2>
            <p style={{ margin: "0 0 18px", fontSize: 13, color: "#475569", textAlign: "center", lineHeight: 1.5 }}>
              Vuoi avvisare lo studio su WhatsApp?<br/>
              Ti aiuta a comunicare meglio con il tuo terapista.
            </p>

            <a
              href={waRedirectInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setWaRedirectInfo(null)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "14px", borderRadius: 10,
                background: "#25D366", color: "#fff", fontWeight: 700, fontSize: 15,
                textDecoration: "none", marginBottom: 10,
              }}
            >
              💬 Avvisa lo studio su WhatsApp
            </a>

            <button
              onClick={() => setWaRedirectInfo(null)}
              style={{
                width: "100%", padding: "12px", borderRadius: 10,
                background: "transparent", border: "1px solid #cbd5e1",
                color: "#64748b", fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}
            >
              No grazie, chiudi
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: "28px 20px" }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, color: "#0f172a", textAlign: "center" }}>
          {isMulti ? "I tuoi prossimi appuntamenti" : "Conferma il tuo appuntamento"}
        </h1>
        <p style={{ textAlign: "center", color: "#64748b", fontSize: 13, marginBottom: 22 }}>
          {firstName ? `Ciao ${firstName}` : patientName}
          {isMulti ? " — conferma o annulla ogni appuntamento" : ""}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {listToShow.map(appt => (
            <AppointmentCard
              key={appt.id}
              appt={appt}
              acting={actingIds.has(appt.id)}
              onConfirm={() => actOn(appt.id, "confirm")}
              onCancel={() => actOn(appt.id, "cancel")}
            />
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: "#94a3b8" }}>
          {data.studio?.signature_name
            ? `${data.studio.signature_name}${data.studio.address ? ` — ${data.studio.address}` : ""}`
            : ""}
        </div>
      </div>
    </Wrapper>
  );
}

// ─── Card singolo appuntamento ────────────────────────────────────────
function AppointmentCard({
  appt, acting, onConfirm, onCancel,
}: {
  appt: ApiAppointment;
  acting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const date = new Date(appt.start_at);
  const dateStr = date.toLocaleDateString("it-IT", {
    weekday: "long", day: "2-digit", month: "long",
  });
  const timeStr = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const luogo = appt.location === "studio"
    ? (appt.clinic_site || "Studio")
    : `Domicilio${appt.domicile_address ? ` (${appt.domicile_address})` : ""}`;

  const isConfirmed = appt.status === "confirmed";
  const isCancelled = appt.status === "cancelled";

  // Bordo + sfondo cambiano in base allo stato
  const cardBorder = isCancelled ? "#fca5a5"
                   : isConfirmed ? "#86efac"
                   : "#e2e8f0";
  const cardBg = isCancelled ? "#fef2f2"
               : isConfirmed ? "#f0fdf4"
               : "#f8fafc";

  return (
    <div style={{
      background: cardBg,
      border: `1.5px solid ${cardBorder}`,
      borderRadius: 12,
      padding: "14px 16px",
      transition: "all 0.2s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>📅</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", textTransform: "capitalize" }}>
          {dateStr}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
        <span style={{ fontSize: 18 }}>🕐</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Ore {timeStr}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>📍</span>
        <span style={{ fontSize: 13, color: "#334155" }}>{luogo}</span>
      </div>

      {isConfirmed ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: "#15803d",
            background: "rgba(22,163,74,0.12)",
            padding: "8px 10px", borderRadius: 8, textAlign: "center",
          }}>
            ✓ Confermato — la aspettiamo
          </div>
          <button
            onClick={onCancel}
            disabled={acting}
            style={{
              padding: "10px", borderRadius: 8,
              border: "1.5px solid #fca5a5",
              background: "#fff", color: "#dc2626",
              fontWeight: 700, fontSize: 13,
              cursor: "pointer", fontFamily: "inherit",
              opacity: acting ? 0.6 : 1,
            }}
          >
            {acting ? "Attendere…" : "✕ Annulla questo appuntamento"}
          </button>
        </div>
      ) : isCancelled ? (
        <div style={{
          fontSize: 12, fontWeight: 700, color: "#dc2626",
          background: "rgba(220,38,38,0.08)",
          padding: "8px 10px", borderRadius: 8, textAlign: "center",
        }}>
          📵 Annullato — per riprenotare contatti lo studio
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            onClick={onConfirm}
            disabled={acting}
            style={{
              padding: "12px 8px", borderRadius: 8, border: "none",
              background: "linear-gradient(135deg,#16a34a,#0d9488)",
              color: "#fff", fontWeight: 800, fontSize: 13,
              cursor: "pointer", fontFamily: "inherit",
              opacity: acting ? 0.6 : 1,
            }}
          >
            {acting ? "…" : "✓ Confermo"}
          </button>
          <button
            onClick={onCancel}
            disabled={acting}
            style={{
              padding: "12px 8px", borderRadius: 8,
              border: "1.5px solid #fca5a5",
              background: "#fff", color: "#dc2626",
              fontWeight: 700, fontSize: 13,
              cursor: "pointer", fontFamily: "inherit",
              opacity: acting ? 0.6 : 1,
            }}
          >
            {acting ? "…" : "✕ Annulla"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Wrapper layout ────────────────────────────────────────────────────
function Wrapper({ children, studioHeader, logoBase64 }: {
  children: React.ReactNode;
  studioHeader?: string;
  logoBase64?: string | null;
}) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#f8fafc",
      fontFamily: "'Segoe UI',system-ui,sans-serif",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        maxWidth: 480, width: "100%",
        background: "#fff",
        borderRadius: 16,
        boxShadow: "0 4px 24px rgba(15,23,42,0.08)",
        overflow: "hidden",
      }}>
        <div style={{
          background: "linear-gradient(135deg,#0d9488,#2563eb)",
          padding: "20px 16px", textAlign: "center",
        }}>
          {logoBase64 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoBase64}
              alt="Logo studio"
              style={{
                display: "block", margin: "0 auto 10px",
                maxHeight: 72, maxWidth: 220, objectFit: "contain",
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))",
              }}
            />
          )}
          <div style={{
            fontSize: 12, color: "rgba(255,255,255,0.7)",
            fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
          }}>
            {studioHeader || "Conferma Appuntamento"}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
