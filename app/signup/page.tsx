"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";

// Mappa dei codici di errore dall'API a messaggi + azioni suggerite
type ErrorInfo = {
  message: string;
  hint?: string;          // Suggerimento concreto per l'utente
  action?: { label: string; href?: string; onClick?: () => void };
};

function buildErrorInfo(code: string, message: string, router: any): ErrorInfo {
  switch (code) {
    case "INVITE_NOT_FOUND":
      return {
        message: "Codice invito non trovato",
        hint: "Verifica di aver scritto il codice correttamente (distingue maiuscole/minuscole). Se è corretto, contatta chi te l'ha fornito — potrebbe essere stato revocato o scritto male.",
      };
    case "INVITE_REVOKED":
      return {
        message: "Codice invito revocato",
        hint: "Questo codice è stato disabilitato. Contatta chi te l'ha fornito per ricevere un nuovo codice.",
      };
    case "INVITE_EXPIRED":
      return {
        message: "Codice invito scaduto",
        hint: message, // contiene già la data
      };
    case "INVITE_EXHAUSTED":
      return {
        message: "Codice invito già utilizzato",
        hint: "Questo codice è già stato usato al massimo delle volte permesse. Richiedi un nuovo codice.",
      };
    case "EMAIL_ALREADY_REGISTERED":
      return {
        message: "Email già registrata",
        hint: "Hai già un account con questa email. Accedi con la tua password esistente.",
        action: { label: "Vai al login", href: "/login" },
      };
    case "INVALID_EMAIL":
      return {
        message: "Email non valida",
        hint: "Verifica il formato dell'email (es. nome@dominio.it).",
      };
    case "WEAK_PASSWORD":
      return {
        message: "Password troppo debole",
        hint: message + " Esempio valido: Fisio2026",
      };
    case "INVALID_STUDIO_NAME":
      return {
        message: "Nome studio troppo corto",
        hint: "Il nome dello studio deve essere di almeno 2 caratteri.",
      };
    case "INVALID_OPERATOR_NAME":
      return {
        message: "Nome operatore troppo corto",
        hint: "Il tuo nome deve essere di almeno 2 caratteri.",
      };
    case "MISSING_FIELDS":
      return {
        message: "Campi mancanti",
        hint: "Compila tutti i campi del modulo prima di procedere.",
      };
    case "DB_ERROR":
    case "AUTH_ERROR":
    case "STUDIO_CREATE_ERROR":
    case "MEMBER_CREATE_ERROR":
    case "SERVER_ERROR":
      return {
        message: "Errore di sistema",
        hint: "Si è verificato un errore inaspettato. Riprova tra qualche minuto. Se il problema persiste, contatta l'assistenza.",
      };
    // ─── Team invite errors (mig. 020) ───
    case "INVALID_INVITE_TOKEN":
      return {
        message: "Link di invito non valido",
        hint: "Il link copiato sembra incompleto. Chiedi al tuo collega di rinviarlo per intero.",
      };
    case "INVITE_ALREADY_CLAIMED":
      return {
        message: "Invito già accettato",
        hint: "Se hai già un account, accedi direttamente con email e password.",
        action: { label: "Vai al login", href: "/login" },
      };
    case "INVITE_DEACTIVATED":
      return {
        message: "Invito annullato",
        hint: "Il titolare dello studio ha annullato questo invito. Chiedi un nuovo link per registrarti.",
      };
    case "INVITE_EMAIL_MISMATCH":
      return {
        message: "Email diversa da quella dell'invito",
        hint: message, // contiene già il dettaglio specifico
      };
    case "INVITE_LOOKUP_ERROR":
    case "AUTH_CREATE_ERROR":
    case "CLAIM_ERROR":
      return {
        message: "Errore di sistema",
        hint: "Si è verificato un errore tecnico. Riprova tra qualche minuto.",
      };
    case "INVALID_NAME":
      return {
        message: "Nome troppo corto",
        hint: "Il tuo nome deve essere di almeno 2 caratteri.",
      };
    default:
      return { message: message || "Errore durante la registrazione" };
  }
}

// Analisi forza password in tempo reale
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

  // ─── Rilevamento tipo invito ───────────────────────────────────────────
  // Se il param ?invite= è in formato UUID, è un invito di TEAM (mig. 020):
  // il collega entra in uno studio esistente, non ne crea uno nuovo.
  // Se invece è un codice testuale (es. ABCD1234), è il classico invito beta.
  const isTeamInvite = useMemo(() => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inviteFromUrl);
  }, [inviteFromUrl]);

  // Pre-fetch info invito team (per mostrare il nome dello studio prima della
  // registrazione: "Stai entrando nel team di FisioHub")
  const [teamInviteInfo, setTeamInviteInfo] = useState<{
    studioName: string;
    suggestedName: string | null;
    suggestedEmail: string | null;
    role: string;
  } | null>(null);
  const [teamInviteError, setTeamInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTeamInvite || !inviteFromUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/signup/team-invite/info?token=${encodeURIComponent(inviteFromUrl)}`);
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          if (!cancelled) setTeamInviteError(j.error || "Invito non valido o scaduto.");
          return;
        }
        const j = await r.json();
        if (!cancelled) {
          setTeamInviteInfo({
            studioName: j.studio_name || "Studio",
            suggestedName: j.suggested_name || null,
            suggestedEmail: j.suggested_email || null,
            role: j.role || "therapist",
          });
        }
      } catch {
        if (!cancelled) setTeamInviteError("Errore di connessione. Riprova.");
      }
    })();
    return () => { cancelled = true; };
  }, [isTeamInvite, inviteFromUrl]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [studioName, setStudioName] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [inviteCode, setInviteCode] = useState(isTeamInvite ? "" : inviteFromUrl.toUpperCase());

  // Pre-compila email + nome quando arriva l'info dell'invito team
  useEffect(() => {
    if (teamInviteInfo) {
      if (teamInviteInfo.suggestedEmail && !email) {
        setEmail(teamInviteInfo.suggestedEmail);
      }
      if (teamInviteInfo.suggestedName && !operatorName) {
        setOperatorName(teamInviteInfo.suggestedName);
      }
    }
    // Eslint: dipendiamo SOLO da teamInviteInfo, non vogliamo riapplicare
    // se l'utente cambia email/nome manualmente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamInviteInfo]);


  const [loading, setLoading] = useState(false);
  const [errInfo, setErrInfo] = useState<ErrorInfo | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session) router.replace("/");
    });
    return () => { alive = false; };
  }, [router]);

  const pwdStrength = useMemo(() => passwordStrength(password), [password]);

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (email.trim().length <= 3) return false;
    if (password.length < 8) return false;
    if (!/\d/.test(password)) return false;
    if (!/[a-zA-Z]/.test(password)) return false;
    if (operatorName.trim().length < 2) return false;

    if (isTeamInvite) {
      // Team invite: serve solo che il token sia caricato e valido
      return Boolean(teamInviteInfo) && !teamInviteError;
    } else {
      // Beta signup: servono nome studio + codice invito
      return (
        studioName.trim().length >= 2 &&
        inviteCode.trim().length >= 4
      );
    }
  }, [email, password, studioName, operatorName, inviteCode, loading, isTeamInvite, teamInviteInfo, teamInviteError]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrInfo(null);
    setLoading(true);

    try {
      // Branching: team invite (UUID) vs beta signup (codice testuale)
      const endpoint = isTeamInvite ? "/api/signup/team-invite" : "/api/signup";
      const payload = isTeamInvite
        ? {
            email: email.trim(),
            password,
            operator_name: operatorName.trim(),
            invite_token: inviteFromUrl,
          }
        : {
            email: email.trim(),
            password,
            studio_name: studioName.trim(),
            operator_name: operatorName.trim(),
            invite_code: inviteCode.trim().toUpperCase(),
          };

      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json();

      if (!r.ok) {
        setErrInfo(buildErrorInfo(j.code || "UNKNOWN", j.error || "Errore sconosciuto", router));
        setLoading(false);
        return;
      }

      // Login automatico dopo registrazione
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginErr) {
        setErrInfo({
          message: "Account creato, ma accesso automatico fallito",
          hint: "L'account è stato creato con successo. Vai al login per accedere.",
          action: { label: "Vai al login", href: "/login" },
        });
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 1200);
    } catch (e: any) {
      setErrInfo({
        message: "Errore di connessione",
        hint: "Verifica la tua connessione internet e riprova.",
      });
      setLoading(false);
    }
  }

  if (success) {
    return (
      <Wrapper>
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <img
              src="/logo-mark.svg"
              alt="FisioHub"
              width={64}
              height={64}
              style={{ display: "block" }}
            />
          </div>
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
        {/* Logo FisioHub (mark vettoriale) in cima al form, comune ai due flussi
            di signup (beta classico + team invite). */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
          <img
            src="/logo-mark.svg"
            alt="FisioHub"
            width={56}
            height={56}
            style={{ display: "block" }}
          />
        </div>
        {isTeamInvite ? (
          // ─── HEADER team invite ──────────────────────────────────────────
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: -0.3 }}>
              Unisciti al team
            </h1>
            {teamInviteError ? (
              <p style={{ margin: "6px 0 0", color: "#dc2626", fontSize: 13, fontWeight: 600 }}>
                ⚠ {teamInviteError}
              </p>
            ) : teamInviteInfo ? (
              <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
                Sei stato invitato a far parte di{" "}
                <strong style={{ color: "#0d9488" }}>{teamInviteInfo.studioName}</strong>
              </p>
            ) : (
              <p style={{ margin: "6px 0 0", color: "#94a3b8", fontSize: 13 }}>
                Verifica invito in corso…
              </p>
            )}
          </div>
        ) : (
          // ─── HEADER beta signup classico ─────────────────────────────────
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#0f172a", letterSpacing: -0.3 }}>
              Crea il tuo studio
            </h1>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
              Registrazione beta — richiede codice d&apos;invito
            </p>
          </div>
        )}

        {/* Codice invito (solo per beta classico) */}
        {!isTeamInvite && (
          <div>
            <label style={lbl}>Codice d&apos;invito</label>
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
        )}

        {/* Nome studio (solo per beta classico) */}
        {!isTeamInvite && (
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
        )}

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
          <label style={lbl}>Password (min 8 caratteri, 1 lettera + 1 numero)</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ ...inp, paddingRight: 44 }}
              autoComplete="new-password"
              minLength={8}
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
          {/* Password strength indicator */}
          {password && (
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${(pwdStrength.score / 3) * 100}%`,
                  background: pwdStrength.color,
                  transition: "width 0.2s, background 0.2s",
                }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: pwdStrength.color, minWidth: 80, textAlign: "right" }}>
                {pwdStrength.label}
              </span>
            </div>
          )}
        </div>

        {/* Errore strutturato */}
        {errInfo && (
          <div style={{
            padding: "12px 14px", borderRadius: 10, background: "rgba(220,38,38,0.06)",
            border: "1.5px solid rgba(220,38,38,0.25)",
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#991b1b", marginBottom: 3 }}>
                  {errInfo.message}
                </div>
                {errInfo.hint && (
                  <div style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.4 }}>
                    {errInfo.hint}
                  </div>
                )}
                {errInfo.action && errInfo.action.href && (
                  <Link
                    href={errInfo.action.href}
                    style={{
                      display: "inline-block", marginTop: 8, fontSize: 13, fontWeight: 700,
                      color: "#2563eb", textDecoration: "underline",
                    }}
                  >
                    → {errInfo.action.label}
                  </Link>
                )}
              </div>
            </div>
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
