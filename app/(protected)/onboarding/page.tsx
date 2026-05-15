"use client";

// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/onboarding/page.tsx
// ═══════════════════════════════════════════════════════════════════════
//
// Wizard di onboarding per nuovi studi. 5 step:
//  1. Info studio (nome, indirizzo, telefono)
//  2. Firma messaggi (nome professionista, titolo)
//  3. Tariffe trattamenti
//  4. Template messaggi WhatsApp
//  5. Tutto pronto + CTA
//
// Si attiva automaticamente al primo login se studios.onboarded_at è NULL.
// L'utente può saltare gli step (tranne nome studio).
// Al completamento, marca studios.onboarded_at = now().
//
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";

const T = {
  pageBg: "#fafafa",
  panelBg: "#ffffff",
  panelSoft: "#f5f5f7",
  text: "#0a0a0a",
  textSoft: "#1d1d1f",
  muted: "#6e6e73",
  mutedLight: "#86868b",
  border: "#d2d2d7",
  borderSoft: "#e8e8ed",
  accent: "#0d9488",
  accentDark: "#0f766e",
  blue: "#2563eb",
  green: "#16a34a",
  amber: "#f97316",
  red: "#dc2626",
};

type StepKey = "studio" | "hours" | "signature" | "rates" | "templates" | "done";

const STEPS: { key: StepKey; label: string; required?: boolean }[] = [
  { key: "studio", label: "Studio", required: true },
  { key: "hours", label: "Orari" },
  { key: "signature", label: "Firma" },
  { key: "rates", label: "Tariffe" },
  { key: "templates", label: "Messaggi" },
  { key: "done", label: "Fine" },
];

// ─── Tipo per gli orari di apertura ────────────────────────────────────
type HourRow = {
  day_of_week: number;     // 0=Dom, 1=Lun, ..., 6=Sab
  open_time: string;       // "HH:MM"
  close_time: string;      // "HH:MM"
  is_open: boolean;
};

// Default: lun-sab aperto 9-19, domenica chiusa
function defaultHours(): HourRow[] {
  return Array.from({ length: 7 }, (_, d) => ({
    day_of_week: d,
    open_time: "09:00",
    close_time: "19:00",
    is_open: d !== 0, // domenica chiusa
  }));
}

const DAY_LABELS: Record<number, string> = {
  1: "Lunedì",
  2: "Martedì",
  3: "Mercoledì",
  4: "Giovedì",
  5: "Venerdì",
  6: "Sabato",
  0: "Domenica",
};
// Ordine display: lun → dom (NON 0..6)
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function OnboardingPage() {
  const router = useRouter();
  const { studio, refresh: refreshStudio } = useCurrentStudio();
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  // ─── Step 1: Studio ────────────────────────────────────────────────
  const [studioName, setStudioName] = useState("");
  const [studioAddress, setStudioAddress] = useState("");
  const [studioPhone, setStudioPhone] = useState("");
  const [studioEmail, setStudioEmail] = useState("");

  // ─── Step 2: Orari di apertura ─────────────────────────────────────
  const [hours, setHours] = useState<HourRow[]>(defaultHours);

  // ─── Step 3: Firma ─────────────────────────────────────────────────
  const [signatureName, setSignatureName] = useState("");
  const [signatureTitle, setSignatureTitle] = useState("Dott.");

  // ─── Step 3: Tariffe ───────────────────────────────────────────────
  const [rateSeduta, setRateSeduta] = useState("40");
  const [rateMacchinario, setRateMacchinario] = useState("25");
  const [rateLaser, setRateLaser] = useState("30");
  const [rateTecar, setRateTecar] = useState("30");

  // ─── Step 4: Template messaggi ─────────────────────────────────────
  const [reminderTpl, setReminderTpl] = useState("");
  const [confirmTpl, setConfirmTpl] = useState("");

  // Default templates dinamici quando arriva la firma
  const defaultReminder = useMemo(() =>
    `{saluto} {nome},\n\nLe ricordiamo il suo appuntamento di {data_relativa} alle ore {ora}.\n\n📍 {luogo}\n\nCordiali saluti${signatureName ? `,\n${signatureName}${signatureTitle ? ` (${signatureTitle})` : ""}` : ""}`,
    [signatureName, signatureTitle]
  );
  const defaultConfirm = useMemo(() =>
    `Grazie per averci scelto.\nRicordiamo il prossimo appuntamento fissato per {data_relativa} alle {ora}.\n\nA presto${signatureName ? `,\n${signatureName}${signatureTitle ? ` (${signatureTitle})` : ""}` : ""}`,
    [signatureName, signatureTitle]
  );

  // Carica dati iniziali dallo studio
  useEffect(() => {
    if (!studio) return;
    setStudioName(studio.name || "");
    setStudioAddress(studio.address || "");
    setStudioPhone(studio.phone || "");
    setStudioEmail((studio as any).email || "");
    setSignatureName(studio.signature_name || "");
    setSignatureTitle(studio.signature_title || "Dott.");
  }, [studio]);

  // Carica orari esistenti (se ci sono già stati impostati prima)
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("working_hours")
        .select("day_of_week, open_time, close_time, is_open")
        .order("day_of_week");
      if (!alive) return;
      if (data && data.length > 0) {
        // Se ci sono già orari salvati, li carico
        type WHRow = { day_of_week: number; open_time: string | null; close_time: string | null; is_open: boolean | null };
        const map = new Map<number, WHRow>(
          (data as WHRow[]).map(r => [r.day_of_week, r])
        );
        setHours(prev => prev.map(h => {
          const r = map.get(h.day_of_week);
          return r
            ? {
                day_of_week: h.day_of_week,
                open_time: (r.open_time || "09:00").slice(0, 5),
                close_time: (r.close_time || "19:00").slice(0, 5),
                is_open: r.is_open ?? true,
              }
            : h;
        }));
      }
    })();
    return () => { alive = false; };
  }, []);

  const currentStep = STEPS[stepIndex];

  // Salvataggio per step
  async function saveCurrentAndNext() {
    if (!studio) return;
    setSaving(true);

    try {
      if (currentStep.key === "studio") {
        if (!studioName.trim()) {
          alert("Inserisci il nome dello studio");
          setSaving(false);
          return;
        }
        await supabase.from("studios").update({
          name: studioName.trim(),
          address: studioAddress.trim() || null,
          phone: studioPhone.trim() || null,
          email: studioEmail.trim() || null,
        } as any).eq("id", studio.id);
        await refreshStudio();
      }

      if (currentStep.key === "hours") {
        // Validazione: per i giorni aperti, close_time deve essere > open_time
        for (const h of hours) {
          if (h.is_open && h.open_time >= h.close_time) {
            alert(`${DAY_LABELS[h.day_of_week]}: l'orario di chiusura deve essere dopo l'apertura.`);
            setSaving(false);
            return;
          }
        }
        const { error: whErr } = await supabase
          .from("working_hours")
          .upsert(
            hours.map(h => ({
              day_of_week: h.day_of_week,
              open_time: h.open_time,
              close_time: h.close_time,
              is_open: h.is_open,
            })),
            { onConflict: "day_of_week" }
          );
        if (whErr) {
          console.error("[onboarding] errore working_hours:", whErr);
          alert("Errore nel salvataggio orari. Riprova.");
          setSaving(false);
          return;
        }
      }

      if (currentStep.key === "signature") {
        await supabase.from("studios").update({
          signature_name: signatureName.trim() || null,
          signature_title: signatureTitle.trim() || null,
        }).eq("id", studio.id);
        await refreshStudio();
      }

      if (currentStep.key === "rates") {
        // Salva su practice_settings (sempre legato all'utente corrente).
        // FIX: rimossa la SELECT senza filtro che poteva restituire il record
        // di un altro utente quando le RLS lo permettevano, causando upsert
        // sull'owner_id sbagliato e leak dei dati tra studi diversi.
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (userId) {
          await supabase.from("practice_settings").upsert({
            owner_id: userId,
            studio_id: studio.id,
            standard_invoice: Number(rateSeduta) || 40,
            standard_cash: Number(rateSeduta) || 40,
            machine_invoice: Number(rateMacchinario) || 25,
            machine_cash: Number(rateMacchinario) || 25,
            laser_invoice: Number(rateLaser) || 30,
            laser_cash: Number(rateLaser) || 30,
            tecar_invoice: Number(rateTecar) || 30,
            tecar_cash: Number(rateTecar) || 30,
          }, { onConflict: "owner_id" });
        }
      }

      if (currentStep.key === "templates") {
        const finalReminder = reminderTpl.trim() || defaultReminder;
        const finalConfirm = confirmTpl.trim() || defaultConfirm;
        // Upsert nei message_templates
        await supabase.from("message_templates").upsert(
          [
            { name: "Promemoria", template: finalReminder, studio_id: studio.id },
            { name: "Appuntamento", template: finalConfirm, studio_id: studio.id },
          ],
          { onConflict: "name" }
        );
      }

      // Avanza
      setStepIndex(i => i + 1);
    } catch (e) {
      console.error("[onboarding] errore salvataggio:", e);
      alert("Errore di salvataggio. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  function skipStep() {
    if (currentStep.required) {
      alert("Questo step è obbligatorio");
      return;
    }
    setStepIndex(i => i + 1);
  }

  async function finishOnboarding() {
    if (!studio) return;
    setSaving(true);
    try {
      await supabase.from("studios").update({
        onboarded_at: new Date().toISOString(),
      }).eq("id", studio.id);
      router.push("/");
    } catch (e) {
      console.error("[onboarding] errore finalizzazione:", e);
      alert("Errore. Riprova.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: T.pageBg, minHeight: "100vh" }}>
      {/* Header brand semplice */}
      <header style={{
        background: "linear-gradient(135deg,#0d9488,#2563eb)",
        padding: "14px 24px",
        color: "#fff",
        fontWeight: 800,
        fontSize: 16,
        letterSpacing: 0.5,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        {/* Logo FisioHub mark accanto al wordmark testuale */}
        <img
          src="/logo-mark.svg"
          alt="FisioHub"
          width={30}
          height={30}
          style={{ display: "block", flexShrink: 0 }}
        />
        <span>
          Fisio<span style={{ fontWeight: 900 }}>Hub</span>
        </span>
      </header>

      <main style={{ padding: "32px 16px 64px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>

          {/* Progress steps */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 32,
            flexWrap: "wrap",
          }}>
            {STEPS.map((s, i) => {
              const done = i < stepIndex;
              const active = i === stepIndex;
              return (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: done ? T.green : active ? T.accent : T.borderSoft,
                    color: done || active ? "#fff" : T.muted,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700,
                    transition: "background 0.2s",
                  }}>
                    {done ? "✓" : i + 1}
                  </div>
                  <span style={{
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    color: active ? T.text : T.muted,
                    marginRight: 4,
                  }}>{s.label}</span>
                  {i < STEPS.length - 1 && (
                    <div style={{ width: 16, height: 1, background: T.borderSoft, marginRight: 4 }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Card contenuto step */}
          <div style={{
            background: T.panelBg,
            border: `1px solid ${T.borderSoft}`,
            borderRadius: 14,
            padding: 32,
          }}>
            {currentStep.key === "studio" && (
              <StepStudio
                name={studioName} setName={setStudioName}
                address={studioAddress} setAddress={setStudioAddress}
                phone={studioPhone} setPhone={setStudioPhone}
                email={studioEmail} setEmail={setStudioEmail}
              />
            )}
            {currentStep.key === "hours" && (
              <StepHours hours={hours} setHours={setHours} />
            )}
            {currentStep.key === "signature" && (
              <StepSignature
                name={signatureName} setName={setSignatureName}
                title={signatureTitle} setTitle={setSignatureTitle}
              />
            )}
            {currentStep.key === "rates" && (
              <StepRates
                seduta={rateSeduta} setSeduta={setRateSeduta}
                macchinario={rateMacchinario} setMacchinario={setRateMacchinario}
                laser={rateLaser} setLaser={setRateLaser}
                tecar={rateTecar} setTecar={setRateTecar}
              />
            )}
            {currentStep.key === "templates" && (
              <StepTemplates
                reminderTpl={reminderTpl} setReminderTpl={setReminderTpl}
                confirmTpl={confirmTpl} setConfirmTpl={setConfirmTpl}
                defaultReminder={defaultReminder}
                defaultConfirm={defaultConfirm}
              />
            )}
            {currentStep.key === "done" && (
              <StepDone studioName={studioName} />
            )}
          </div>

          {/* Bottoni azione */}
          <div style={{
            marginTop: 24,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}>
            {stepIndex > 0 && currentStep.key !== "done" ? (
              <button
                onClick={() => setStepIndex(i => Math.max(0, i - 1))}
                disabled={saving}
                style={{
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: "#fff",
                  color: T.text,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >← Indietro</button>
            ) : <div />}

            <div style={{ display: "flex", gap: 10 }}>
              {!currentStep.required && currentStep.key !== "done" && (
                <button
                  onClick={skipStep}
                  disabled={saving}
                  style={{
                    padding: "12px 20px",
                    borderRadius: 8,
                    border: `1px solid ${T.border}`,
                    background: T.panelSoft,
                    color: T.muted,
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >Salta</button>
              )}

              {currentStep.key === "done" ? (
                <button
                  onClick={finishOnboarding}
                  disabled={saving}
                  style={{
                    padding: "13px 28px",
                    borderRadius: 8,
                    border: "none",
                    background: T.green,
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: saving ? "default" : "pointer",
                    opacity: saving ? 0.6 : 1,
                  }}
                >{saving ? "Attendi..." : "Vai al gestionale →"}</button>
              ) : (
                <button
                  onClick={saveCurrentAndNext}
                  disabled={saving}
                  style={{
                    padding: "13px 28px",
                    borderRadius: 8,
                    border: "none",
                    background: T.accent,
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: saving ? "default" : "pointer",
                    opacity: saving ? 0.6 : 1,
                  }}
                >{saving ? "Salvataggio..." : "Continua →"}</button>
              )}
            </div>
          </div>

          {/* Help text */}
          <p style={{
            marginTop: 24,
            fontSize: 12,
            color: T.mutedLight,
            textAlign: "center",
          }}>
            Potrai modificare tutto in qualsiasi momento dalle Impostazioni.
          </p>
        </div>
      </main>
    </div>
  );
}

/* ─── Step components ──────────────────────────────────────────────── */

function StepStudio(p: {
  name: string; setName: (s: string) => void;
  address: string; setAddress: (s: string) => void;
  phone: string; setPhone: (s: string) => void;
  email: string; setEmail: (s: string) => void;
}) {
  return (
    <>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: -0.3 }}>
        Iniziamo dal tuo studio
      </h1>
      <p style={{ margin: "8px 0 24px", fontSize: 14, color: T.muted, lineHeight: 1.5 }}>
        Questi dati appariranno nei messaggi WhatsApp e nelle pagine pubbliche di prenotazione.
      </p>

      <Field label="Nome studio *" hint="Es. Studio Fisioterapico Rossi">
        <input
          value={p.name}
          onChange={e => p.setName(e.target.value)}
          placeholder="Il nome del tuo studio"
          style={inp}
          autoFocus
        />
      </Field>

      <Field label="Indirizzo" hint="Verrà mostrato nei promemoria di appuntamento">
        <input
          value={p.address}
          onChange={e => p.setAddress(e.target.value)}
          placeholder="Es. Via Roma 12, Pontecorvo (FR)"
          style={inp}
        />
      </Field>

      <Field label="Telefono studio" hint="Per contatti dei pazienti">
        <input
          value={p.phone}
          onChange={e => p.setPhone(e.target.value)}
          placeholder="Es. 0776 123456"
          style={inp}
        />
      </Field>

      <Field label="Email studio" hint="Visibile nelle pagine pubbliche di prenotazione">
        <input
          type="email"
          value={p.email}
          onChange={e => p.setEmail(e.target.value)}
          placeholder="Es. info@tuostudio.it"
          style={inp}
        />
      </Field>
    </>
  );
}

// ─── Step Orari di apertura ────────────────────────────────────────────
function StepHours(p: {
  hours: HourRow[];
  setHours: Dispatch<SetStateAction<HourRow[]>>;
}) {
  function update(day: number, patch: Partial<HourRow>) {
    p.setHours(prev => prev.map(h => h.day_of_week === day ? { ...h, ...patch } : h));
  }

  function copyToAllOpenDays(from: number) {
    const src = p.hours.find(h => h.day_of_week === from);
    if (!src) return;
    p.setHours(prev => prev.map(h =>
      h.is_open && h.day_of_week !== from
        ? { ...h, open_time: src.open_time, close_time: src.close_time }
        : h
    ));
  }

  return (
    <>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: -0.3 }}>
        Quando lavori?
      </h1>
      <p style={{ margin: "8px 0 24px", fontSize: 14, color: T.muted, lineHeight: 1.5 }}>
        Questi orari servono per le prenotazioni online: i pazienti vedranno solo
        gli slot liberi nei giorni di apertura. Puoi modificarli in qualsiasi
        momento dalle Impostazioni.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {DAY_ORDER.map((d) => {
          const h = p.hours.find(x => x.day_of_week === d);
          if (!h) return null;
          return (
            <div
              key={d}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(95px, 110px) auto 1fr 1fr",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: h.is_open ? T.panelSoft : "#fafafa",
                border: `1px solid ${h.is_open ? T.borderSoft : T.borderSoft}`,
                borderRadius: 10,
                opacity: h.is_open ? 1 : 0.65,
              }}
            >
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: T.text,
              }}>
                {DAY_LABELS[d]}
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: T.muted }}>
                <input
                  type="checkbox"
                  checked={h.is_open}
                  onChange={e => update(d, { is_open: e.target.checked })}
                  style={{ width: 16, height: 16, accentColor: T.accent, cursor: "pointer" }}
                />
                <span>{h.is_open ? "Aperto" : "Chiuso"}</span>
              </label>

              <input
                type="time"
                value={h.open_time}
                disabled={!h.is_open}
                onChange={e => update(d, { open_time: e.target.value })}
                style={{ ...inp, padding: "8px 10px", fontSize: 13 }}
              />
              <input
                type="time"
                value={h.close_time}
                disabled={!h.is_open}
                onChange={e => update(d, { close_time: e.target.value })}
                style={{ ...inp, padding: "8px 10px", fontSize: 13 }}
              />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => copyToAllOpenDays(1)}
        style={{
          marginTop: 14,
          padding: "9px 14px",
          borderRadius: 8,
          border: `1px solid ${T.borderSoft}`,
          background: "#fff",
          color: T.muted,
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Copia orari del lunedì agli altri giorni aperti
      </button>
    </>
  );
}

function StepSignature(p: {
  name: string; setName: (s: string) => void;
  title: string; setTitle: (s: string) => void;
}) {
  return (
    <>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: -0.3 }}>
        La tua firma nei messaggi
      </h1>
      <p style={{ margin: "8px 0 24px", fontSize: 14, color: T.muted, lineHeight: 1.5 }}>
        Ogni messaggio WhatsApp di promemoria verrà firmato così.
      </p>

      <Field label="Nome professionista">
        <input
          value={p.name}
          onChange={e => p.setName(e.target.value)}
          placeholder="Es. Marco Turchetta"
          style={inp}
        />
      </Field>

      <Field label="Titolo">
        <select
          value={p.title}
          onChange={e => p.setTitle(e.target.value)}
          style={inp}
        >
          <option value="Dott.">Dott.</option>
          <option value="Dr.">Dr.</option>
          <option value="Dr.ssa">Dr.ssa</option>
          <option value="Dott.ssa">Dott.ssa</option>
          <option value="Prof.">Prof.</option>
          <option value="">Nessuno</option>
        </select>
      </Field>

      {p.name && (
        <div style={{
          marginTop: 18,
          padding: 14,
          background: T.panelSoft,
          borderRadius: 10,
          fontSize: 13,
          color: T.muted,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.mutedLight, textTransform: "uppercase", marginBottom: 4 }}>
            Anteprima firma
          </div>
          Cordiali saluti,<br />
          {p.name}{p.title ? ` (${p.title})` : ""}
        </div>
      )}
    </>
  );
}

function StepRates(p: {
  seduta: string; setSeduta: (s: string) => void;
  macchinario: string; setMacchinario: (s: string) => void;
  laser: string; setLaser: (s: string) => void;
  tecar: string; setTecar: (s: string) => void;
}) {
  return (
    <>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: -0.3 }}>
        Le tue tariffe
      </h1>
      <p style={{ margin: "8px 0 24px", fontSize: 14, color: T.muted, lineHeight: 1.5 }}>
        Verranno applicate automaticamente quando crei un appuntamento. Puoi sempre modificarle al volo.
      </p>

      <RateField label="Seduta standard" value={p.seduta} onChange={p.setSeduta} />
      <RateField label="Macchinario" value={p.macchinario} onChange={p.setMacchinario} />
      <RateField label="Laser" value={p.laser} onChange={p.setLaser} />
      <RateField label="Tecar" value={p.tecar} onChange={p.setTecar} />
    </>
  );
}

function StepTemplates(p: {
  reminderTpl: string; setReminderTpl: (s: string) => void;
  confirmTpl: string; setConfirmTpl: (s: string) => void;
  defaultReminder: string;
  defaultConfirm: string;
}) {
  return (
    <>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: -0.3 }}>
        Messaggi WhatsApp
      </h1>
      <p style={{ margin: "8px 0 18px", fontSize: 14, color: T.muted, lineHeight: 1.5 }}>
        Personalizza i messaggi inviati ai pazienti. Lascia vuoto per usare il template di default.
      </p>

      <div style={{
        marginBottom: 16,
        padding: 12,
        background: "rgba(13,148,136,0.06)",
        borderRadius: 8,
        fontSize: 12,
        color: T.muted,
        lineHeight: 1.5,
      }}>
        <strong style={{ color: T.accent }}>Variabili disponibili:</strong>{" "}
        <code>{`{nome}`}</code> · <code>{`{data_relativa}`}</code> · <code>{`{ora}`}</code> · <code>{`{luogo}`}</code> · <code>{`{saluto}`}</code> · <code>{`{firma}`}</code>
      </div>

      <Field label="Promemoria appuntamento" hint="Inviato come ricordo prima dell'appuntamento">
        <textarea
          value={p.reminderTpl}
          onChange={e => p.setReminderTpl(e.target.value)}
          placeholder={p.defaultReminder}
          style={{ ...inp, minHeight: 100, fontFamily: "inherit", resize: "vertical" }}
        />
      </Field>

      <Field label="Conferma appuntamento" hint="Inviato subito dopo aver creato un appuntamento">
        <textarea
          value={p.confirmTpl}
          onChange={e => p.setConfirmTpl(e.target.value)}
          placeholder={p.defaultConfirm}
          style={{ ...inp, minHeight: 90, fontFamily: "inherit", resize: "vertical" }}
        />
      </Field>
    </>
  );
}

function StepDone(p: { studioName: string }) {
  return (
    <div style={{ textAlign: "center", padding: "16px 0" }}>
      <div style={{
        width: 64, height: 64, borderRadius: "50%",
        background: "linear-gradient(135deg, #0d9488, #2563eb)",
        margin: "0 auto 18px",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontSize: 32,
      }}>✓</div>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: T.text, letterSpacing: -0.3 }}>
        Tutto pronto!
      </h1>
      <p style={{ margin: "10px 0 24px", fontSize: 15, color: T.muted, lineHeight: 1.5, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
        <strong style={{ color: T.text }}>{p.studioName}</strong> è configurato.
        Da ora puoi creare il tuo primo paziente, fissare appuntamenti, e mandare promemoria con un click.
      </p>

      <div style={{
        marginTop: 24,
        padding: 18,
        background: T.panelSoft,
        borderRadius: 10,
        textAlign: "left",
        fontSize: 13,
        color: T.muted,
        lineHeight: 1.7,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Suggerimenti per iniziare
        </div>
        • Crea il tuo primo paziente dalla scheda Pazienti<br />
        • Fissa un appuntamento dal Calendario<br />
        • Personalizza altre impostazioni in Impostazioni
      </div>
    </div>
  );
}

/* ─── UI helpers ───────────────────────────────────────────────────── */

function Field(p: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{
        display: "block",
        fontSize: 13,
        fontWeight: 600,
        color: T.text,
        marginBottom: 6,
      }}>{p.label}</label>
      {p.children}
      {p.hint && (
        <div style={{ fontSize: 12, color: T.mutedLight, marginTop: 4 }}>{p.hint}</div>
      )}
    </div>
  );
}

function RateField(p: { label: string; value: string; onChange: (s: string) => void }) {
  return (
    <Field label={p.label}>
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          color: T.muted, fontWeight: 600, fontSize: 14,
        }}>€</span>
        <input
          type="number"
          inputMode="decimal"
          value={p.value}
          onChange={e => p.onChange(e.target.value)}
          style={{ ...inp, paddingLeft: 28 }}
        />
      </div>
    </Field>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  borderRadius: 8,
  border: `1.5px solid ${T.border}`,
  background: "#fff",
  fontSize: 14,
  color: T.text,
  outline: "none",
  boxSizing: "border-box",
};
