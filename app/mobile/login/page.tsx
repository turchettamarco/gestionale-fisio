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
    // se già loggato, vai via
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/mobile/calendar");
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
      router.replace("/mobile/calendar");
    } else {
      setErr("Login fallito: nessuna sessione ricevuta.");
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)"
    }}>
      <div style={{
        width: "100%",
        maxWidth: 420,
        background: "white",
        borderRadius: 20,
        padding: 40,
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.1)",
        position: "relative",
        overflow: "hidden"
      }}>
        {/* Decorative top element */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          background: "linear-gradient(90deg, #4b6cb7 0%, #182848 100%)"
        }}></div>
        
        {/* Logo/Header section */}
        <div style={{
          textAlign: "center",
          marginBottom: 30
        }}>
          <div style={{
            fontSize: 24,
            fontWeight: 800,
            color: "#182848",
            letterSpacing: "0.5px",
            marginBottom: 4
          }}>
            Fisio<strong style={{ color: "#4b6cb7" }}>Hub</strong>
          </div>
          <div style={{
            fontSize: 14,
            color: "#666",
            fontWeight: 500,
            marginBottom: 20
          }}>
            Gestione Clinica e Appuntamenti
          </div>
          
          {/* Professional info */}
          <div style={{
            background: "linear-gradient(90deg, #f8f9fa 0%, #e9ecef 100%)",
            padding: "16px 20px",
            borderRadius: 12,
            marginBottom: 30,
            borderLeft: "4px solid #4b6cb7"
          }}>
            <div style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#182848",
              marginBottom: 4
            }}>
              TURCHETTA MARCO
            </div>
            <div style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#4b6cb7"
            }}>
              FISIOTERAPISTA
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: "block",
              fontSize: 14,
              fontWeight: 600,
              color: "#374151",
              marginBottom: 8
            }}>
              Username / Email
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
                transition: "all 0.3s ease",
                boxSizing: "border-box"
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#4b6cb7";
                e.target.style.boxShadow = "0 0 0 3px rgba(75, 108, 183, 0.1)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#e5e7eb";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: "block",
              fontSize: 14,
              fontWeight: 600,
              color: "#374151",
              marginBottom: 8
            }}>
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
                transition: "all 0.3s ease",
                boxSizing: "border-box"
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#4b6cb7";
                e.target.style.boxShadow = "0 0 0 3px rgba(75, 108, 183, 0.1)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#e5e7eb";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          {err && (
            <div style={{
              background: "#fee2e2",
              border: "1px solid #ef4444",
              padding: "12px 16px",
              borderRadius: 10,
              marginBottom: 20,
              color: "#dc2626",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 8
            }}>
              <svg style={{ width: 18, height: 18, flexShrink: 0 }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
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
              fontWeight: 700,
              fontSize: 16,
              cursor: loading ? "not-allowed" : "pointer",
              background: "linear-gradient(90deg, #4b6cb7 0%, #182848 100%)",
              color: "white",
              transition: "all 0.3s ease",
              marginBottom: 20,
              position: "relative",
              overflow: "hidden"
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 5px 15px rgba(75, 108, 183, 0.3)";
              }
            }}
            onMouseOut={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }
            }}
          >
            {loading ? (
              <>
                <span style={{ opacity: 0.9 }}>Accesso in corso...</span>
                <div style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
                  animation: "shimmer 1.5s infinite"
                }}></div>
              </>
            ) : (
              "LOGIN"
            )}
          </button>

          <div style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 14,
            color: "#6b7280"
          }}>
            <button
              type="button"
              onClick={() => {
                // Aggiungi qui la logica per "Forgot Password?"
                alert("Funzionalità 'Password dimenticata?' da implementare");
              }}
              style={{
                background: "none",
                border: "none",
                color: "#4b6cb7",
                cursor: "pointer",
                fontSize: 14,
                textDecoration: "underline",
                padding: 0
              }}
            >
              Forgot Password?
            </button>
            
            <button
              type="button"
              onClick={() => {
                // Aggiungi qui la logica per "Sign Up"
                alert("Funzionalità 'Sign Up' da implementare");
              }}
              style={{
                background: "none",
                border: "none",
                color: "#182848",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                padding: 0
              }}
            >
              Sign Up
            </button>
          </div>
        </form>

        <div style={{
          fontSize: 12,
          textAlign: "center",
          marginTop: 30,
          color: "#9ca3af",
          paddingTop: 20,
          borderTop: "1px solid #f3f4f6"
        }}>
          Usa le credenziali create in Supabase Auth per accedere.
        </div>

        {/* Aggiungi questo stile per l'animazione dello shimmer */}
        <style jsx>{`
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      </div>
    </div>
  );
}