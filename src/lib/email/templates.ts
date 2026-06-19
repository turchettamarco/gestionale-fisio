// ═══════════════════════════════════════════════════════════════════════
// src/lib/email/templates.ts
// ═══════════════════════════════════════════════════════════════════════
//
// Template email HTML responsive per tutte le notifiche transazionali.
// Stile: pulito, professionale, mobile-first, rispetta brand FisioHub
// (gradient teal-blu, font system).
//
// Per aggiungere un nuovo template:
//  1. Aggiungi il tipo in TEMPLATE_DATA_MAP
//  2. Aggiungi il case in renderTemplate()
//  3. Crea la funzione build*() che ritorna { subject, html, text }
//
// ═══════════════════════════════════════════════════════════════════════

// ─── 1. Tipi: dati richiesti per ogni template ────────────────────────

type TemplateDataMap = {
  welcome: {
    studioName: string;
    ownerName: string;
    appUrl: string;
  };
  reset_password: {
    resetUrl: string;
    expiresInHours: number;
  };
  email_confirm: {
    confirmUrl: string;
    studioName?: string;
  };
  plan_expiring: {
    studioName: string;
    planName: string;
    daysLeft: number;
    renewUrl: string;
  };
  booking_received: {
    studioName: string;
    patientName: string;
    patientPhone: string;
    appointmentDate: string;     // pre-formatted "Lunedì 15 Mar 2026 alle 10:30"
    treatmentType?: string;
    note?: string;
    appUrl: string;
  };
  weekly_summary: {
    studioName: string;
    weekStart: string;           // "Lun 14 Mar"
    weekEnd: string;             // "Dom 20 Mar"
    appointmentsCount: number;
    revenue: number;
    newPatientsCount: number;
    upcomingCount: number;       // settimana prossima
    appUrl: string;
  };
  monthly_report: {
    studioName: string;
    monthLabel: string;          // "giugno 2026"
    done: number;
    collected: number;
    newPatients: number;
    appUrl: string;
  };
  ts_ricevuta: {
    studioName: string;
    periodo: string;             // es. "2026" o "maggio 2026"
    protocollo: string;
    esitoText: string;           // es. "File elaborato correttamente — inviati 6, accolti 6"
    appUrl: string;
  };
  ts_reminder: {
    studioName: string;
    periodoLabel: string;        // es. "il mese di maggio 2026" / "il 2° trimestre 2026"
    daInviare: number | null;    // documenti ancora da inviare (se noto)
    appUrl: string;
  };
  ts_invio_report: {
    studioName: string;
    periodo: string;
    protocollo: string;
    esitoText: string;
    ambiente: string;            // "produzione" | "test"
    righe: Array<{ paziente: string; numero: string; importo: number }>;
    ricevutaInclusa: boolean;
    appUrl: string;
  };
};

export type TemplateName = keyof TemplateDataMap;
export type TemplateData<T extends TemplateName> = TemplateDataMap[T];

type Rendered = { subject: string; html: string; text: string };

// ─── 2. Layout base condiviso ─────────────────────────────────────────

function emailLayout(content: string, footerNote?: string): string {
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FisioHub</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 14px rgba(15,23,42,0.06);">
      <!-- Header brand -->
      <tr><td style="background:linear-gradient(135deg,#0d9488,#2563eb);padding:20px 28px;">
        <div style="color:#ffffff;font-weight:800;font-size:18px;letter-spacing:0.5px;">
          Fisio<span style="font-weight:900;">Hub</span>
        </div>
      </td></tr>
      <!-- Content -->
      <tr><td style="padding:28px;">
        ${content}
      </td></tr>
      <!-- Footer -->
      <tr><td style="padding:18px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;">
        <div style="font-size:11px;color:#64748b;line-height:1.6;">
          ${footerNote ? `<div style="margin-bottom:6px;">${footerNote}</div>` : ""}
          Email automatica da FisioHub. Per assistenza scrivi a
          <a href="mailto:turchettamrc@gmail.com" style="color:#0d9488;text-decoration:none;">turchettamrc@gmail.com</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;"><tr><td>
    <a href="${href}" style="display:inline-block;padding:13px 28px;background:#0d9488;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:8px;">${label}</a>
  </td></tr></table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── 3. Singoli template ───────────────────────────────────────────────

function buildWelcome(d: TemplateDataMap["welcome"]): Rendered {
  const subject = "Benvenuto in FisioHub!";
  const html = emailLayout(`
    <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#0f172a;">Benvenuto, ${escapeHtml(d.ownerName)}!</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">
      Grazie per aver attivato <strong>${escapeHtml(d.studioName)}</strong> su FisioHub.
    </p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">
      Ora puoi iniziare a gestire i tuoi appuntamenti, pazienti e tariffe in un unico posto.
      Per partire, ti consigliamo di:
    </p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.8;color:#334155;">
      <li>Configurare i dati del tuo studio (nome, indirizzo, firma)</li>
      <li>Inserire le tariffe dei trattamenti</li>
      <li>Personalizzare i messaggi WhatsApp di promemoria</li>
    </ul>
    ${button(d.appUrl, "Vai al gestionale →")}
    <p style="margin:14px 0 0;font-size:13px;color:#64748b;line-height:1.5;">
      Se hai bisogno di aiuto, rispondi pure a questa email.
    </p>
  `);
  const text = `Benvenuto in FisioHub, ${d.ownerName}!\n\nGrazie per aver attivato ${d.studioName}.\n\nVai al gestionale: ${d.appUrl}\n\nPer assistenza: turchettamrc@gmail.com`;
  return { subject, html, text };
}

function buildResetPassword(d: TemplateDataMap["reset_password"]): Rendered {
  const subject = "Reimposta la tua password FisioHub";
  const html = emailLayout(`
    <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#0f172a;">Reimposta password</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">
      Hai richiesto di reimpostare la password del tuo account FisioHub.
      Clicca il pulsante qui sotto per scegliere una nuova password.
    </p>
    ${button(d.resetUrl, "Reimposta password")}
    <p style="margin:14px 0 0;font-size:13px;color:#64748b;line-height:1.5;">
      Il link è valido per ${d.expiresInHours} ${d.expiresInHours === 1 ? "ora" : "ore"}.
      Se non hai richiesto tu il reset, ignora questa email — la tua password resta invariata.
    </p>
  `, "Per motivi di sicurezza, non condividere mai questo link.");
  const text = `Reimposta password FisioHub\n\nLink (valido ${d.expiresInHours}h): ${d.resetUrl}\n\nSe non hai richiesto tu il reset, ignora questa email.`;
  return { subject, html, text };
}

function buildEmailConfirm(d: TemplateDataMap["email_confirm"]): Rendered {
  const subject = "Conferma il tuo indirizzo email";
  const html = emailLayout(`
    <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#0f172a;">Conferma email</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">
      Per completare la registrazione${d.studioName ? ` di <strong>${escapeHtml(d.studioName)}</strong>` : ""},
      conferma il tuo indirizzo email cliccando il pulsante.
    </p>
    ${button(d.confirmUrl, "Conferma email")}
    <p style="margin:14px 0 0;font-size:13px;color:#64748b;line-height:1.5;">
      Se non hai creato tu un account FisioHub, puoi ignorare questa email.
    </p>
  `);
  const text = `Conferma email FisioHub\n\nClicca per confermare: ${d.confirmUrl}\n\nSe non hai creato tu l'account, ignora questa email.`;
  return { subject, html, text };
}

function buildPlanExpiring(d: TemplateDataMap["plan_expiring"]): Rendered {
  const subject = `Il tuo piano ${d.planName} scade tra ${d.daysLeft} giorni`;
  const html = emailLayout(`
    <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#0f172a;">Piano in scadenza</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">
      Ciao, ti informiamo che il piano <strong>${escapeHtml(d.planName)}</strong>
      di <strong>${escapeHtml(d.studioName)}</strong> scadrà tra <strong>${d.daysLeft} giorni</strong>.
    </p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">
      Per evitare interruzioni, contattaci per rinnovare il piano.
    </p>
    ${button(d.renewUrl, "Gestisci piano →")}
    <p style="margin:14px 0 0;font-size:13px;color:#64748b;line-height:1.5;">
      Allo scadere, alcune funzionalità potrebbero essere limitate.
      Tutti i tuoi dati restano salvi.
    </p>
  `);
  const text = `Piano ${d.planName} di ${d.studioName} in scadenza tra ${d.daysLeft} giorni.\n\nGestisci piano: ${d.renewUrl}`;
  return { subject, html, text };
}

function buildBookingReceived(d: TemplateDataMap["booking_received"]): Rendered {
  const subject = `Nuova prenotazione: ${d.patientName}`;
  const html = emailLayout(`
    <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#0f172a;">📅 Nuova prenotazione</h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#334155;">
      Hai ricevuto una nuova prenotazione dal sito.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f8fafc;border-radius:10px;padding:16px;margin-bottom:16px;">
      <tr><td style="padding:6px 0;font-size:14px;color:#64748b;width:120px;">Paziente:</td>
          <td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(d.patientName)}</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Telefono:</td>
          <td style="padding:6px 0;font-size:14px;color:#0f172a;">${escapeHtml(d.patientPhone)}</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Appuntamento:</td>
          <td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(d.appointmentDate)}</td></tr>
      ${d.treatmentType ? `<tr><td style="padding:6px 0;font-size:14px;color:#64748b;">Trattamento:</td>
          <td style="padding:6px 0;font-size:14px;color:#0f172a;">${escapeHtml(d.treatmentType)}</td></tr>` : ""}
      ${d.note ? `<tr><td style="padding:6px 0;font-size:14px;color:#64748b;vertical-align:top;">Note:</td>
          <td style="padding:6px 0;font-size:14px;color:#0f172a;">${escapeHtml(d.note)}</td></tr>` : ""}
    </table>
    ${button(d.appUrl + "/calendar", "Apri il calendario →")}
  `);
  const text = `Nuova prenotazione per ${d.studioName}\n\nPaziente: ${d.patientName}\nTel: ${d.patientPhone}\nQuando: ${d.appointmentDate}\n${d.treatmentType ? "Trattamento: " + d.treatmentType + "\n" : ""}${d.note ? "Note: " + d.note + "\n" : ""}\nApri: ${d.appUrl}/calendar`;
  return { subject, html, text };
}

function buildWeeklySummary(d: TemplateDataMap["weekly_summary"]): Rendered {
  const subject = `Riepilogo settimanale: ${d.appointmentsCount} appuntamenti, €${d.revenue.toFixed(0)}`;
  const html = emailLayout(`
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0f172a;">📊 Riepilogo settimana</h1>
    <p style="margin:0 0 18px;font-size:14px;color:#64748b;">
      ${escapeHtml(d.weekStart)} → ${escapeHtml(d.weekEnd)}
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:16px;">
      <tr>
        <td style="width:33%;padding:12px;background:#f0fdfa;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:800;color:#0d9488;">${d.appointmentsCount}</div>
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Appuntamenti</div>
        </td>
        <td style="width:6px;"></td>
        <td style="width:33%;padding:12px;background:#eff6ff;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:800;color:#2563eb;">€${d.revenue.toFixed(0)}</div>
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Incassi</div>
        </td>
        <td style="width:6px;"></td>
        <td style="width:33%;padding:12px;background:#fef3c7;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:800;color:#d97706;">${d.newPatientsCount}</div>
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Nuovi pazienti</div>
        </td>
      </tr>
    </table>
    ${d.upcomingCount > 0 ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#334155;">
      📌 Settimana prossima hai già <strong>${d.upcomingCount} appuntamenti</strong> in agenda.
    </p>` : ""}
    ${button(d.appUrl, "Apri il gestionale →")}
    <p style="margin:14px 0 0;font-size:12px;color:#64748b;line-height:1.5;">
      Ricevi questo riepilogo ogni lunedì mattina. Puoi disattivarlo dalle Impostazioni.
    </p>
  `);
  const text = `Riepilogo settimanale ${d.studioName}\n${d.weekStart} - ${d.weekEnd}\n\nAppuntamenti: ${d.appointmentsCount}\nIncassi: €${d.revenue.toFixed(0)}\nNuovi pazienti: ${d.newPatientsCount}\nProssima settimana: ${d.upcomingCount} appuntamenti\n\nApri: ${d.appUrl}`;
  return { subject, html, text };
}

// ─── 4. Dispatcher principale ──────────────────────────────────────────

export function renderTemplate<T extends TemplateName>(
  template: T,
  data: TemplateDataMap[T]
): Rendered {
  switch (template) {
    case "welcome":
      return buildWelcome(data as TemplateDataMap["welcome"]);
    case "reset_password":
      return buildResetPassword(data as TemplateDataMap["reset_password"]);
    case "email_confirm":
      return buildEmailConfirm(data as TemplateDataMap["email_confirm"]);
    case "plan_expiring":
      return buildPlanExpiring(data as TemplateDataMap["plan_expiring"]);
    case "booking_received":
      return buildBookingReceived(data as TemplateDataMap["booking_received"]);
    case "weekly_summary":
      return buildWeeklySummary(data as TemplateDataMap["weekly_summary"]);
    case "monthly_report":
      return buildMonthlyReport(data as TemplateDataMap["monthly_report"]);
    case "ts_ricevuta":
      return buildTsRicevuta(data as TemplateDataMap["ts_ricevuta"]);
    case "ts_reminder":
      return buildTsReminder(data as TemplateDataMap["ts_reminder"]);
    case "ts_invio_report":
      return buildTsInvioReport(data as TemplateDataMap["ts_invio_report"]);
    default:
      throw new Error(`Template sconosciuto: ${template}`);
  }
}

function buildMonthlyReport(d: TemplateDataMap["monthly_report"]): Rendered {
  const subject = `Report mensile ${d.monthLabel}: €${d.collected.toFixed(0)} incassati, ${d.done} sedute`;
  const html = emailLayout(`
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0f172a;">📄 Report mensile</h1>
    <p style="margin:0 0 18px;font-size:14px;color:#64748b;">
      ${escapeHtml(d.studioName)} · ${escapeHtml(d.monthLabel)}
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:16px;">
      <tr>
        <td style="width:33%;padding:12px;background:#f0fdfa;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:800;color:#0d9488;">${d.done}</div>
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Sedute svolte</div>
        </td>
        <td style="width:6px;"></td>
        <td style="width:33%;padding:12px;background:#ecfdf5;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:800;color:#15803d;">€${d.collected.toFixed(0)}</div>
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Incassato</div>
        </td>
        <td style="width:6px;"></td>
        <td style="width:33%;padding:12px;background:#eff6ff;border-radius:8px;text-align:center;">
          <div style="font-size:24px;font-weight:800;color:#2563eb;">${d.newPatients}</div>
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Nuovi pazienti</div>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#334155;">
      📎 In allegato trovi il <strong>report completo in PDF</strong> con il dettaglio di sedute, incassi, confronto col mese precedente e ripartizione per operatore.
    </p>
    ${button(d.appUrl, "Apri il gestionale →")}
    <p style="margin:14px 0 0;font-size:12px;color:#64748b;line-height:1.5;">
      Ricevi questo report il primo giorno di ogni mese. Puoi disattivarlo dalle Impostazioni.
    </p>
  `);
  const text = `Report mensile ${d.studioName} - ${d.monthLabel}\n\nSedute svolte: ${d.done}\nIncassato: €${d.collected.toFixed(0)}\nNuovi pazienti: ${d.newPatients}\n\nIl report PDF completo è in allegato.\n\nApri: ${d.appUrl}`;
  return { subject, html, text };
}

function buildTsRicevuta(d: TemplateDataMap["ts_ricevuta"]): Rendered {
  const subject = `Ricevuta Sistema TS — protocollo ${d.protocollo}`;
  const html = emailLayout(`
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0f172a;">Ricevuta Sistema TS</h1>
    <p style="margin:0 0 18px;font-size:14px;color:#64748b;">
      ${escapeHtml(d.studioName)} · spese sanitarie ${escapeHtml(d.periodo)}
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:16px;">
      <tr><td style="padding:12px;background:#f0fdfa;border-radius:8px;">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Protocollo</div>
        <div style="font-size:16px;font-weight:800;color:#0d9488;margin-top:2px;">${escapeHtml(d.protocollo)}</div>
        <div style="font-size:13px;color:#0f172a;margin-top:10px;">${escapeHtml(d.esitoText)}</div>
      </td></tr>
    </table>
    <p style="margin:0 0 4px;font-size:13px;color:#475569;">La ricevuta ufficiale in PDF è in allegato: conservala come prova di trasmissione.</p>
  `);
  const text = `Ricevuta Sistema TS\n${d.studioName} - spese sanitarie ${d.periodo}\n\nProtocollo: ${d.protocollo}\nEsito: ${d.esitoText}\n\nLa ricevuta PDF è in allegato.\n\nApri: ${d.appUrl}`;
  return { subject, html, text };
}

function buildTsReminder(d: TemplateDataMap["ts_reminder"]): Rendered {
  const subject = `Promemoria: invio spese sanitarie al Sistema TS`;
  const daInviareRow = d.daInviare && d.daInviare > 0
    ? `<div style="font-size:13px;color:#0f172a;margin-top:10px;">Risultano <b>${d.daInviare}</b> document${d.daInviare > 1 ? "i" : "o"} ancora da inviare.</div>`
    : "";
  const html = emailLayout(`
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0f172a;">Promemoria Sistema TS</h1>
    <p style="margin:0 0 18px;font-size:14px;color:#64748b;">${escapeHtml(d.studioName)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:16px;">
      <tr><td style="padding:12px;background:#eff6ff;border-radius:8px;">
        <div style="font-size:14px;color:#0f172a;">È il momento di inviare al Sistema Tessera Sanitaria le spese sanitarie per ${escapeHtml(d.periodoLabel)}.</div>
        ${daInviareRow}
      </td></tr>
    </table>
    <p style="margin:0;font-size:13px;color:#475569;">Apri FisioHub → Contabilità per numerare e inviare.</p>
  `);
  const text = `Promemoria Sistema TS\n${d.studioName}\n\nÈ il momento di inviare le spese sanitarie per ${d.periodoLabel}.${d.daInviare && d.daInviare > 0 ? `\nDocumenti da inviare: ${d.daInviare}.` : ""}\n\nApri: ${d.appUrl}`;
  return { subject, html, text };
}

function buildTsInvioReport(d: TemplateDataMap["ts_invio_report"]): Rendered {
  const subject = `Invio Sistema TS effettuato — protocollo ${d.protocollo}`;
  const rows = d.righe.map(r => `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid #eef2f7;font-size:13px;color:#0f172a;">${escapeHtml(r.paziente)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eef2f7;font-size:13px;color:#0f172a;">${escapeHtml(r.numero)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eef2f7;font-size:13px;color:#0f172a;text-align:right;">€${(r.importo || 0).toFixed(2)}</td>
    </tr>`).join("");
  const html = emailLayout(`
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0f172a;">Invio al Sistema TS effettuato</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#64748b;">${escapeHtml(d.studioName)} · spese sanitarie ${escapeHtml(d.periodo)} · ambiente ${escapeHtml(d.ambiente)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:16px;">
      <tr><td style="padding:12px;background:#f0fdfa;border-radius:8px;">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Protocollo</div>
        <div style="font-size:16px;font-weight:800;color:#0d9488;margin-top:2px;">${escapeHtml(d.protocollo)}</div>
        <div style="font-size:13px;color:#0f172a;margin-top:8px;">${escapeHtml(d.esitoText)}</div>
      </td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #eef2f7;border-radius:8px;border-collapse:separate;overflow:hidden;">
      <tr style="background:#f8fafc;">
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Paziente</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">N. documento</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;">Importo</th>
      </tr>
      ${rows}
    </table>
    <p style="margin:14px 0 0;font-size:13px;color:#475569;">${d.ricevutaInclusa ? "In allegato la ricevuta PDF ufficiale." : "La ricevuta PDF sarà disponibile a breve dal pulsante \u201cRicevuta PDF\u201d in Contabilità."}</p>
  `);
  const textRows = d.righe.map(r => `- ${r.paziente} | ${r.numero} | €${(r.importo || 0).toFixed(2)}`).join("\n");
  const text = `Invio al Sistema TS effettuato\n${d.studioName} - spese sanitarie ${d.periodo} (${d.ambiente})\n\nProtocollo: ${d.protocollo}\nEsito: ${d.esitoText}\n\nDocumenti:\n${textRows}\n\n${d.ricevutaInclusa ? "Ricevuta PDF in allegato." : "Ricevuta PDF disponibile a breve in Contabilità."}\n\nApri: ${d.appUrl}`;
  return { subject, html, text };
}
