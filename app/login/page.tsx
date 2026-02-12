"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

/**
 * Login desktop-first (ma responsive).
 * Requisito asset: metti il logo qui -> /public/brand/fisiohub.png
 */
export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const [capsOn, setCapsOn] = useState(false);
  const pwRef = useRef<HTMLInputElement | null>(null);

  // Se già loggato, vai alla home protetta
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session) {
        router.replace("/");
        router.refresh();
      }
    });
    return () => {
      alive = false;
    };
  }, [router]);

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length >= 6 && !loading;
  }, [email, password, loading]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      // Messaggi Supabase spesso poco UX: li “puliamo” quel minimo.
      const msg =
        error.message?.toLowerCase().includes("invalid login credentials")
          ? "Credenziali non valide. Controlla email e password."
          : error.message || "Errore di accesso.";
      setErr(msg);
      return;
    }

    if (data.session) {
      router.replace("/");
      router.refresh();
    } else {
      setErr("Login fallito: nessuna sessione ricevuta.");
    }
  }

  function onPwKeyUp(e: React.KeyboardEvent<HTMLInputElement>) {
    // CapsLock detection
    const caps = e.getModifierState?.("CapsLock") ?? false;
    setCapsOn(caps);
  }

  return (
    <div className="wrap">
      <div className="bg" aria-hidden />

      <div className="shell">
        {/* LEFT: Brand / value */}
        <aside className="brandPanel">
          <div className="brandTop">
            <div className="logoRing">
              <Image
                src="/brand/fisiohub.png"
                alt="FisioHub Galileo"
                width={132}
                height={132}
                priority
                className="logoImg"
              />
            </div>

            <div className="brandText">
              <div className="brandName">
                Fisio<span>Hub</span>
              </div>
              <div className="brandSub">GALILEO • Gestionale clinico</div>
            </div>
          </div>

          <div className="pitch">
            <h1>Entra, lavora, chiudi il cerchio.</h1>
            <p>
              Dashboard, agenda e promemoria WhatsApp: tutto in un posto solo, senza
              fronzoli. Qui l’obiettivo è uno: meno caos, più incasso, meno scuse.
            </p>

            <div className="bullets">
              <div className="bullet">
                <div className="dot">✓</div>
                <div>
                  <div className="bTitle">KPI in tempo reale</div>
                  <div className="bDesc">Pagati, non pagati, fatturato e trend. Niente fumo.</div>
                </div>
              </div>

              <div className="bullet">
                <div className="dot">✓</div>
                <div>
                  <div className="bTitle">Promemoria sotto controllo</div>
                  <div className="bDesc">Capisci subito se hai inviato WhatsApp o sei in ritardo.</div>
                </div>
              </div>

              <div className="bullet">
                <div className="dot">✓</div>
                <div>
                  <div className="bTitle">Flusso semplice</div>
                  <div className="bDesc">Prenoti → tratti → incassi. Il resto è rumore.</div>
                </div>
              </div>
            </div>

            <div className="brandFooter">
              <div className="miniTag">Studio-ready • Desktop first • Supabase Auth</div>
            </div>
          </div>
        </aside>

        {/* RIGHT: Form */}
        <main className="formPanel">
          <div className="card">
            <div className="cardTop">
              <div className="cardTitle">Accesso</div>
              <div className="cardHint">Inserisci le tue credenziali</div>
            </div>

            {err ? (
              <div className="alert" role="alert">
                <div className="alertIcon">!</div>
                <div className="alertText">{err}</div>
                <button
                  type="button"
                  className="alertClose"
                  onClick={() => setErr("")}
                  aria-label="Chiudi"
                  title="Chiudi"
                >
                  ×
                </button>
              </div>
            ) : null}

            <form onSubmit={onSubmit} className="form">
              <div className="field">
                <label className="label" htmlFor="email">
                  Email
                </label>
                <div className="control">
                  <input
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="nome@dominio.it"
                    className="input"
                    inputMode="email"
                  />
                  <div className="icon" aria-hidden>
                    @
                  </div>
                </div>
              </div>

              <div className="field">
                <label className="label" htmlFor="password">
                  Password
                </label>

                <div className="control">
                  <input
                    ref={pwRef}
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={onPwKeyUp}
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    className="input"
                  />

                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setShowPw((s) => !s)}
                    aria-label={showPw ? "Nascondi password" : "Mostra password"}
                    title={showPw ? "Nascondi password" : "Mostra password"}
                  >
                    {showPw ? "Nascondi" : "Mostra"}
                  </button>
                </div>

                {capsOn ? <div className="caps">Caps Lock attivo</div> : null}
              </div>

              <div className="row">
                <label className="check">
                  <input
                    type="checkbox"
                    onChange={() => {
                      // Placeholder: Supabase Auth gestisce la sessione via cookie/localStorage.
                      // Se vuoi “ricordami”, si fa con policy/session persistence (di solito già persistente).
                    }}
                  />
                  <span>Ricordami</span>
                </label>

                <a className="link" href="/reset-password">
                  Password dimenticata?
                </a>
              </div>

              <button type="submit" className="btn" disabled={!canSubmit}>
                {loading ? (
                  <span className="btnInner">
                    <span className="spinner" aria-hidden />
                    Accesso in corso…
                  </span>
                ) : (
                  "Entra"
                )}
              </button>

              <div className="micro">
                Usando FisioHub accetti di lavorare in modo più ordinato di ieri. (È un contratto morale.)
              </div>
            </form>
          </div>
        </main>
      </div>

      <style jsx>{`
        :global(html, body) {
          height: 100%;
        }
        .wrap {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: stretch;
          justify-content: center;
          padding: 28px;
          background: #070b1a;
        }

        /* Background */
        .bg {
          position: absolute;
          inset: -40px;
          background:
            radial-gradient(900px 600px at 20% 20%, rgba(35, 170, 255, 0.22), rgba(0, 0, 0, 0) 60%),
            radial-gradient(800px 600px at 85% 75%, rgba(44, 217, 179, 0.18), rgba(0, 0, 0, 0) 58%),
            radial-gradient(500px 500px at 35% 85%, rgba(135, 95, 255, 0.12), rgba(0, 0, 0, 0) 60%),
            linear-gradient(180deg, rgba(7, 11, 26, 1), rgba(10, 14, 30, 1));
          filter: saturate(1.1);
        }

        /* Shell */
        .shell {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 1120px;
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          border-radius: 26px;
          overflow: hidden;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(14px);
        }

        /* Brand panel */
        .brandPanel {
          position: relative;
          padding: 38px 38px 30px;
          color: rgba(255, 255, 255, 0.92);
          background:
            radial-gradient(1200px 700px at 30% 20%, rgba(35, 170, 255, 0.26), rgba(0, 0, 0, 0) 55%),
            radial-gradient(900px 700px at 80% 80%, rgba(44, 217, 179, 0.22), rgba(0, 0, 0, 0) 55%),
            linear-gradient(140deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
        }

        .brandPanel:before {
          content: "";
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(rgba(255, 255, 255, 0.16) 1px, transparent 1px);
          background-size: 18px 18px;
          opacity: 0.07;
          pointer-events: none;
        }

        .brandTop {
          display: flex;
          align-items: center;
          gap: 16px;
          position: relative;
          z-index: 1;
        }

        .logoRing {
          width: 86px;
          height: 86px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background:
            radial-gradient(circle at 30% 30%, rgba(35, 170, 255, 0.30), rgba(44, 217, 179, 0.16) 45%, rgba(255, 255, 255, 0.08) 72%);
          border: 1px solid rgba(255, 255, 255, 0.16);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
          overflow: hidden;
        }
        .logoImg {
          width: 78px;
          height: 78px;
          object-fit: contain;
          transform: translateY(1px);
        }

        .brandText {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .brandName {
          font-size: 28px;
          font-weight: 900;
          letter-spacing: -0.4px;
          line-height: 1.05;
        }
        .brandName span {
          color: rgba(44, 217, 179, 1);
        }
        .brandSub {
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.72);
          font-weight: 700;
        }

        .pitch {
          margin-top: 26px;
          position: relative;
          z-index: 1;
          max-width: 520px;
        }

        .pitch h1 {
          margin: 0 0 10px;
          font-size: 34px;
          letter-spacing: -0.6px;
          line-height: 1.1;
          font-weight: 950;
        }

        .pitch p {
          margin: 0 0 18px;
          color: rgba(255, 255, 255, 0.72);
          font-size: 14px;
          line-height: 1.55;
          font-weight: 600;
        }

        .bullets {
          display: grid;
          gap: 12px;
          margin-top: 18px;
        }

        .bullet {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 12px 12px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.10);
        }

        .dot {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: rgba(44, 217, 179, 0.18);
          border: 1px solid rgba(44, 217, 179, 0.35);
          color: rgba(255, 255, 255, 0.92);
          font-weight: 900;
          flex: 0 0 auto;
        }

        .bTitle {
          font-size: 13px;
          font-weight: 900;
          letter-spacing: -0.2px;
        }
        .bDesc {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.70);
          line-height: 1.35;
          margin-top: 2px;
          font-weight: 600;
        }

        .brandFooter {
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.10);
        }
        .miniTag {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.70);
          font-weight: 700;
        }

        /* Form panel */
        .formPanel {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 28px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
        }

        .card {
          width: 100%;
          max-width: 420px;
          border-radius: 22px;
          padding: 26px;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(255, 255, 255, 0.55);
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35);
        }

        .cardTop {
          margin-bottom: 14px;
        }
        .cardTitle {
          font-size: 22px;
          font-weight: 950;
          letter-spacing: -0.3px;
          color: #0b1024;
        }
        .cardHint {
          font-size: 12px;
          color: rgba(15, 23, 42, 0.60);
          font-weight: 700;
          margin-top: 4px;
        }

        .alert {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          background: rgba(239, 68, 68, 0.10);
          border: 1px solid rgba(239, 68, 68, 0.35);
          color: rgba(185, 28, 28, 1);
          padding: 12px 12px;
          border-radius: 14px;
          margin-bottom: 14px;
          position: relative;
        }
        .alertIcon {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          background: rgba(239, 68, 68, 0.20);
          border: 1px solid rgba(239, 68, 68, 0.35);
          display: grid;
          place-items: center;
          font-weight: 950;
          flex: 0 0 auto;
          transform: translateY(1px);
        }
        .alertText {
          font-size: 13px;
          line-height: 1.35;
          font-weight: 700;
          padding-right: 26px;
        }
        .alertClose {
          position: absolute;
          right: 8px;
          top: 6px;
          background: transparent;
          border: 0;
          color: rgba(185, 28, 28, 0.9);
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
        }

        .form {
          display: grid;
          gap: 14px;
        }

        .field {
          display: grid;
          gap: 8px;
        }

        .label {
          font-size: 12px;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: rgba(15, 23, 42, 0.65);
          font-weight: 900;
        }

        .control {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input {
          width: 100%;
          height: 46px;
          border-radius: 14px;
          border: 1px solid rgba(15, 23, 42, 0.12);
          background: rgba(255, 255, 255, 0.95);
          padding: 0 14px;
          font-size: 14px;
          font-weight: 700;
          color: rgba(15, 23, 42, 0.92);
          outline: none;
          transition: box-shadow 160ms ease, border-color 160ms ease, transform 160ms ease;
        }

        .input:focus {
          border-color: rgba(35, 170, 255, 0.55);
          box-shadow: 0 0 0 4px rgba(35, 170, 255, 0.16);
        }

        .icon {
          position: absolute;
          right: 12px;
          height: 28px;
          min-width: 28px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          background: rgba(15, 23, 42, 0.06);
          border: 1px solid rgba(15, 23, 42, 0.08);
          color: rgba(15, 23, 42, 0.55);
          font-weight: 900;
          pointer-events: none;
        }

        .ghost {
          position: absolute;
          right: 10px;
          height: 32px;
          padding: 0 10px;
          border-radius: 10px;
          border: 1px solid rgba(15, 23, 42, 0.12);
          background: rgba(255, 255, 255, 0.7);
          color: rgba(15, 23, 42, 0.75);
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
          transition: transform 120ms ease, background 120ms ease;
        }
        .ghost:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.95);
        }

        .caps {
          font-size: 12px;
          font-weight: 800;
          color: rgba(234, 88, 12, 1);
          margin-top: 6px;
        }

        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .check {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          font-weight: 800;
          color: rgba(15, 23, 42, 0.75);
          user-select: none;
        }
        .check input {
          width: 16px;
          height: 16px;
          accent-color: rgba(44, 217, 179, 1);
        }

        .link {
          font-size: 13px;
          font-weight: 900;
          color: rgba(35, 170, 255, 1);
          text-decoration: none;
        }
        .link:hover {
          text-decoration: underline;
        }

        .btn {
          width: 100%;
          height: 48px;
          border-radius: 14px;
          border: 0;
          cursor: pointer;
          font-weight: 950;
          font-size: 14px;
          letter-spacing: 0.02em;
          color: white;
          background: linear-gradient(90deg, rgba(35, 170, 255, 1), rgba(44, 217, 179, 1));
          box-shadow: 0 18px 40px rgba(35, 170, 255, 0.22);
          transition: transform 140ms ease, opacity 140ms ease, box-shadow 140ms ease;
        }
        .btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 22px 50px rgba(35, 170, 255, 0.28);
        }
        .btn:disabled {
          cursor: not-allowed;
          opacity: 0.55;
          transform: none;
          box-shadow: none;
        }

        .btnInner {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .spinner {
          width: 14px;
          height: 14px;
          border-radius: 999px;
          border: 2px solid rgba(255, 255, 255, 0.55);
          border-top-color: rgba(255, 255, 255, 1);
          animation: spin 900ms linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .micro {
          margin-top: 10px;
          text-align: center;
          font-size: 12px;
          color: rgba(15, 23, 42, 0.55);
          font-weight: 700;
          line-height: 1.35;
        }

        /* Responsive */
        @media (max-width: 980px) {
          .wrap {
            padding: 18px;
          }
          .shell {
            grid-template-columns: 1fr;
            max-width: 560px;
          }
          .brandPanel {
            padding: 26px;
          }
          .pitch h1 {
            font-size: 28px;
          }
          .formPanel {
            padding: 22px;
          }
        }

        @media (max-width: 520px) {
          .brandTop {
            gap: 12px;
          }
          .logoRing {
            width: 76px;
            height: 76px;
          }
          .logoImg {
            width: 70px;
            height: 70px;
          }
          .brandName {
            font-size: 24px;
          }
          .card {
            padding: 22px;
          }
        }
      `}</style>
    </div>
  );
}
