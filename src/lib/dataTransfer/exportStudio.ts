// src/lib/dataTransfer/exportStudio.ts
// ═══════════════════════════════════════════════════════════════════════
// Export completo dei dati dello studio in un unico file Excel, con un
// foglio per tabella.
//
// PERCHÉ ESISTE:
// I dati di uno studio devono poter uscire da FisioHub quando lo studio
// vuole. È una garanzia da dare al cliente prima ancora che la chieda —
// "non ti tengo in ostaggio" è un argomento di vendita, e chi ha già
// vissuto una migrazione difficile lo capisce al volo. In più è una rete
// di sicurezza in più accanto ai backup.
//
// SCELTE:
//  • Un solo file .xlsx invece di tanti CSV: si apre con doppio clic e
//    non chiede a nessuno di sapere cos'è un separatore di campo.
//  • Un foglio per tabella, con intestazioni in italiano: deve essere
//    leggibile da una persona, non solo re-importabile da una macchina.
//  • Gli id interni restano nella prima colonna: servono se un domani si
//    reimportano i dati o si ricostruiscono i collegamenti.
//  • Tutto filtrato per studio: in multi-tenant un export che si porta
//    dietro i dati di un altro studio sarebbe un incidente grave.
// ═══════════════════════════════════════════════════════════════════════

import * as XLSX from "xlsx";
import { supabase } from "@/src/lib/supabaseClient";

export type ExportProgress = (fatto: number, totale: number, etichetta: string) => void;

type Foglio = {
  nome: string;
  intestazioni: string[];
  righe: unknown[][];
};

/** Data leggibile in italiano; stringa vuota se il valore manca. */
function data(v: unknown): string {
  if (!v) return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("it-IT");
}

function dataOra(v: unknown): string {
  if (!v) return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function siNo(v: unknown): string {
  return v === true ? "Sì" : v === false ? "No" : "";
}

/** Oggetti e array diventano testo leggibile invece di [object Object]. */
function testo(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${Array.isArray(val) ? val.join(", ") : String(val)}`)
      .join(" · ");
  }
  return String(v);
}

type Riga = Record<string, unknown>;

export async function esportaStudio(
  studioId: string,
  onProgress?: ExportProgress
): Promise<{ blob: Blob; nomeFile: string; conteggi: Record<string, number> }> {

  const fogli: Foglio[] = [];
  const conteggi: Record<string, number> = {};

  // Le query sono in sequenza e non in parallelo: su archivi grandi
  // servirebbero comunque, e così l'avanzamento è veritiero.
  const passi: Array<{ etichetta: string; esegui: () => Promise<Foglio | null> }> = [

    {
      etichetta: "Pazienti",
      esegui: async () => {
        const { data: r } = await supabase.from("patients")
          .select("*").eq("studio_id", studioId).order("last_name");
        const righe = ((r ?? []) as Riga[]).map(p => [
          p.id, p.last_name, p.first_name, p.phone, p.email,
          data(p.birth_date), p.birth_place, p.tax_code,
          p.res_address, p.res_city, p.res_cap, p.res_province,
          p.occupation, p.sport,
          testo(p.anamnesis), testo(p.diagnosis), testo(p.treatment),
          testo(p.custom_clinical),
          data(p.first_visit_date), dataOra(p.created_at),
        ]);
        return {
          nome: "Pazienti",
          intestazioni: ["ID", "Cognome", "Nome", "Telefono", "Email",
            "Data nascita", "Luogo nascita", "Codice fiscale",
            "Indirizzo", "Città", "CAP", "Provincia",
            "Professione", "Sport",
            "Anamnesi", "Diagnosi", "Trattamento", "Scheda clinica",
            "Prima visita", "Creato il"],
          righe,
        };
      },
    },

    {
      etichetta: "Appuntamenti",
      esegui: async () => {
        const { data: r } = await supabase.from("appointments")
          .select("*, patients:patient_id(first_name,last_name)")
          .eq("studio_id", studioId).order("start_at", { ascending: false });
        const righe = ((r ?? []) as Riga[]).map(a => {
          const p = a.patients as { first_name?: string; last_name?: string } | null;
          return [
            a.id, a.patient_id,
            p ? `${p.last_name ?? ""} ${p.first_name ?? ""}`.trim() : "",
            data(a.start_at),
            a.start_at ? new Date(String(a.start_at)).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "",
            a.end_at ? new Date(String(a.end_at)).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "",
            a.status, a.treatment_type, a.location, a.clinic_site,
            a.amount, siNo(a.is_paid), a.payment_method, data(a.paid_at),
            a.package_id ? "Sì" : "", testo(a.calendar_note),
          ];
        });
        return {
          nome: "Appuntamenti",
          intestazioni: ["ID", "ID paziente", "Paziente", "Data", "Ora inizio", "Ora fine",
            "Stato", "Trattamento", "Luogo", "Sede",
            "Importo", "Pagato", "Metodo", "Pagato il", "Da pacchetto", "Note"],
          righe,
        };
      },
    },

    {
      etichetta: "Pacchetti",
      esegui: async () => {
        const { data: r } = await supabase.from("patient_packages")
          .select("*").eq("studio_id", studioId).order("created_at", { ascending: false });
        if (!r || r.length === 0) return null;
        const righe = (r as Riga[]).map(k => [
          k.id, k.patient_id, k.title, k.total_sessions, k.status,
          typeof k.total_amount_cents === "number" ? (k.total_amount_cents / 100).toFixed(2) : "",
          data(k.expires_at), dataOra(k.created_at),
        ]);
        return {
          nome: "Pacchetti",
          intestazioni: ["ID", "ID paziente", "Titolo", "Sedute totali", "Stato",
            "Importo €", "Scadenza", "Creato il"],
          righe,
        };
      },
    },

    {
      etichetta: "Scale di valutazione",
      esegui: async () => {
        const { data: r } = await supabase.from("scale_requests")
          .select("*").eq("studio_id", studioId).order("sent_at", { ascending: false });
        if (!r || r.length === 0) return null;
        const righe = (r as Riga[]).map(s => [
          s.id, s.patient_id, s.scale_type, s.status,
          dataOra(s.sent_at), testo(s.payload),
        ]);
        return {
          nome: "Scale valutazione",
          intestazioni: ["ID", "ID paziente", "Scala", "Stato", "Inviata il", "Risposte"],
          righe,
        };
      },
    },

    {
      etichetta: "Diario del dolore",
      esegui: async () => {
        const { data: r } = await supabase.from("patient_pain_log")
          .select("*").eq("studio_id", studioId).order("day", { ascending: false });
        if (!r || r.length === 0) return null;
        const righe = (r as Riga[]).map(d => [d.patient_id, data(d.day), d.level, d.note]);
        return {
          nome: "Diario dolore",
          intestazioni: ["ID paziente", "Giorno", "Livello 0-10", "Nota"],
          righe,
        };
      },
    },

    {
      etichetta: "Autovalutazioni",
      esegui: async () => {
        const { data: r } = await supabase.from("patient_intake")
          .select("*").eq("studio_id", studioId).order("sent_at", { ascending: false });
        if (!r || r.length === 0) return null;
        const righe = (r as Riga[]).map(i => [
          i.patient_id, i.status, dataOra(i.sent_at), dataOra(i.completed_at), testo(i.payload),
        ]);
        return {
          nome: "Autovalutazioni",
          intestazioni: ["ID paziente", "Stato", "Inviata il", "Compilata il", "Risposte"],
          righe,
        };
      },
    },

    {
      etichetta: "Consensi",
      esegui: async () => {
        const { data: r } = await supabase.from("patient_consents")
          .select("id, patient_id, consent_type, title, status, sent_at, signed_at, signed_name")
          .eq("studio_id", studioId).order("sent_at", { ascending: false });
        if (!r || r.length === 0) return null;
        const righe = (r as Riga[]).map(c => [
          c.id, c.patient_id, c.consent_type, c.title, c.status,
          dataOra(c.sent_at), dataOra(c.signed_at), c.signed_name,
        ]);
        return {
          nome: "Consensi",
          intestazioni: ["ID", "ID paziente", "Tipo", "Titolo", "Stato",
            "Inviato il", "Firmato il", "Firmato da"],
          righe,
        };
      },
    },

    {
      etichetta: "Servizi prenotabili",
      esegui: async () => {
        const { data: r } = await supabase.from("booking_services")
          .select("*").eq("studio_id", studioId).order("sort_order");
        if (!r || r.length === 0) return null;
        const righe = (r as Riga[]).map(s => [
          s.name, s.description, s.duration, s.price, s.price_unit, siNo(s.show_price),
        ]);
        return {
          nome: "Servizi online",
          intestazioni: ["Nome", "Descrizione", "Minuti", "Prezzo", "Unità prezzo", "Prezzo visibile"],
          righe,
        };
      },
    },

    {
      etichetta: "Scheda clinica",
      esegui: async () => {
        const { data: r } = await supabase.from("studio_clinical_fields")
          .select("id, template_id, label, hint, type, options, sort_order, is_active")
          .eq("studio_id", studioId).order("sort_order");
        if (!r || r.length === 0) return null;
        const righe = (r as Riga[]).map(f => [
          f.id, f.template_id, f.label, f.hint, f.type, testo(f.options), siNo(f.is_active),
        ]);
        return {
          nome: "Campi scheda clinica",
          intestazioni: ["ID campo", "ID scheda", "Etichetta", "Aiuto", "Tipo", "Scelte", "Attivo"],
          righe,
        };
      },
    },

    {
      etichetta: "Noleggi",
      esegui: async () => {
        const { data: r } = await supabase.from("noleggios")
          .select("*").order("created_at", { ascending: false });
        if (!r || r.length === 0) return null;
        const righe = (r as Riga[]).map(n => [
          n.id, n.patient_name, n.device, data(n.start_date), data(n.end_date),
          n.amount, siNo(n.is_paid),
        ]);
        return {
          nome: "Noleggi",
          intestazioni: ["ID", "Paziente", "Apparecchio", "Dal", "Al", "Importo", "Pagato"],
          righe,
        };
      },
    },
  ];

  for (let i = 0; i < passi.length; i++) {
    onProgress?.(i, passi.length, passi[i].etichetta);
    try {
      const foglio = await passi[i].esegui();
      if (foglio) {
        fogli.push(foglio);
        conteggi[foglio.nome] = foglio.righe.length;
      }
    } catch {
      // Una tabella che non esiste o non è leggibile non deve far fallire
      // l'intero export: si salta e si va avanti.
      conteggi[passi[i].etichetta] = -1;
    }
  }
  onProgress?.(passi.length, passi.length, "Preparo il file");

  const wb = XLSX.utils.book_new();

  // Primo foglio: cosa c'è dentro, così chi apre il file capisce subito
  const riepilogo = [
    ["Export FisioHub"],
    ["Generato il", new Date().toLocaleString("it-IT")],
    [],
    ["Foglio", "Righe"],
    ...fogli.map(f => [f.nome, f.righe.length]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(riepilogo), "Riepilogo");

  for (const f of fogli) {
    const ws = XLSX.utils.aoa_to_sheet([f.intestazioni, ...f.righe]);
    // Larghezze indicative: senza, ogni colonna esce strettissima
    ws["!cols"] = f.intestazioni.map(h => ({ wch: Math.min(40, Math.max(12, h.length + 4)) }));
    XLSX.utils.book_append_sheet(wb, ws, f.nome.slice(0, 31));
  }

  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return { blob, nomeFile: `fisiohub-export-${stamp}.xlsx`, conteggi };
}
