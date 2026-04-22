// Utility pure per WhatsApp — normalizzazione numeri e apertura chat

// Restituisce SOLO cifre senza + (es. "393331234567")
// api.whatsapp.com/send?phone= vuole il numero senza + né spazi
export function cleanPhoneForWA(phone: string): string {
  if (!phone) return "";
  // 1. Rimuovi tutto tranne cifre e +
  let c = phone.trim().replace(/[\s\(\)\-\.\/]/g, "");
  // 2. 00xx → +xx
  if (c.startsWith("00")) c = "+" + c.slice(2);
  // 3. Rimuovi il + per lavorare solo con cifre
  if (c.startsWith("+")) c = c.slice(1);
  // 4. Rimuovi qualsiasi residuo non numerico
  c = c.replace(/\D/g, "");
  if (!c) return "";
  // 5. Doppio prefisso 39 (es. 003939xxx) → togli il primo
  if (c.startsWith("3939") && c.length > 13) c = c.slice(2);
  // 6. Già con prefisso 39 e lunghezza corretta (11 fisso, 12 mobile)
  if (c.startsWith("39") && (c.length === 11 || c.length === 12)) return c;
  // 7. Mobile italiano 3xx (10 cifre) → aggiungi 39
  if (c.startsWith("3") && c.length === 10) return "39" + c;
  // 8. Fisso italiano 0xx (9-11 cifre) → sostituisci 0 iniziale con 39
  if (c.startsWith("0") && c.length >= 9 && c.length <= 11) return "39" + c.slice(1);
  // 9. Numero corto/incompleto → aggiungi 39
  if (c.length <= 10) return "39" + c;
  return c;
}

// Apre WhatsApp: app nativa su mobile, WhatsApp Web su desktop
// NESSUN popup — usa un anchor temporaneo che Safari rispetta se chiamato
// direttamente da un gestore click sincrono (senza await prima)
export function openWhatsApp(phone: string, message: string): boolean {
  const clean = cleanPhoneForWA(phone);
  if (!clean) return false;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(
    typeof navigator !== "undefined" ? navigator.userAgent : ""
  );
  const url =
    (isMobile ? "https://api.whatsapp.com/send" : "https://web.whatsapp.com/send") +
    "?phone=" + clean +
    "&text=" + encodeURIComponent(message);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}
