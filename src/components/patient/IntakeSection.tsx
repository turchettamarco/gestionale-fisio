"use client";

// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/IntakeSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Autovalutazione pre-visita nella cartella del paziente (mig. 093):
// da qui si invia l'invito e si rileggono le risposte.
//
// Le risposte NON vengono riversate in anamnesi in automatico: sono
// dichiarazioni del paziente, spesso da tradurre in termini clinici. È il
// terapista a decidere cosa riportare, quindi qui si leggono e basta.
//
// Le domande di controllo (bandiere rosse) segnate "sì" sono raccolte in
// cima: se ce ne sono, devono saltare all'occhio prima della seduta e non
// restare sepolte in fondo a un elenco di venti risposte.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import {
  INTAKE_SECTIONS,
  INTAKE_ALL_QUESTIONS,
  redFlagsFrom,
} from "@/src/lib/intakeQuestions";

type IntakeRow = {
  id: string;
  access_token: string;
  status: "pending" | "completed" | "cancelled";
  payload: Record<string, unknown>;
  sent_at: string;
  completed_at: string | null;
};

export type IntakeSectionProps = {
  patientId: string;
  patientFirstName: string;
  patientPhone: string | null;
  studioId: string | null;
  /** Se presente, compare "Riporta in anamnesi": passa il testo composto al
   *  campo anamnesi della cartella, che resta da rileggere e salvare a mano. */
  onCopyToAnamnesis?: (text: string) => void;
};

/** Compone un testo leggibile dalle risposte, pronto da incollare in
 *  anamnesi. Solo le domande a cui il paziente ha risposto, nell'ordine
 *  del questionario; le domande di controllo restano fuori perché vanno
 *  verificate a voce, non trascritte come se fossero un dato clinico. */
function composeAnamnesis(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const sec of INTAKE_SECTIONS) {
    if (sec.id === "segnali") continue;
    for (const q of sec.questions) {
      const v = payload[q.id];
      if (v === undefined || v === null || v === "" || v === false) continue;
      const val = q.type === "scale" ? `${v}/10` : String(v).trim();
      parts.push(`${q.label} ${val}`);
    }
  }
  return parts.join("\n");
}

export default function IntakeSection(p: IntakeSectionProps) {
  const [rows, setRows] = useState<IntakeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!p.patientId) return;
    setLoading(true);
    const { data } = await supabase
      .from("patient_intake")
      .select("id, access_token, status, payload, sent_at, completed_at")
      .eq("patient_id", p.patientId)
      .order("sent_at", { ascending: false })
      .limit(10);
    setRows((data as IntakeRow[]) ?? []);
    setLoading(false);
  }, [p.patientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function createInvite() {
    if (!p.studioId) { alert("Studio non identificato."); return; }
    setCreating(true);
    try {
      const { error } = await supabase.from("patient_intake").insert({
        studio_id: p.studioId,
        patient_id: p.patientId,
      });
      if (error) { alert("Errore: " + error.message); return; }
      await load();
    } finally {
      setCreating(false);
    }
  }

  function linkFor(row: IntakeRow) {
    return `${window.location.origin}/autovalutazione/${row.access_token}`;
  }

  function sendWhatsApp(row: IntakeRow) {
    const phone = (p.patientPhone ?? "").replace(/[^0-9]/g, "");
    const testo =
      `Ciao ${p.patientFirstName}, prima della visita ti chiedo di compilare ` +
      `qualche domanda: bastano cinque minuti e ci permettono di partire ` +
      `già preparati.\n\n${linkFor(row)}`;
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(testo)}`
      : `https://web.whatsapp.com/send?text=${encodeURIComponent(testo)}`;
    window.open(url, "_blank");
  }

  const pending = rows.filter(r => r.status === "pending");
  const completed = rows.filter(r => r.status === "completed");

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Autovalutazione pre-visita</div>
          <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 2 }}>
            Il paziente risponde da casa, tu leggi qui prima della seduta
          </div>
        </div>
        <button onClick={() => void createInvite()} disabled={creating}
          style={{ padding: "8px 14px", borderRadius: 7, border: "none", background: "#0d9488", color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", opacity: creating ? 0.6 : 1 }}>
          {creating ? "Creo…" : "Nuovo invito"}
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 12.5, color: "#64748b" }}>Caricamento…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#64748b", fontStyle: "italic" }}>
          Nessuna autovalutazione inviata a questo paziente.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pending.map(r => (
            <div key={r.id} style={{ padding: "10px 12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: "#92400e", fontWeight: 700 }}>
                  In attesa di risposta · inviata il {new Date(r.sent_at).toLocaleDateString("it-IT")}
                </span>
                <span style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => sendWhatsApp(r)}
                    style={{ padding: "5px 11px", borderRadius: 6, border: "none", background: "#25D366", color: "#fff", fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}>
                    WhatsApp
                  </button>
                  <button onClick={() => { void navigator.clipboard?.writeText(linkFor(r)); }}
                    style={{ padding: "5px 11px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}>
                    Copia link
                  </button>
                </span>
              </div>
            </div>
          ))}

          {completed.map(r => {
            const flags = redFlagsFrom(r.payload ?? {});
            const open = openId === r.id;
            return (
              <div key={r.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                <button onClick={() => setOpenId(open ? null : r.id)}
                  style={{ width: "100%", textAlign: "left", cursor: "pointer", background: "#f8fafc", border: "none", padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span>
                    <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#0f172a" }}>
                      Compilata il {r.completed_at ? new Date(r.completed_at).toLocaleDateString("it-IT") : "—"}
                    </span>
                    {flags.length > 0 && (
                      <span style={{ display: "block", fontSize: 11.5, color: "#b45309", fontWeight: 700, marginTop: 2 }}>
                        {flags.length} {flags.length === 1 ? "segnale da verificare" : "segnali da verificare"}
                      </span>
                    )}
                  </span>
                  <span style={{ color: "#64748b", fontSize: 12, transform: open ? "rotate(180deg)" : "none" }}>▾</span>
                </button>

                {open && (
                  <div style={{ padding: "12px", background: "#fff" }}>
                    {flags.length > 0 && (
                      <div style={{ padding: "10px 12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", marginBottom: 12 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 800, color: "#92400e", marginBottom: 4 }}>
                          Segnalati dal paziente
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#92400e", lineHeight: 1.6 }}>
                          {flags.map(f => <li key={f.id}>{f.label}</li>)}
                        </ul>
                        <div style={{ fontSize: 10.5, color: "#a16207", marginTop: 6, lineHeight: 1.45 }}>
                          Sono risposte del paziente, non una valutazione: da approfondire in visita.
                        </div>
                      </div>
                    )}

                    {p.onCopyToAnamnesis && (
                      <button
                        onClick={() => {
                          const testo = composeAnamnesis(r.payload ?? {});
                          if (!testo) { alert("Nessuna risposta da riportare."); return; }
                          p.onCopyToAnamnesis?.(testo);
                        }}
                        style={{
                          marginBottom: 12, padding: "7px 14px", borderRadius: 7,
                          border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a",
                          fontWeight: 700, fontSize: 12, cursor: "pointer",
                        }}
                      >
                        Riporta in anamnesi
                      </button>
                    )}

                    {INTAKE_SECTIONS.map(sec => {
                      const answered = sec.questions.filter(q => {
                        const v = (r.payload ?? {})[q.id];
                        return v !== undefined && v !== null && v !== "" && v !== false;
                      });
                      if (answered.length === 0) return null;
                      return (
                        <div key={sec.id} style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 10.5, fontWeight: 800, color: "#64748b", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 5 }}>
                            {sec.title}
                          </div>
                          {answered.map(q => {
                            const v = (r.payload ?? {})[q.id];
                            return (
                              <div key={q.id} style={{ marginBottom: 7 }}>
                                <div style={{ fontSize: 11.5, color: "#64748b" }}>{q.label}</div>
                                <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 600, whiteSpace: "pre-wrap" }}>
                                  {q.type === "checkbox" ? "Sì" : q.type === "scale" ? `${v}/10` : String(v)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}

                    {INTAKE_ALL_QUESTIONS.every(q => {
                      const v = (r.payload ?? {})[q.id];
                      return v === undefined || v === null || v === "" || v === false;
                    }) && (
                      <div style={{ fontSize: 12.5, color: "#64748b", fontStyle: "italic" }}>
                        Nessuna risposta registrata.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
