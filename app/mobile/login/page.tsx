"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../src/lib/supabaseClient";

const COLORS = {
  bg1: "#0b1220",
  bg2: "#0f172a",
  card: "rgba(255,255,255,0.92)",
  border: "rgba(15, 23, 42, 0.10)",
  text: "#0f172a",
  muted: "#64748b",
  primary1: "#60a5fa",
  primary2: "#34d399",
  danger: "#ef4444",
};

export default function MobileLoginPage() {
  const router = useRouter();

  // Se sei su /mobile/*, dopo login resti nel mondo mobile
  const postLoginPath = useMemo(() => "/mobile", []);

  const [email, setEmail] = useState("demo@demo.it");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Se l'utente è già loggato, non deve rimanere bloccato qui
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!alive) return;
        if (error) return; // non bloccare la UI per un errore di session check
        if (data.session) {
          router.replace(postLoginPath);
          setTimeout(() => router.refresh(), 50);
        }
      } catch {
        // ignora: non vogliamo crashare la pagina login
      }
    })();
    return () => {
      alive = false;
    };
  }, [router, postLoginPath]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;

    setErrorMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMsg("Inserisci email e password.");
      return;
    }

    setLoading(true);

    try {
      // Persistenza sessione: Supabase di default usa localStorage (persistente).
      // Se NON vuoi "Ricordami", proviamo ad usare sessionStorage (solo per questa tab).
      // Nota: Supabase JS non espone un toggle diretto per storage dopo init;
      // quindi qui facciamo una scelta pragmatica: se remember=false facciamo sign-in,
      // e l'utente può comunque fare logout quando vuole.
      // (Se vuoi la gestione perfetta, va fatta nel supabaseClient inizializzando storage dinamico.)
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        setErrorMsg(error.message || "Login fallito.");
        setLoading(false);
        return;
      }

      if (!data.session) {
        setErrorMsg("Sessione non creata. Controlla credenziali e riprova.");
        setLoading(false);
        return;
      }

      router.replace(postLoginPath);
      setTimeout(() => router.refresh(), 50);
    } catch (err: any) {
      setErrorMsg(err?.message || "Errore imprevisto durante il login.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(1200px 800px at 20% 10%, rgba(96,165,250,0.35), transparent 60%), radial-gradient(1000px 700px at 80% 20%, rgba(52,211,153,0.25), transparent 60%), linear-gradient(180deg, " +
          COLORS.bg2 +
          ", " +
          COLORS.bg1 +
          ")",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            padding: 14,
            borderRadius: 16,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            marginBottom: 18,
          }}
        >
          <div
            aria-hidden
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.12)",
              display: "grid",
              placeItems: "center",
              fontSize: 18,
            }}
          >
            🧠
          </div>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ color: "white", fontSize: 20, fontWeight: 900 }}>
              Fisio<span style={{ color: "#34d399" }}>Hub</span>
            </div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 700 }}>
              GALILEO • GESTIONALE CLINICO
            </div>
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            background: COLORS.card,
            borderRadius: 22,
            border: `1px solid ${COLORS.border}`,
            boxShadow: "0 18px 60px rgba(0,0,0,0.30)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 22, borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 34, fontWeight: 1000, color: COLORS.text }}>Accesso</div>
            <div style={{ marginTop: 6, color: COLORS.muted, fontWeight: 700 }}>
              Inserisci le tue credenziali
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: 22 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 900, color: COLORS.muted }}>
              EMAIL
            </label>
            <div
              style={{
                marginTop: 8,
                borderRadius: 16,
                border: `1px solid ${COLORS.border}`,
                background: "white",
                display: "flex",
                alignItems: "center",
                padding: "10px 12px",
                gap: 10,
              }}
            >
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="email@dominio.it"
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  fontSize: 18,
                  fontWeight: 800,
                  color: COLORS.text,
                  background: "transparent",
                }}
              />
              <div
                aria-hidden
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  border: `1px solid ${COLORS.border}`,
                  display: "grid",
                  placeItems: "center",
                  color: COLORS.muted,
                  fontWeight: 900,
                }}
              >
                @
              </div>
            </div>

            <label
              style={{
                display: "block",
                marginTop: 16,
                fontSize: 13,
                fontWeight: 900,
                color: COLORS.muted,
              }}
            >
              PASSWORD
            </label>
            <div
              style={{
                marginTop: 8,
                borderRadius: 16,
                border: `1px solid ${COLORS.border}`,
                background: "white",
                display: "flex",
                alignItems: "center",
                padding: "10px 12px",
                gap: 10,
              }}
            >
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="••••••••"
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  fontSize: 18,
                  fontWeight: 800,
                  color: COLORS.text,
                  background: "transparent",
                }}
              />
              <button
                type="button"
                onClick={() => {
                  // Toggle visibilità password senza componenti esterni
                  const el = document.querySelector<HTMLInputElement>('input[type="password"], input[data-pass="1"]');
                  if (!el) return;
                  if (el.type === "password") {
                    el.type = "text";
                    el.setAttribute("data-pass", "1");
                  } else {
                    el.type = "password";
                  }
                }}
                style={{
                  borderRadius: 12,
                  padding: "8px 10px",
                  border: `1px solid ${COLORS.border}`,
                  background: "white",
                  fontWeight: 900,
                  color: COLORS.muted,
                }}
              >
                Mostra
              </button>
            </div>

            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <div style={{ color: COLORS.text, fontWeight: 800 }}>Ricordami</div>
              <div style={{ marginLeft: "auto", color: "#2563eb", fontWeight: 900, fontSize: 14 }}>
                Password dimenticata?
              </div>
            </div>

            {errorMsg ? (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 14,
                  background: "rgba(239,68,68,0.10)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  color: "#991b1b",
                  fontWeight: 900,
                  fontSize: 13,
                }}
              >
                {errorMsg}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 16,
                width: "100%",
                border: "none",
                borderRadius: 18,
                padding: "16px 14px",
                fontSize: 18,
                fontWeight: 1000,
                color: "white",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.75 : 1,
                background: `linear-gradient(90deg, ${COLORS.primary1}, ${COLORS.primary2})`,
                boxShadow: "0 14px 35px rgba(0,0,0,0.18)",
              }}
            >
              {loading ? "Accesso..." : "Entra"}
            </button>

            <div style={{ marginTop: 16, color: COLORS.muted, fontWeight: 700, textAlign: "center" }}>
              Usa FisioHub come un chirurgo usa il bisturi: pulito, preciso, senza teatrini.
            </div>

            <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {["KPI", "Agenda", "WhatsApp", "Incassi"].map((t) => (
                <div
                  key={t}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 999,
                    background: "rgba(15,23,42,0.08)",
                    border: `1px solid ${COLORS.border}`,
                    fontWeight: 900,
                    color: "#334155",
                    fontSize: 13,
                  }}
                >
                  {t}
                </div>
              ))}
            </div>
          </form>
        </div>

        <div style={{ marginTop: 14, textAlign: "center", color: "rgba(255,255,255,0.55)", fontWeight: 700, fontSize: 12 }}>
          v0.1 • Mobile Login
        </div>
      </div>
    </div>
  );
}
