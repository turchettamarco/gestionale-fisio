"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Esercizio = {
  id: string;
  nome: string;
  descrizione: string;
  serie: string;
  ripetizioni: string;
  frequenza: string;
  note: string;
  avvertenze: string;
  youtube_query?: string;
};

export default function SchedaEserciziPubblica() {
  const params = useParams();
  const token = params?.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [patientName, setPatientName] = useState("");
  const [esercizi, setEsercizi] = useState<Esercizio[]>([]);
  const [nota, setNota] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/esercizi-pubblici?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setPatientName(d.patient_name);
        setEsercizi(d.esercizi ?? []);
        setNota(d.note ?? "");
        setCreatedAt(d.created_at ? new Date(d.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" }) : "");
      })
      .catch(() => setError("Errore nel caricamento della scheda"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
        <div style={{ fontSize: 16, color: "#334155", fontWeight: 600 }}>Caricamento scheda esercizi…</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", padding: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>😕</div>
        <div style={{ fontSize: 18, color: "#dc2626", fontWeight: 700, marginBottom: 8 }}>{error}</div>
        <div style={{ fontSize: 14, color: "#64748b" }}>Contatta il tuo fisioterapista per ricevere un nuovo link.</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        @media print {
          .no-print { display: none !important; }
          .card { break-inside: avoid; }
        }
      `}</style>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0d9488, #2563eb)", padding: "24px 20px 28px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
          FisioHub — Dr. Marco Turchetta
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 4 }}>
          Programma Esercizi Domiciliari
        </div>
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>
          {patientName}
        </div>
        {createdAt && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 6 }}>
            Emesso il {createdAt}
          </div>
        )}
      </div>

      {/* Intro */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 16px" }}>
        <div style={{ background: "#fff", borderRadius: "0 0 14px 14px", padding: "14px 18px", marginBottom: 20, boxShadow: "0 4px 16px rgba(13,148,136,0.1)" }}>
          <div style={{ fontSize: 13, color: "#0d9488", fontWeight: 600, lineHeight: 1.6 }}>
            ℹ️ Esegui gli esercizi con attenzione. In caso di dolore acuto o peggioramento, <strong>fermati e contatta lo studio</strong>. Clicca su ogni esercizio per vedere i dettagli e il video dimostrativo.
          </div>
          {nota && (
            <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(13,148,136,0.06)", borderRadius: 8, fontSize: 13, color: "#334155", borderLeft: "3px solid #0d9488" }}>
              📋 {nota}
            </div>
          )}
        </div>

        {/* Lista esercizi */}
        {esercizi.map((e, idx) => (
          <div key={e.id} className="card" style={{ background: "#fff", borderRadius: 14, marginBottom: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(15,23,42,0.06)", border: "1.5px solid #e2e8f0" }}>
            {/* Header card */}
            <div
              onClick={() => setExpanded(expanded === e.id ? null : e.id)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", userSelect: "none" }}
            >
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #0d9488, #2563eb)", color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {idx + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#0f172a" }}>{e.nome}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {e.serie} serie × {e.ripetizioni} rip. · {e.frequenza}
                </div>
              </div>
              <div style={{ fontSize: 18, color: "#94a3b8", transition: "transform 0.2s", transform: expanded === e.id ? "rotate(180deg)" : "none" }}>▾</div>
            </div>

            {/* Dettagli espandibili */}
            {expanded === e.id && (
              <div style={{ padding: "0 16px 16px", borderTop: "1px solid #f1f5f9" }}>
                {/* Parametri */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
                  {[
                    { l: "Serie", v: e.serie },
                    { l: "Ripetizioni", v: e.ripetizioni },
                    { l: "Frequenza", v: e.frequenza },
                  ].map(k => (
                    <span key={k.l} style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", background: "rgba(37,99,235,0.08)", padding: "4px 12px", borderRadius: 99 }}>
                      {k.l}: {k.v}
                    </span>
                  ))}
                </div>

                {/* Descrizione */}
                {e.descrizione && (
                  <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.7, marginBottom: 10 }}>
                    {e.descrizione}
                  </div>
                )}

                {/* Note */}
                {e.note && (
                  <div style={{ fontSize: 13, color: "#0d9488", background: "rgba(13,148,136,0.07)", padding: "8px 12px", borderRadius: 8, marginBottom: 8 }}>
                    📌 {e.note}
                  </div>
                )}

                {/* Avvertenze */}
                {e.avvertenze && (
                  <div style={{ fontSize: 13, color: "#dc2626", background: "rgba(220,38,38,0.06)", padding: "8px 12px", borderRadius: 8, marginBottom: 10 }}>
                    ⚠️ {e.avvertenze}
                  </div>
                )}

                {/* Bottone YouTube */}
                {e.youtube_query && (
                  <a
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(e.youtube_query)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#dc2626", borderRadius: 10, textDecoration: "none", color: "#fff" }}
                  >
                    <span style={{ fontSize: 22 }}>▶</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>Guarda il video su YouTube</div>
                      <div style={{ fontSize: 11, opacity: 0.85 }}>{e.youtube_query}</div>
                    </div>
                  </a>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "24px 0 40px", fontSize: 12, color: "#94a3b8" }}>
          <div style={{ fontWeight: 700, color: "#334155", marginBottom: 4 }}>Dr. Marco Turchetta — Fisioterapista & Osteopata</div>
          Via Galileo Galilei 5, Pontecorvo (FR)
          <div className="no-print" style={{ marginTop: 16 }}>
            <button onClick={() => window.print()} style={{ padding: "10px 24px", background: "#0d9488", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              🖨️ Stampa / Salva PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
