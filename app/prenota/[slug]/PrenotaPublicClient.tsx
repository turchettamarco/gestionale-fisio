"use client";

// ════════════════════════════════════════════════════════════════════════
// app/prenota/[slug]/PrenotaPublicClient.tsx
// ════════════════════════════════════════════════════════════════════════
// Flusso: scegli servizio → scegli data → scegli orario libero → i tuoi
// dati → conferma. 4 passi semplici, pensati per essere aperti da un link
// condiviso su WhatsApp/Instagram, senza bisogno di un sito esterno.
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from "react";
import type React from "react";
import { useParams } from "next/navigation";
import type { PublicBookingStudio, PublicBookingService, PublicBookingLocation } from "@/app/api/public/booking-info/[slug]/route";

// ── Palette brand FisioHub (stessa della pagina agenda pubblica) ──────
const T = {
  appBg:      "#f1f5f9",
  panelBg:    "#ffffff",
  panelSoft:  "#f8fafc",
  text:       "#0f172a",
  textSoft:   "#1e293b",
  muted:      "#475569",
  mutedSoft:  "#64748b",
  border:     "#cbd5e1",
  borderSoft: "#e2e8f0",
  blue:       "#2563eb",
  teal:       "#0d9488",
  red:        "#dc2626",
  white:      "#ffffff",
};

const GRADIENT = "linear-gradient(135deg, #0d9488, #2563eb)";

// "location" compare solo se lo studio ha più sedi (mig. 084).
type Step = "location" | "service" | "datetime" | "details" | "done";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

export default function PrenotaPublicClient() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [studio, setStudio] = useState<PublicBookingStudio | null>(null);
  const [services, setServices] = useState<PublicBookingService[]>([]);
  const [locations, setLocations] = useState<PublicBookingLocation[]>([]);
  const [showPrices, setShowPrices] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState<PublicBookingLocation | null>(null);

  const [step, setStep] = useState<Step>("service");
  const [selectedService, setSelectedService] = useState<PublicBookingService | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsClosed, setSlotsClosed] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hasLocations = locations.length > 1;

  // ── Carica studio + servizi ──────────────────────────────────────────
  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const res = await fetch(`/api/public/booking-info/${encodeURIComponent(slug)}`);
        if (!res.ok) { setNotFound(true); return; }
        const data = await res.json();
        setStudio(data.studio);
        setServices(data.services ?? []);
        setShowPrices(data.showPrices !== false);
        const locs: PublicBookingLocation[] = data.locations ?? [];
        setLocations(locs);
        // Con più sedi si parte dalla scelta della sede, altrimenti si va
        // dritti ai servizi come prima.
        if (locs.length > 1) setStep("location");
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  // ── Carica gli slot liberi ───────────────────────────────────────────
  // Servizio e data si passano espliciti invece di leggerli dallo stato:
  // così la chiamata parte dal gesto dell'utente (scelta servizio o
  // cambio data) senza dipendere da quando React aggiorna lo stato.
  const loadSlotsFor = useCallback(async (
    service: PublicBookingService,
    date: string,
    location: PublicBookingLocation | null,
  ) => {
    if (!studio) return;
    setSlotsLoading(true);
    setSlotsClosed(false);
    setSelectedTime(null);
    try {
      const locParam = location ? `&location_id=${location.id}` : "";
      const res = await fetch(
        `/api/booking/slots?studio_id=${studio.id}&date=${date}&duration=${service.duration}${locParam}`
      );
      const data = await res.json();
      setSlots(data.slots ?? []);
      setSlotsClosed(Boolean(data.closed));
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [studio]);

  function chooseLocation(loc: PublicBookingLocation) {
    setSelectedLocation(loc);
    setStep("service");
  }

  function chooseService(svc: PublicBookingService) {
    setSelectedService(svc);
    setStep("datetime");
    void loadSlotsFor(svc, selectedDate, selectedLocation);
  }

  function changeDate(date: string) {
    setSelectedDate(date);
    if (selectedService) void loadSlotsFor(selectedService, date, selectedLocation);
  }

  async function submitBooking() {
    if (!studio || !selectedService || !selectedTime) return;
    if (!name.trim() || !phone.trim()) {
      setSubmitError("Nome e telefono sono obbligatori.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studio_id: studio.id,
          location_id: selectedLocation?.id ?? null,
          service_name: selectedService.name,
          service_duration: selectedService.duration,
          requested_date: selectedDate,
          requested_time: selectedTime,
          patient_name: name.trim(),
          patient_phone: phone.trim(),
          patient_email: email.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Errore durante l'invio. Riprova.");
        return;
      }
      setStep("done");
    } catch {
      setSubmitError("Errore di connessione. Riprova.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Stati di caricamento / errore ────────────────────────────────────
  if (loading) {
    return (
      <Centered>
        <div style={{ color: T.mutedSoft, fontSize: 14, fontWeight: 600 }}>Caricamento…</div>
      </Centered>
    );
  }

  if (notFound || !studio) {
    return (
      <Centered>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 8 }}>
            Pagina non disponibile
          </div>
          <div style={{ fontSize: 13, color: T.mutedSoft }}>
            Il link potrebbe non essere corretto, oppure lo studio non ha
            ancora attivato la prenotazione online.
          </div>
        </div>
      </Centered>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.appBg }}>
      {/* Header */}
      <div style={{ background: GRADIENT, padding: "28px 20px 22px", color: T.white }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Prenota una visita
          </div>
          <div style={{ fontSize: 21, fontWeight: 800, marginTop: 4 }}>{studio.name}</div>
          {(studio.address || studio.phone) && (
            <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 4 }}>
              {[studio.address, studio.phone].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 20px 60px" }}>
        {/* I numeri dei passi si spostano se c'è anche la scelta sede */}
        {step === "location" && (
          <Panel title="1. Scegli la sede">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {locations.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => chooseLocation(loc)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                    border: `1px solid ${T.borderSoft}`, background: T.panelBg,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, color: T.text }}>{loc.name}</div>
                  {loc.address && (
                    <div style={{ fontSize: 12, color: T.mutedSoft, marginTop: 2 }}>{loc.address}</div>
                  )}
                </button>
              ))}
            </div>
          </Panel>
        )}

        {step === "service" && (
          <Panel
            title={`${hasLocations ? 2 : 1}. Scegli il servizio`}
            onBack={hasLocations ? () => setStep("location") : undefined}
          >
            {selectedLocation && (
              <div style={{ fontSize: 12.5, color: T.mutedSoft, marginBottom: 14 }}>
                Sede: <strong style={{ color: T.textSoft }}>{selectedLocation.name}</strong>
              </div>
            )}
            {services.length === 0 ? (
              <div style={{ fontSize: 13, color: T.mutedSoft, fontStyle: "italic" }}>
                Nessun servizio prenotabile online al momento.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {services.map(svc => (
                  <button
                    key={svc.id}
                    onClick={() => chooseService(svc)}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                      border: `1px solid ${T.borderSoft}`, background: T.panelBg, textAlign: "left",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: T.text }}>{svc.name}</div>
                      <div style={{ fontSize: 12, color: T.mutedSoft, marginTop: 2 }}>{svc.duration} min</div>
                    </div>
                    {showPrices && (
                      <div style={{ fontWeight: 700, fontSize: 14, color: T.teal }}>€{svc.price}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Panel>
        )}

        {step === "datetime" && selectedService && (
          <Panel title={`${hasLocations ? 3 : 2}. Scegli data e orario`} onBack={() => setStep("service")}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Servizio</label>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                {selectedService.name} · {selectedService.duration} min
              </div>
            </div>

            <label style={labelStyle}>Data</label>
            <input
              type="date"
              value={selectedDate}
              min={todayISO()}
              onChange={e => changeDate(e.target.value)}
              style={inputStyle}
            />

            <div style={{ marginTop: 16 }}>
              <label style={labelStyle}>Orari disponibili — {formatDateLabel(selectedDate)}</label>
              {slotsLoading ? (
                <div style={{ fontSize: 13, color: T.mutedSoft }}>Caricamento orari…</div>
              ) : slotsClosed ? (
                <div style={{ fontSize: 13, color: T.mutedSoft, fontStyle: "italic" }}>
                  Chiuso in questa data. Prova un altro giorno.
                </div>
              ) : slots.length === 0 ? (
                <div style={{ fontSize: 13, color: T.mutedSoft, fontStyle: "italic" }}>
                  Nessun orario libero in questa data. Prova un altro giorno.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {slots.map(t => (
                    <button
                      key={t}
                      onClick={() => setSelectedTime(t)}
                      style={{
                        padding: "9px 6px", borderRadius: 8, cursor: "pointer",
                        border: `1px solid ${selectedTime === t ? T.teal : T.borderSoft}`,
                        background: selectedTime === t ? T.teal : T.panelBg,
                        color: selectedTime === t ? T.white : T.text,
                        fontWeight: 700, fontSize: 13,
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setStep("details")}
              disabled={!selectedTime}
              style={{ ...primaryButtonStyle, marginTop: 20, opacity: selectedTime ? 1 : 0.5 }}
            >
              Continua
            </button>
          </Panel>
        )}

        {step === "details" && selectedService && selectedTime && (
          <Panel title={`${hasLocations ? 4 : 3}. I tuoi dati`} onBack={() => setStep("datetime")}>
            <SummaryLine service={selectedService} date={selectedDate} time={selectedTime} location={selectedLocation} />

            <label style={labelStyle}>Nome e cognome *</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Mario Rossi" />

            <label style={labelStyle}>Telefono *</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} placeholder="333 1234567" />

            <label style={labelStyle}>Email (facoltativa)</label>
            <input value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="mario@email.it" />

            <label style={labelStyle}>Note (facoltative)</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
              placeholder="Es. prima visita, zona da trattare…"
            />

            {submitError && (
              <div style={{ fontSize: 12.5, color: T.red, marginTop: 8, marginBottom: 4 }}>{submitError}</div>
            )}

            <button
              onClick={() => void submitBooking()}
              disabled={submitting || !name.trim() || !phone.trim()}
              style={{ ...primaryButtonStyle, marginTop: 16, opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? "Invio in corso…" : "Invia richiesta di prenotazione"}
            </button>
            <div style={{ fontSize: 11.5, color: T.mutedSoft, marginTop: 10, textAlign: "center" }}>
              Non è una conferma automatica: lo studio la confermerà a breve.
            </div>
          </Panel>
        )}

        {step === "done" && selectedService && selectedTime && (
          <Panel title="Richiesta inviata">
            <div style={{ textAlign: "center", padding: "12px 0 4px" }}>
              <div style={{
                width: 52, height: 52, borderRadius: "50%", background: T.teal,
                color: T.white, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26, margin: "0 auto 14px",
              }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>
                Grazie, {name.split(" ")[0]}!
              </div>
              <div style={{ fontSize: 13, color: T.mutedSoft, lineHeight: 1.5 }}>
                La tua richiesta per <strong>{selectedService.name}</strong> il{" "}
                <strong>{formatDateLabel(selectedDate)} alle {selectedTime}</strong> è stata
                inviata a {selectedLocation ? `${studio.name} — ${selectedLocation.name}` : studio.name}. Ti contatteranno a breve per confermarla.
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

// ── Sotto-componenti UI ──────────────────────────────────────────────

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: T.appBg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      {children}
    </div>
  );
}

function Panel({ title, onBack, children }: { title: string; onBack?: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      background: T.panelBg, borderRadius: 14, border: `1px solid ${T.borderSoft}`,
      padding: "20px 18px", marginTop: -30, boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        {onBack && (
          <button onClick={onBack} style={{ border: "none", background: "none", cursor: "pointer", color: T.mutedSoft, fontSize: 18, padding: 0 }}>
            ←
          </button>
        )}
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function SummaryLine({ service, date, time, location }: {
  service: PublicBookingService; date: string; time: string;
  location: PublicBookingLocation | null;
}) {
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 8, background: T.panelSoft,
      border: `1px solid ${T.borderSoft}`, marginBottom: 16, fontSize: 12.5, color: T.textSoft,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span>{service.name}</span>
        <span style={{ fontWeight: 700, textAlign: "right" }}>{formatDateLabel(date)} · {time}</span>
      </div>
      {location && (
        <div style={{ marginTop: 4, color: T.mutedSoft }}>Sede: {location.name}</div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: T.mutedSoft,
  marginTop: 12, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.3,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: `1px solid ${T.border}`, fontSize: 13.5, color: T.text,
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%", padding: "13px", borderRadius: 10, border: "none",
  background: T.teal, color: T.white, fontWeight: 700, fontSize: 14, cursor: "pointer",
};
