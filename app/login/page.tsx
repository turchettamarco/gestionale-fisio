"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    // Se già loggato, vai alla home protetta
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/");
        router.refresh();
      }
    });
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    if (data.session) {
      router.replace("/");
      router.refresh();
    } else {
      setErr("Login fallito: nessuna sessione ricevuta.");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "white",
          borderRadius: 20,
          padding: 40,
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.1)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: "linear-gradient(90deg, #4b6cb7 0%, #182848 100%)",
          }}
        />

        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#182848" }}>
            Fisio<strong style={{ color: "#4b6cb7" }}>Hub</strong>
          </div>
          <div style={{ fontSize: 13, color: "#666", fontWeight: 500, marginTop: 6 }}>
            Gestione Clinica e Appuntamenti
          </div>
        </div>

        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 600,
                color: "#374151",
                marginBottom: 8,
              }}
            >
              Email
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
              placeholder="inserisci la tua email"
              style={{
                width: "100%",
                padding: "14px 16px",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                fontSize: 15,
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 600,
                color: "#374151",
                marginBottom: 8,
              }}
            >
              Password
            </label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
              placeholder="inserisci la tua password"
              style={{
                width: "100%",
                padding: "14px 16px",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                fontSize: 15,
                boxSizing: "border-box",
              }}
            />
          </div>

          {err && (
            <div
              style={{
                background: "#fee2e2",
                border: "1px solid #ef4444",
                padding: "12px 16px",
                borderRadius: 10,
                marginBottom: 16,
                color: "#dc2626",
                fontSize: 14,
              }}
            >
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: 10,
              border: "none",
              fontWeight: 800,
              fontSize: 16,
              cursor: loading ? "not-allowed" : "pointer",
              background: "linear-gradient(90deg, #4b6cb7 0%, #182848 100%)",
              color: "white",
              opacity: loading ? 0.85 : 1,
            }}
          >
            {loading ? "Accesso..." : "LOGIN"}
          </button>

          <div
            style={{
              fontSize: 12,
              textAlign: "center",
              marginTop: 18,
              color: "#9ca3af",
            }}
          >
            Usa le credenziali create in Supabase Auth per accedere.
          </div>
        </form>
      </div>
    </div>
  );
}
