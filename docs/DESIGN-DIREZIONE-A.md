# FisioHub Mobile — Specifica Design "Direzione A"

Congelata a luglio 2026 dopo il restyling mobile. Questa è la fonte di verità:
ogni nuova schermata o componente mobile deve rispettarla.

## Fondamenta

- **Token**: `src/theme/tokens.ts` — unica fonte per colori, raggi, ombre.
  I client mobile importano `MOBILE_THEME` (chiavi storiche compatibili).
- **Icone**: `src/components/icons.tsx` — SVG a tratto uniforme (stroke 2,
  round). **Vietate le emoji nell'interfaccia**; ammesse solo dentro i
  messaggi WhatsApp inviati ai pazienti e nei dialog nativi (`confirm`).
- **Font**: Inter, caricato una volta in `app/layout.tsx`. Primo nella
  font-stack di ogni root mobile.

## Palette

| Ruolo | Token | Hex |
|---|---|---|
| Sfondo app | `appBg` / cream | `#FAF7F2` |
| Card | `panelBg` | `#FFFFFF` |
| Superfici secondarie / tab bar | `panelSoft` | `#FFFDF9` |
| Filetti | `line` / `lineStrong` / `lineFaint` | `#EDE6D8` / `#E0D8C8` / `#F3EEE3` |
| Testo | `ink` / `textSoft` / `muted` / `warm500` / `warm400` | `#1A1D24` / `#3A3E46` / `#6B6455` / `#8A8377` / `#A9A092` |
| Brand | teal `#0d9488` (deep `#085041`, tint `#E1F5EE`) · blu `#2563eb` (deep `#1e40af`, tint `#E8F0FD`) |
| Semantici | verde `#16a34a` (WA) · ambra `#B45309`/tint `#FAEEDA` · rosso `#C0392B`/tint `#FBEAE7` · viola gruppi `#5B3FA8`/tint `#EFE9FB` |
| Gradiente | `linear-gradient(135deg,#0d9488,#2563eb)` |

**Regola d'oro**: il gradiente compare SOLO su header, FAB, azioni primarie,
segmenti attivi e barre di avanzamento. Mai come decorazione.

## Regole di composizione

- Raggi: card 14 · controlli 12 · chip 10 · pill 99.
- Pill di stato: tinte piene (`tealTint`/`blueTint`/`amberTint`…), testo deep,
  fontSize 10–11, peso 700. La pill mostra sempre e solo **"Pagato"** senza
  metodo; le eseguite non pagate mostrano **"Da saldare"** in ambra.
- Bottone WhatsApp: 28–34px, radius 10–12, sfondo `#E9F7EE`, bordo `#CBE8D5`,
  glifo WA verde **sempre** (mai sostituito); "già inviato" = badge spunta
  13px all'angolo.
- Nomi in liste compatte: **cognome intero** (vista settimana/mese) o
  cognome+nome (liste larghe). Tap sul nome in home = chiamata (abitudine
  consolidata, non toccare).
- Pulse-line del logo (`PulseDivider`): firma del brand su titoli sezione ed
  empty state. Usarla con parsimonia, una per schermata.

## Componenti canonici

- `src/components/mobile/StatusSheet.tsx` — cambio stato seduta (Pagato con
  metodo / Da saldare / Non pagato / Riporta a Confermato). Renderizzato via
  **portal sul body** (mai dentro contenitori trasformati). Metodi:
  `cash | pos | bank_transfer`.
- `src/components/MobileTabBar.tsx` — 6 voci, icone SVG, attivo teal.
- Header gradiente: cerchio traslucido + pulse + "FisioHub", campanella nuda
  con dot ambra, avatar tondo con iniziali dalla firma studio.

## Viste calendario mobile

- Toggle **Giorno | Settimana | Mese**; **Settimana è la default**.
- Settimana: 6 colonne Lun–Sab, ore 7→20 (44px/h), blocchi colorati per
  **stato** (`statusColor`, come giorno e mese), solo cognome, corsie
  affiancate sulle sovrapposizioni, tap su cella vuota → nuova seduta a
  scatti di 30', autoscroll sull'ora corrente, tap intestazione → Giorno.
- Toggle **Sab** nel footer di Settimana e Mese: nasconde il sabato e
  allarga le colonne; persistito in `localStorage`
  (`fisiohub_show_saturday`), condiviso tra le due viste.

## Lezioni tecniche (non ripetere questi errori)

- Mai `return` prima che tutti gli hook siano eseguiti: per nascondere un
  componente per viewport, usare un **wrapper** che monta/smonta il figlio
  (vedi `GlobalSearch`). Violazione = React #310 in produzione.
- Overlay e sheet: sempre `createPortal(document.body)`.
- Dopo ogni modifica a componenti condivisi, testare **mobile E desktop**.

## Da fare (fuori dal restyling)

- Icone-dato residue: tab della scheda paziente (🏠📝📦…), tab report
  (💰⚠️), tipi dispositivo noleggio — richiedono glifi dedicati nel set.
- Vestito mobile per /contabilita se l'uso da telefono diventa frequente.
- Screenshot aggiornati per myfisiohub.com (vedi TODO marketing).
