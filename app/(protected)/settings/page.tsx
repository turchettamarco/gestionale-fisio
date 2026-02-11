"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../src/lib/supabaseClient";

import Link from "next/link";

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

export default function SettingsPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTemplate, setEditTemplate] = useState("");
  
  const [newName, setNewName] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [addingNew, setAddingNew] = useState(false);

  // Stati per le tariffe
  const [standardInvoice, setStandardInvoice] = useState("40.00");
  const [standardCash, setStandardCash] = useState("35.00");
  const [machineInvoice, setMachineInvoice] = useState("25.00");
  const [machineCash, setMachineCash] = useState("20.00");
  const [autoApplyPrices, setAutoApplyPrices] = useState(true);
  const [savingPrices, setSavingPrices] = useState(false);

  // Stati per le sezioni espandibili
  const [showTemplates, setShowTemplates] = useState(true);
  const [showPrices, setShowPrices] = useState(true);

  // Carica i template
  useEffect(() => {
    loadTemplates();
    loadPrices();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    setError("");
    
    try {
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Errore nel caricamento template:", error);
        setError("Errore nel caricamento: " + error.message);
        setTemplates([]);
      } else {
        console.log("Template caricati:", data);
        setTemplates(data || []);
      }
    } catch (err) {
      console.error("Errore:", err);
      setError("Errore nel caricamento dei template");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadPrices() {
    // Qui implementeresti il caricamento dal DB
    setStandardInvoice("40.00");
    setStandardCash("35.00");
    setMachineInvoice("25.00");
    setMachineCash("20.00");
    setAutoApplyPrices(true);
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

      if (error) {
        console.error("Errore nel salvataggio:", error);
        setError("Errore nel salvataggio: " + error.message);
      } else {
        setSuccess("Template salvato con successo!");
        setEditingId(null);
        await loadTemplates();
        setTimeout(() => setSuccess(""), 3000);
      }
    } catch (err) {
      console.error("Errore:", err);
      setError("Errore nel salvataggio del template");
    }
  }

  async function deleteTemplate(id: string) {
  console.log("Tentativo di eliminazione template:", id);
  
  // Controlla se è l'ultimo template
  if (templates.length <= 1) {
    setError("Non puoi eliminare l'unico template disponibile");
    return;
  }

  // Trova il template da eliminare
  const templateToDelete = templates.find(t => t.id === id);
  if (!templateToDelete) return;

  if (!confirm("Sei sicuro di voler eliminare questo template?\nQuesta azione non può essere annullata.")) return;

  setError("");
  
  try {
    // Se stiamo eliminando il template predefinito, dobbiamo prima impostarne un altro come predefinito
    if (templateToDelete.is_default) {
      // Trova un altro template (il primo che non sia quello da eliminare)
      const otherTemplate = templates.find(t => t.id !== id);
      if (otherTemplate) {
        // Imposta l'altro template come predefinito
        await supabase
          .from("message_templates")
          .update({ is_default: true })
          .eq("id", otherTemplate.id);
      }
    }

    // Ora elimina il template
    const { error } = await supabase
      .from("message_templates")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Errore nell'eliminazione:", error);
      setError("Errore nell'eliminazione: " + error.message);
    } else {
      console.log("Template eliminato con successo");
      setSuccess("Template eliminato con successo!");
      await loadTemplates();
      setTimeout(() => setSuccess(""), 3000);
    }
  } catch (err) {
    console.error("Errore:", err);
    setError("Errore nell'eliminazione del template");
  }
}

  async function setAsDefault(id: string) {
    setError("");
    
    try {
      // Prima rimuovi il default da tutti
      const { error: error1 } = await supabase
        .from("message_templates")
        .update({ is_default: false })
        .neq("id", id);

      if (error1) {
        console.error("Errore nell'aggiornamento:", error1);
        setError("Errore nell'impostazione del default");
        return;
      }

      // Poi imposta come default quello selezionato
      const { error: error2 } = await supabase
        .from("message_templates")
        .update({ is_default: true })
        .eq("id", id);

      if (error2) {
        console.error("Errore nell'aggiornamento:", error2);
        setError("Errore nell'impostazione del default: " + error2.message);
      } else {
        setSuccess("Template impostato come predefinito!");
        await loadTemplates();
        setTimeout(() => setSuccess(""), 3000);
      }
    } catch (err) {
      console.error("Errore:", err);
      setError("Errore nell'impostazione del default");
    }
  }

  async function createNewTemplate() {
    if (!newName.trim() || !newTemplate.trim()) {
      setError("Nome e template sono obbligatori");
      return;
    }

    setError("");
    
    try {
      const isDefault = templates.length === 0; // Se è il primo template, impostalo come default
      
      const { error } = await supabase
        .from("message_templates")
        .insert({
          name: newName.trim(),
          template: newTemplate.trim(),
          is_default: isDefault,
        });

      if (error) {
        console.error("Errore nella creazione:", error);
        setError("Errore nella creazione: " + error.message);
      } else {
        setSuccess("Nuovo template creato!");
        setNewName("");
        setNewTemplate("");
        setAddingNew(false);
        await loadTemplates();
        setTimeout(() => setSuccess(""), 3000);
      }
    } catch (err) {
      console.error("Errore:", err);
      setError("Errore nella creazione del template");
    }
  }

  async function savePrices() {
    setSavingPrices(true);
    setError("");
    
    try {
      // Simulazione salvataggio
      await new Promise(resolve => setTimeout(resolve, 500));
      setSuccess("Tariffe salvate con successo!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError("Errore nel salvataggio delle tariffe");
    } finally {
      setSavingPrices(false);
    }
  }

  // Formatta la preview
  function formatPreview(template: string): string {
    return template
      .replace(/{nome}/g, "Marco")
      .replace(/{data_relativa}/g, "Oggi")
      .replace(/{ora}/g, "10:30")
      .replace(/{luogo}/g, "Studio Pontecorvo, Via Galileo Galilei 5");
  }

  function validatePrice(value: string): string {
    // Rimuovi tutto tranne numeri e punto/decimale
    const clean = value.replace(/[^\d.,]/g, '');
    // Sostituisci virgola con punto
    const normalized = clean.replace(',', '.');
    // Prendi solo due decimali
    const parts = normalized.split('.');
    if (parts.length > 1) {
      return `${parts[0]}.${parts[1].slice(0, 2)}`;
    }
    return normalized || "0.00";
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: COLORS.appBg }}>
      {/* SIDEBAR */}
      <div style={{
        width: 250,
        background: COLORS.panelBg,
        borderRight: `1px solid ${COLORS.border}`,
        padding: 16,
      }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: COLORS.primary }}>FisioHub</div>

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/" style={{ color: COLORS.primary, fontWeight: 800, textDecoration: "none" }}>
            🏠 Home
          </Link>
          <Link href="/calendar" style={{ color: COLORS.primary, fontWeight: 800, textDecoration: "none" }}>
            📅 Calendario
          </Link>
          <Link href="/patients" style={{ color: COLORS.primary, fontWeight: 800, textDecoration: "none" }}>
            👤 Pazienti
          </Link>
          <Link href="/settings" style={{ color: COLORS.secondary, fontWeight: 800, textDecoration: "none" }}>
            ⚙️ Impostazioni
          </Link>
        </div>

        <div style={{ marginTop: 26, fontSize: 12, color: COLORS.muted }}>
          Gestione template e tariffe
        </div>
      </div>

      {/* CONTENUTO PRINCIPALE */}
      <main style={{ flex: 1, padding: 24, overflowY: "auto" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          {/* HEADER */}
          <div>
            <h1 style={{ margin: 0, color: COLORS.patientsAccent, fontWeight: 900, fontSize: 32 }}>
              Impostazioni
            </h1>
            <div style={{ marginTop: 6, fontSize: 12, color: COLORS.muted }}>
              Gestione template WhatsApp • Tariffe trattamenti • Configurazione sistema
            </div>
          </div>

          {error && (
            <div style={{
              marginTop: 12,
              background: "rgba(220,38,38,0.10)",
              border: "1px solid rgba(220,38,38,0.30)",
              color: "#7f1d1d",
              padding: 12,
              borderRadius: 14,
              fontWeight: 800,
            }}>
              ⚠️ Errore: {error}
            </div>
          )}

          {success && (
            <div style={{
              marginTop: 12,
              background: "rgba(22,163,74,0.10)",
              border: "1px solid rgba(22,163,74,0.30)",
              color: "#14532d",
              padding: 12,
              borderRadius: 14,
              fontWeight: 800,
            }}>
              ✅ {success}
            </div>
          )}

          {/* SEZIONE TEMPLATE WHATSAPP */}
          <section style={{
            marginTop: 20,
            background: COLORS.panelBg,
            borderRadius: 16,
            padding: 20,
            boxShadow: "0 10px 30px rgba(15,23,42,0.10)",
            border: `1px solid ${COLORS.border}`,
          }}>
            <div 
              style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center", 
                cursor: "pointer",
                paddingBottom: 12,
                borderBottom: `1px solid ${COLORS.borderSoft}`
              }}
              onClick={() => setShowTemplates(!showTemplates)}
            >
              <div>
                <h2 style={{ margin: 0, color: COLORS.primary, fontWeight: 900, fontSize: 20 }}>
                  Template WhatsApp
                </h2>
                <div style={{ marginTop: 4, fontSize: 12, color: COLORS.muted }}>
                  {templates.length} template configurati • Clicca per {showTemplates ? "nascondere" : "mostrare"}
                </div>
              </div>
              <div style={{ 
                fontSize: 20, 
                color: COLORS.patientsAccent, 
                transform: showTemplates ? "rotate(180deg)" : "rotate(0deg)", 
                transition: "transform 0.3s" 
              }}>
                ▼
              </div>
            </div>

            {showTemplates && (
              <div style={{ marginTop: 16 }}>
                {/* INFO PLACEHOLDER */}
                <div style={{
                  background: "rgba(241,245,249,0.5)",
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                  border: `1px solid ${COLORS.borderSoft}`,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: COLORS.primary, marginBottom: 8 }}>
                    Placeholder disponibili:
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <code style={{ background: "#334155", padding: "4px 8px", borderRadius: 6, fontSize: 12 }}>{`{nome}`}</code>
                    <code style={{ background: "#334155", padding: "4px 8px", borderRadius: 6, fontSize: 12 }}>{`{data_relativa}`}</code>
                    <code style={{ background: "#334155", padding: "4px 8px", borderRadius: 6, fontSize: 12 }}>{`{ora}`}</code>
                    <code style={{ background: "#334155", padding: "4px 8px", borderRadius: 6, fontSize: 12 }}>{`{luogo}`}</code>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 11, color: COLORS.muted }}>
                    I placeholder verranno sostituiti automaticamente con i dati del paziente e dell'appuntamento.
                  </div>
                </div>

                {/* PULSANTE NUOVO TEMPLATE */}
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

                {/* FORM NUOVO TEMPLATE */}
                {addingNew && (
                  <div style={{
                    background: "rgba(13,148,136,0.05)",
                    borderRadius: 12,
                    padding: 20,
                    marginBottom: 20,
                    border: `1px solid rgba(13,148,136,0.2)`,
                  }}>
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
                        placeholder={`Buongiorno {nome},\n\nLe ricordiamo il suo appuntamento di {data_relativa} alle ore **{ora}**.\n\n📍 **{luogo}**\n\nCordiali saluti,\nDr. Marco Turchetta\nFisioterapia e Osteopatia`}
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

                    <div style={{ marginBottom: 16, padding: "12px", background: "#f8fafc", borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: COLORS.muted, marginBottom: 8 }}>Anteprima:</div>
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
                        onClick={createNewTemplate}
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

                {/* LISTA TEMPLATE ESISTENTI */}
                <div>
                  <h3 style={{ margin: "0 0 16px 0", color: COLORS.primary, fontSize: 16 }}>
                    Template esistenti {templates.length > 0 && `(${templates.length})`}
                  </h3>
                  
                  {loading ? (
                    <div style={{ textAlign: "center", padding: 40, color: COLORS.muted }}>
                      Caricamento template...
                    </div>
                  ) : templates.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 40, color: COLORS.muted }}>
                      Nessun template configurato. Crea il primo! (Controlla che la tabella message_templates esista in Supabase)
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
                            <div style={{
                              position: "absolute",
                              top: -8,
                              right: 16,
                              background: COLORS.patientsAccent,
                              color: "white",
                              fontSize: 10,
                              fontWeight: 900,
                              padding: "4px 8px",
                              borderRadius: 999,
                            }}>
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
                              <div style={{ marginBottom: 12, padding: "12px", background: "#f8fafc", borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
                                <div style={{ fontSize: 12, fontWeight: 900, color: COLORS.muted, marginBottom: 8 }}>Anteprima:</div>
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
                                  onClick={() => saveTemplate(template.id)}
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
    onClick={() => setAsDefault(template.id)}
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
      minWidth: 100,
      justifyContent: "center",
    }}
    disabled={template.is_default}
    title={template.is_default ? "Questo template è già predefinito" : "Imposta come predefinito"}
  >
    ⭐ Predefinito
  </button>
  
  <button
    onClick={() => deleteTemplate(template.id)}
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
      minWidth: 80,
      justifyContent: "center",
    }}
    disabled={templates.length <= 1}
    title={templates.length <= 1 ? "Non puoi eliminare l'unico template" : "Elimina template"}
  >
    🗑️ Elimina
  </button>
</div>
                                                            </div>
                              <div style={{
                                fontSize: 13,
                                color: COLORS.muted,
                                whiteSpace: "pre-wrap",
                                background: "#f8fafc",
                                padding: 12,
                                borderRadius: 8,
                                border: `1px solid ${COLORS.border}`,
                                lineHeight: 1.5,
                                marginTop: 8,
                              }}>
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

          {/* SEZIONE TARIFFE TRATTAMENTI */}
          <section style={{
            marginTop: 20,
            background: COLORS.panelBg,
            borderRadius: 16,
            padding: 20,
            boxShadow: "0 10px 30px rgba(15,23,42,0.10)",
            border: `1px solid ${COLORS.border}`,
          }}>
            <div 
              style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center", 
                cursor: "pointer",
                paddingBottom: 12,
                borderBottom: `1px solid ${COLORS.borderSoft}`
              }}
              onClick={() => setShowPrices(!showPrices)}
            >
              <div>
                <h2 style={{ margin: 0, color: COLORS.primary, fontWeight: 900, fontSize: 20 }}>
                  Tariffe Trattamenti
                </h2>
                <div style={{ marginTop: 4, fontSize: 12, color: COLORS.muted }}>
                  Configura i prezzi per i diversi tipi di trattamento • Clicca per {showPrices ? "nascondere" : "mostrare"}
                </div>
              </div>
              <div style={{ 
                fontSize: 20, 
                color: COLORS.patientsAccent, 
                transform: showPrices ? "rotate(180deg)" : "rotate(0deg)", 
                transition: "transform 0.3s" 
              }}>
                ▼
              </div>
            </div>

            {showPrices && (
              <div style={{ marginTop: 20 }}>
                {/* CONTENITORE PRINCIPALE PER LE TARIFFE */}
                <div style={{ 
                  display: "grid", 
                  gridTemplateColumns: "1fr 1fr", 
                  gap: 24,
                  alignItems: "start"
                }}>
                  
                  {/* SEDUTA STANDARD */}
                  <div style={{
                    padding: 20,
                    background: "linear-gradient(135deg, rgba(37, 99, 235, 0.05) 0%, rgba(37, 99, 235, 0.02) 100%)",
                    borderRadius: 12,
                    border: `1px solid rgba(37, 99, 235, 0.15)`,
                    boxShadow: "0 4px 12px rgba(37, 99, 235, 0.05)",
                    minHeight: 200,
                    display: "flex",
                    flexDirection: "column",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                      <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: "rgba(37, 99, 235, 0.1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                      }}>
                        💼
                      </div>
                      <div>
                        <h3 style={{ margin: 0, color: COLORS.primary, fontSize: 18, fontWeight: 900 }}>
                          Seduta Standard
                        </h3>
                        <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
                          Trattamento completo
                        </div>
                      </div>
                    </div>

                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 900, color: COLORS.primary, display: "block", marginBottom: 8 }}>
                          Fatturato (con ricevuta)
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ 
                            fontSize: 16, 
                            fontWeight: 900, 
                            color: COLORS.primary,
                            background: "rgba(37, 99, 235, 0.1)",
                            padding: "8px 12px",
                            borderRadius: 8,
                            minWidth: 40,
                            textAlign: "center"
                          }}>
                            €
                          </span>
                          <input
                            value={standardInvoice}
                            onChange={(e) => setStandardInvoice(validatePrice(e.target.value))}
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
                          <span style={{ 
                            fontSize: 16, 
                            fontWeight: 900, 
                            color: COLORS.primary,
                            background: "rgba(37, 99, 235, 0.1)",
                            padding: "8px 12px",
                            borderRadius: 8,
                            minWidth: 40,
                            textAlign: "center"
                          }}>
                            €
                          </span>
                          <input
                            value={standardCash}
                            onChange={(e) => setStandardCash(validatePrice(e.target.value))}
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
                  
                  {/* SOLO MACCHINARIO */}
                  <div style={{
                    padding: 20,
                    background: "linear-gradient(135deg, rgba(13, 148, 136, 0.05) 0%, rgba(13, 148, 136, 0.02) 100%)",
                    borderRadius: 12,
                    border: `1px solid rgba(13, 148, 136, 0.15)`,
                    boxShadow: "0 4px 12px rgba(13, 148, 136, 0.05)",
                    minHeight: 200,
                    display: "flex",
                    flexDirection: "column",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                      <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: "rgba(13, 148, 136, 0.1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                      }}>
                        🏥
                      </div>
                      <div>
                        <h3 style={{ margin: 0, color: COLORS.patientsAccent, fontSize: 18, fontWeight: 900 }}>
                          Solo Macchinario
                        </h3>
                        <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
                          Terapia strumentale
                        </div>
                      </div>
                    </div>

                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 900, color: COLORS.primary, display: "block", marginBottom: 8 }}>
                          Fatturato (con ricevuta)
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ 
                            fontSize: 16, 
                            fontWeight: 900, 
                            color: COLORS.primary,
                            background: "rgba(13, 148, 136, 0.1)",
                            padding: "8px 12px",
                            borderRadius: 8,
                            minWidth: 40,
                            textAlign: "center"
                          }}>
                            €
                          </span>
                          <input
                            value={machineInvoice}
                            onChange={(e) => setMachineInvoice(validatePrice(e.target.value))}
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
                          <span style={{ 
                            fontSize: 16, 
                            fontWeight: 900, 
                            color: COLORS.primary,
                            background: "rgba(13, 148, 136, 0.1)",
                            padding: "8px 12px",
                            borderRadius: 8,
                            minWidth: 40,
                            textAlign: "center"
                          }}>
                            €
                          </span>
                          <input
                            value={machineCash}
                            onChange={(e) => setMachineCash(validatePrice(e.target.value))}
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
                </div>
                
                {/* CHECKBOX E SALVATAGGIO */}
                <div style={{ marginTop: 30, paddingTop: 20, borderTop: `1px solid ${COLORS.border}` }}>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ 
                      display: "flex", 
                      alignItems: "flex-start", 
                      gap: 12, 
                      cursor: "pointer",
                      maxWidth: 600 
                    }}>
                      <input 
                        type="checkbox" 
                        checked={autoApplyPrices}
                        onChange={(e) => setAutoApplyPrices(e.target.checked)}
                        style={{
                          width: 20,
                          height: 20,
                          cursor: "pointer",
                          marginTop: 2,
                        }}
                      />
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: COLORS.primary, lineHeight: 1.4 }}>
                          ✅ Applica automaticamente questi prezzi quando creo nuovi appuntamenti
                        </div>
                        <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 6, lineHeight: 1.4 }}>
                          I prezzi verranno selezionati automaticamente in base alla preferenza "Fattura/Non fattura" del paziente. 
                          Se disattivato, dovrai selezionare manualmente il prezzo per ogni appuntamento.
                        </div>
                      </div>
                    </label>
                  </div>
                  
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button 
                      onClick={savePrices}
                      disabled={savingPrices}
                      style={{
                        padding: "12px 28px",
                        borderRadius: 12,
                        border: `1px solid ${COLORS.success}`,
                        background: savingPrices ? COLORS.gray : COLORS.success,
                        color: "white",
                        cursor: savingPrices ? "not-allowed" : "pointer",
                        fontWeight: 900,
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        minWidth: 150,
                        justifyContent: "center",
                        boxShadow: "0 4px 12px rgba(22, 163, 74, 0.2)",
                        transition: "all 0.2s",
                      }}
                      onMouseOver={(e) => {
                        if (!savingPrices) {
                          e.currentTarget.style.transform = "translateY(-2px)";
                          e.currentTarget.style.boxShadow = "0 6px 16px rgba(22, 163, 74, 0.3)";
                        }
                      }}
                      onMouseOut={(e) => {
                        if (!savingPrices) {
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.boxShadow = "0 4px 12px rgba(22, 163, 74, 0.2)";
                        }
                      }}
                    >
                      {savingPrices ? (
                        <>
                          <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid white", borderTop: "2px solid transparent", animation: "spin 1s linear infinite" }} />
                          Salvataggio...
                        </>
                      ) : (
                        <>
                          💾 Salva tariffe
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* FOOTER */}
          <div style={{ marginTop: 20, fontSize: 12, color: COLORS.muted, textAlign: "center" }}>
            Sistema gestionale FisioHub • {new Date().getFullYear()}
          </div>
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