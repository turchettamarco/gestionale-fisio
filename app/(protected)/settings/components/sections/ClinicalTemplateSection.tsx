"use client";

// ═══════════════════════════════════════════════════════════════════════
// app/(protected)/settings/components/sections/ClinicalTemplateSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Costruzione della scheda clinica dello studio (mig. 095): quali campi,
// di che tipo, in che ordine.
//
// Chi non vuole partire da zero carica un modello e lo modifica. I modelli
// sono volutamente corti: una scheda lunga è il problema da cui si scappa.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { THEME, cardStyle, sectionHead, inputStyle, labelStyle } from "../shared/theme";
import {
  type ClinicalField, type ClinicalFieldType, type ClinicalTemplate,
  FIELD_TYPE_LABELS, TYPES_WITH_OPTIONS, STARTER_TEMPLATES,
} from "@/src/lib/clinical/customFields";

export type ClinicalTemplateSectionProps = {
  show: boolean;
  onToggle: () => void;
  templates: ClinicalTemplate[];
  activeTemplateId: string | null;
  onSelectTemplate: (id: string) => void;
  onCreateTemplate: (name: string) => void;
  onRenameTemplate: (id: string, name: string) => void;
  onDeleteTemplate: (id: string) => void;
  archivedTemplates: ClinicalTemplate[];
  onRestoreTemplate: (id: string) => void;
  onSetDefaultTemplate: (id: string) => void;
  fields: ClinicalField[];
  loading: boolean;
  saving: boolean;
  onAdd: (f: { label: string; hint: string | null; type: ClinicalFieldType; options: string[] }) => void;
  onUpdate: (id: string, patch: Partial<ClinicalField>) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onRemove: (id: string) => void;
  /** Carica un modello di partenza dentro una NUOVA scheda col nome indicato. */
  onLoadTemplate: (starterId: string, name: string) => void;
};

export default function ClinicalTemplateSection(p: ClinicalTemplateSectionProps) {
  const [label, setLabel] = useState("");
  const [hint, setHint] = useState("");
  const [type, setType] = useState<ClinicalFieldType>("textarea");
  const [optionsText, setOptionsText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editHint, setEditHint] = useState("");
  const [editOptions, setEditOptions] = useState("");
  const [newTplName, setNewTplName] = useState("");
  const [renamingTpl, setRenamingTpl] = useState(false);
  const [tplName, setTplName] = useState("");

  const activeTpl = p.templates.find(t => t.id === p.activeTemplateId) ?? null;

  const needsOptions = TYPES_WITH_OPTIONS.includes(type);

  function add() {
    if (!label.trim()) return;
    p.onAdd({
      label: label.trim(),
      hint: hint.trim() || null,
      type,
      options: needsOptions
        ? optionsText.split(",").map(o => o.trim()).filter(Boolean)
        : [],
    });
    setLabel(""); setHint(""); setOptionsText("");
  }

  function startEdit(f: ClinicalField) {
    setEditingId(f.id);
    setEditLabel(f.label);
    setEditHint(f.hint ?? "");
    setEditOptions((f.options ?? []).join(", "));
  }

  function confirmEdit(f: ClinicalField) {
    if (!editLabel.trim()) return;
    p.onUpdate(f.id, {
      label: editLabel.trim(),
      hint: editHint.trim() || null,
      options: TYPES_WITH_OPTIONS.includes(f.type)
        ? editOptions.split(",").map(o => o.trim()).filter(Boolean)
        : [],
    });
    setEditingId(null);
  }

  return (
    <div style={cardStyle}>
      <div style={sectionHead} onClick={p.onToggle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: THEME.text }}>Scheda clinica</div>
          <div style={{ fontSize: 12, color: THEME.muted, marginTop: 2 }}>
            {p.templates.length === 0
              ? "Nessuna scheda: la cartella usa i campi liberi"
              : `${p.templates.length} ${p.templates.length === 1 ? "scheda" : "schede"} · ${p.fields.length} ${p.fields.length === 1 ? "campo" : "campi"} in questa`}
          </div>
        </div>
        <span style={{
          color: THEME.muted, fontSize: 12,
          transform: p.show ? "rotate(180deg)" : "none", transition: "transform 0.2s",
        }}>▾</span>
      </div>

      {p.show && (
        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 13, color: THEME.textSoft, marginTop: 0, marginBottom: 18, lineHeight: 1.5 }}>
            Costruisci la scheda come lavori tu: i campi che ti servono, nell&apos;ordine
            che vuoi. Compariranno nella cartella di ogni paziente, tutti insieme su
            una schermata sola. Se non definisci nulla, la cartella continua a
            funzionare con i campi liberi di sempre.
          </p>

          {/* ── Le schede dello studio ────────────────────────────── */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.text, marginBottom: 8 }}>
              Le tue schede
            </div>

            {p.templates.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {p.templates.map(t => {
                  const on = t.id === p.activeTemplateId;
                  return (
                    <button key={t.id} onClick={() => p.onSelectTemplate(t.id)}
                      style={{
                        padding: "7px 14px", borderRadius: 999, cursor: "pointer",
                        border: `1px solid ${on ? THEME.teal : THEME.border}`,
                        background: on ? "rgba(13,148,136,0.08)" : "#fff",
                        color: on ? THEME.teal : THEME.textSoft,
                        fontWeight: 700, fontSize: 12.5,
                      }}>
                      {t.name}{t.is_default ? " · predefinita" : ""}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Azioni sulla scheda selezionata */}
            {activeTpl && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
                {renamingTpl ? (
                  <>
                    <input value={tplName} onChange={e => setTplName(e.target.value)}
                      style={{ ...inputStyle, width: 200 }} placeholder="Nome della scheda" />
                    <button onClick={() => { if (tplName.trim()) { p.onRenameTemplate(activeTpl.id, tplName.trim()); setRenamingTpl(false); } }}
                      style={miniAction(THEME.teal, "#fff")}>Salva nome</button>
                    <button onClick={() => setRenamingTpl(false)} style={miniAction("#fff", THEME.muted)}>Annulla</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setTplName(activeTpl.name); setRenamingTpl(true); }}
                      style={miniAction("#fff", THEME.text)}>Rinomina</button>
                    {!activeTpl.is_default && (
                      <button onClick={() => p.onSetDefaultTemplate(activeTpl.id)}
                        title="I nuovi pazienti useranno questa scheda"
                        style={miniAction("#fff", THEME.text)}>Rendi predefinita</button>
                    )}
                    <button onClick={() => p.onDeleteTemplate(activeTpl.id)}
                      title="La scheda viene archiviata: i dati già raccolti sui pazienti restano leggibili"
                      style={miniAction("rgba(220,38,38,0.05)", THEME.red)}>Archivia scheda</button>
                  </>
                )}
              </div>
            )}

            {/* Schede archiviate: ripristinabili */}
            {p.archivedTemplates.length > 0 && (
              <div style={{ marginBottom: 10, fontSize: 11.5, color: THEME.muted }}>
                Archiviate:{" "}
                {p.archivedTemplates.map((t, i) => (
                  <span key={t.id}>
                    {i > 0 && " · "}
                    {t.name}{" "}
                    <button onClick={() => p.onRestoreTemplate(t.id)}
                      style={{
                        border: "none", background: "none", padding: 0, cursor: "pointer",
                        color: THEME.teal, fontWeight: 700, fontSize: 11.5, textDecoration: "underline",
                      }}>ripristina</button>
                  </span>
                ))}
              </div>
            )}

            {/* Nuova scheda vuota */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <input value={newTplName} onChange={e => setNewTplName(e.target.value)}
                placeholder="Nome nuova scheda (es. Osteopatia)"
                style={{ ...inputStyle, flex: "1 1 200px" }} />
              <button onClick={() => { if (newTplName.trim()) { p.onCreateTemplate(newTplName.trim()); setNewTplName(""); } }}
                disabled={!newTplName.trim() || p.saving}
                style={{
                  padding: "9px 14px", borderRadius: 7, border: "none", background: THEME.teal,
                  color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer",
                  whiteSpace: "nowrap", opacity: (!newTplName.trim() || p.saving) ? 0.5 : 1,
                }}>
                Crea scheda vuota
              </button>
            </div>

            {/* Modelli di partenza: sempre disponibili, creano una scheda nuova */}
            <div style={{
              padding: "12px 14px", borderRadius: 8, background: THEME.panelSoft,
              border: `1px solid ${THEME.border}`,
            }}>
              <div style={{ fontSize: 11.5, color: THEME.muted, marginBottom: 8, lineHeight: 1.45 }}>
                Oppure parti da un modello: ne crea una <strong>nuova</strong> scheda,
                senza toccare quelle che hai già.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {STARTER_TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => p.onLoadTemplate(t.id, t.name)}
                    title={t.description} disabled={p.saving}
                    style={{
                      padding: "8px 14px", borderRadius: 7, cursor: "pointer",
                      border: `1px solid ${THEME.border}`, background: "#fff",
                      color: THEME.text, fontWeight: 700, fontSize: 12,
                    }}>
                    + {t.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: THEME.border, marginBottom: 18 }} />

          {/* Aggiunta campo */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 8 }}>
            <div style={{ flex: "2 1 180px" }}>
              <label style={labelStyle}>Nome del campo</label>
              <input value={label} onChange={e => setLabel(e.target.value)}
                placeholder="Es. Cosa ho trovato" style={inputStyle} />
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <label style={labelStyle}>Tipo</label>
              <select value={type} onChange={e => setType(e.target.value as ClinicalFieldType)} style={inputStyle}>
                {(Object.keys(FIELD_TYPE_LABELS) as ClinicalFieldType[]).map(t => (
                  <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
            <div style={{ flex: "2 1 200px" }}>
              <label style={labelStyle}>Aiuto sotto il campo (facoltativo)</label>
              <input value={hint} onChange={e => setHint(e.target.value)}
                placeholder="Es. Osservazione, palpazione, test" style={inputStyle} />
            </div>
            {needsOptions && (
              <div style={{ flex: "2 1 200px" }}>
                <label style={labelStyle}>Scelte, separate da virgola</label>
                <input value={optionsText} onChange={e => setOptionsText(e.target.value)}
                  placeholder="Lieve, Moderato, Severo" style={inputStyle} />
              </div>
            )}
            <button onClick={add} disabled={!label.trim() || p.saving}
              style={{
                padding: "9px 16px", borderRadius: 7, border: "none", background: THEME.teal,
                color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
                whiteSpace: "nowrap", opacity: (!label.trim() || p.saving) ? 0.5 : 1,
              }}>
              Aggiungi campo
            </button>
          </div>

          {/* Elenco campi */}
          {p.loading ? (
            <div style={{ fontSize: 13, color: THEME.muted }}>Caricamento…</div>
          ) : p.fields.length === 0 ? (
            <div style={{
              padding: "16px 14px", borderRadius: 8, background: THEME.panelSoft,
              border: `1px solid ${THEME.border}`, fontSize: 12.5, color: THEME.muted, lineHeight: 1.5,
            }}>
              Nessun campo definito.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {p.fields.map((f, i) => (
                <div key={f.id} style={{
                  padding: "10px 14px", borderRadius: 8,
                  border: `1px solid ${THEME.border}`, background: "#fff",
                }}>
                  {editingId === f.id ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div style={{ flex: "2 1 160px" }}>
                        <label style={labelStyle}>Nome</label>
                        <input value={editLabel} onChange={e => setEditLabel(e.target.value)} style={inputStyle} />
                      </div>
                      <div style={{ flex: "2 1 160px" }}>
                        <label style={labelStyle}>Aiuto</label>
                        <input value={editHint} onChange={e => setEditHint(e.target.value)} style={inputStyle} />
                      </div>
                      {TYPES_WITH_OPTIONS.includes(f.type) && (
                        <div style={{ flex: "2 1 160px" }}>
                          <label style={labelStyle}>Scelte</label>
                          <input value={editOptions} onChange={e => setEditOptions(e.target.value)} style={inputStyle} />
                        </div>
                      )}
                      <button onClick={() => confirmEdit(f)} disabled={!editLabel.trim()}
                        style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: THEME.teal, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        Salva
                      </button>
                      <button onClick={() => setEditingId(null)}
                        style={{ padding: "8px 14px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.muted, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        Annulla
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: THEME.text }}>{f.label}</div>
                        <div style={{ fontSize: 11.5, color: THEME.muted, marginTop: 1 }}>
                          {FIELD_TYPE_LABELS[f.type]}
                          {f.options.length > 0 && ` · ${f.options.join(", ")}`}
                          {f.hint && ` · ${f.hint}`}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                        <button onClick={() => p.onMove(f.id, "up")} disabled={i === 0}
                          title="Sposta su"
                          style={miniBtn(i === 0)}>↑</button>
                        <button onClick={() => p.onMove(f.id, "down")} disabled={i === p.fields.length - 1}
                          title="Sposta giù"
                          style={miniBtn(i === p.fields.length - 1)}>↓</button>
                        <button onClick={() => startEdit(f)}
                          style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${THEME.border}`, background: "#fff", color: THEME.text, fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}>
                          Modifica
                        </button>
                        <button onClick={() => p.onRemove(f.id)}
                          title="Rimuove il campo dalla scheda. I valori già inseriti sui pazienti restano salvati."
                          style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.05)", color: THEME.red, fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 11, color: THEME.muted, marginTop: 12, lineHeight: 1.5 }}>
            Togliendo un campo, i valori già raccolti sui pazienti non vengono
            cancellati: restano nel database e tornano visibili se lo riattivi.
          </div>
        </div>
      )}
    </div>
  );
}

function miniAction(bg: string, color: string): React.CSSProperties {
  return {
    padding: "7px 13px", borderRadius: 7, cursor: "pointer",
    border: `1px solid ${bg === "#fff" ? THEME.border : "transparent"}`,
    background: bg, color, fontWeight: 700, fontSize: 12,
  };
}

function miniBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "5px 9px", borderRadius: 6, border: `1px solid ${THEME.border}`,
    background: "#fff", color: disabled ? "#cbd5e1" : THEME.muted,
    fontWeight: 800, fontSize: 11.5, cursor: disabled ? "default" : "pointer",
  };
}
