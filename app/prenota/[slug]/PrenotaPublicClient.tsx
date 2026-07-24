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
  // Colori brand FisioHub: teal + blu, come nel resto del gestionale
  teal:       "#0d9488",
  tealSoft:   "#f0fdfa",   // sfondo della card selezionata
  tealLine:   "#99f6e4",   // bordo della card selezionata
  tealIcon:   "#ccfbf1",   // riquadro icona quando selezionata
  blue:       "#2563eb",
  red:        "#dc2626",
  white:      "#ffffff",
  wa:         "#25D366",
};

const GRADIENT = "linear-gradient(135deg, #0d9488, #2563eb)";

// "location" compare solo se lo studio ha più sedi (mig. 084).
type Step = "location" | "service" | "datetime" | "details" | "done";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Durata usata per capire dove c'è posto in agenda quando il servizio non
// ne ha una (es. un noleggio). Serve solo al calcolo: non si mostra mai.
const FALLBACK_DURATION_MIN = 30;

function slotDuration(service: PublicBookingService): number {
  return service.duration && service.duration > 0 ? service.duration : FALLBACK_DURATION_MIN;
}

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}


// ── Icona del servizio, dedotta dal nome ─────────────────────────────
// Tratto sottile, stessa griglia 24x24, così le card restano uniformi.
function ServiceIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  const common = {
    width: 20, height: 20, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.7,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };

  if (/domicil|casa|a domicilio/.test(n)) return (
    <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
  );
  if (/tecar|diatermia/.test(n)) return (
    <svg {...common}><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" /></svg>
  );
  if (/laser/.test(n)) return (
    <svg {...common}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2" /></svg>
  );
  if (/ultrasuon|ecograf/.test(n)) return (
    <svg {...common}><path d="M2 9c3-3 5 3 8 0s5 3 8 0" /><path d="M2 15c3-3 5 3 8 0s5 3 8 0" /></svg>
  );
  if (/noleggio|magneto|apparecch/.test(n)) return (
    <svg {...common}><rect x="3" y="7" width="18" height="11" rx="2" /><path d="M8 7V5h8v2" /></svg>
  );
  if (/prima visita|valutazione|consulen/.test(n)) return (
    <svg {...common}><path d="M6 3v6a4 4 0 0 0 8 0V3" /><path d="M10 13v3a5 5 0 0 0 8 3" /><circle cx="19" cy="17" r="2" /></svg>
  );
  if (/osteopat|manipol/.test(n)) return (
    <svg {...common}><circle cx="12" cy="5" r="2.4" /><path d="M12 7.4V15" /><path d="M8 10h8" /><path d="m9 21 3-6 3 6" /></svg>
  );
  // predefinita: seduta / trattamento
  return (
    <svg {...common}><path d="M4 9v6" /><path d="M8 6v12" /><path d="M16 6v12" /><path d="M20 9v6" /><path d="M8 12h8" /></svg>
  );
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
        `/api/booking/slots?studio_id=${studio.id}&date=${date}&duration=${slotDuration(service)}${locParam}`
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

  // Il tocco seleziona soltanto: si avanza con "Continua", così si può
  // cambiare idea prima di passare al calendario.
  function chooseService(svc: PublicBookingService) {
    setSelectedService(svc);
  }

  function confirmService() {
    if (!selectedService) return;
    setStep("datetime");
    void loadSlotsFor(selectedService, selectedDate, selectedLocation);
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
          service_duration: slotDuration(selectedService),
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
                    display: "flex", alignItems: "center", gap: 14,
                    width: "100%", textAlign: "left", cursor: "pointer",
                    padding: "14px 16px", borderRadius: 12,
                    border: `1px solid ${T.borderSoft}`, background: T.panelBg,
                  }}
                >
                  <span style={{
                    flexShrink: 0, width: 38, height: 38, borderRadius: 10,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: T.panelSoft, color: T.textSoft,
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: 15, color: T.text }}>{loc.name}</span>
                    {loc.address && (
                      <span style={{ display: "block", fontSize: 13, color: T.muted, marginTop: 2 }}>{loc.address}</span>
                    )}
                  </span>
                  <span style={{ flexShrink: 0, color: T.mutedSoft, fontSize: 16 }}>›</span>
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
              <>
                <div style={{
                  fontSize: 11.5, fontWeight: 700, color: T.muted,
                  letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 12,
                }}>
                  Scegli il tipo di visita
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {services.map(svc => {
                    const active = selectedService?.id === svc.id;
                    return (
                      <button
                        key={svc.id}
                        onClick={() => chooseService(svc)}
                        aria-pressed={active}
                        style={{
                          display: "flex", alignItems: "center", gap: 14,
                          width: "100%", textAlign: "left", cursor: "pointer",
                          padding: "14px 16px", borderRadius: 12,
                          border: `1px solid ${active ? T.tealLine : T.borderSoft}`,
                          background: active ? T.tealSoft : T.panelBg,
                          transition: "background 0.15s, border-color 0.15s",
                        }}
                      >
                        <span style={{
                          flexShrink: 0, width: 38, height: 38, borderRadius: 10,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: active ? T.tealIcon : T.panelSoft,
                          color: active ? T.teal : T.textSoft,
                        }}>
                          <ServiceIcon name={svc.name} />
                        </span>

                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            display: "block", fontWeight: 700, fontSize: 15,
                            color: active ? T.teal : T.text,
                          }}>
                            {svc.name}
                          </span>
                          {svc.description && (
                            <span style={{
                              display: "block", fontSize: 13, color: T.muted, marginTop: 2,
                            }}>
                              {svc.description}
                            </span>
                          )}
                          <span style={{
                            display: "block", fontSize: 12, color: T.mutedSoft, marginTop: 3,
                          }}>
                            {svc.duration ? `${svc.duration} min` : ""}
                            {showPrices && `${svc.duration ? " · " : ""}€${svc.price}${svc.price_unit ? ` ${svc.price_unit}` : ""}`}
                          </span>
                        </span>

                        {active && (
                          <span style={{ flexShrink: 0, color: T.teal, fontSize: 18, lineHeight: 1 }}>✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={confirmService}
                  disabled={!selectedService}
                  style={{
                    width: "100%", marginTop: 20, padding: "15px",
                    borderRadius: 12, border: "none",
                    background: T.teal, color: T.white,
                    fontWeight: 700, fontSize: 15, cursor: "pointer",
                    opacity: selectedService ? 1 : 0.45,
                  }}
                >
                  Continua →
                </button>
              </>
            )}
          </Panel>
        )}

        {step === "datetime" && selectedService && (
          <Panel title={`${hasLocations ? 3 : 2}. Scegli data e orario`} onBack={() => setStep("service")}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Servizio</label>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                {selectedService.name}{selectedService.duration ? ` · ${selectedService.duration} min` : ""}
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

      {/* Scorciatoia WhatsApp: per chi preferisce scrivere invece di
          compilare il modulo. Compare solo se lo studio ha un telefono. */}
      {studio.phone && step !== "done" && (
        <div style={{
          borderTop: `1px solid ${T.borderSoft}`, background: T.panelBg,
          padding: "18px 20px 26px",
        }}>
          <div style={{
            maxWidth: 480, margin: "0 auto",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 13.5, color: T.muted }}>
              Preferisci scrivere direttamente?
            </span>
            <a
              href={`https://wa.me/${studio.phone.replace(/[^0-9]/g, "")}`}
              target="_blank" rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "11px 20px", borderRadius: 999,
                background: T.wa, color: T.white, textDecoration: "none",
                fontWeight: 700, fontSize: 14.5,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 4a10 10 0 0 0-15.6 12L3 21l5.2-1.4A10 10 0 1 0 20 4zM8.5 7.6c.2 0 .4 0 .5.4l.8 1.9c.1.2 0 .4-.1.5l-.6.7c-.1.2-.2.3 0 .6a8 8 0 0 0 3.6 3.1c.3.1.4 0 .6-.1l.7-.8c.1-.2.3-.2.5-.1l1.9.9c.2.1.3.3.3.5 0 1-1 1.9-2 1.9-2.8 0-7.3-4.5-7.3-7.3 0-1 .9-2 1.9-2.1z" />
              </svg>
              WhatsApp
            </a>
          </div>
        </div>
      )}
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
  width: "100%", padding: "15px", borderRadius: 12, border: "none",
  background: T.teal, color: T.white, fontWeight: 700, fontSize: 15, cursor: "pointer",
};
