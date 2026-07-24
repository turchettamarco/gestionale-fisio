"use client";

// ═══════════════════════════════════════════════════════════════════════
// src/components/patient/ExerciseLibraryModal.tsx
// ═══════════════════════════════════════════════════════════════════════
// Pesca esercizi dall'archivio dello studio (mig. 098).
//
// Selezione multipla: chi costruisce un programma ne aggiunge cinque in un
// colpo, non uno alla volta chiudendo e riaprendo.
//
// I più usati stanno in cima, perché su un archivio di cento esercizi la
// verità è che se ne usano venti.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import type { Esercizio } from "./ExerciseProgramSection";

export type LibraryItem = {
  id: string;
  nome: string;
  descrizione: string;
  serie: string;
  ripetizioni: string;
  frequenza: string;
  note: string | null;
  avvertenze: string | null;
  youtube_id: string | null;
  image_url: string | null;
  categoria: string | null;
  tags: string[];
  use_count: number;
};

const T = {
  text: "#0f172a", soft: "#475569", muted: "#64748b",
  border: "#e2e8f0", line: "#cbd5e1", panel: "#f8fafc",
  teal: "#0d9488", red: "#dc2626",
};

export type ExerciseLibraryModalProps = {
  open: boolean;
  onClose: () => void;
  studioId: string | null;
  /** Riceve gli esercizi scelti, già nella forma usata dalle schede. */
  onPick: (esercizi: Esercizio[]) => void;
};

/** Da riga di libreria a esercizio della scheda: si COPIANO i valori. */
function toEsercizio(r: LibraryItem): Esercizio {
  return {
    id: `lib-${r.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    nome: r.nome,
    descrizione: r.descrizione,
    serie: r.serie,
    ripetizioni: r.ripetizioni,
    frequenza: r.frequenza,
    note: r.note ?? undefined,
    avvertenze: r.avvertenze ?? undefined,
    youtube_id: r.youtube_id ?? undefined,
    image_url: r.image_url ?? undefined,
    categoria: r.categoria ?? undefined,
  };
}

export default function ExerciseLibraryModal(p: ExerciseLibraryModalProps) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [cerca, setCerca] = useState("");
  const [tagAttivo, setTagAttivo] = useState<string | null>(null);
  const [scelti, setScelti] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!p.studioId) return;
    setLoading(true);
    const { data } = await supabase
      .from("studio_exercise_library")
      .select("id, nome, descrizione, serie, ripetizioni, frequenza, note, avvertenze, youtube_id, image_url, categoria, tags, use_count")
      .eq("studio_id", p.studioId).eq("is_active", true)
      .order("use_count", { ascending: false })
      .order("nome", { ascending: true });
    setItems((data as LibraryItem[]) ?? []);
    setLoading(false);
  }, [p.studioId]);

  useEffect(() => {
    if (!p.open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScelti(new Set());
    void load();
  }, [p.open, load]);

  const tuttiTag = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => i.tags?.forEach(t => s.add(t)));
    return Array.from(s).sort();
  }, [items]);

  const filtrati = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return items.filter(i => {
      if (tagAttivo && !i.tags?.includes(tagAttivo)) return false;
      if (!q) return true;
      return i.nome.toLowerCase().includes(q)
        || (i.categoria ?? "").toLowerCase().includes(q)
        || (i.descrizione ?? "").toLowerCase().includes(q)
        || i.tags?.some(t => t.toLowerCase().includes(q));
    });
  }, [items, cerca, tagAttivo]);

  function toggle(id: string) {
    setScelti(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function conferma() {
    const righe = items.filter(i => scelti.has(i.id));
    if (righe.length === 0) return;

    p.onPick(righe.map(toEsercizio));

    // Contatore d'uso: serve a far salire i più usati. Se fallisce non è
    // un problema, l'esercizio è già stato aggiunto alla scheda.
    void Promise.all(righe.map(r =>
      supabase.from("studio_exercise_library")
        .update({ use_count: r.use_count + 1, last_used_at: new Date().toISOString() })
        .eq("id", r.id)
    )).catch(() => {});

    p.onClose();
  }

  if (!p.open) return null;

  return (
    <div
      onClick={p.onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 20000,
        background: "rgba(15,23,42,0.5)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14, width: "100%", maxWidth: 620,
          maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Libreria esercizi</div>
            <button onClick={p.onClose} style={{
              border: "none", background: "none", cursor: "pointer",
              color: T.muted, fontSize: 20, lineHeight: 1, padding: 0,
            }}>×</button>
          </div>

          <input
            value={cerca} onChange={e => setCerca(e.target.value)}
            placeholder="Cerca per nome, categoria o etichetta…"
            style={{
              width: "100%", marginTop: 10, padding: "9px 12px", borderRadius: 8,
              border: `1px solid ${T.line}`, fontSize: 13, color: T.text,
              outline: "none", boxSizing: "border-box", fontFamily: "inherit",
            }}
          />

          {tuttiTag.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {tuttiTag.map(t => {
                const on = tagAttivo === t;
                return (
                  <button key={t} onClick={() => setTagAttivo(on ? null : t)}
                    style={{
                      padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                      border: `1px solid ${on ? T.teal : T.line}`,
                      background: on ? "rgba(13,148,136,0.08)" : "#fff",
                      color: on ? T.teal : T.soft, fontWeight: 700, fontSize: 11.5,
                    }}>{t}</button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px" }}>
          {loading ? (
            <div style={{ fontSize: 13, color: T.muted, padding: "20px 0", textAlign: "center" }}>
              Caricamento…
            </div>
          ) : items.length === 0 ? (
            <div style={{
              padding: "20px 16px", borderRadius: 8, background: T.panel,
              border: `1px solid ${T.border}`, fontSize: 12.5, color: T.muted, lineHeight: 1.55,
            }}>
              La libreria è vuota. Man mano che costruisci le schede, usa
              <strong style={{ color: T.soft }}> “Salva in libreria”</strong> sugli
              esercizi che riusi: la prossima volta li ripeschi da qui invece di
              riscriverli.
            </div>
          ) : filtrati.length === 0 ? (
            <div style={{ fontSize: 13, color: T.muted, padding: "20px 0", textAlign: "center" }}>
              Nessun esercizio corrisponde alla ricerca.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {filtrati.map(i => {
                const on = scelti.has(i.id);
                return (
                  <button key={i.id} onClick={() => toggle(i.id)}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left",
                      width: "100%", padding: "11px 13px", borderRadius: 10, cursor: "pointer",
                      border: `1px solid ${on ? T.teal : T.border}`,
                      background: on ? "rgba(13,148,136,0.05)" : "#fff",
                    }}>
                    <span style={{
                      flexShrink: 0, width: 18, height: 18, borderRadius: 5, marginTop: 1,
                      border: `1.5px solid ${on ? T.teal : T.line}`,
                      background: on ? T.teal : "#fff", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 800,
                    }}>{on ? "✓" : ""}</span>

                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.text }}>
                        {i.nome}
                      </span>
                      {i.descrizione && (
                        <span style={{
                          display: "block", fontSize: 11.5, color: T.muted, marginTop: 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{i.descrizione}</span>
                      )}
                      <span style={{ display: "block", fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                        {[i.serie && `${i.serie} serie`, i.ripetizioni && `${i.ripetizioni} rip`, i.frequenza]
                          .filter(Boolean).join(" · ")}
                        {i.use_count > 0 && ` · usato ${i.use_count}×`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{
          padding: "12px 18px", borderTop: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}>
          <span style={{ fontSize: 12, color: T.muted }}>
            {scelti.size === 0 ? "Nessuno selezionato" : `${scelti.size} selezionati`}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={p.onClose} style={{
              padding: "9px 16px", borderRadius: 8, border: `1px solid ${T.border}`,
              background: "#fff", color: T.muted, fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>Annulla</button>
            <button onClick={() => void conferma()} disabled={scelti.size === 0}
              style={{
                padding: "9px 18px", borderRadius: 8, border: "none", background: T.teal,
                color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
                opacity: scelti.size === 0 ? 0.5 : 1,
              }}>
              Aggiungi al programma
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
