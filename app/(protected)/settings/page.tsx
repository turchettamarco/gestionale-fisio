"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../src/lib/supabaseClient";

const COLORS = {
  appBg: "#f1f5f9",
  panelBg: "#ffffff",
  primary: "#1e3a8a",
  secondary: "#2563eb",
  patientsAccent: "#0d9488",
  success: "#16a34a",
  warning: "#f97316",
  danger: "#dc2626",
  muted: "#334155",
  border: "#cbd5e1",
  borderSoft: "#94a3b8",
  gray: "#94a3b8",
};

type MessageTemplate = {
  id: string;
  name: string;
  template: string;
  is_default: boolean;
  created_at: string;
};

type PracticeSettingsRow = {
  owner_id: string;
  practice_name: string | null;
  owner_full_name: string | null;
  vat_number: string | null;
  address: string | null;
  pec_email: string | null;
  phone: string | null;

  // ✅ nuove colonne (devono esistere in DB)
  standard_invoice: number | null;
  standard_cash: number | null;
  machine_invoice: number | null;
  machine_cash: number | null;
  auto_apply_prices: boolean | null;

  created_at?: string;
  updated_at?: string;
};

function toMoneyString(n: number | null | undefined, fallback: string) {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return n.toFixed(2);
}
function toNumberSafe(s: string, fallback: number) {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export default function SettingsPage() {
  // Templates
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // Practice settings
  const [loadingPractice, setLoadingPractice] = useState(true);
  const [savingPractice, setSavingPractice] = useState(false);

  // Alerts
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Template edit/create
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTemplate, setEditTemplate] = useState("");
  const [newName, setNewName] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [addingNew, setAddingNew] = useState(false);

  // Sezioni
  const [showPractice, setShowPractice] = useState(true);
  const [showTemplates, setShowTemplates] = useState(true);
  const [showPrices, setShowPrices] = useState(true);

  // Studio (practice_settings)
  const [practiceName, setPracticeName] = useState("");
  const [ownerFullName, setOwnerFullName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [address, setAddress] = useState("");
  const [pecEmail, setPecEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Tariffe (practice_settings)
  const [standardInvoice, setStandardInvoice] = useState("40.00");
  const [standardCash, setStandardCash] = useState("35.00");
  const [machineInvoice, setMachineInvoice] = useState("25.00");
  const [machineCash, setMachineCash] = useState("20.00");
  const [autoApplyPrices, setAutoApplyPrices] = useState(true);

  // Caricamenti iniziali
  useEffect(() => {
    void (async () => {
      setError("");
      await Promise.all([loadPracticeSettings(), loadTemplates()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flashSuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  }

  async function requireUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(error.message);
    const uid = data?.user?.id;
    if (!uid) throw new Error("Utente non autenticato.");
    return uid;
  }

  async function loadPracticeSettings() {
    setLoadingPractice(true);
    setError("");

    try {
      const uid = await requireUserId();

      // Prendi la riga del tuo owner_id
      const { data, error } = await supabase
        .from("practice_settings")
        .select(
          "owner_id, practice_name, owner_full_name, vat_number, address, pec_email, phone, standard_invoice, standard_cash, machine_invoice, machine_cash, auto_apply_prices"
        )
        .eq("owner_id", uid)
        .maybeSingle();

      if (error) throw new Error(error.message);

      // Se non esiste, creala (upsert)
      if (!data) {
        // DB: owner_full_name è NOT NULL -> mai inserire null.
        const { data: uData, error: uErr } = await supabase.auth.getUser();
        if (uErr) throw new Error(uErr.message);

        const u = uData?.user;
        const fullNameRaw =
          (u?.user_metadata?.full_name ||
            u?.user_metadata?.name ||
            [u?.user_metadata?.first_name, u?.user_metadata?.last_name].filter(Boolean).join(" ") ||
            u?.email ||
            "Titolare") + "";

        const fullName = fullNameRaw.trim() || "Titolare";

        const seed: PracticeSettingsRow = {
          owner_id: uid,
          practice_name: "FisioHub",
          owner_full_name: fullName,
          vat_number: "",
          address: "",
          pec_email: "",
          phone: "",

          standard_invoice: 40,
          standard_cash: 35,
          machine_invoice: 25,
          machine_cash: 20,
          auto_apply_prices: true,
        };

        const { error: upsertErr } = await supabase
          .from("practice_settings")
          .upsert(seed, { onConflict: "owner_id" });

        if (upsertErr) throw new Error(upsertErr.message);

        // Ricarica dopo creazione
        return await loadPracticeSettings();
      }

      // Popola UI
      setPracticeName(data.practice_name ?? "");
      setOwnerFullName(data.owner_full_name ?? "");
      setVatNumber(data.vat_number ?? "");
      setAddress(data.address ?? "");
      setPecEmail(data.pec_email ?? "");
      setPhone(data.phone ?? "");

      setStandardInvoice(toMoneyString(data.standard_invoice, "40.00"));
      setStandardCash(toMoneyString(data.standard_cash, "35.00"));
      setMachineInvoice(toMoneyString(data.machine_invoice, "25.00"));
      setMachineCash(toMoneyString(data.machine_cash, "20.00"));
      setAutoApplyPrices(data.auto_apply_prices ?? true);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Errore nel caricamento impostazioni studio.");
    } finally {
      setLoadingPractice(false);
    }
  }

  async function savePracticeSettings() {
    setSavingPractice(true);
    setError("");

    try {
      const uid = await requireUserId();

      const payload: PracticeSettingsRow = {
        owner_id: uid,
        practice_name: practiceName.trim() || "FisioHub",
        owner_full_name: ownerFullName.trim() || "Titolare",
        vat_number: vatNumber.trim() || "",
        address: address.trim() || "",
        pec_email: pecEmail.trim() || "",
        phone: phone.trim() || "",

        standard_invoice: toNumberSafe(standardInvoice, 40),
        standard_cash: toNumberSafe(standardCash, 35),
        machine_invoice: toNumberSafe(machineInvoice, 25),
        machine_cash: toNumberSafe(machineCash, 20),
        auto_apply_prices: autoApplyPrices,
      };

      const { error } = await supabase
        .from("practice_settings")
        .upsert(payload, { onConflict: "owner_id" });

      if (error) throw new Error(error.message);

      flashSuccess("Impostazioni salvate con successo!");
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Errore nel salvataggio impostazioni.");
    } finally {
      setSavingPractice(false);
    }
  }

  async function loadTemplates() {
    setLoadingTemplates(true);
    setError("");

    try {
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      setTemplates((data as MessageTemplate[]) || []);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Errore nel caricamento dei template");
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function saveTemplate(id: string) {
    if (!editName.trim() || !editTemplate.trim()) {
      setError("Nome e template sono obbligatori");
      return;
    }

    setError("");

    try {
      const { error } = await supabase
        .from("message_templates")
        .update({
          name: editName.trim(),
          template: editTemplate.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw new Error(error.message);

      flashSuccess("Template salvato con successo!");
      setEditingId(null);
      await loadTemplates();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Errore nel salvataggio del template");
    }
  }

  async function deleteTemplate(id: string) {
    if (templates.length <= 1) {
      setError("Non puoi eliminare l'unico template disponibile");
      return;
    }

    const templateToDelete = templates.find((t) => t.id === id);
    if (!templateToDelete) return;

    if (
      !confirm(
        "Sei sicuro di voler eliminare questo template?\nQuesta azione non può essere annullata."
      )
    )
      return;

    setError("");

    try {
      // Se elimini il default, assegna default ad un altro prima
      if (templateToDelete.is_default) {
        const other = templates.find((t) => t.id !== id);
        if (other) {
          const { error: e1 } = await supabase
            .from("message_templates")
            .update({ is_default: true })
            .eq("id", other.id);
          if (e1) throw new Error(e1.message);
        }
      }

      const { error } = await supabase
        .from("message_templates")
        .delete()
        .eq("id", id);

      if (error) throw new Error(error.message);

      flashSuccess("Template eliminato con successo!");
      await loadTemplates();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Errore nell'eliminazione del template");
    }
  }

  async function setAsDefault(id: string) {
    setError("");

    try {
      // Nota: senza transazione, ma ok per uso normale.
      const { error: error1 } = await supabase
        .from("message_templates")
        .update({ is_default: false })
        .neq("id", id);
      if (error1) throw new Error(error1.message);

      const { error: error2 } = await supabase
        .from("message_templates")
        .update({ is_default: true })
        .eq("id", id);
      if (error2) throw new Error(error2.message);

      flashSuccess("Template impostato come predefinito!");
      await loadTemplates();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Errore nell'impostazione del default");
    }
  }

  async function createNewTemplate() {
    if (!newName.trim() || !newTemplate.trim()) {
      setError("Nome e template sono obbligatori");
      return;
    }

    setError("");

    try {
      const isDefault = templates.length === 0;

      const { error } = await supabase.from("message_templates").insert({
        name: newName.trim(),
        template: newTemplate.trim(),
        is_default: isDefault,
      });

      if (error) throw new Error(error.message);

      flashSuccess("Nuovo template creato!");
      setNewName("");
      setNewTemplate("");
      setAddingNew(false);
      await loadTemplates();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Errore nella creazione del template");
    }
  }

  function formatPreview(template: string): string {
    return template
      .replace(/{nome}/g, "Marco")
      .replace(/{data_relativa}/g, "Oggi")
      .replace(/{ora}/g, "10:30")
      .replace(/{luogo}/g, "Studio Pontecorvo, Via Galileo Galilei 5");
  }

  function validatePrice(value: string): string {
    const clean = value.replace(/[^\d.,]/g, "");
    const normalized = clean.replace(",", ".");
    const parts = normalized.split(".");
    if (parts.length > 1) return `${parts[0]}.${parts[1].slice(0, 2)}`;
    return normalized || "0.00";
  }

  const anyLoading = useMemo(
    () => loadingPractice || loadingTemplates,
    [loadingPractice, loadingTemplates]
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: COLORS.appBg }}>
      {/* SIDEBAR */}
      <div
        style={{
          width: 250,
          background: COLORS.panelBg,
          borderRight: `1px solid ${COLORS.border}`,
          padding: 16,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900, color: COLORS.primary }}>
          FisioHub
        </div>

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/" style={{ color: COLORS.primary, fontWeight: 800, textDecoration: "none" }}>
            🏠 Home
          </Link>
          <Link
            href="/calendar"
            style={{ color: COLORS.primary, fontWeight: 800, textDecoration: "none" }}
          >
            📅 Calendario
          </Link>
          <Link
            href="/patients"
            style={{ color: COLORS.primary, fontWeight: 800, textDecoration: "none" }}
          >
            👤 Pazienti
          </Link>
          <Link
            href="/settings"
            style={{ color: COLORS.secondary, fontWeight: 800, textDecoration: "none" }}
          >
            ⚙️ Impostazioni
          </Link>
        </div>

        <div style={{ marginTop: 26, fontSize: 12, color: COLORS.muted }}>
          Studio • Tariffe • Template
        </div>
      </div>

      {/* CONTENUTO */}
      <main style={{ flex: 1, padding: 24, overflowY: "auto" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          {/* HEADER */}
          <div>
            <h1 style={{ margin: 0, color: COLORS.patientsAccent, fontWeight: 900, fontSize: 32 }}>
              Impostazioni
            </h1>
            <div style={{ marginTop: 6, fontSize: 12, color: COLORS.muted }}>
              Dati studio • Tariffe trattamenti • Template WhatsApp
            </div>
          </div>

          {error && (
            <div
              style={{
                marginTop: 12,
                background: "rgba(220,38,38,0.10)",
                border: "1px solid rgba(220,38,38,0.30)",
                color: "#7f1d1d",
                padding: 12,
                borderRadius: 14,
                fontWeight: 800,
              }}
            >
              ⚠️ Errore: {error}
            </div>
          )}

          {success && (
            <div
              style={{
                marginTop: 12,
                background: "rgba(22,163,74,0.10)",
                border: "1px solid rgba(22,163,74,0.30)",
                color: "#14532d",
                padding: 12,
                borderRadius: 14,
                fontWeight: 800,
              }}
            >
              ✅ {success}
            </div>
          )}

          {/* SEZIONE STUDIO */}
          <section
            style={{
              marginTop: 20,
              background: COLORS.panelBg,
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 10px 30px rgba(15,23,42,0.10)",
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                paddingBottom: 12,
                borderBottom: `1px solid ${COLORS.borderSoft}`,
              }}
              onClick={() => setShowPractice(!showPractice)}
            >
              <div>
                <h2 style={{ margin: 0, color: COLORS.primary, fontWeight: 900, fontSize: 20 }}>
                  Dati Studio
                </h2>
                <div style={{ marginTop: 4, fontSize: 12, color: COLORS.muted }}>
                  {loadingPractice ? "Caricamento..." : "Gestisci anagrafica e contatti"}
                </div>
              </div>
              <div
                style={{
                  fontSize: 20,
                  color: COLORS.patientsAccent,
                  transform: showPractice ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.3s",
                }}
              >
                ▼
              </div>
            </div>

            {showPractice && (
              <div style={{ marginTop: 16, opacity: loadingPractice ? 0.7 : 1 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                  }}
                >
                  <Field label="Nome studio" value={practiceName} setValue={setPracticeName} />
                  <Field
                    label="Titolare (nome e cognome)"
                    value={ownerFullName}
                    setValue={setOwnerFullName}
                  />
                  <Field label="Partita IVA" value={vatNumber} setValue={setVatNumber} />
                  <Field label="Telefono" value={phone} setValue={setPhone} />
                  <Field label="PEC" value={pecEmail} setValue={setPecEmail} />
                  <Field
                    label="Indirizzo"
                    value={address}
                    setValue={setAddress}
                    full
                  />
                </div>

                <div
                  style={{
                    marginTop: 16,
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                  }}
                >
                  <button
                    onClick={() => void loadPracticeSettings()}
                    disabled={loadingPractice || savingPractice}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 12,
                      border: `1px solid ${COLORS.borderSoft}`,
                      background: "#fff",
                      color: COLORS.muted,
                      cursor: loadingPractice || savingPractice ? "not-allowed" : "pointer",
                      fontWeight: 900,
                      fontSize: 13,
                    }}
                    title="Ricarica da database"
                  >
                    🔄 Ricarica
                  </button>

                  <button
                    onClick={() => void savePracticeSettings()}
                    disabled={loadingPractice || savingPractice}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 12,
                      border: `1px solid ${COLORS.success}`,
                      background: savingPractice ? COLORS.gray : COLORS.success,
                      color: "white",
                      cursor: loadingPractice || savingPractice ? "not-allowed" : "pointer",
                      fontWeight: 900,
                      fontSize: 13,
                      minWidth: 160,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    {savingPractice ? "Salvataggio..." : "💾 Salva dati studio"}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* SEZIONE TARIFFE */}
          <section
            style={{
              marginTop: 20,
              background: COLORS.panelBg,
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 10px 30px rgba(15,23,42,0.10)",
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                paddingBottom: 12,
                borderBottom: `1px solid ${COLORS.borderSoft}`,
              }}
              onClick={() => setShowPrices(!showPrices)}
            >
              <div>
                <h2 style={{ margin: 0, color: COLORS.primary, fontWeight: 900, fontSize: 20 }}>
                  Tariffe Trattamenti
                </h2>
                <div style={{ marginTop: 4, fontSize: 12, color: COLORS.muted }}>
                  Salva in practice_settings • {autoApplyPrices ? "Auto-applica ON" : "Auto-applica OFF"}
                </div>
              </div>
              <div
                style={{
                  fontSize: 20,
                  color: COLORS.patientsAccent,
                  transform: showPrices ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.3s",
                }}
              >
                ▼
              </div>
            </div>

            {showPrices && (
              <div style={{ marginTop: 20, opacity: loadingPractice ? 0.7 : 1 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 24,
                    alignItems: "start",
                  }}
                >
                  <PriceCard
                    title="Seduta Standard"
                    subtitle="Trattamento completo"
                    icon="💼"
                    accent="rgba(37, 99, 235, 0.1)"
                    border="rgba(37, 99, 235, 0.15)"
                    invoiceValue={standardInvoice}
                    onInvoice={(v) => setStandardInvoice(validatePrice(v))}
                    cashValue={standardCash}
                    onCash={(v) => setStandardCash(validatePrice(v))}
                  />

                  <PriceCard
                    title="Solo Macchinario"
                    subtitle="Terapia strumentale"
                    icon="🏥"
                    accent="rgba(13, 148, 136, 0.1)"
                    border="rgba(13, 148, 136, 0.15)"
                    invoiceValue={machineInvoice}
                    onInvoice={(v) => setMachineInvoice(validatePrice(v))}
                    cashValue={machineCash}
                    onCash={(v) => setMachineCash(validatePrice(v))}
                  />
                </div>

                <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", maxWidth: 650 }}>
                    <input
                      type="checkbox"
                      checked={autoApplyPrices}
                      onChange={(e) => setAutoApplyPrices(e.target.checked)}
                      style={{ width: 20, height: 20, cursor: "pointer", marginTop: 2 }}
                    />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.primary, lineHeight: 1.4 }}>
                        ✅ Applica automaticamente questi prezzi nei nuovi appuntamenti
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 6, lineHeight: 1.4 }}>
                        Se disattivato, selezioni manualmente il prezzo per ogni appuntamento.
                      </div>
                    </div>
                  </label>

                  <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button
                      onClick={() => void loadPracticeSettings()}
                      disabled={loadingPractice || savingPractice}
                      style={{
                        padding: "10px 16px",
                        borderRadius: 12,
                        border: `1px solid ${COLORS.borderSoft}`,
                        background: "#fff",
                        color: COLORS.muted,
                        cursor: loadingPractice || savingPractice ? "not-allowed" : "pointer",
                        fontWeight: 900,
                        fontSize: 13,
                      }}
                    >
                      🔄 Ricarica
                    </button>

                    <button
                      onClick={() => void savePracticeSettings()}
                      disabled={loadingPractice || savingPractice}
                      style={{
                        padding: "10px 16px",
                        borderRadius: 12,
                        border: `1px solid ${COLORS.success}`,
                        background: savingPractice ? COLORS.gray : COLORS.success,
                        color: "white",
                        cursor: loadingPractice || savingPractice ? "not-allowed" : "pointer",
                        fontWeight: 900,
                        fontSize: 13,
                        minWidth: 180,
                      }}
                    >
                      {savingPractice ? "Salvataggio..." : "💾 Salva tariffe"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* SEZIONE TEMPLATE */}
          <section
            style={{
              marginTop: 20,
              background: COLORS.panelBg,
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 10px 30px rgba(15,23,42,0.10)",
              border: `1px solid ${COLORS.border}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                paddingBottom: 12,
                borderBottom: `1px solid ${COLORS.borderSoft}`,
              }}
              onClick={() => setShowTemplates(!showTemplates)}
            >
              <div>
                <h2 style={{ margin: 0, color: COLORS.primary, fontWeight: 900, fontSize: 20 }}>
                  Template WhatsApp
                </h2>
                <div style={{ marginTop: 4, fontSize: 12, color: COLORS.muted }}>
                  {templates.length} template • Clicca per {showTemplates ? "nascondere" : "mostrare"}
                </div>
              </div>
              <div
                style={{
                  fontSize: 20,
                  color: COLORS.patientsAccent,
                  transform: showTemplates ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.3s",
                }}
              >
                ▼
              </div>
            </div>

            {showTemplates && (
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    background: "rgba(241,245,249,0.5)",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 16,
                    border: `1px solid ${COLORS.borderSoft}`,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 900, color: COLORS.primary, marginBottom: 8 }}>
                    Placeholder disponibili:
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <code style={{ background: "#334155", padding: "4px 8px", borderRadius: 6, fontSize: 12 }}>
                      {"{nome}"}
                    </code>
                    <code style={{ background: "#334155", padding: "4px 8px", borderRadius: 6, fontSize: 12 }}>
                      {"{data_relativa}"}
                    </code>
                    <code style={{ background: "#334155", padding: "4px 8px", borderRadius: 6, fontSize: 12 }}>
                      {"{ora}"}
                    </code>
                    <code style={{ background: "#334155", padding: "4px 8px", borderRadius: 6, fontSize: 12 }}>
                      {"{luogo}"}
                    </code>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 11, color: COLORS.muted }}>
                    I placeholder verranno sostituiti automaticamente con i dati del paziente e dell&apos;appuntamento.
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                  <button
                    onClick={() => setAddingNew(!addingNew)}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 12,
                      border: `1px solid ${COLORS.patientsAccent}`,
                      background: addingNew ? "#ffffff" : COLORS.patientsAccent,
                      color: addingNew ? COLORS.patientsAccent : "white",
                      cursor: "pointer",
                      fontWeight: 900,
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {addingNew ? "✕ Annulla" : "＋ Nuovo template"}
                  </button>
                </div>

                {addingNew && (
                  <div
                    style={{
                      background: "rgba(13,148,136,0.05)",
                      borderRadius: 12,
                      padding: 20,
                      marginBottom: 20,
                      border: `1px solid rgba(13,148,136,0.2)`,
                    }}
                  >
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 13, fontWeight: 900, color: COLORS.primary, display: "block", marginBottom: 8 }}>
                        Nome template *
                      </label>
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Es. Promemoria standard"
                        style={{
                          width: "100%",
                          padding: "12px",
                          borderRadius: 8,
                          border: `1px solid ${COLORS.borderSoft}`,
                          background: "#fff",
                          color: "#0f172a",
                          outline: "none",
                          fontSize: 14,
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 13, fontWeight: 900, color: COLORS.primary, display: "block", marginBottom: 8 }}>
                        Template messaggio *
                      </label>
                      <textarea
                        value={newTemplate}
                        onChange={(e) => setNewTemplate(e.target.value)}
                        rows={8}
                        style={{
                          width: "100%",
                          padding: "12px",
                          borderRadius: 8,
                          border: `1px solid ${COLORS.borderSoft}`,
                          background: "#fff",
                          color: "#0f172a",
                          outline: "none",
                          fontSize: 14,
                          fontFamily: "monospace",
                          resize: "vertical",
                          lineHeight: 1.5,
                        }}
                      />
                    </div>

                    <div
                      style={{
                        marginBottom: 16,
                        padding: "12px",
                        background: "#f8fafc",
                        borderRadius: 8,
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 900, color: COLORS.muted, marginBottom: 8 }}>
                        Anteprima:
                      </div>
                      <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: COLORS.primary, lineHeight: 1.5 }}>
                        {formatPreview(newTemplate || "Inserisci il template per vedere l'anteprima")}
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                      <button
                        onClick={() => {
                          setNewName("");
                          setNewTemplate("");
                          setAddingNew(false);
                        }}
                        style={{
                          padding: "10px 20px",
                          borderRadius: 8,
                          border: `1px solid ${COLORS.borderSoft}`,
                          background: "#fff",
                          color: COLORS.muted,
                          cursor: "pointer",
                          fontWeight: 900,
                          fontSize: 14,
                        }}
                      >
                        Annulla
                      </button>
                      <button
                        onClick={() => void createNewTemplate()}
                        style={{
                          padding: "10px 20px",
                          borderRadius: 8,
                          border: `1px solid ${COLORS.success}`,
                          background: COLORS.success,
                          color: "white",
                          cursor: "pointer",
                          fontWeight: 900,
                          fontSize: 14,
                        }}
                      >
                        Crea template
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <h3 style={{ margin: "0 0 16px 0", color: COLORS.primary, fontSize: 16 }}>
                    Template esistenti {templates.length > 0 && `(${templates.length})`}
                  </h3>

                  {loadingTemplates ? (
                    <div style={{ textAlign: "center", padding: 40, color: COLORS.muted }}>Caricamento template...</div>
                  ) : templates.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 40, color: COLORS.muted }}>
                      Nessun template configurato.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {templates.map((template) => (
                        <div
                          key={template.id}
                          style={{
                            padding: 16,
                            background: template.is_default ? "rgba(13,148,136,0.05)" : "#fff",
                            borderRadius: 12,
                            border: `1px solid ${template.is_default ? COLORS.patientsAccent : COLORS.borderSoft}`,
                            position: "relative",
                          }}
                        >
                          {template.is_default && (
                            <div
                              style={{
                                position: "absolute",
                                top: -8,
                                right: 16,
                                background: COLORS.patientsAccent,
                                color: "white",
                                fontSize: 10,
                                fontWeight: 900,
                                padding: "4px 8px",
                                borderRadius: 999,
                              }}
                            >
                              PREDEFINITO
                            </div>
                          )}

                          {editingId === template.id ? (
                            <div>
                              <div style={{ marginBottom: 12 }}>
                                <input
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  style={{
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: 8,
                                    border: `1px solid ${COLORS.borderSoft}`,
                                    background: "#fff",
                                    color: "#0f172a",
                                    outline: "none",
                                    fontSize: 14,
                                    fontWeight: 900,
                                  }}
                                />
                              </div>

                              <div style={{ marginBottom: 12 }}>
                                <textarea
                                  value={editTemplate}
                                  onChange={(e) => setEditTemplate(e.target.value)}
                                  rows={6}
                                  style={{
                                    width: "100%",
                                    padding: "12px",
                                    borderRadius: 8,
                                    border: `1px solid ${COLORS.borderSoft}`,
                                    background: "#fff",
                                    color: "#0f172a",
                                    outline: "none",
                                    fontSize: 14,
                                    fontFamily: "monospace",
                                    resize: "vertical",
                                  }}
                                />
                              </div>

                              <div
                                style={{
                                  marginBottom: 12,
                                  padding: "12px",
                                  background: "#f8fafc",
                                  borderRadius: 8,
                                  border: `1px solid ${COLORS.border}`,
                                }}
                              >
                                <div style={{ fontSize: 12, fontWeight: 900, color: COLORS.muted, marginBottom: 8 }}>
                                  Anteprima:
                                </div>
                                <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: COLORS.primary, lineHeight: 1.5 }}>
                                  {formatPreview(editTemplate || "Anteprima")}
                                </div>
                              </div>

                              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                <button
                                  onClick={() => setEditingId(null)}
                                  style={{
                                    padding: "8px 16px",
                                    borderRadius: 8,
                                    border: `1px solid ${COLORS.borderSoft}`,
                                    background: "#fff",
                                    color: COLORS.muted,
                                    cursor: "pointer",
                                    fontWeight: 900,
                                    fontSize: 13,
                                  }}
                                >
                                  Annulla
                                </button>
                                <button
                                  onClick={() => void saveTemplate(template.id)}
                                  style={{
                                    padding: "8px 16px",
                                    borderRadius: 8,
                                    border: `1px solid ${COLORS.success}`,
                                    background: COLORS.success,
                                    color: "white",
                                    cursor: "pointer",
                                    fontWeight: 900,
                                    fontSize: 13,
                                  }}
                                >
                                  Salva modifiche
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                                <div style={{ flex: 1 }}>
                                  <h4 style={{ margin: 0, color: COLORS.primary, fontSize: 15 }}>
                                    {template.name}
                                    {template.is_default && (
                                      <span style={{ marginLeft: 8, fontSize: 11, color: COLORS.patientsAccent, fontWeight: 900 }}>
                                        (Predefinito)
                                      </span>
                                    )}
                                  </h4>
                                  <div style={{ marginTop: 4, fontSize: 12, color: COLORS.muted }}>
                                    Creato: {new Date(template.created_at).toLocaleDateString("it-IT")}
                                  </div>
                                </div>

                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                  <button
                                    onClick={() => {
                                      setEditingId(template.id);
                                      setEditName(template.name);
                                      setEditTemplate(template.template);
                                    }}
                                    style={{
                                      padding: "6px 12px",
                                      borderRadius: 8,
                                      border: `1px solid ${COLORS.secondary}`,
                                      background: COLORS.secondary,
                                      color: "white",
                                      cursor: "pointer",
                                      fontWeight: 900,
                                      fontSize: 12,
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 4,
                                      minWidth: 80,
                                      justifyContent: "center",
                                    }}
                                  >
                                    ✏️ Modifica
                                  </button>

                                  <button
                                    onClick={() => void setAsDefault(template.id)}
                                    disabled={template.is_default}
                                    title={template.is_default ? "Questo template è già predefinito" : "Imposta come predefinito"}
                                    style={{
                                      padding: "6px 12px",
                                      borderRadius: 8,
                                      border: `1px solid ${COLORS.patientsAccent}`,
                                      background: template.is_default ? COLORS.gray : COLORS.patientsAccent,
                                      color: "white",
                                      cursor: template.is_default ? "not-allowed" : "pointer",
                                      fontWeight: 900,
                                      fontSize: 12,
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 4,
                                      minWidth: 110,
                                      justifyContent: "center",
                                    }}
                                  >
                                    ⭐ Predefinito
                                  </button>

                                  <button
                                    onClick={() => void deleteTemplate(template.id)}
                                    disabled={templates.length <= 1}
                                    title={templates.length <= 1 ? "Non puoi eliminare l'unico template" : "Elimina template"}
                                    style={{
                                      padding: "6px 12px",
                                      borderRadius: 8,
                                      border: `1px solid ${COLORS.danger}`,
                                      background: templates.length <= 1 ? COLORS.gray : COLORS.danger,
                                      color: "white",
                                      cursor: templates.length <= 1 ? "not-allowed" : "pointer",
                                      fontWeight: 900,
                                      fontSize: 12,
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 4,
                                      minWidth: 90,
                                      justifyContent: "center",
                                    }}
                                  >
                                    🗑️ Elimina
                                  </button>
                                </div>
                              </div>

                              <div
                                style={{
                                  fontSize: 13,
                                  color: COLORS.muted,
                                  whiteSpace: "pre-wrap",
                                  background: "#f8fafc",
                                  padding: 12,
                                  borderRadius: 8,
                                  border: `1px solid ${COLORS.border}`,
                                  lineHeight: 1.5,
                                  marginTop: 8,
                                }}
                              >
                                {template.template}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <div style={{ marginTop: 20, fontSize: 12, color: COLORS.muted, textAlign: "center" }}>
            Sistema gestionale FisioHub • {new Date().getFullYear()}
          </div>

          {anyLoading && (
            <div style={{ marginTop: 12, fontSize: 12, color: COLORS.muted, textAlign: "center" }}>
              Caricamento impostazioni...
            </div>
          )}
        </div>
      </main>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  value,
  setValue,
  full,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  full?: boolean;
}) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : undefined }}>
      <label style={{ fontSize: 13, fontWeight: 900, color: COLORS.primary, display: "block", marginBottom: 8 }}>
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: 8,
          border: `1px solid ${COLORS.borderSoft}`,
          background: "#fff",
          color: "#0f172a",
          outline: "none",
          fontSize: 14,
        }}
      />
    </div>
  );
}

function PriceCard({
  title,
  subtitle,
  icon,
  accent,
  border,
  invoiceValue,
  cashValue,
  onInvoice,
  onCash,
}: {
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  border: string;
  invoiceValue: string;
  cashValue: string;
  onInvoice: (v: string) => void;
  onCash: (v: string) => void;
}) {
  return (
    <div
      style={{
        padding: 20,
        background: `linear-gradient(135deg, ${accent} 0%, rgba(255,255,255,0.02) 100%)`,
        borderRadius: 12,
        border: `1px solid ${border}`,
        boxShadow: "0 4px 12px rgba(15,23,42,0.05)",
        minHeight: 200,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
          }}
        >
          {icon}
        </div>
        <div>
          <h3 style={{ margin: 0, color: COLORS.primary, fontSize: 18, fontWeight: 900 }}>{title}</h3>
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 900, color: COLORS.primary, display: "block", marginBottom: 8 }}>
            Fatturato (con ricevuta)
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: COLORS.primary,
                background: accent,
                padding: "8px 12px",
                borderRadius: 8,
                minWidth: 40,
                textAlign: "center",
              }}
            >
              €
            </span>
            <input
              value={invoiceValue}
              onChange={(e) => onInvoice(e.target.value)}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: 8,
                border: `1px solid ${COLORS.borderSoft}`,
                background: "#fff",
                color: "#0f172a",
                outline: "none",
                fontSize: 16,
                fontWeight: 900,
                textAlign: "right",
                boxShadow: "inset 0 2px 4px rgba(0,0,0,0.05)",
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 900, color: COLORS.primary, display: "block", marginBottom: 8 }}>
            A nero (senza ricevuta)
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: COLORS.primary,
                background: accent,
                padding: "8px 12px",
                borderRadius: 8,
                minWidth: 40,
                textAlign: "center",
              }}
            >
              €
            </span>
            <input
              value={cashValue}
              onChange={(e) => onCash(e.target.value)}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: 8,
                border: `1px solid ${COLORS.borderSoft}`,
                background: "#fff",
                color: "#0f172a",
                outline: "none",
                fontSize: 16,
                fontWeight: 900,
                textAlign: "right",
                boxShadow: "inset 0 2px 4px rgba(0,0,0,0.05)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
