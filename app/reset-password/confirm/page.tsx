"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

function passwordStrength(pwd: string): { score: 0 | 1 | 2 | 3; label: string; color: string } {
  if (!pwd) return { score: 0, label: "", color: "#e2e8f0" };
  if (pwd.length < 8) return { score: 1, label: "Troppo corta", color: "#dc2626" };
  const hasLetter = /[a-zA-Z]/.test(pwd);
  const hasNumber = /\d/.test(pwd);
  const hasSymbol = /[^a-zA-Z0-9]/.test(pwd);
  if (!hasLetter || !hasNumber) return { score: 1, label: "Serve lettera + numero", color: "#dc2626" };
  if (pwd.length >= 12 && hasSymbol) return { score: 3, label: "Forte", color: "#16a34a" };
  if (pwd.length >= 10 || hasSymbol) return { score: 3, label: "Buona", color: "#16a34a" };
  return { score: 2, label: "Accettabile", color: "#f59e0b" };
}

export default function ResetPasswordConfirmPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);

  const strength = useMemo(() => passwordStrength(password), [password]);

  // Verifica che arriviamo qui con una sessione di recovery valida
  useEffect(() => {
    // Supabase gestisce automaticamente il token nell'URL (hash params)
    // Verifichiamo se abbiamo una sessione valida
    supabase.auth.getSession().then(({ data }) => {
      setSessionValid(!!data.session);
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri.");
      return;
    }
    if (!/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      setError("La password deve contenere almeno una lettera e un numero.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("Le due password non coincidono.");
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        setError("Errore: " + err.message);
        setLoading(false);
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 1500);
    } catch (e: any) {
      setError("Errore di rete. Riprova.");
      setLoading(false);
    }
  }

  if (sessionValid === false) {
    return (
      <Wrapper>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
            Link non valido o scaduto
          </h2>
          <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
            Questo link di recupero password non è più valido. Richiedi un nuovo link dalla pagina
            &ldquo;Password dimenticata&rdquo;.
          </p>
          <Link href="/reset-password" style={{
            display: "inline-block", padding: "10px 20px", borderRadius: 8,
            background: "linear-gradient(135deg,#0d9488,#2563eb)", color: "#fff",
            fontWeight: 700, fontSize: 14, textDecoration: "none",
          }}>
            Richiedi nuovo link
          </Link>
        </div>
      </Wrapper>
    );
  }

  if (success) {
    return (
      <Wrapper>
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 22, color: "#0f172a" }}>
            Password aggiornata!
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
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔐</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
            Imposta nuova password
          </h1>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Scegli una password sicura (min 8 caratteri, 1 lettera + 1 numero)
          </p>
        </div>

        <div>
          <label style={lbl}>Nuova password</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ ...inp, paddingRight: 44 }}
              autoComplete="new-password"
              autoFocus
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
          {password && (
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${(strength.score / 3) * 100}%`,
                  background: strength.color,
                  transition: "width 0.2s, background 0.2s",
                }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: strength.color, minWidth: 80, textAlign: "right" }}>
                {strength.label}
              </span>
            </div>
          )}
        </div>

        <div>
          <label style={lbl}>Conferma nuova password</label>
          <input
            type={showPw ? "text" : "password"}
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            placeholder="••••••••"
            style={inp}
            autoComplete="new-password"
            required
          />
          {passwordConfirm && password !== passwordConfirm && (
            <div style={{ marginTop: 4, fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
              ⚠ Le password non coincidono
            </div>
          )}
        </div>

        {error && (
          <div style={{
            padding: "10px 14px", borderRadius: 8, background: "rgba(220,38,38,0.08)",
            border: "1px solid rgba(220,38,38,0.2)", color: "#dc2626", fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || password.length < 8 || password !== passwordConfirm}
          style={{
            marginTop: 6, padding: "12px 16px", borderRadius: 10, border: "none",
            background: loading || password.length < 8 || password !== passwordConfirm
              ? "#cbd5e1"
              : "linear-gradient(135deg,#0d9488,#2563eb)",
            color: "#fff", fontWeight: 700, fontSize: 15,
            cursor: loading || password.length < 8 || password !== passwordConfirm ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Salvataggio…" : "Aggiorna password"}
        </button>
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
