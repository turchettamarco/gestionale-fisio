"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudio } from "@/src/contexts/StudioContext";

const THEME = {
  teal: "#0d9488", blue: "#2563eb", text: "#0f172a",
  muted: "#64748b", border: "#e2e8f0", green: "#16a34a", red: "#dc2626",
  panelSoft: "#f8fafc",
};

export type SOAPNote = {
  appointment_id: string;
  patient_id: string;
  studio_id?: string;
  soap_s?: string; soap_o?: string; soap_a?: string; soap_p?: string;
  vas_before?: number | null; vas_after?: number | null;
  quick_note?: string;
};

export function SOAPNotesEditor({ appointmentId, patientId, onSaved }: {
  appointmentId: string; patientId: string; onSaved?: () => void;
}) {
  const { studio } = useCurrentStudio();
  const [note, setNote] = useState<SOAPNote>({ appointment_id: appointmentId, patient_id: patientId });
  const [isExisting, setIsExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedMode, setExpandedMode] = useState<"quick" | "soap">("quick");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("session_notes")
      .select("*").eq("appointment_id", appointmentId).maybeSingle();
    if (data) {
      setNote(data as SOAPNote);
      setIsExisting(true);
      if (data.soap_s || data.soap_o || data.soap_a || data.soap_p) setExpandedMode("soap");
    }
    setLoading(false);
  }, [appointmentId]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!studio?.id) {
      alert("Studio non identificato. Ricarica la pagina.");
      return;
    }
    setSaving(true); setSaved(false);
    // La tabella session_notes ha appointment_id come PRIMARY KEY,
    // quindi usiamo upsert on appointment_id (una nota per appuntamento).
    const payload: any = {
      appointment_id: appointmentId,
      patient_id: patientId,
      studio_id: studio.id,
      soap_s: note.soap_s || null,
      soap_o: note.soap_o || null,
      soap_a: note.soap_a || null,
      soap_p: note.soap_p || null,
      vas_before: note.vas_before ?? null,
      vas_after: note.vas_after ?? null,
      quick_note: note.quick_note || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("session_notes")
      .upsert(payload, { onConflict: "appointment_id" })
      .select()
      .maybeSingle();
    if (error) {
      alert("Errore salvataggio note: " + error.message);
      setSaving(false);
      return;
    }
    if (data) setNote(data as SOAPNote);
    setIsExisting(true);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved?.();
  }

  if (loading) return <div style={{ padding: 16, color: THEME.muted, fontSize: 12 }}>Caricamento note…</div>;

  const vasColor = (v: number | null | undefined) =>
    v == null ? THEME.muted : v <= 3 ? THEME.green : v <= 6 ? "#f59e0b" : THEME.red;

  return (
    <div style={{ padding: "14px 18px", background: THEME.panelSoft, borderRadius: 10, border: `1px solid ${THEME.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: THEME.text }}>📝 Note di seduta</div>
        <div style={{ display: "flex", gap: 4, background: "#fff", borderRadius: 7, padding: 2, border: `1px solid ${THEME.border}` }}>
          <button onClick={() => setExpandedMode("quick")} style={{
            padding: "4px 10px", borderRadius: 5, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
            background: expandedMode === "quick" ? THEME.teal : "transparent",
            color: expandedMode === "quick" ? "#fff" : THEME.muted,
          }}>Rapida</button>
          <button onClick={() => setExpandedMode("soap")} style={{
            padding: "4px 10px", borderRadius: 5, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
            background: expandedMode === "soap" ? THEME.teal : "transparent",
            color: expandedMode === "soap" ? "#fff" : THEME.muted,
          }}>SOAP completa</button>
        </div>
      </div>

      {expandedMode === "quick" ? (
        <div>
          <textarea
            value={note.quick_note || ""}
            onChange={e => setNote({ ...note, quick_note: e.target.value })}
            placeholder="Es. VAS 4→2, miglioramento ROM, continua esercizi a casa…"
            rows={3}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${THEME.border}`, fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: THEME.muted }}>VAS prima:</span>
              <input type="number" min={0} max={10} value={note.vas_before ?? ""}
                onChange={e => setNote({ ...note, vas_before: e.target.value === "" ? null : Math.min(10, Math.max(0, parseInt(e.target.value))) })}
                style={{ width: 55, padding: "5px 8px", borderRadius: 6, border: `1.5px solid ${vasColor(note.vas_before)}`, fontSize: 13, fontWeight: 700, color: vasColor(note.vas_before), textAlign: "center", outline: "none" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: THEME.muted }}>VAS dopo:</span>
              <input type="number" min={0} max={10} value={note.vas_after ?? ""}
                onChange={e => setNote({ ...note, vas_after: e.target.value === "" ? null : Math.min(10, Math.max(0, parseInt(e.target.value))) })}
                style={{ width: 55, padding: "5px 8px", borderRadius: 6, border: `1.5px solid ${vasColor(note.vas_after)}`, fontSize: 13, fontWeight: 700, color: vasColor(note.vas_after), textAlign: "center", outline: "none" }} />
            </div>
            {note.vas_before != null && note.vas_after != null && (
              <div style={{ fontSize: 11, fontWeight: 700, color: note.vas_after < note.vas_before ? THEME.green : note.vas_after > note.vas_before ? THEME.red : THEME.muted }}>
                {note.vas_after < note.vas_before ? `↓ ${note.vas_before - note.vas_after} punti` : note.vas_after > note.vas_before ? `↑ ${note.vas_after - note.vas_before} punti` : "Invariato"}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {([
            { k: "soap_s", label: "S — Soggettivo", placeholder: "Cosa riferisce il paziente (dolore, limitazioni, vissuto)", color: THEME.blue },
            { k: "soap_o", label: "O — Oggettivo", placeholder: "Cosa osservi/misuri (ROM, forza, test)", color: THEME.teal },
            { k: "soap_a", label: "A — Assessment", placeholder: "Valutazione clinica, ragionamento, diagnosi", color: "#7c3aed" },
            { k: "soap_p", label: "P — Piano", placeholder: "Cosa farai la prossima volta, esercizi, educazione", color: THEME.green },
          ] as const).map(f => (
            <div key={f.k}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: f.color, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>{f.label}</label>
              <textarea
                value={(note as any)[f.k] || ""}
                onChange={e => setNote({ ...note, [f.k]: e.target.value })}
                placeholder={f.placeholder}
                rows={2}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: `1.5px solid ${THEME.border}`, fontSize: 12, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }}
              />
            </div>
          ))}
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: THEME.muted }}>VAS:</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: THEME.muted }}>prima</span>
              <input type="number" min={0} max={10} value={note.vas_before ?? ""}
                onChange={e => setNote({ ...note, vas_before: e.target.value === "" ? null : Math.min(10, Math.max(0, parseInt(e.target.value))) })}
                style={{ width: 50, padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${vasColor(note.vas_before)}`, fontSize: 12, fontWeight: 700, color: vasColor(note.vas_before), textAlign: "center", outline: "none" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: THEME.muted }}>dopo</span>
              <input type="number" min={0} max={10} value={note.vas_after ?? ""}
                onChange={e => setNote({ ...note, vas_after: e.target.value === "" ? null : Math.min(10, Math.max(0, parseInt(e.target.value))) })}
                style={{ width: 50, padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${vasColor(note.vas_after)}`, fontSize: 12, fontWeight: 700, color: vasColor(note.vas_after), textAlign: "center", outline: "none" }} />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        {saved && <span style={{ color: THEME.green, fontSize: 11, fontWeight: 700, alignSelf: "center" }}>✓ Salvato</span>}
        <button onClick={save} disabled={saving}
          style={{ padding: "8px 20px", borderRadius: 7, border: "none", background: `linear-gradient(135deg, ${THEME.teal}, ${THEME.blue})`, color: "#fff", fontWeight: 700, fontSize: 12, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Salvataggio…" : isExisting ? "Aggiorna" : "Salva note"}
        </button>
      </div>
    </div>
  );
}
