"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !email.includes("@")) {
      setError("Inserisci un'email valida");
      return;
    }
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password/confirm`;
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (err) {
        // Supabase tipicamente non rivela se l'email esiste (per sicurezza),
        // quindi mostriamo sempre "email inviata" a meno di errori di rete.
        console.warn("resetPasswordForEmail:", err.message);
      }
      // Mostra sempre conferma, per motivi di sicurezza (no user enumeration)
      setSent(true);
    } catch (e: any) {
      setError("Errore di connessione. Verifica la tua rete e riprova.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <Wrapper>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📬</div>
          <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
            Controlla la tua email
          </h2>
          <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>
            Se esiste un account associato a <strong style={{ color: "#0f172a" }}>{email}</strong>,
            riceverai a breve un'email con le istruzioni per reimpostare la password.
          </p>
          <div style={{
            padding: 12, borderRadius: 8, background: "#fef3c7",
            border: "1px solid #fde68a", fontSize: 12, color: "#92400e", marginBottom: 20,
            textAlign: "left",
          }}>
            💡 <strong>Non trovi l'email?</strong> Controlla la cartella spam/promozioni.
            L'email arriva da Supabase e può metterci 1-2 minuti.
          </div>
          <Link href="/login" style={{
            display: "inline-block", padding: "10px 20px", borderRadius: 8,
            background: "linear-gradient(135deg,#0d9488,#2563eb)", color: "#fff",
            fontWeight: 700, fontSize: 14, textDecoration: "none",
          }}>
            Torna al login
          </Link>
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔑</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
            Password dimenticata?
          </h1>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>
            Inserisci la tua email e ti invieremo un link per reimpostare la password.
          </p>
        </div>

        <div>
          <label style={lbl}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tua@email.com"
            style={inp}
            autoComplete="email"
            autoFocus
            required
          />
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
          disabled={loading || !email.trim()}
          style={{
            marginTop: 6, padding: "12px 16px", borderRadius: 10, border: "none",
            background: loading || !email.trim() ? "#cbd5e1" : "linear-gradient(135deg,#0d9488,#2563eb)",
            color: "#fff", fontWeight: 700, fontSize: 15,
            cursor: loading || !email.trim() ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Invio in corso…" : "Invia link di recupero"}
        </button>

        <div style={{ textAlign: "center", marginTop: 4, fontSize: 13, color: "#64748b" }}>
          <Link href="/login" style={{ color: "#2563eb", fontWeight: 600 }}>
            ← Torna al login
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
