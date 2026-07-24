"use client";

// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/clinical/CustomClinicalFields.tsx
// ═══════════════════════════════════════════════════════════════════════
// La scheda clinica costruita dallo studio (mig. 095).
//
// Tutti i campi sono visibili insieme, uno sotto l'altro: niente
// fisarmoniche, niente modali, niente "apri, compila, chiudi, passa al
// prossimo". Si scorre una volta e si salva alla fine, con un solo
// pulsante.
//
// Se lo studio non ha definito nessun campo il componente non rende
// nulla: chi non usa la funzione non se ne accorge.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import {
  type ClinicalField, type ClinicalTemplate, emptyValueFor, isFilled,
} from "@/src/lib/clinical/customFields";

const T = {
  text: "#0f172a", soft: "#475569", muted: "#64748b",
  border: "#e2e8f0", line: "#cbd5e1",
  teal: "#0d9488", green: "#16a34a", amber: "#d97706",
};

export type CustomClinicalFieldsProps = {
  patientId: string;
  studioId: string | null;
};

export default function CustomClinicalFields({ patientId, studioId }: CustomClinicalFieldsProps) {
  const [templates, setTemplates] = useState<ClinicalTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [fields, setFields] = useState<ClinicalField[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const saltaPrimoRender = useRef(true);

  // Tutti i campi mai definiti dallo studio, comprese schede archiviate e
  // campi disattivati: servono a rileggere le risposte già raccolte, che
  // altrimenti resterebbero coppie "id → valore" senza etichetta.
  const [allFields, setAllFields] = useState<ClinicalField[]>([]);
  const [allTemplates, setAllTemplates] = useState<ClinicalTemplate[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const load = useCallback(async () => {
    if (!patientId || !studioId) { setLoading(false); return; }
    setLoading(true);
    const [templatesRes, patientRes] = await Promise.all([
      supabase.from("studio_clinical_templates")
        .select("id, name, is_default, sort_order, is_active")
        .eq("studio_id", studioId)
        .order("sort_order", { ascending: true }),
      supabase.from("patients")
        .select("custom_clinical, clinical_template_id")
        .eq("id", patientId).maybeSingle(),
    ]);

    const tutte = (templatesRes.data as ClinicalTemplate[]) ?? [];
    setAllTemplates(tutte);
    // Nel menu solo le schede attive
    const tpls = tutte.filter(t => t.is_active !== false);
    setTemplates(tpls);

    // Catalogo completo dei campi, per rileggere anche l'archivio
    const { data: tuttiCampi } = await supabase
      .from("studio_clinical_fields")
      .select("id, template_id, label, hint, type, options, section, sort_order, is_active")
      .eq("studio_id", studioId)
      .order("sort_order", { ascending: true });
    setAllFields((tuttiCampi as ClinicalField[]) ?? []);

    // Scheda del paziente; se non ne ha una, quella predefinita dello
    // studio; in mancanza, la prima disponibile.
    const scelto =
      (patientRes.data?.clinical_template_id as string | null) ??
      tpls.find(t => t.is_default)?.id ??
      tpls[0]?.id ?? null;
    setTemplateId(scelto);

    const fieldsRes = scelto
      ? await supabase.from("studio_clinical_fields")
          .select("id, template_id, label, hint, type, options, section, sort_order, is_active")
          .eq("template_id", scelto).eq("is_active", true)
          .order("sort_order", { ascending: true })
      : { data: [] };

    setFields((fieldsRes.data as ClinicalField[]) ?? []);
    setValues((patientRes.data?.custom_clinical as Record<string, unknown>) ?? {});
    setDirty(false);
    setLoading(false);
    saltaPrimoRender.current = true;
  }, [patientId, studioId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function changeTemplate(next: string) {
    if (!next || next === templateId) return;
    setTemplateId(next);
    // La scelta resta sul paziente: riaprendo la cartella si ritrova la
    // stessa scheda. I valori già inseriti sull'altra NON si perdono,
    // perché sono indicizzati per id del campo.
    await supabase.from("patients").update({ clinical_template_id: next }).eq("id", patientId);
    const { data } = await supabase.from("studio_clinical_fields")
      .select("id, template_id, label, hint, type, options, section, sort_order, is_active")
      .eq("template_id", next).eq("is_active", true)
      .order("sort_order", { ascending: true });
    setFields((data as ClinicalField[]) ?? []);
  }

  function set(fieldId: string, v: unknown) {
    saltaPrimoRender.current = false;
    setValues(prev => ({ ...prev, [fieldId]: v }));
    setDirty(true);
    setSaved(false);
  }

  async function save() {
    if (!patientId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("patients").update({ custom_clinical: values }).eq("id", patientId);
      if (error) { alert("Errore salvataggio: " + error.message); return; }
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const compilati = useMemo(
    () => fields.filter(f => isFilled(f.type, values[f.id])).length,
    [fields, values]
  );

  // Valori che non appartengono ai campi della scheda in uso: vengono da
  // un'altra scheda o da una archiviata. Si mostrano in sola lettura, così
  // nulla di ciò che è stato scritto sul paziente va perso di vista.
  const idsInUso = new Set(fields.map(f => f.id));
  const archivio = allFields
    .filter(f => !idsInUso.has(f.id))
    .filter(f => isFilled(f.type, values[f.id]))
    .map(f => ({
      campo: f,
      scheda: allTemplates.find(t => t.id === f.template_id)?.name ?? "Scheda rimossa",
      archiviata: allTemplates.find(t => t.id === f.template_id)?.is_active === false,
    }));

  if (loading || (templates.length === 0 && archivio.length === 0)) return null;

  // Raggruppa per sezione mantenendo l'ordine di definizione
  const sezioni: Array<{ nome: string | null; campi: ClinicalField[] }> = [];
  for (const f of fields) {
    const nome = f.section?.trim() || null;
    const ultima = sezioni[sezioni.length - 1];
    if (ultima && ultima.nome === nome) ultima.campi.push(f);
    else sezioni.push({ nome, campi: [f] });
  }

  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, background: "#fff", marginBottom: 18 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, padding: "14px 16px", borderBottom: `1px solid ${T.border}`, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Scheda clinica</div>
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>
            {compilati}/{fields.length} compilati
            {dirty && <span style={{ color: T.amber, fontWeight: 700 }}> · modifiche non salvate</span>}
            {!dirty && saved && <span style={{ color: T.green, fontWeight: 700 }}> · salvato ✓</span>}
          </div>
        </div>
        {templates.length > 1 && (
          <select
            value={templateId ?? ""}
            onChange={e => void changeTemplate(e.target.value)}
            title="Cambia scheda per questo paziente"
            style={{
              padding: "7px 10px", borderRadius: 7, border: `1px solid ${T.line}`,
              fontSize: 12.5, color: T.text, background: "#fff",
              fontFamily: "inherit", cursor: "pointer", marginLeft: "auto", marginRight: 8,
            }}
          >
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => void save()}
          disabled={!dirty || saving}
          style={{
            padding: "8px 18px", borderRadius: 7, border: "none",
            background: dirty ? T.teal : "#e2e8f0", color: dirty ? "#fff" : "#94a3b8",
            fontWeight: 700, fontSize: 12.5, cursor: dirty ? "pointer" : "default",
          }}
        >
          {saving ? "Salvo…" : "Salva scheda"}
        </button>
      </div>

      <div style={{ padding: "16px" }}>
        {fields.length === 0 && (
          <div style={{ fontSize: 12.5, color: T.muted, fontStyle: "italic" }}>
            Questa scheda non ha ancora campi. Li aggiungi da Impostazioni →
            Area Paziente → Scheda clinica.
          </div>
        )}
        {sezioni.map((sez, si) => (
          <div key={si} style={{ marginBottom: si === sezioni.length - 1 ? 0 : 18 }}>
            {sez.nome && (
              <div style={{
                fontSize: 10.5, fontWeight: 800, color: T.muted, letterSpacing: 0.5,
                textTransform: "uppercase", marginBottom: 10,
                paddingBottom: 5, borderBottom: `1px solid ${T.border}`,
              }}>{sez.nome}</div>
            )}

            {sez.campi.map(f => {
              const v = values[f.id] ?? emptyValueFor(f.type);
              return (
                <div key={f.id} style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: T.text, marginBottom: f.hint ? 1 : 5 }}>
                    {f.label}
                  </label>
                  {f.hint && (
                    <div style={{ fontSize: 11, color: T.muted, marginBottom: 5 }}>{f.hint}</div>
                  )}

                  {f.type === "textarea" && (
                    <textarea rows={3} value={String(v)} onChange={e => set(f.id, e.target.value)} style={campo} />
                  )}
                  {f.type === "text" && (
                    <input value={String(v)} onChange={e => set(f.id, e.target.value)} style={campo} />
                  )}
                  {f.type === "date" && (
                    <input type="date" value={String(v)} onChange={e => set(f.id, e.target.value)} style={campo} />
                  )}
                  {f.type === "checkbox" && (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={v === true} onChange={e => set(f.id, e.target.checked)}
                        style={{ width: 18, height: 18, cursor: "pointer" }} />
                      <span style={{ fontSize: 12.5, color: T.soft }}>{v === true ? "Sì" : "No"}</span>
                    </label>
                  )}
                  {f.type === "select" && (
                    <select value={String(v)} onChange={e => set(f.id, e.target.value)} style={campo}>
                      <option value="">—</option>
                      {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                  {f.type === "multiselect" && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {f.options.map(o => {
                        const arr = Array.isArray(v) ? (v as string[]) : [];
                        const on = arr.includes(o);
                        return (
                          <button key={o}
                            onClick={() => set(f.id, on ? arr.filter(x => x !== o) : [...arr, o])}
                            style={{
                              padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                              border: `1px solid ${on ? T.teal : T.line}`,
                              background: on ? "rgba(13,148,136,0.08)" : "#fff",
                              color: on ? T.teal : T.soft, fontWeight: 700, fontSize: 12,
                            }}>{o}</button>
                        );
                      })}
                    </div>
                  )}
                  {f.type === "scale" && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(11,1fr)", gap: 3 }}>
                      {Array.from({ length: 11 }, (_, i) => i).map(n => {
                        const on = v === n;
                        return (
                          <button key={n} onClick={() => set(f.id, n)} style={{
                            padding: "7px 0", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 800,
                            border: `1px solid ${on ? T.teal : T.line}`,
                            background: on ? T.teal : "#fff", color: on ? "#fff" : T.soft,
                          }}>{n}</button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* Raccolto su altre schede o su schede archiviate: sola lettura.
            È materiale di cartella clinica, non può sparire perché la
            scheda che lo conteneva non è più in uso. */}
        {archivio.length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
            <button
              onClick={() => setArchiveOpen(o => !o)}
              style={{
                width: "100%", textAlign: "left", cursor: "pointer",
                background: "none", border: "none", padding: 0,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 700, color: T.soft }}>
                Raccolto su altre schede
                <span style={{ fontWeight: 500, color: T.muted }}> · {archivio.length} {archivio.length === 1 ? "voce" : "voci"}</span>
              </span>
              <span style={{
                color: T.muted, fontSize: 12,
                transform: archiveOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s",
              }}>▾</span>
            </button>

            {archiveOpen && (
              <div style={{ marginTop: 12 }}>
                {archivio.map(({ campo, scheda, archiviata }) => {
                  const v = values[campo.id];
                  const testo = campo.type === "checkbox" ? "Sì"
                    : campo.type === "scale" ? `${v}/10`
                    : Array.isArray(v) ? (v as string[]).join(", ")
                    : String(v);
                  return (
                    <div key={campo.id} style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: T.muted }}>
                        {campo.label}
                        <span style={{ color: "#94a3b8" }}>
                          {" · "}{scheda}{archiviata ? " (archiviata)" : ""}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: T.text, fontWeight: 600, whiteSpace: "pre-wrap" }}>
                        {testo}
                      </div>
                    </div>
                  );
                })}
                <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 8, lineHeight: 1.45 }}>
                  Sola lettura. Per modificarle, riporta il paziente sulla scheda
                  d&apos;origine dal menu in alto.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const campo: React.CSSProperties = {
  width: "100%", padding: "9px 11px", borderRadius: 7,
  border: `1px solid ${T.line}`, fontSize: 13, color: T.text,
  outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical",
};
