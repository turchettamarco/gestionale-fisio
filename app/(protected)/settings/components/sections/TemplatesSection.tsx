// app/(protected)/settings/components/sections/TemplatesSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Messaggi WhatsApp": template promemoria calendario +
// 6 messaggi automatici (benvenuto, conferma booking, promemoria,
// pagamento, compleanno, soddisfazione).
// ═══════════════════════════════════════════════════════════════════════

"use client";

import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import { BtnPrimary, BtnOutline } from "../shared/Buttons";
import TemplateEditor, { DEFAULT_PLACEHOLDERS } from "../TemplateEditor";
import type { MessageTemplate } from "../shared/types";

export type TemplatesSectionProps = {
  show: boolean;
  onToggle: () => void;
  loadingTemplates: boolean;
  savingPractice: boolean;
  templates: MessageTemplate[];
  dynamicSignature: string;

  // Template editor (lista promemoria)
  editingId: string | null;
  setEditingId: (v: string | null) => void;
  editName: string; setEditName: (v: string) => void;
  editTemplate: string; setEditTemplate: (v: string) => void;
  newName: string; setNewName: (v: string) => void;
  newTemplate: string; setNewTemplate: (v: string) => void;
  addingNew: boolean; setAddingNew: (v: boolean) => void;
  onSaveTemplate: (id: string) => void;
  onDeleteTemplate: (id: string) => void;
  onSetAsDefault: (id: string) => void;
  onCreateNewTemplate: () => void;

  // 6 messaggi automatici
  welcomeMsg: string; setWelcomeMsg: (v: string) => void;
  bookingConfirmMsg: string; setBookingConfirmMsg: (v: string) => void;
  reminderMsg: string; setReminderMsg: (v: string) => void;
  paymentMsg: string; setPaymentMsg: (v: string) => void;
  birthdayMsg: string; setBirthdayMsg: (v: string) => void;
  satisfactionMsg: string; setSatisfactionMsg: (v: string) => void;

  onSaveAutoMessages: () => void;
};

export default function TemplatesSection(p: TemplatesSectionProps) {
  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>💬 Messaggi WhatsApp</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>Template promemoria · Messaggi automatici · Benvenuto</div>
        </div>
        <span style={{ color: THEME.muted, fontSize: 12, transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 28 }}>

          {/* ─── Template promemoria calendario ────────────────────────────── */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: THEME.text, marginBottom: 14, paddingBottom: 8, borderBottom: `1.5px solid ${THEME.border}` }}>
              📋 Template promemoria calendario
              <div style={{ fontSize: 11, fontWeight: 500, color: THEME.muted, marginTop: 3 }}>Usati dai bottoni WhatsApp nel calendario</div>
            </div>

            <div style={{ padding: "20px" }}>
              {/* Aggiungi nuovo */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: p.addingNew ? 12 : 16 }}>
                <button onClick={() => p.setAddingNew(!p.addingNew)} style={{ padding: "9px 16px", borderRadius: 7, border: `1.5px solid ${THEME.teal}`, background: p.addingNew ? "#fff" : THEME.teal, color: p.addingNew ? THEME.teal : "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  {p.addingNew ? "✕ Annulla" : "+ Nuovo template"}
                </button>
              </div>

              {p.addingNew && (
                <div style={{ padding: 18, borderRadius: 10, border: `1.5px solid ${THEME.teal}`, background: "rgba(13,148,136,0.03)", marginBottom: 16 }}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={labelStyle}>Nome template *</label>
                    <input value={p.newName} onChange={e => p.setNewName(e.target.value)} placeholder="Es. Promemoria standard" style={inputStyle} autoFocus />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <TemplateEditor
                      label="Messaggio *"
                      value={p.newTemplate}
                      onChange={p.setNewTemplate}
                      rows={6}
                      helperText="Clicca i bottoni sopra per inserire i dati del paziente nel messaggio."
                      signature={p.dynamicSignature}
                      galleryKey="reminder"
                      messageKind="promemoria appuntamento"
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <BtnOutline label="Annulla" onClick={() => { p.setNewName(""); p.setNewTemplate(""); p.setAddingNew(false); }} />
                    <BtnPrimary label="Crea template" onClick={p.onCreateNewTemplate} />
                  </div>
                </div>
              )}

              {/* Lista template */}
              {p.loadingTemplates ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: THEME.muted, fontSize: 13 }}>Caricamento template…</div>
              ) : p.templates.length === 0 ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: THEME.muted, fontSize: 13 }}>Nessun template configurato.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {p.templates.map(template => (
                    <div key={template.id} style={{ padding: 16, borderRadius: 10, border: `1.5px solid ${template.is_default ? THEME.teal : THEME.border}`, background: template.is_default ? "rgba(13,148,136,0.03)" : "#fff", position: "relative" }}>

                      {template.is_default && (
                        <div style={{ position: "absolute", top: -1, right: 12, background: THEME.teal, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: "0 0 6px 6px", letterSpacing: 0.5 }}>
                          PREDEFINITO
                        </div>
                      )}

                      {p.editingId === template.id ? (
                        <div>
                          <div style={{ marginBottom: 10 }}>
                            <label style={labelStyle}>Nome</label>
                            <input value={p.editName} onChange={e => p.setEditName(e.target.value)} style={inputStyle} />
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <TemplateEditor
                              label="Messaggio"
                              value={p.editTemplate}
                              onChange={p.setEditTemplate}
                              rows={6}
                              signature={p.dynamicSignature}
                              galleryKey="reminder"
                              messageKind="promemoria appuntamento"
                            />
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <BtnOutline label="Annulla" onClick={() => p.setEditingId(null)} />
                            <BtnPrimary label="Salva modifiche" onClick={() => p.onSaveTemplate(template.id)} />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14, color: THEME.text }}>{template.name}</div>
                              <div style={{ fontSize: 11, color: THEME.muted, marginTop: 2 }}>Creato: {new Date(template.created_at).toLocaleDateString("it-IT")}</div>
                            </div>
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                              <button onClick={() => { p.setEditingId(template.id); p.setEditName(template.name); p.setEditTemplate(template.template); }} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${THEME.blue}`, background: THEME.blue, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Modifica</button>
                              <button onClick={() => p.onSetAsDefault(template.id)} disabled={template.is_default} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: "#fff", color: template.is_default ? THEME.gray : THEME.teal, fontWeight: 700, fontSize: 12, cursor: template.is_default ? "not-allowed" : "pointer", opacity: template.is_default ? 0.5 : 1 }}>Predefinito</button>
                              <button onClick={() => p.onDeleteTemplate(template.id)} disabled={p.templates.length <= 1} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: "#fff", color: p.templates.length <= 1 ? THEME.gray : THEME.red, fontWeight: 700, fontSize: 12, cursor: p.templates.length <= 1 ? "not-allowed" : "pointer", opacity: p.templates.length <= 1 ? 0.5 : 1 }}>Elimina</button>
                            </div>
                          </div>
                          <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: THEME.muted, background: THEME.panelSoft, padding: "10px 14px", borderRadius: 8, border: `1px solid ${THEME.border}`, lineHeight: 1.5 }}>
                            {template.template}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ─── Messaggi automatici ─────────────────────────────────────────── */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: THEME.text, marginBottom: 14, paddingBottom: 8, borderBottom: `1.5px solid ${THEME.border}` }}>
              🤖 Messaggi automatici
              <div style={{ fontSize: 11, fontWeight: 500, color: THEME.muted, marginTop: 3 }}>Benvenuto nuovo paziente · Conferma prenotazione online</div>
            </div>

            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 20 }}>
              <TemplateEditor
                label="Messaggio benvenuto nuovo paziente"
                value={p.welcomeMsg}
                onChange={p.setWelcomeMsg}
                rows={4}
                helperText="Inviato automaticamente al primo appuntamento."
                placeholders={DEFAULT_PLACEHOLDERS.filter(pl => ["saluto", "nome"].includes(pl.key))}
                signature={p.dynamicSignature}
                galleryKey="welcome"
                messageKind="benvenuto nuovo paziente"
              />
              <TemplateEditor
                label="Messaggio conferma prenotazione online"
                value={p.bookingConfirmMsg}
                onChange={p.setBookingConfirmMsg}
                rows={4}
                helperText="Inviato quando confermi una prenotazione arrivata dal sito."
                placeholders={DEFAULT_PLACEHOLDERS.filter(pl => ["saluto", "nome", "data", "ora"].includes(pl.key))}
                signature={p.dynamicSignature}
                galleryKey="booking"
                messageKind="conferma prenotazione"
              />
              <TemplateEditor
                label="Promemoria appuntamento"
                value={p.reminderMsg}
                onChange={p.setReminderMsg}
                rows={4}
                helperText="Inviato come promemoria prima dell'appuntamento."
                placeholders={DEFAULT_PLACEHOLDERS.filter(pl => ["saluto", "nome", "data", "ora", "luogo"].includes(pl.key))}
                signature={p.dynamicSignature}
                galleryKey="reminder"
                messageKind="promemoria appuntamento"
              />
              <TemplateEditor
                label="Sollecito pagamento"
                value={p.paymentMsg}
                onChange={p.setPaymentMsg}
                rows={4}
                helperText="Per pazienti con saldo aperto."
                placeholders={[
                  ...DEFAULT_PLACEHOLDERS.filter(pl => pl.key === "nome"),
                  { key: "importo", label: "Importo €", icon: "💶", example: "120" },
                ]}
                signature={p.dynamicSignature}
                galleryKey="payment"
                messageKind="sollecito pagamento cortese"
              />
              <TemplateEditor
                label="Auguri compleanno"
                value={p.birthdayMsg}
                onChange={p.setBirthdayMsg}
                rows={3}
                helperText="Inviato dal widget compleanni in dashboard."
                placeholders={DEFAULT_PLACEHOLDERS.filter(pl => pl.key === "nome")}
                signature={p.dynamicSignature}
                galleryKey="birthday"
                messageKind="auguri compleanno"
              />
              <TemplateEditor
                label="Questionario soddisfazione"
                value={p.satisfactionMsg}
                onChange={p.setSatisfactionMsg}
                rows={3}
                helperText="Inviato al termine del ciclo di trattamento."
                placeholders={[
                  ...DEFAULT_PLACEHOLDERS.filter(pl => pl.key === "nome"),
                  { key: "link", label: "Link questionario", icon: "🔗", example: "https://gestionale.app/survey/abc123" },
                ]}
                signature={p.dynamicSignature}
                galleryKey="satisfaction"
                messageKind="questionario soddisfazione"
              />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <BtnPrimary label={p.savingPractice ? "Salvataggio…" : "Salva messaggi"} onClick={p.onSaveAutoMessages} disabled={p.savingPractice} />
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
