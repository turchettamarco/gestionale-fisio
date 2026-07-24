// app/(protected)/settings/components/sections/OnlineBookingSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione unica "Prenotazione Online" (mig. 083/084/085).
//
// Raccoglie tutto ciò che riguarda la pagina pubblica di prenotazione, che
// prima era sparso in due card separate:
//   • attivazione della pagina + indirizzo (slug) modificabile
//   • toggle per pubblicare o nascondere i prezzi
//   • listino dei servizi prenotabili, ora anche modificabili
//
// Il listino parte VUOTO per ogni studio: nessun servizio precompilato,
// li configura il cliente. Finché non ce n'è almeno uno la pagina non ha
// nulla da mostrare, quindi lo si dice esplicitamente.
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { useState, useSyncExternalStore } from "react";
import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import type { BookableService } from "../shared/types";

// L'origin esiste solo nel browser. useSyncExternalStore è il modo previsto
// da React per leggerlo: lato server "" (nessun mismatch in idratazione),
// lato client il dominio reale, così il link è giusto anche su anteprime
// Vercel o dominio personalizzato.
const subscribeNoop = () => () => {};
const getOrigin = () => window.location.origin;
const getOriginServer = () => "";

/** Normalizza quello che si digita nel campo indirizzo: minuscole, niente
 *  accenti, spazi e simboli diventano trattini. Stessa regola del vincolo
 *  di formato lato database (mig. 085), così l'utente non può scrivere
 *  qualcosa che poi il salvataggio rifiuta. */
export function slugifyInput(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type OnlineBookingSectionProps = {
  show: boolean;
  onToggle: () => void;

  // Pagina pubblica
  bookingSlug: string;
  setBookingSlug: (v: string) => void;
  bookingPublicEnabled: boolean;
  setBookingPublicEnabled: (v: boolean) => void;
  bookingShowPrices: boolean;
  setBookingShowPrices: (v: boolean) => void;
  savingBooking: boolean;
  bookingError: string | null;
  onSaveBooking: () => void;

  // Listino
  loadingServices: boolean;
  savingSvc: boolean;
  services: BookableService[];
  newSvcName: string; setNewSvcName: (v: string) => void;
  newSvcDuration: string; setNewSvcDuration: (v: string) => void;
  newSvcPrice: string; setNewSvcPrice: (v: string) => void;
  newSvcDescription: string; setNewSvcDescription: (v: string) => void;
  onAdd: () => void;
  onUpdate: (id: string, patch: {
    name: string; duration: number; price: number; description: string | null;
  }) => void;
  onDelete: (id: string) => void;
  /** Chiede all'AI una descrizione a partire dal nome. Restituisce null se fallisce. */
  onGenerateDescription: (name: string, duration: number) => Promise<string | null>;
};

export default function OnlineBookingSection(p: OnlineBookingSectionProps) {
  const [copied, setCopied] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editDescription, setEditDescription] = useState("");
  // id del servizio in generazione, "new" per la riga di aggiunta
  const [generating, setGenerating] = useState<string | null>(null);

  const origin = useSyncExternalStore(subscribeNoop, getOrigin, getOriginServer);
  const link = p.bookingSlug && origin ? `${origin}/prenota/${p.bookingSlug}` : null;

  const slugTooShort = p.bookingSlug.length > 0 && p.bookingSlug.length < 3;

  function copyLink() {
    if (!link) return;
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function startEdit(svc: BookableService) {
    setEditingId(svc.id);
    setEditName(svc.name);
    setEditDuration(String(svc.duration));
    setEditPrice(String(svc.price));
    setEditDescription(svc.description ?? "");
  }

  async function generateFor(target: "new" | "edit") {
    const name = target === "new" ? p.newSvcName : editName;
    const duration = parseInt(target === "new" ? p.newSvcDuration : editDuration) || 60;
    if (name.trim().length < 3) return;
    setGenerating(target === "new" ? "new" : editingId);
    try {
      const text = await p.onGenerateDescription(name.trim(), duration);
      if (text) {
        if (target === "new") p.setNewSvcDescription(text);
        else setEditDescription(text);
      }
    } finally {
      setGenerating(null);
    }
  }

  function confirmEdit() {
    if (!editingId || !editName.trim()) return;
    p.onUpdate(editingId, {
      name: editName.trim(),
      duration: parseInt(editDuration) || 60,
      price: parseFloat(editPrice) || 0,
      description: editDescription.trim() || null,
    });
    setEditingId(null);
  }

  const subtitle = !p.bookingPublicEnabled
    ? "Pagina non attiva"
    : p.services.length === 0
      ? "Attiva, ma nessun servizio configurato"
      : `Attiva · ${p.services.length} ${p.services.length === 1 ? "servizio" : "servizi"}`;

  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Prenotazione Online</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>{subtitle}</div>
        </div>
        <span style={{
          color: THEME.muted, fontSize: 12,
          transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s",
        }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: "20px" }}>
          <p style={{ fontSize: 13, color: THEME.textSoft, marginTop: 0, marginBottom: 18, lineHeight: 1.5 }}>
            Una pagina di prenotazione già pronta, ospitata da FisioHub: non
            serve avere un sito. Condividi il link su WhatsApp, nella bio
            Instagram o su Google Business e i pazienti scelgono servizio,
            data e orario tra quelli liberi.
          </p>

          {/* ── Attivazione ────────────────────────────────────────── */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={p.bookingPublicEnabled}
              onChange={e => p.setBookingPublicEnabled(e.target.checked)}
              style={{ width: 18, height: 18, cursor: "pointer" }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: THEME.text }}>
              Pagina raggiungibile pubblicamente
            </span>
          </label>

          {/* ── Prezzi ─────────────────────────────────────────────── */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={p.bookingShowPrices}
              onChange={e => p.setBookingShowPrices(e.target.checked)}
              style={{ width: 18, height: 18, cursor: "pointer" }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: THEME.text }}>
              Mostra i prezzi sulla pagina
              <span style={{ display: "block", fontWeight: 400, fontSize: 11.5, color: THEME.muted, marginTop: 1 }}>
                Se disattivo, il paziente vede solo nome e durata del servizio
              </span>
            </span>
          </label>

          {/* ── Indirizzo (slug) ───────────────────────────────────── */}
          <label style={labelStyle}>Indirizzo della pagina</label>
          <div style={{
            display: "flex", alignItems: "center", gap: 0,
            border: `1px solid ${THEME.border}`, borderRadius: 8, overflow: "hidden",
          }}>
            <span style={{
              padding: "10px 0 10px 12px", fontSize: 13, color: THEME.muted,
              fontFamily: "monospace", whiteSpace: "nowrap", background: THEME.panelSoft,
            }}>
              {(origin || "myfisiohub.app").replace(/^https?:\/\//, "")}/prenota/
            </span>
            <input
              value={p.bookingSlug}
              onChange={e => p.setBookingSlug(slugifyInput(e.target.value))}
              placeholder="nome-studio"
              style={{
                ...inputStyle, border: "none", borderRadius: 0, flex: 1,
                fontFamily: "monospace", minWidth: 80,
              }}
            />
          </div>
          <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 5 }}>
            Minuscole, numeri e trattini. Cambiandolo, il link precedente
            smette di funzionare: aggiornalo dove l&apos;hai già condiviso.
          </div>
          {slugTooShort && (
            <div style={{ fontSize: 12, color: THEME.red, marginTop: 5 }}>
              Servono almeno 3 caratteri.
            </div>
          )}
          {p.bookingError && (
            <div style={{ fontSize: 12, color: THEME.red, marginTop: 5 }}>{p.bookingError}</div>
          )}

          {/* ── Link condivisibile ─────────────────────────────────── */}
          {link && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 14px", borderRadius: 8,
              border: `1px solid ${THEME.border}`, background: THEME.panelSoft,
              marginTop: 14,
            }}>
              <span style={{
                flex: 1, fontSize: 13, fontFamily: "monospace", color: THEME.text,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {link}
              </span>
              <button onClick={copyLink} style={{
                padding: "6px 12px", borderRadius: 6, border: "none",
                background: copied ? THEME.green : THEME.teal, color: "#fff",
                fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
              }}>
                {copied ? "Copiato ✓" : "Copia"}
              </button>
              {p.bookingPublicEnabled && (
                <a href={link} target="_blank" rel="noopener noreferrer" style={{
                  padding: "6px 12px", borderRadius: 6, border: `1px solid ${THEME.border}`,
                  color: THEME.text, fontWeight: 700, fontSize: 12,
                  textDecoration: "none", whiteSpace: "nowrap",
                }}>
                  Apri ↗
                </a>
              )}
            </div>
          )}

          <button
            onClick={p.onSaveBooking}
            disabled={p.savingBooking || slugTooShort || !p.bookingSlug}
            style={{
              marginTop: 14, padding: "9px 18px", borderRadius: 7, border: "none",
              background: THEME.teal, color: "#fff", fontWeight: 700, fontSize: 13,
              cursor: "pointer", opacity: (p.savingBooking || slugTooShort || !p.bookingSlug) ? 0.5 : 1,
            }}
          >
            {p.savingBooking ? "Salvataggio…" : "Salva impostazioni pagina"}
          </button>

          {/* ── Listino ────────────────────────────────────────────── */}
          <div style={{
            marginTop: 26, paddingTop: 20, borderTop: `1px solid ${THEME.border}`,
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: THEME.text, marginBottom: 4 }}>
              Servizi prenotabili
            </div>
            <div style={{ fontSize: 12.5, color: THEME.muted, marginBottom: 16, lineHeight: 1.5 }}>
              Sono le voci che il paziente vede e può scegliere sulla pagina.
              La durata determina gli slot proposti in agenda.
            </div>

            {/* Aggiunta */}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
              <div style={{ flex: "2 1 160px" }}>
                <label style={labelStyle}>Nome</label>
                <input value={p.newSvcName} onChange={e => p.setNewSvcName(e.target.value)}
                  placeholder="Es. Prima visita" style={inputStyle} />
              </div>
              <div style={{ flex: "1 1 80px" }}>
                <label style={labelStyle}>Minuti</label>
                <input value={p.newSvcDuration} onChange={e => p.setNewSvcDuration(e.target.value)}
                  inputMode="numeric" style={inputStyle} />
              </div>
              <div style={{ flex: "1 1 80px" }}>
                <label style={labelStyle}>Prezzo €</label>
                <input value={p.newSvcPrice} onChange={e => p.setNewSvcPrice(e.target.value)}
                  inputMode="decimal" style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Descrizione (mostrata sotto il nome)</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  value={p.newSvcDescription}
                  onChange={e => p.setNewSvcDescription(e.target.value)}
                  placeholder="Es. Valutazione clinica e piano terapeutico"
                  maxLength={70}
                  style={{ ...inputStyle, flex: "1 1 220px" }}
                />
                <button
                  onClick={() => void generateFor("new")}
                  disabled={generating === "new" || p.newSvcName.trim().length < 3}
                  title={p.newSvcName.trim().length < 3 ? "Scrivi prima il nome del servizio" : "Proponi una descrizione dal nome"}
                  style={{
                    padding: "9px 14px", borderRadius: 7,
                    border: `1px solid ${THEME.border}`, background: "#fff",
                    color: THEME.text, fontWeight: 700, fontSize: 12.5, cursor: "pointer",
                    whiteSpace: "nowrap",
                    opacity: (generating === "new" || p.newSvcName.trim().length < 3) ? 0.5 : 1,
                  }}
                >
                  {generating === "new" ? "Scrivo…" : "✨ Scrivila tu"}
                </button>
                <button onClick={p.onAdd} disabled={p.savingSvc || !p.newSvcName.trim()} style={{
                  padding: "9px 16px", borderRadius: 7, border: "none", background: THEME.teal,
                  color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
                  whiteSpace: "nowrap",
                  opacity: (p.savingSvc || !p.newSvcName.trim()) ? 0.5 : 1,
                }}>
                  Aggiungi
                </button>
              </div>
            </div>

            {/* Elenco */}
            {p.loadingServices ? (
              <div style={{ fontSize: 13, color: THEME.muted }}>Caricamento…</div>
            ) : p.services.length === 0 ? (
              <div style={{
                padding: "16px 14px", borderRadius: 8, background: THEME.panelSoft,
                border: `1px solid ${THEME.border}`, fontSize: 12.5, color: THEME.muted, lineHeight: 1.5,
              }}>
                Nessun servizio configurato. Finché non ne aggiungi almeno uno
                la pagina di prenotazione non ha nulla da proporre ai pazienti.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {p.services.map(svc => (
                  <div key={svc.id} style={{
                    padding: "10px 14px", borderRadius: 8,
                    border: `1px solid ${THEME.border}`, background: "#fff",
                  }}>
                    {editingId === svc.id ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                        <div style={{ flex: "2 1 140px" }}>
                          <label style={labelStyle}>Nome</label>
                          <input value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} />
                        </div>
                        <div style={{ flex: "1 1 70px" }}>
                          <label style={labelStyle}>Minuti</label>
                          <input value={editDuration} onChange={e => setEditDuration(e.target.value)}
                            inputMode="numeric" style={inputStyle} />
                        </div>
                        <div style={{ flex: "1 1 70px" }}>
                          <label style={labelStyle}>Prezzo €</label>
                          <input value={editPrice} onChange={e => setEditPrice(e.target.value)}
                            inputMode="decimal" style={inputStyle} />
                        </div>
                        <div style={{ flex: "1 1 100%" }}>
                          <label style={labelStyle}>Descrizione</label>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <input
                              value={editDescription}
                              onChange={e => setEditDescription(e.target.value)}
                              placeholder="Es. Trattamento individuale"
                              maxLength={70}
                              style={{ ...inputStyle, flex: "1 1 200px" }}
                            />
                            <button
                              onClick={() => void generateFor("edit")}
                              disabled={generating === editingId || editName.trim().length < 3}
                              style={{
                                padding: "8px 12px", borderRadius: 6,
                                border: `1px solid ${THEME.border}`, background: "#fff",
                                color: THEME.text, fontWeight: 700, fontSize: 12, cursor: "pointer",
                                whiteSpace: "nowrap",
                                opacity: (generating === editingId || editName.trim().length < 3) ? 0.5 : 1,
                              }}
                            >
                              {generating === editingId ? "Scrivo…" : "✨ Scrivila tu"}
                            </button>
                          </div>
                        </div>
                        <button onClick={confirmEdit} disabled={!editName.trim()} style={{
                          padding: "8px 14px", borderRadius: 6, border: "none", background: THEME.teal,
                          color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer",
                          opacity: editName.trim() ? 1 : 0.5,
                        }}>
                          Salva
                        </button>
                        <button onClick={() => setEditingId(null)} style={{
                          padding: "8px 14px", borderRadius: 6, border: `1px solid ${THEME.border}`,
                          background: "#fff", color: THEME.muted, fontWeight: 700, fontSize: 12, cursor: "pointer",
                        }}>
                          Annulla
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13.5, color: THEME.text }}>{svc.name}</div>
                          {svc.description && (
                            <div style={{ fontSize: 12, color: THEME.textSoft, marginTop: 1 }}>{svc.description}</div>
                          )}
                          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 1 }}>
                            {svc.duration} min
                            {p.bookingShowPrices
                              ? ` · €${svc.price}`
                              : ` · €${svc.price} (non pubblicato)`}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button onClick={() => startEdit(svc)} style={{
                            padding: "5px 12px", borderRadius: 6, border: `1px solid ${THEME.border}`,
                            background: "#fff", color: THEME.text, cursor: "pointer",
                            fontWeight: 700, fontSize: 11.5,
                          }}>
                            Modifica
                          </button>
                          <button onClick={() => p.onDelete(svc.id)} style={{
                            padding: "5px 10px", borderRadius: 6,
                            border: "1px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.05)",
                            color: THEME.red, cursor: "pointer", fontWeight: 700, fontSize: 11.5,
                          }}>
                            ✕
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
