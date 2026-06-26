// app/(protected)/settings/components/sections/PracticeSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Dati fiscali" — solo dati fiscali interni (non visibili ai pazienti).
// Tutti i dati paziente-visibili (nome, indirizzo, telefono, email, sito,
// google review, firma, logo) sono in StudioBrandingSection → tabella `studios`.
// Qui restano Titolare, P.IVA, PEC + config Sistema TS → tabella `practice_settings`.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { BtnPrimary, BtnOutline } from "../shared/Buttons";
import { TIPI_SPESA } from "@/src/lib/contabilita/tsTipiSpesa";

export type PracticeSectionProps = {
  show: boolean;
  onToggle: () => void;
  loadingPractice: boolean;
  savingPractice: boolean;
  ownerFullName: string; setOwnerFullName: (v: string) => void;
  vatNumber: string; setVatNumber: (v: string) => void;
  pecEmail: string; setPecEmail: (v: string) => void;
  tsEnabled: boolean; setTsEnabled: (v: boolean) => void;
  tsTipoSpesaDefault: string; setTsTipoSpesaDefault: (v: string) => void;
  tsNumberingMode: string; setTsNumberingMode: (v: string) => void;
  tsCfProprietario: string; setTsCfProprietario: (v: string) => void;
  tsRegimeForfettario: boolean; setTsRegimeForfettario: (v: boolean) => void;
  tsDispositivo: number; setTsDispositivo: (v: number) => void;
  tsWsUser: string; setTsWsUser: (v: string) => void;
  tsWsPassword: string; setTsWsPassword: (v: string) => void;
  tsWsPincode: string; setTsWsPincode: (v: string) => void;
  tsWsAmbiente: "test" | "prod"; setTsWsAmbiente: (v: "test" | "prod") => void;
  tsReminderCadences: string[]; setTsReminderCadences: (v: string[]) => void;
  tsInvioEmailEnabled: boolean; setTsInvioEmailEnabled: (v: boolean) => void;
  tsRecapCadences: string[]; setTsRecapCadences: (v: string[]) => void;
  onReload: () => void;
  onSave: () => void;
};

export default function PracticeSection(p: PracticeSectionProps) {
  const fields = [
    { label: "Titolare (nome cognome)", value: p.ownerFullName, set: p.setOwnerFullName, placeholder: "Es. Dott. Mario Rossi" },
    { label: "Partita IVA",             value: p.vatNumber,     set: p.setVatNumber,     placeholder: "Es. 12345678901" },
    { label: "PEC",                     value: p.pecEmail,      set: p.setPecEmail,      placeholder: "Es. mariorossi@pec.it" },
  ];

  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>📋 Dati fiscali</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
            {p.loadingPractice ? "Caricamento…" : "Titolare, Partita IVA, PEC, Sistema Tessera Sanitaria"}
          </div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: "20px", opacity: p.loadingPractice ? 0.7 : 1 }}>
          <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(148,163,184,0.06)", border: `1px solid ${THEME.border}`, marginBottom: 20, fontSize: 12, color: THEME.muted }}>
            <strong style={{ color: THEME.text }}>ℹ️ Nota:</strong> questi dati sono <strong>interni</strong>, usati per ricevute e adempimenti fiscali. Non vengono mostrati ai pazienti. I dati pubblici (nome studio, indirizzo, contatti, firma) sono nella sezione <strong>&ldquo;Il tuo Studio&rdquo;</strong>.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 24 }}>
            {fields.map((f, idx) => (
              <div key={f.label} style={{ gridColumn: idx === 0 ? "1 / -1" : "auto" }}>
                <label style={labelStyle}>{f.label}</label>
                <input
                  value={f.value}
                  onChange={e => f.set(e.target.value)}
                  placeholder={f.placeholder}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>

          {/* ─── Sistema Tessera Sanitaria ─────────────────────────────── */}
          <div style={{ borderTop: `1px solid ${THEME.border}`, paddingTop: 18, marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: THEME.text, marginBottom: 4 }}>🩺 Sistema Tessera Sanitaria</div>
            <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 16 }}>
              Invio dei dati di spesa sanitaria (730 precompilato). La gestione e l&rsquo;export si trovano nella sezione <strong>Contabilità</strong>.
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={p.tsEnabled}
                onChange={e => p.setTsEnabled(e.target.checked)}
                style={{ width: 18, height: 18, cursor: "pointer", accentColor: THEME.teal }}
              />
              <span style={{ fontSize: 13, color: THEME.text, fontWeight: 600 }}>
                Sono soggetto obbligato all&rsquo;invio al Sistema TS
              </span>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 22, alignItems: "start" }}>
            <div style={{ opacity: p.tsEnabled ? 1 : 0.5 }}>
              <label style={labelStyle}>Tipo spesa di default</label>
              <select
                value={p.tsTipoSpesaDefault}
                onChange={e => p.setTsTipoSpesaDefault(e.target.value)}
                disabled={!p.tsEnabled}
                style={{ ...inputStyle, cursor: p.tsEnabled ? "pointer" : "not-allowed" }}
              >
                {TIPI_SPESA.map(t => (
                  <option key={t.code} value={t.code}>{t.code} · {t.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 6 }}>
                Per fisioterapista/osteopata la prestazione tipica è <strong>SP</strong>. Conferma il codice corretto con il tuo commercialista.
              </div>
            </div>

            <div style={{ opacity: p.tsEnabled ? 1 : 0.5 }}>
              <label style={labelStyle}>Numerazione documenti</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { k: "external", t: "Esterna (Xolo / commercialista)", d: "Fatturi fuori: inserisci tu il numero della ricevuta in Contabilità." },
                  { k: "fisiohub", t: "FisioHub", d: "FisioHub genera il numero progressivo (e in futuro la ricevuta)." },
                ].map(o => {
                  const sel = p.tsNumberingMode === o.k;
                  return (
                    <button
                      key={o.k}
                      onClick={() => p.tsEnabled && p.setTsNumberingMode(o.k)}
                      disabled={!p.tsEnabled}
                      style={{
                        flex: "1 1 220px", textAlign: "left", padding: "10px 12px", borderRadius: 10,
                        cursor: p.tsEnabled ? "pointer" : "not-allowed",
                        border: `1.5px solid ${sel ? THEME.teal : THEME.border}`,
                        background: sel ? "rgba(13,148,136,0.08)" : "#fff",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: sel ? THEME.teal : THEME.text }}>{o.t}</div>
                      <div style={{ fontSize: 11, color: THEME.muted, marginTop: 3 }}>{o.d}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ opacity: p.tsEnabled ? 1 : 0.5 }}>
              <label style={labelStyle}>Dati per il file XML (Sistema TS)</label>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 4 }}>Codice fiscale del professionista (tuo)</div>
                  <input
                    value={p.tsCfProprietario}
                    onChange={e => p.setTsCfProprietario(e.target.value.toUpperCase())}
                    disabled={!p.tsEnabled}
                    placeholder="RSSMRA80A01H501U"
                    maxLength={16}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${THEME.border}`, fontSize: 14, color: THEME.text, background: "#fff", boxSizing: "border-box", textTransform: "uppercase", letterSpacing: 1 }}
                  />
                  <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>Va nella radice del file (cfProprietario). Verrà cifrato con il certificato SOGEI in fase di generazione.</div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 4 }}>Regime fiscale</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      { k: true, t: "Forfettario", d: "naturaIVA N2.2" },
                      { k: false, t: "Ordinario (esente art.10)", d: "naturaIVA N4" },
                    ].map(o => {
                      const sel = p.tsRegimeForfettario === o.k;
                      return (
                        <button
                          key={String(o.k)}
                          onClick={() => p.tsEnabled && p.setTsRegimeForfettario(o.k)}
                          disabled={!p.tsEnabled}
                          style={{
                            flex: "1 1 200px", textAlign: "left", padding: "10px 12px", borderRadius: 10,
                            cursor: p.tsEnabled ? "pointer" : "not-allowed",
                            border: `1.5px solid ${sel ? THEME.teal : THEME.border}`,
                            background: sel ? "rgba(13,148,136,0.08)" : "#fff",
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: sel ? THEME.teal : THEME.text }}>{o.t}</div>
                          <div style={{ fontSize: 11, color: THEME.muted, marginTop: 3 }}>{o.d}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ opacity: p.tsEnabled ? 1 : 0.5 }}>
              <label style={labelStyle}>Invio automatico al Sistema TS (Web Service)</label>
              <div style={{ fontSize: 11, color: THEME.muted, marginBottom: 10 }}>
                Credenziali del Web Service Sistema TS, salvate solo nel tuo profilo. Il pincode viene cifrato al momento dell&apos;invio.
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 4 }}>Ambiente</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {([
                      { k: "test" as const, t: "Test (collaudo)", d: "ambiente di prova SOGEI" },
                      { k: "prod" as const, t: "Produzione", d: "invio reale" },
                    ]).map(o => {
                      const sel = p.tsWsAmbiente === o.k;
                      const accent = o.k === "prod" ? THEME.red : THEME.teal;
                      return (
                        <button
                          key={o.k}
                          onClick={() => p.tsEnabled && p.setTsWsAmbiente(o.k)}
                          disabled={!p.tsEnabled}
                          style={{
                            flex: "1 1 200px", textAlign: "left", padding: "10px 12px", borderRadius: 10,
                            cursor: p.tsEnabled ? "pointer" : "not-allowed",
                            border: `1.5px solid ${sel ? accent : THEME.border}`,
                            background: sel ? (o.k === "prod" ? "rgba(220,38,38,0.06)" : "rgba(13,148,136,0.08)") : "#fff",
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: sel ? accent : THEME.text }}>{o.t}</div>
                          <div style={{ fontSize: 11, color: THEME.muted, marginTop: 3 }}>{o.d}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 4 }}>Utente (userid Sistema TS)</div>
                  <input
                    value={p.tsWsUser}
                    onChange={e => p.setTsWsUser(e.target.value)}
                    disabled={!p.tsEnabled}
                    placeholder="es. MTOMRA66A41G224M"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${THEME.border}`, fontSize: 14, color: THEME.text, background: "#fff", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 4 }}>Password</div>
                  <input
                    type="password"
                    value={p.tsWsPassword}
                    onChange={e => p.setTsWsPassword(e.target.value)}
                    disabled={!p.tsEnabled}
                    placeholder="password web service"
                    autoComplete="new-password"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${THEME.border}`, fontSize: 14, color: THEME.text, background: "#fff", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 4 }}>Pincode</div>
                  <input
                    value={p.tsWsPincode}
                    onChange={e => p.setTsWsPincode(e.target.value)}
                    disabled={!p.tsEnabled}
                    placeholder="pincode Sistema TS"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${THEME.border}`, fontSize: 14, color: THEME.text, background: "#fff", boxSizing: "border-box" }}
                  />
                  <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>Lo trovi sul portale: Profilo utente → Stampa pincode.</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 4 }}>Promemoria di invio (email il 1° del mese) — selezionane quanti vuoi</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {([
                      { k: "monthly", t: "Ogni mese", d: "1° di ogni mese" },
                      { k: "quarterly", t: "Ogni 3 mesi", d: "gen · apr · lug · ott" },
                      { k: "semiannual", t: "Ogni 6 mesi", d: "gennaio · luglio" },
                      { k: "annual", t: "Annuale", d: "gennaio (scadenza TS)" },
                    ]).map(o => {
                      const sel = p.tsReminderCadences.includes(o.k);
                      return (
                        <button
                          key={o.k}
                          onClick={() => {
                            if (!p.tsEnabled) return;
                            p.setTsReminderCadences(
                              sel ? p.tsReminderCadences.filter(x => x !== o.k) : [...p.tsReminderCadences, o.k]
                            );
                          }}
                          disabled={!p.tsEnabled}
                          style={{
                            flex: "1 1 150px", textAlign: "left", padding: "10px 12px", borderRadius: 10,
                            cursor: p.tsEnabled ? "pointer" : "not-allowed",
                            border: `1.5px solid ${sel ? THEME.teal : THEME.border}`,
                            background: sel ? "rgba(13,148,136,0.08)" : "#fff",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{
                              width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                              border: `1.5px solid ${sel ? THEME.teal : THEME.border}`,
                              background: sel ? THEME.teal : "#fff", color: "#fff",
                              display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800,
                            }}>{sel ? "✓" : ""}</span>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: sel ? THEME.teal : THEME.text }}>{o.t}</div>
                              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 2 }}>{o.d}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
                    {p.tsReminderCadences.length === 0
                      ? "Nessuna selezione = promemoria disattivato."
                      : "Ricevi l'email quando scatta una qualsiasi delle frequenze scelte."}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 4 }}>Email ad ogni invio</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {([
                      { k: true, t: "Attiva", d: "report + ricevuta PDF ad ogni invio" },
                      { k: false, t: "Disattiva", d: "nessuna email ad ogni invio" },
                    ]).map(o => {
                      const sel = p.tsInvioEmailEnabled === o.k;
                      return (
                        <button
                          key={String(o.k)}
                          onClick={() => p.tsEnabled && p.setTsInvioEmailEnabled(o.k)}
                          disabled={!p.tsEnabled}
                          style={{
                            flex: "1 1 200px", textAlign: "left", padding: "10px 12px", borderRadius: 10,
                            cursor: p.tsEnabled ? "pointer" : "not-allowed",
                            border: `1.5px solid ${sel ? THEME.teal : THEME.border}`,
                            background: sel ? "rgba(13,148,136,0.08)" : "#fff",
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: sel ? THEME.teal : THEME.text }}>{o.t}</div>
                          <div style={{ fontSize: 11, color: THEME.muted, marginTop: 3 }}>{o.d}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>Ad ogni invio ricevi un&apos;email con le fatture trasmesse e la ricevuta PDF (qualche minuto dopo).</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: THEME.muted, marginBottom: 4 }}>Riepilogo periodico degli invii — selezionane quanti vuoi</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {([
                      { k: "monthly", t: "Mensile", d: "lista invii del mese precedente" },
                      { k: "annual", t: "Annuale", d: "lista invii dell'anno (a gennaio)" },
                    ]).map(o => {
                      const sel = p.tsRecapCadences.includes(o.k);
                      return (
                        <button
                          key={o.k}
                          onClick={() => {
                            if (!p.tsEnabled) return;
                            p.setTsRecapCadences(sel ? p.tsRecapCadences.filter(x => x !== o.k) : [...p.tsRecapCadences, o.k]);
                          }}
                          disabled={!p.tsEnabled}
                          style={{
                            flex: "1 1 200px", textAlign: "left", padding: "10px 12px", borderRadius: 10,
                            cursor: p.tsEnabled ? "pointer" : "not-allowed",
                            border: `1.5px solid ${sel ? THEME.teal : THEME.border}`,
                            background: sel ? "rgba(13,148,136,0.08)" : "#fff",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{
                              width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                              border: `1.5px solid ${sel ? THEME.teal : THEME.border}`,
                              background: sel ? THEME.teal : "#fff", color: "#fff",
                              display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800,
                            }}>{sel ? "✓" : ""}</span>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: sel ? THEME.teal : THEME.text }}>{o.t}</div>
                              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 2 }}>{o.d}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: THEME.muted, marginTop: 4 }}>
                    {p.tsRecapCadences.length === 0
                      ? "Nessuna selezione = riepilogo disattivato."
                      : "Email con l'elenco completo degli invii trasmessi nel periodo (paziente, numero, importo, protocollo)."}
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <BtnOutline label="Ricarica" onClick={p.onReload} disabled={p.loadingPractice || p.savingPractice} />
            <BtnPrimary label={p.savingPractice ? "Salvataggio…" : "Salva dati fiscali"} onClick={p.onSave} disabled={p.loadingPractice || p.savingPractice} />
          </div>
        </div>
      )}
    </div>
  );
}
