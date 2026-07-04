"use client";
// app/(protected)/components/dashboard/QuickSearchBar.tsx
// ═══════════════════════════════════════════════════════════════════════
// Barra di ricerca rapida: il gesto più frequente del fisioterapista
// (trovare un paziente) in primo piano. Scrivi 2 lettere → risultati
// live → click → cartella. Accanto, le due azioni più comuni.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";
import { useCurrentStudioId } from "@/src/contexts/StudioContext";
import { THEME } from "./shared/theme";

type Hit = { id: string; first_name: string | null; last_name: string | null; phone: string | null };

export default function QuickSearchBar() {
  const studioId = useCurrentStudioId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Ricerca live con debounce
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2 || !studioId) { setHits([]); setOpen(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone")
        .eq("studio_id", studioId)
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
        .order("last_name", { ascending: true })
        .limit(6);
      if (!cancelled) {
        setHits((data as Hit[]) || []);
        setOpen(true);
        setSearching(false);
      }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, studioId]);

  // Chiudi cliccando fuori
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (id: string) => { window.location.href = `/patients/${id}`; };

  return (
    <div ref={boxRef} style={{ position: "relative", marginBottom: 18, zIndex: 40 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        background: "#fff", border: `1px solid ${THEME.border}`, borderRadius: 14,
        padding: "10px 14px", boxShadow: "0 6px 24px rgba(30,64,175,0.09)",
      }}>
        <span style={{ fontSize: 16 }}>🔍</span>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => { if (hits.length > 0) setOpen(true); }}
          onKeyDown={e => {
            if (e.key === "Enter" && hits[0]) go(hits[0].id);
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Cerca un paziente per nome o cognome…"
          style={{ flex: 1, minWidth: 180, border: "none", outline: "none", fontSize: 14, fontFamily: "inherit", color: "#1e293b", background: "transparent" }}
        />
        {searching && <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>cerco…</span>}
        <div style={{ width: 1, alignSelf: "stretch", background: THEME.border }} className="qs-div" />
        <Link href="/calendar?new=1" style={{ padding: "8px 14px", borderRadius: 9, background: "linear-gradient(135deg,#0d9488,#2563eb)", color: "#fff", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>
          ➕ Appuntamento
        </Link>
        <Link href="/patients/new" style={{ padding: "8px 14px", borderRadius: 9, border: `1.5px solid ${THEME.teal}`, color: THEME.teal, fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", background: "#fff" }}>
          👤 Nuovo paziente
        </Link>
      </div>

      {/* Risultati */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
          background: "#fff", border: `1px solid ${THEME.border}`, borderRadius: 12,
          boxShadow: "0 14px 40px rgba(15,23,42,0.15)", overflow: "hidden",
        }}>
          {hits.length === 0 ? (
            <div style={{ padding: "12px 16px", fontSize: 12, color: "#7c8aa0" }}>
              Nessun paziente trovato per “{q.trim()}” — <Link href="/patients/new" style={{ color: THEME.blue, fontWeight: 700 }}>crealo ora →</Link>
            </div>
          ) : hits.map((h, i) => (
            <button
              key={h.id}
              onClick={() => go(h.id)}
              className="rh"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                width: "100%", textAlign: "left", padding: "10px 16px",
                border: "none", background: "#fff", cursor: "pointer",
                borderBottom: i < hits.length - 1 ? `1px solid ${THEME.border}` : "none",
                fontFamily: "inherit",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                {h.first_name} {h.last_name}
                {i === 0 && <span style={{ marginLeft: 8, fontSize: 9.5, fontWeight: 700, color: "#94a3b8", border: `1px solid ${THEME.border}`, borderRadius: 5, padding: "1px 5px" }}>Invio ↵</span>}
              </span>
              {h.phone && <span style={{ fontSize: 11, color: "#94a3b8" }}>{h.phone}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
