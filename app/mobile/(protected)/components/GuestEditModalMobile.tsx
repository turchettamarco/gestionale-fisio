"use client";

// ════════════════════════════════════════════════════════════════════════
// app/mobile/(protected)/components/GuestEditModalMobile.tsx
// ════════════════════════════════════════════════════════════════════════
//
// Modale mobile per la modifica COMPLETA di un professionista ospite.
// Include tutte le funzionalità che il desktop ha:
//   • Dati base (nome, cognome, specialità, colore, note)
//   • Stanza predefinita
//   • Configurazione campi PDF (telefono, durata, diagnosi, note)
//   • Portale pubblico (genera/revoca/copia link)
//   • Cancellazione hard
//
// UI: full-screen su mobile con scroll interno. Header gradient sticky.
// ════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { X, Trash2, Copy, Link2, Unlink } from "lucide-react";
import PhoneInput from "@/src/components/PhoneInput";

// Palette mobile (allineata settings mobile)
const T = {
  appBg: "#f1f5f9", panelBg: "#ffffff", text: "#0f172a", muted: "#334155",
  mutedSoft: "#64748b", border: "#cbd5e1", blue: "#2563eb", teal: "#0d9488",
  green: "#16a34a", red: "#dc2626", gray: "#94a3b8",
  gradient: "linear-gradient(135deg,#0d9488,#2563eb)",
};

const COLOR_PRESETS: { value: string; name: string }[] = [
  { value: "#DB2777", name: "Magenta" },
  { value: "#7C3AED", name: "Viola" },
  { value: "#0EA5E9", name: "Azzurro" },
  { value: "#F59E0B", name: "Ambra" },
  { value: "#14B8A6", name: "Turchese" },
  { value: "#EF4444", name: "Rosso" },
];

const SPECIALTY_SUGGESTIONS = [
  "Ortopedico", "Nutrizionista", "Psicologo", "Logopedista",
  "Osteopata", "Posturologo", "Medico estetico", "Podologo",
];

// ── Tipi ─────────────────────────────────────────────────────────────────
export type GuestEditRow = {
  id: string;
  first_name: string;
  last_name: string;
  specialty: string;
  display_color: string | null;
  default_room_id: string | null;
  notes: string | null;
  is_active: boolean;
  pdf_print_fields: {
    telefono?: boolean;
    durata?: boolean;
    diagnosi?: boolean;
    note?: boolean;
  };
  access_token: string | null;
  token_created_at: string | null;
  last_access_at: string | null;
  // mig. 033 — Contatti
  phone: string | null;
  email: string | null;
};

type StudioRoom = {
  id: string;
  name: string;
};

type Props = {
  guest: GuestEditRow;
  studioId: string;
  onClose: () => void;
  onSaved: () => void;
};

// ════════════════════════════════════════════════════════════════════════

export default function GuestEditModalMobile({ guest, studioId, onClose, onSaved }: Props) {
  // ── Stato form ──────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState(guest.first_name);
  const [lastName, setLastName] = useState(guest.last_name);
  const [specialty, setSpecialty] = useState(guest.specialty);
  const [color, setColor] = useState(guest.display_color || "#DB2777");
  const [defaultRoomId, setDefaultRoomId] = useState<string | null>(guest.default_room_id);
  const [notes, setNotes] = useState(guest.notes || "");
  // mig. 033 — Contatti
  const [phone, setPhone] = useState(guest.phone || "");
  const [email, setEmail] = useState(guest.email || "");

  // Campi PDF
  const pdfDefaults = guest.pdf_print_fields || {};
  const [pdfTelefono, setPdfTelefono] = useState(pdfDefaults.telefono !== false);
  const [pdfDurata, setPdfDurata] = useState(pdfDefaults.durata !== false);
  const [pdfDiagnosi, setPdfDiagnosi] = useState(pdfDefaults.diagnosi !== false);
  const [pdfNote, setPdfNote] = useState(pdfDefaults.note !== false);

  // Token portale (refreshed dal DB per riflettere genera/revoca senza reload)
  const [accessToken, setAccessToken] = useState<string | null>(guest.access_token);
  const [tokenCreatedAt, setTokenCreatedAt] = useState<string | null>(guest.token_created_at);
  const [lastAccessAt] = useState<string | null>(guest.last_access_at);

  // Loading flags
  const [saving, setSaving] = useState(false);
  const [savingToken, setSavingToken] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Stanze
  const [rooms, setRooms] = useState<StudioRoom[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("studio_rooms")
        .select("id, name")
        .eq("studio_id", studioId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      setRooms((data || []) as StudioRoom[]);
    })();
    return () => { cancelled = true; };
  }, [studioId]);

  const flash = useCallback((msg: string, type: "success" | "error" = "success") => {
    if (type === "success") {
      setSuccess(msg); setError(null);
      setTimeout(() => setSuccess(null), 2500);
    } else {
      setError(msg); setSuccess(null);
    }
  }, []);

  // ── Salva dati base + PDF fields ────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!firstName.trim() || !lastName.trim() || !specialty.trim()) {
      flash("Nome, cognome e specialità sono obbligatori.", "error");
      return;
    }
    setSaving(true); setError(null);
    try {
      const { error: err } = await supabase
        .from("guest_practitioners")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          specialty: specialty.trim(),
          display_color: color,
          default_room_id: defaultRoomId,
          notes: notes.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          pdf_print_fields: {
            telefono: pdfTelefono,
            durata: pdfDurata,
            diagnosi: pdfDiagnosi,
            note: pdfNote,
          },
        })
        .eq("id", guest.id);
      if (err) throw new Error(err.message);
      onSaved();
      onClose();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Errore sconosciuto", "error");
    } finally {
      setSaving(false);
    }
  }, [firstName, lastName, specialty, color, defaultRoomId, notes, phone, email, pdfTelefono, pdfDurata, pdfDiagnosi, pdfNote, guest.id, onSaved, onClose, flash]);

  // ── Genera token portale ────────────────────────────────────────────────
  const handleGenerateToken = useCallback(async () => {
    setSavingToken(true);
    try {
      const newToken = crypto.randomUUID();
      const now = new Date().toISOString();
      const { error: err } = await supabase
        .from("guest_practitioners")
        .update({ access_token: newToken, token_created_at: now, last_access_at: null })
        .eq("id", guest.id);
      if (err) throw new Error(err.message);
      setAccessToken(newToken);
      setTokenCreatedAt(now);
      flash("Link generato. Ora puoi copiarlo e inviarlo.");
      onSaved();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Errore", "error");
    } finally {
      setSavingToken(false);
    }
  }, [guest.id, onSaved, flash]);

  // ── Revoca token ────────────────────────────────────────────────────────
  const handleRevokeToken = useCallback(async () => {
    if (!confirm("Revocare il link? Il professionista non potrà più aprirlo.")) return;
    setSavingToken(true);
    try {
      const { error: err } = await supabase
        .from("guest_practitioners")
        .update({ access_token: null, token_created_at: null, last_access_at: null })
        .eq("id", guest.id);
      if (err) throw new Error(err.message);
      setAccessToken(null);
      setTokenCreatedAt(null);
      flash("Link revocato.");
      onSaved();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Errore", "error");
    } finally {
      setSavingToken(false);
    }
  }, [guest.id, onSaved, flash]);

  // ── Copia link ──────────────────────────────────────────────────────────
  const handleCopyLink = useCallback(async () => {
    if (!accessToken) return;
    const url = `${window.location.origin}/agenda/${accessToken}`;
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copiato negli appunti!");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      flash("Link copiato!");
    }
  }, [accessToken, flash]);

  // ── Cancella ospite (hard delete) ───────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!confirm(`Cancellare definitivamente ${firstName} ${lastName}? Gli appuntamenti già registrati rimarranno in DB ma non più collegati.\n\nL'azione non è reversibile. In alternativa puoi "Disattivare" l'ospite per nasconderlo senza cancellarlo.`)) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase
        .from("guest_practitioners")
        .delete()
        .eq("id", guest.id);
      if (err) throw new Error(err.message);
      onSaved();
      onClose();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Errore", "error");
      setDeleting(false);
    }
  }, [firstName, lastName, guest.id, onSaved, onClose, flash]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0, background: T.appBg,
      zIndex: 100, display: "flex", flexDirection: "column",
      fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif",
    }}>
      {/* Header sticky */}
      <header style={{
        background: T.gradient, padding: "14px 18px",
        display: "flex", alignItems: "center", gap: 12,
        position: "sticky", top: 0, zIndex: 20,
        flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.2)",
            border: "1.5px solid rgba(255,255,255,0.3)",
            borderRadius: 8, color: "#fff", fontWeight: 700,
            cursor: "pointer", padding: "6px 10px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.85)", letterSpacing: 1, textTransform: "uppercase" }}>
            Modifica professionista
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", lineHeight: 1.1, marginTop: 2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {guest.first_name} {guest.last_name}
          </div>
        </div>
      </header>

      {/* Body scrollabile */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", paddingBottom: 100 }}>
        {error && (
          <div style={{
            marginBottom: 12, padding: "10px 14px", borderRadius: 10,
            background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)",
            color: T.red, fontWeight: 600, fontSize: 13,
          }}>{error}</div>
        )}
        {success && (
          <div style={{
            marginBottom: 12, padding: "10px 14px", borderRadius: 10,
            background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.2)",
            color: T.green, fontWeight: 600, fontSize: 13,
          }}>{success}</div>
        )}

        {/* ── DATI BASE ─────────────────────────────────────────────── */}
        <SectionMobile title="Dati base">
          <Field label="Nome *">
            <input
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Cognome *">
            <input
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Specialità *">
            <input
              list="specialty-suggest"
              value={specialty}
              onChange={e => setSpecialty(e.target.value)}
              placeholder="Es. Ortopedico"
              style={inputStyle}
            />
            <datalist id="specialty-suggest">
              {SPECIALTY_SUGGESTIONS.map(s => <option key={s} value={s} />)}
            </datalist>
          </Field>
          <Field label="Colore visualizzazione">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {COLOR_PRESETS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: c.value, cursor: "pointer",
                    border: color === c.value ? "3px solid #fff" : "2px solid transparent",
                    boxShadow: color === c.value ? `0 0 0 2px ${c.value}` : "0 1px 3px rgba(0,0,0,0.1)",
                  }}
                  aria-label={c.name}
                />
              ))}
            </div>
          </Field>
          <Field label="Telefono (per WhatsApp)">
            <PhoneInput
              value={phone}
              onChange={setPhone}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nome@esempio.it"
              style={inputStyle}
            />
          </Field>
          <Field label="Note (private)">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Note interne sul collaboratore..."
              rows={2}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
          </Field>
        </SectionMobile>

        {/* ── STANZA PREDEFINITA ────────────────────────────────────── */}
        {rooms.length > 0 && (
          <SectionMobile title="Stanza predefinita">
            <div style={{ fontSize: 11, color: T.mutedSoft, marginBottom: 10, lineHeight: 1.4 }}>
              Stanza preselezionata quando crei nuovi appuntamenti per questo ospite.
            </div>
            <select
              value={defaultRoomId ?? ""}
              onChange={e => setDefaultRoomId(e.target.value || null)}
              style={inputStyle}
            >
              <option value="">— Nessuna stanza —</option>
              {rooms.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </SectionMobile>
        )}

        {/* ── PORTALE PUBBLICO ──────────────────────────────────────── */}
        <SectionMobile title="🔗 Portale pubblico" highlight={!!accessToken}>
          <div style={{ fontSize: 11, color: T.mutedSoft, marginBottom: 12, lineHeight: 1.4 }}>
            Link sicuro da inviare all&apos;ospite via WhatsApp o email per consultare la sua agenda senza login.
            Sempre aggiornata. Sola lettura.
          </div>

          {accessToken ? (
            <>
              <div style={{
                padding: "10px 12px", background: "#fff",
                border: `1px solid ${T.border}`, borderRadius: 8,
                marginBottom: 8,
              }}>
                <div style={{
                  fontSize: 10, color: T.mutedSoft, fontWeight: 800,
                  letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4,
                }}>
                  Link attivo
                </div>
                <div style={{
                  fontSize: 11, color: T.text, fontFamily: "ui-monospace, monospace",
                  wordBreak: "break-all", lineHeight: 1.4,
                }}>
                  {typeof window !== "undefined" ? `${window.location.origin}/agenda/${accessToken}` : `…/agenda/${accessToken}`}
                </div>
              </div>

              {tokenCreatedAt && (
                <div style={{ fontSize: 10, color: T.mutedSoft, marginBottom: 8, lineHeight: 1.5 }}>
                  Generato il {new Date(tokenCreatedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}
                  {lastAccessAt && <> · Ultimo accesso {new Date(lastAccessAt).toLocaleDateString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>}
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleCopyLink}
                  disabled={savingToken}
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 8,
                    background: T.teal, color: "#fff", border: "none",
                    fontSize: 13, fontWeight: 800, cursor: "pointer",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  <Copy size={14} /> Copia link
                </button>
                <button
                  onClick={handleRevokeToken}
                  disabled={savingToken}
                  style={{
                    padding: "10px 14px", borderRadius: 8,
                    background: "#fff", color: T.red,
                    border: `1px solid ${T.red}`,
                    fontSize: 13, fontWeight: 800, cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 6,
                  }}
                >
                  <Unlink size={14} /> Revoca
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={handleGenerateToken}
              disabled={savingToken}
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 10,
                background: T.gradient, color: "#fff", border: "none",
                fontSize: 14, fontWeight: 800, cursor: "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <Link2 size={16} /> {savingToken ? "Generazione…" : "Genera link agenda"}
            </button>
          )}
        </SectionMobile>

        {/* ── CAMPI PDF ─────────────────────────────────────────────── */}
        <SectionMobile title="📄 Campi mostrati nel PDF">
          <div style={{ fontSize: 11, color: T.mutedSoft, marginBottom: 10, lineHeight: 1.4 }}>
            Scegli quali colonne mostrare nel PDF dell&apos;agenda. Data, ora e nome paziente sono sempre presenti.
          </div>
          <CheckboxRow label="Telefono paziente" checked={pdfTelefono} onChange={setPdfTelefono} />
          <CheckboxRow label="Durata appuntamento" checked={pdfDurata} onChange={setPdfDurata} />
          <CheckboxRow label="Diagnosi" checked={pdfDiagnosi} onChange={setPdfDiagnosi} />
          <CheckboxRow label="Note appuntamento" checked={pdfNote} onChange={setPdfNote} />
        </SectionMobile>

        {/* ── ZONA PERICOLO ────────────────────────────────────────── */}
        <SectionMobile title="⚠️ Zona pericolo" danger>
          <div style={{ fontSize: 11, color: T.mutedSoft, marginBottom: 10, lineHeight: 1.4 }}>
            Cancellazione definitiva. Gli appuntamenti già creati rimarranno in DB ma non più collegati.
            <strong style={{ color: T.red, display: "block", marginTop: 4 }}>
              Per nasconderlo senza cancellare, usa &quot;Disattiva&quot; nella lista.
            </strong>
          </div>
          <button
            onClick={handleDelete}
            disabled={deleting || saving}
            style={{
              width: "100%", padding: "11px 14px", borderRadius: 10,
              background: "#fff", color: T.red,
              border: `1px solid ${T.red}`,
              fontSize: 13, fontWeight: 800, cursor: deleting ? "not-allowed" : "pointer",
              opacity: deleting ? 0.5 : 1,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <Trash2 size={14} /> {deleting ? "Cancello..." : "Cancella definitivamente"}
          </button>
        </SectionMobile>
      </div>

      {/* Footer sticky con Salva */}
      <footer style={{
        background: "#fff", borderTop: `1px solid ${T.border}`,
        padding: "12px 16px",
        display: "flex", gap: 10,
        flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          disabled={saving || deleting}
          style={{
            flex: 1, padding: "12px", borderRadius: 10,
            border: `1px solid ${T.border}`, background: "#fff",
            color: T.muted, fontSize: 14, fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Annulla
        </button>
        <button
          onClick={handleSave}
          disabled={saving || deleting}
          style={{
            flex: 2, padding: "12px", borderRadius: 10,
            border: "none", background: T.gradient,
            color: "#fff", fontSize: 14, fontWeight: 800,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Salvataggio..." : "Salva modifiche"}
        </button>
      </footer>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────
function SectionMobile({ title, children, highlight, danger }: { title: string; children: React.ReactNode; highlight?: boolean; danger?: boolean }) {
  return (
    <div style={{
      background: highlight ? "rgba(22,163,74,0.04)" : (danger ? "rgba(220,38,38,0.04)" : "#fff"),
      border: `1px solid ${highlight ? "#86efac" : (danger ? "rgba(220,38,38,0.2)" : T.border)}`,
      borderRadius: 12, padding: 16, marginBottom: 12,
    }}>
      <div style={{
        fontSize: 13, fontWeight: 800, color: T.text,
        marginBottom: 12,
      }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{
        display: "block", fontSize: 10, color: T.mutedSoft,
        fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5,
        marginBottom: 4,
      }}>{label}</label>
      {children}
    </div>
  );
}

function CheckboxRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        padding: "10px 12px", borderRadius: 8,
        border: `1px solid ${T.border}`,
        background: checked ? "rgba(13,148,136,0.04)" : "#fff",
        cursor: "pointer", marginBottom: 6,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{label}</div>
      <div style={{
        width: 40, height: 22, borderRadius: 11,
        background: checked ? T.teal : "#cbd5e1",
        position: "relative", transition: "background 0.2s",
        flexShrink: 0,
      }}>
        <span style={{
          position: "absolute", top: 2,
          left: checked ? 20 : 2,
          width: 18, height: 18, borderRadius: "50%",
          background: "#fff", transition: "left 0.2s",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        }} />
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: `1px solid ${T.border}`, fontSize: 14,
  color: T.text, fontWeight: 600, outline: "none",
  background: "#fff",
};
