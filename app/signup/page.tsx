"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";

export default function SignupPage() {
  return (
    <Suspense fallback={<div />}>
      <SignupInner />
    </Suspense>
  );
}

function SignupInner() {
  const router = useRouter();
  const params = useSearchParams();
  const inviteFromUrl = params.get("invite") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [studioName, setStudioName] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [inviteCode, setInviteCode] = useState(inviteFromUrl.toUpperCase());

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);

  // Se già loggato, vai alla home
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session) {
        router.replace("/");
      }
    });
    return () => { alive = false; };
  }, [router]);

  const canSubmit = useMemo(() => {
    return (
      email.trim().length > 3 &&
      password.length >= 6 &&
      studioName.trim().length >= 2 &&
      operatorName.trim().length >= 2 &&
      inviteCode.trim().length >= 4 &&
      !loading
    );
  }, [email, password, studioName, operatorName, inviteCode, loading]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    try {
      // 1. Chiama API signup
      const r = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          studio_name: studioName.trim(),
          operator_name: operatorName.trim(),
          invite_code: inviteCode.trim().toUpperCase(),
        }),
      });

      const j = await r.json();

      if (!r.ok) {
        setErr(j.error || "Errore durante la registrazione");
        setLoading(false);
        return;
      }

      // 2. Login automatico
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginErr) {
        setErr("Account creato ma login fallito. Vai al login.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 1200);
    } catch (e: any) {
      setErr(e?.message || "Errore di rete");
      setLoading(false);
    }
  }

  if (success) {
    return (
      <Wrapper>
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 22, color: "#0f172a" }}>
            Benvenuto in FisioHub!
          </h2>
          <p style={{ color: "#64748b", fontSize: 14 }}>
            Accesso in corso…
          </p>
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: -0.3 }}>
            Crea il tuo studio
          </h1>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Registrazione beta — richiede codice d'invito
          </p>
        </div>

        {/* Codice invito */}
        <div>
          <label style={lbl}>Codice d'invito</label>
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="ABCD1234"
            style={{ ...inp, letterSpacing: 2, fontFamily: "monospace", textTransform: "uppercase" }}
            autoComplete="off"
            required
          />
        </div>

        {/* Nome studio */}
        <div>
          <label style={lbl}>Nome dello studio</label>
          <input
            type="text"
            value={studioName}
            onChange={(e) => setStudioName(e.target.value)}
            placeholder="Es. Fisio Center Milano"
            style={inp}
            autoComplete="organization"
            required
          />
        </div>

        {/* Nome operatore */}
        <div>
          <label style={lbl}>Il tuo nome (per messaggi e firme)</label>
          <input
            type="text"
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            placeholder="Es. Dr. Mario Rossi"
            style={inp}
            autoComplete="name"
            required
          />
        </div>

        {/* Email */}
        <div>
          <label style={lbl}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tua@email.com"
            style={inp}
            autoComplete="email"
            required
          />
        </div>

        {/* Password */}
        <div>
          <label style={lbl}>Password (min 6 caratteri)</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ ...inp, paddingRight: 44 }}
              autoComplete="new-password"
              minLength={6}
              required
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                background: "transparent", border: "none", cursor: "pointer",
                color: "#64748b", fontSize: 13,
              }}
            >
              {showPw ? "🙈" : "👁"}
            </button>
          </div>
        </div>

        {/* Errore */}
        {err && (
          <div style={{
            padding: "10px 14px", borderRadius: 8, background: "rgba(220,38,38,0.08)",
            border: "1px solid rgba(220,38,38,0.2)", color: "#dc2626", fontSize: 13,
          }}>
            {err}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            marginTop: 6, padding: "12px 16px", borderRadius: 10, border: "none",
            background: canSubmit ? "linear-gradient(135deg,#0d9488,#2563eb)" : "#cbd5e1",
            color: "#fff", fontWeight: 700, fontSize: 15,
            cursor: canSubmit ? "pointer" : "not-allowed",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Creazione in corso…" : "Crea il mio studio"}
        </button>

        <div style={{ textAlign: "center", marginTop: 4, fontSize: 13, color: "#64748b" }}>
          Hai già un account?{" "}
          <Link href="/login" style={{ color: "#2563eb", fontWeight: 600 }}>
            Accedi
          </Link>
        </div>
      </form>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg,#f0fdfa 0%,#eff6ff 100%)",
      fontFamily: "Inter,-apple-system,sans-serif", padding: "24px 16px",
    }}>
      <div style={{
        maxWidth: 420, width: "100%", background: "#fff", borderRadius: 16,
        padding: "32px 28px", boxShadow: "0 10px 40px rgba(15,23,42,0.08)",
      }}>
        {children}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1.5px solid #cbd5e1", fontSize: 14, outline: "none",
  background: "#fff", color: "#0f172a", boxSizing: "border-box" as const,
};

const lbl: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600,
  color: "#334155", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5,
};
