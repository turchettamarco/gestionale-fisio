"use client";
// ═══════════════════════════════════════════════════════════════════════
// src/components/packages/PackagePickerSection.tsx
// ═══════════════════════════════════════════════════════════════════════
// Sezione "Usa pacchetto" inseribile nei modal di creazione appuntamento.
// Quando il paziente è selezionato, fa un fetch dei pacchetti attivi e
// mostra un dropdown solo se ce ne sono di disponibili.
//
// È autonomo: il modal padre passa solo `patientId` e `value`/`onChange`.
//
// COSA SUCCEDE LATO PADRE:
// - Se viene selezionato un pacchetto, l'appuntamento andrà salvato con
//   package_id valorizzato e (a discrezione del padre) is_paid=true,
//   amount nullato → la seduta è coperta dal pacchetto, no incasso doppio.
// - Se viene selezionato "Nessuno", flusso normale (pagamento singolo).
// ═══════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from "react";
import type { PatientPackageEnriched } from "@/src/lib/packages/types";

const T = {
  text: "#0f172a",
  muted: "#334155",
  border: "#cbd5e1",
  borderSoft: "#e2e8f0",
  panelSoft: "#f7f9fd",
  teal: "#0d9488",
  blue: "#2563eb",
};

export type PackagePickerSectionProps = {
  patientId: string | null;
  value: string | null;
  onChange: (packageId: string | null) => void;
  /** Compact: rende dimensioni più piccole (per modal mobile densi) */
  compact?: boolean;
};

export default function PackagePickerSection({
  patientId,
  value,
  onChange,
  compact,
}: PackagePickerSectionProps) {
  const [packages, setPackages] = useState<PatientPackageEnriched[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!patientId) {
      setPackages([]);
      return;
    }
    setLoading(true);
    fetch(`/api/packages?patient_id=${patientId}&status=active`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { packages: [] }))
      .then((d) => {
        // Filtra solo i pacchetti con sedute residue (o ad acconto libero)
        const usable: PatientPackageEnriched[] = (d.packages || []).filter(
          (p: PatientPackageEnriched) =>
            p.status === "active" &&
            (p.total_sessions === null ||
              (p.sessions_remaining ?? 0) > 0)
        );
        setPackages(usable);
        // Se il pacchetto attualmente selezionato non è più nella lista
        // (es. ha finito le sedute), deselezionalo
        if (value && !usable.find((p) => p.id === value)) {
          onChange(null);
        }
      })
      .catch(() => setPackages([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  // Niente paziente o niente pacchetti → niente UI (silenzioso)
  if (!patientId) return null;
  if (loading) return null;
  if (packages.length === 0) return null;

  const selected = packages.find((p) => p.id === value);

  return (
    <div
      style={{
        padding: compact ? "10px 12px" : "12px 14px",
        background: T.panelSoft,
        borderRadius: 9,
        border: `1.5px solid ${selected ? T.teal : T.borderSoft}`,
        marginTop: 10,
        marginBottom: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 14 }}>📦</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: T.muted,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          Usa pacchetto sedute
        </span>
        {selected && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 10,
              fontWeight: 700,
              color: T.teal,
              background: "rgba(13,148,136,0.12)",
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            ATTIVO
          </span>
        )}
      </div>

      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          width: "100%",
          padding: compact ? "8px 10px" : "10px 12px",
          borderRadius: 7,
          border: `1.5px solid ${T.border}`,
          fontSize: 13,
          fontFamily: "inherit",
          color: T.text,
          background: "#fff",
          cursor: "pointer",
        }}
      >
        <option value="">Nessuno (seduta a pagamento singolo)</option>
        {packages.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
            {p.total_sessions !== null && p.sessions_remaining !== null
              ? ` · ${p.sessions_used}/${p.total_sessions} usate (${p.sessions_remaining} rimaste)`
              : ` · ${p.sessions_used} usate (acconto libero)`}
          </option>
        ))}
      </select>

      {selected && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: T.muted,
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          La seduta scalerà dal pacchetto. Nessun pagamento singolo verrà
          richiesto: l&apos;incasso è gestito sui versamenti del pacchetto.
        </div>
      )}
    </div>
  );
}
