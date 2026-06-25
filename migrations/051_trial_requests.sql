-- 051_trial_requests.sql
-- Richieste di prova dal sito: raccolte qui, attivate manualmente da fisiohub-admin.

create table if not exists public.trial_requests (
  id               uuid primary key default gen_random_uuid(),

  -- referente
  contact_name     text not null,
  studio_name      text not null,
  email            text not null,
  phone            text,

  -- profilo studio
  city             text,
  province         text,
  profession       text,        -- fisioterapista | osteopata | altro
  team_size        text,        -- solo | 2-5 | 5+
  current_software text,        -- gestionale attuale (per migrazione)
  heard_from       text,        -- come ci ha conosciuto
  notes            text,        -- messaggio libero

  -- gestione (compilati all'attivazione da admin)
  status           text not null default 'nuova'
                     check (status in ('nuova','attivata','rifiutata')),
  studio_id        uuid references public.studios(id) on delete set null,
  activated_at     timestamptz,
  activated_by     uuid,

  -- meta
  source           text default 'site',
  user_agent       text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_trial_requests_status
  on public.trial_requests(status);
create index if not exists idx_trial_requests_created
  on public.trial_requests(created_at desc);

-- RLS: tabella chiusa. Solo codice server (service role) può accedervi.
alter table public.trial_requests enable row level security;
