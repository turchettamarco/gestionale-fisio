"use client";

// ═══════════════════════════════════════════════════════════════════════
// RICERCA GLOBALE MOBILE — sheet a tutta altezza aperto dalla lente
// nell'header della home. Cerca i pazienti per nome, cognome o telefono;
// da ogni risultato: chiama (tel:) o apri la scheda.
// Portal sul body (regola della specifica: mai dentro contenitori
// trasformati). Rispetta la privacy mode.
// ═══════════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import { usePrivacyDisplay, useDisplayPatientPhone } from "@/src/contexts/PrivacyModeContext";
import { MOBILE_THEME as T } from "@/src/theme/tokens";
import { Icon } from "@/src/components/icons";

type Row = { id: string; first_name: string | null; last_name: string | null; phone: string | null };

export default function MobileSearchSheet({ onClose }: { onClose: () => void }) {
  const { maskName } = usePrivacyDisplay();
  const displayPhone = useDisplayPatientPhone();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { const id = setTimeout(() => inputRef.current?.focus(), 120); return () => clearTimeout(id); }, []);

  useEffect(() => {
    if (tRef.current) clearTimeout(tRef.current);
    const term = q.trim();
    if (term.length < 2) { setRows([]); setLoading(false); return; }
    setLoading(true);
    tRef.current = setTimeout(async () => {
      const like = `%${term}%`;
      const { data } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone")
        .or(`first_name.ilike.${like},last_name.ilike.${like},phone.ilike.${like}`)
        .order("last_name", { ascending: true })
        .limit(10);
      setRows((data as Row[]) ?? []);
      setLoading(false);
    }, 250);
    return () => { if (tRef.current) clearTimeout(tRef.current); };
  }, [q]);

  if (!mounted) return null;

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(26,29,36,0.34)" }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed", left: 0, right: 0, top: 0, zIndex: 1000,
          background: T.panelBg, borderRadius: "0 0 22px 22px",
          padding: "calc(env(safe-area-inset-top,0px) + 12px) 14px 14px",
          boxShadow: "0 8px 30px rgba(26,29,36,0.14)",
          maxHeight: "80dvh", display: "flex", flexDirection: "column",
        }}
      >
        {/* Campo di ricerca */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            flex: 1, display: "flex", alignItems: "center", gap: 8,
            border: `1.5px solid ${T.teal}`, borderRadius: 12,
            background: T.panelBg, padding: "9px 12px",
          }}>
            <Icon name="search" size={16} color={T.warm400} />
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Nome, cognome o telefono…"
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                fontSize: 15, color: T.ink, fontFamily: "inherit",
              }}
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Pulisci" style={{ border: "none", background: "transparent", cursor: "pointer", padding: 2, display: "flex" }}>
                <Icon name="x" size={14} color={T.warm400} />
              </button>
            )}
          </div>
          <button onClick={onClose} style={{
            border: "none", background: "transparent", cursor: "pointer",
            fontSize: 13, fontWeight: 700, color: T.teal, padding: "6px 2px", flexShrink: 0,
          }}>Chiudi</button>
        </div>

        {/* Risultati */}
        <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", marginTop: 10 }}>
          {loading && (
            <p style={{ margin: 0, padding: "14px 4px", fontSize: 13, color: T.warm500 }}>Ricerca…</p>
          )}
          {!loading && q.trim().length >= 2 && rows.length === 0 && (
            <p style={{ margin: 0, padding: "14px 4px", fontSize: 13, color: T.warm500 }}>Nessun paziente trovato.</p>
          )}
          {!loading && rows.map(r => {
            const name = maskName({ first_name: r.first_name, last_name: r.last_name });
            const phone = r.phone ? displayPhone(r.phone) : null;
            return (
              <div key={r.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "11px 4px", borderBottom: `1px solid ${T.lineFaint}`,
              }}>
                <Link href={`/patients/${r.id}`} onClick={onClose} style={{ flex: 1, minWidth: 0, textDecoration: "none" }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
                  {phone && <p style={{ margin: "1px 0 0", fontSize: 12, color: T.warm500 }}>{phone}</p>}
                </Link>
                {r.phone && (
                  <a href={`tel:${r.phone}`} aria-label="Chiama" style={{
                    width: 34, height: 34, borderRadius: 12, flexShrink: 0,
                    border: "1px solid #CBDCF6", background: T.blueTint,
                    display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none",
                  }}><Icon name="phone" size={15} color={T.blue} /></a>
                )}
                <Link href={`/patients/${r.id}`} onClick={onClose} aria-label="Apri scheda" style={{
                  width: 34, height: 34, borderRadius: 12, flexShrink: 0,
                  border: `1px solid ${T.border}`, background: T.panelSoft,
                  display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none",
                }}><Icon name="chevronRight" size={15} color={T.warm500} /></Link>
              </div>
            );
          })}
          {q.trim().length < 2 && !loading && (
            <p style={{ margin: 0, padding: "14px 4px", fontSize: 12, color: T.warm400 }}>Scrivi almeno due lettere.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
