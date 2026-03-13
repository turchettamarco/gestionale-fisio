"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

type Plan = "invoice" | "no_invoice";

/* ─── Theme ───────────────────────────────────────────────────────────── */
const THEME = {
  appBg:     "#f1f5f9",
  panelBg:   "#ffffff",
  panelSoft: "#f7f9fd",
  text:      "#0f172a",
  textSoft:  "#1e293b",
  muted:     "#334155",
  border:    "#cbd5e1",
  blue:      "#2563eb",
  green:     "#16a34a",
  red:       "#dc2626",
  amber:     "#f97316",
  teal:      "#0d9488",
  gradient:  "linear-gradient(135deg, #0d9488, #2563eb)",
};

const BOTTOM_TAB_H = 62;

/* ─── UI primitives ───────────────────────────────────────────────────── */
function inputS(err?: boolean): React.CSSProperties {
  return {
    width: "100%", padding: "11px 13px", borderRadius: 10, outline: "none",
    border: `1.5px solid ${err ? THEME.red : THEME.border}`,
    background: THEME.panelBg, color: THEME.text,
    fontWeight: 500, fontSize: 15,
    fontFamily: "Inter,-apple-system,sans-serif",
    boxSizing: "border-box" as const,
  };
}

function FG({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, color: THEME.muted, marginBottom: 6,
        textTransform: "uppercase", letterSpacing: "0.08em",
        display: "flex", gap: 4, alignItems: "center",
      }}>
        {label}
        {required && <span style={{ color: THEME.red, fontWeight: 900 }}>*</span>}
      </div>
      {children}
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────── */
export default function NewPatientPage() {
  const router = useRouter();

  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState(false);

  /* Campi */
  const [firstName,     setFirstName]     = useState("");
  const [lastName,      setLastName]      = useState("");
  const [phone,         setPhone]         = useState("");
  const [birthDate,     setBirthDate]     = useState("");
  const [preferredPlan, setPreferredPlan] = useState<Plan>("invoice");

  /* Validazione campo per campo */
  const [touched, setTouched] = useState({
    firstName: false, lastName: false, phone: false, birthDate: false,
  });
  const touch = (f: keyof typeof touched) => setTouched(t => ({ ...t, [f]: true }));

  const errs = useMemo(() => ({
    firstName: !firstName.trim(),
    lastName:  !lastName.trim(),
    phone:     !phone.trim(),
    birthDate: false, // opzionale ma richiesto dal desktop — qui facoltativo
  }), [firstName, lastName, phone]);

  /* User / logout */
  const [userEmail,    setUserEmail]    = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data }) => setUserEmail(data?.user?.email ?? null))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [userMenuOpen]);

  const userInitials = useMemo(() => {
    if (!userEmail) return "U";
    const parts = (userEmail.split("@")[0] ?? "U")
      .replace(/[^a-zA-Z0-9]/g, " ").split(" ").filter(Boolean);
    return ((parts[0]?.[0] ?? "U") + (parts[1]?.[0] ?? "")).toUpperCase().slice(0, 2);
  }, [userEmail]);

  async function handleLogout() {
    try { await supabase.auth.signOut(); } finally { window.location.href = "/login"; }
  }

  /* Submit */
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ firstName: true, lastName: true, phone: true, birthDate: true });
    setError("");

    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      setError("Compila i campi obbligatori.");
      return;
    }

    setSaving(true);
    const { error: insErr } = await supabase.from("patients").insert({
      first_name:     firstName.trim(),
      last_name:      lastName.trim(),
      phone:          phone.trim(),
      birth_date:     birthDate.trim() || null,
      preferred_plan: preferredPlan,
    });
    setSaving(false);

    if (insErr) { setError(insErr.message); return; }

    setSuccess(true);
    setTimeout(() => router.push("/mobile/patients"), 800);
  }

  /* ─── RENDER ─────────────────────────────────────────────────────── */
  return (
    <div style={{
      minHeight: "100vh", background: THEME.appBg,
      paddingBottom: BOTTOM_TAB_H + 24,
      fontFamily: "Inter,-apple-system,sans-serif",
    }}>

      {/* ━━━ NAVBAR ━━━ */}
      <header style={{
        position: "sticky", top: 0, zIndex: 30,
        background: THEME.gradient, padding: "0 14px", height: 54,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 2px 12px rgba(13,148,136,0.18)", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <Link href="/mobile/patients" style={{
            width: 30, height: 30, borderRadius: 7, display: "flex",
            alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,0.2)", border: "1.5px solid rgba(255,255,255,0.3)",
            color: "#fff", textDecoration: "none", fontSize: 16, fontWeight: 700,
          }}>‹</Link>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>
            Nuovo paziente
          </div>
        </div>

        {/* Avatar menu */}
        <div ref={userMenuRef} style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => setUserMenuOpen(v => !v)} style={{
            width: 30, height: 30, borderRadius: 7,
            border: "1.5px solid rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.2)", color: "#fff",
            fontWeight: 800, fontSize: 11, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{userInitials}</button>
          {userMenuOpen && (
            <div style={{
              position: "absolute", right: 0, top: "calc(100% + 8px)", width: 190,
              background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
              borderRadius: 12, boxShadow: "0 12px 32px rgba(30,64,175,0.15)",
              overflow: "hidden", zIndex: 60,
            }}>
              <button onClick={handleLogout} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "12px 16px", background: "transparent", border: "none",
                cursor: "pointer", color: THEME.red, fontWeight: 600, fontSize: 13,
              }}>⏻ Logout</button>
            </div>
          )}
        </div>
      </header>

      {/* ━━━ TAB BAR BOTTOM ━━━ */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30,
        background: THEME.panelBg, borderTop: `1.5px solid ${THEME.border}`,
        display: "flex", boxShadow: "0 -4px 16px rgba(15,23,42,0.08)",
        paddingBottom: "env(safe-area-inset-bottom,0px)",
      }}>
        {[
          { href: "/mobile",          label: "Home",      icon: "⌂" },
          { href: "/mobile/calendar", label: "Calendario", icon: "▦" },
          { href: "/mobile/patients", label: "Pazienti",  icon: "◉", active: true },
          { href: "/mobile/reports",  label: "Report",    icon: "◈" },
        ].map(item => (
          <Link key={item.href} href={item.href} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "10px 4px 9px", textDecoration: "none", gap: 3, position: "relative",
          }}>
            <span style={{
              fontSize: 18, lineHeight: 1,
              ...(item.active
                ? { background: THEME.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }
                : { color: THEME.muted }),
            }}>{item.icon}</span>
            <span style={{
              fontSize: 10, fontWeight: item.active ? 700 : 600,
              color: item.active ? THEME.blue : THEME.muted,
            }}>{item.label}</span>
            {item.active && (
              <div style={{
                position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                width: 28, height: 2.5, borderRadius: 999, background: THEME.gradient,
              }} />
            )}
          </Link>
        ))}
      </nav>

      {/* ━━━ FORM ━━━ */}
      <div style={{ padding: "16px 14px 0" }}>

        {/* Errore */}
        {error && (
          <div style={{
            padding: "10px 13px", borderRadius: 10, marginBottom: 14,
            background: "rgba(220,38,38,0.06)", border: "1.5px solid rgba(220,38,38,0.25)",
            color: "#7f1d1d", fontWeight: 600, fontSize: 13,
          }}>⚠️ {error}</div>
        )}

        {/* Successo */}
        {success && (
          <div style={{
            padding: "12px 16px", borderRadius: 12, marginBottom: 14,
            background: "rgba(22,163,74,0.08)", border: "1.5px solid rgba(22,163,74,0.3)",
            color: THEME.green, fontWeight: 700, fontSize: 14, textAlign: "center",
          }}>✅ Paziente creato! Reindirizzo…</div>
        )}

        <form onSubmit={onSubmit}>
          <div style={{
            background: THEME.panelBg, border: `1.5px solid ${THEME.border}`,
            borderRadius: 14, padding: 16,
            boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
            display: "flex", flexDirection: "column", gap: 14,
          }}>

            {/* Nome + Cognome affiancati */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <FG label="Nome" required>
                <input
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  onBlur={() => touch("firstName")}
                  placeholder="Mario"
                  autoComplete="given-name"
                  style={inputS(touched.firstName && errs.firstName)}
                />
              </FG>
              <FG label="Cognome" required>
                <input
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  onBlur={() => touch("lastName")}
                  placeholder="Rossi"
                  autoComplete="family-name"
                  style={inputS(touched.lastName && errs.lastName)}
                />
              </FG>
            </div>

            <FG label="Telefono" required>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onBlur={() => touch("phone")}
                placeholder="+39 320 …"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                style={inputS(touched.phone && errs.phone)}
              />
            </FG>

            <FG label="Data di nascita">
              <input
                value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
                type="date"
                style={inputS()}
              />
            </FG>

            <FG label="Tipo fatturazione">
              <select
                value={preferredPlan}
                onChange={e => setPreferredPlan(e.target.value as Plan)}
                style={inputS()}
              >
                <option value="invoice">Fattura</option>
                <option value="no_invoice">Non fattura</option>
              </select>
            </FG>

          </div>

          {/* Bottoni */}
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="submit"
              disabled={saving || success}
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 12, border: "none",
                background: THEME.gradient, color: "#fff",
                fontWeight: 800, fontSize: 15, cursor: saving ? "not-allowed" : "pointer",
                opacity: saving || success ? 0.6 : 1,
                boxShadow: "0 2px 12px rgba(13,148,136,0.3)",
                fontFamily: "Inter,-apple-system,sans-serif",
              }}
            >
              {saving ? "Salvataggio…" : "✓ Registra paziente"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/mobile/patients")}
              disabled={saving}
              style={{
                width: "100%", padding: "13px 16px", borderRadius: 12,
                border: `1.5px solid ${THEME.border}`,
                background: THEME.panelSoft, color: THEME.muted,
                fontWeight: 700, fontSize: 14, cursor: "pointer",
                fontFamily: "Inter,-apple-system,sans-serif",
              }}
            >
              Annulla
            </button>
          </div>
        </form>

        {/* Nota campi obbligatori */}
        <div style={{ marginTop: 12, fontSize: 11, color: THEME.muted, textAlign: "center" }}>
          I campi con <span style={{ color: THEME.red }}>*</span> sono obbligatori
        </div>

      </div>
    </div>
  );
}
