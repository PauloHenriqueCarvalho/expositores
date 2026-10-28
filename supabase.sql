-- =====================================================================
--  SISTEMA DE EXPOSITORES — banco de dados (Supabase / PostgreSQL)
--  Como usar: Supabase > SQL Editor > New query > cole tudo > Run
-- =====================================================================

-- >>> TROQUE AQUI pelo e-mail que você vai usar para entrar no painel <<<
--     (só e-mails desta lista conseguem ver/editar os dados)
create table if not exists public.admins (email text primary key);
insert into public.admins (email) values ('SEU-EMAIL@gmail.com') on conflict do nothing;


-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.expositores (
  id               uuid primary key default gen_random_uuid(),
  codigo           text unique not null,              -- vai no QR Code
  estabelecimento  text not null,
  responsavel      text,
  telefone         text,
  endereco         text,
  bairro           text,
  cidade           text default 'Londrina',
  produto          text,
  capacidade       int  not null default 0 check (capacidade >= 0),
  estoque_atual    int  not null default 0 check (estoque_atual >= 0),
  preco_venda      numeric(10,2) not null default 0,  -- preço unitário ao consumidor
  custo_unitario   numeric(10,2) not null default 0,  -- quanto te custa cada unidade
  comissao_pct     numeric(5,2)  not null default 0,  -- % que fica com o estabelecimento
  data_instalacao  date not null default current_date,
  ativo            boolean not null default true,
  observacoes      text,
  created_at       timestamptz not null default now()
);

create table if not exists public.visitas (
  id                 uuid primary key default gen_random_uuid(),
  expositor_id       uuid not null references public.expositores(id) on delete cascade,
  data               date not null default current_date,
  estoque_anterior   int  not null default 0,          -- preenchido automaticamente
  estoque_encontrado int  not null default 0 check (estoque_encontrado >= 0),
  perdas             int  not null default 0 check (perdas >= 0),  -- avariados/vencidos/sumidos
  repostos           int  not null default 0 check (repostos >= 0),
  vendidos           int  generated always as (greatest(estoque_anterior - estoque_encontrado - perdas, 0)) stored,
  preco_unitario     numeric(10,2),                     -- foto do preço na data da visita
  custo_unitario     numeric(10,2),
  comissao_pct       numeric(5,2),
  valor_recebido     numeric(10,2) not null default 0,
  observacoes        text,
  created_at         timestamptz not null default now()
);
create index if not exists visitas_expositor_data on public.visitas (expositor_id, data desc);
create index if not exists visitas_data on public.visitas (data desc);

create table if not exists public.avisos (
  id              uuid primary key default gen_random_uuid(),
  expositor_id    uuid references public.expositores(id) on delete set null,
  estabelecimento text not null,
  mensagem        text,
  status          text not null default 'aberto' check (status in ('aberto','atendido')),
  created_at      timestamptz not null default now(),
  atendido_em     timestamptz
);
create index if not exists avisos_status on public.avisos (status, created_at desc);


-- ---------------------------------------------------------------------
-- Regras automáticas das visitas
--   * guarda o estoque anterior e o preço do dia
--   * atualiza o estoque do expositor (encontrado + repostos)
--   * marca os avisos abertos daquele expositor como atendidos
--   * ao apagar a última visita, devolve o estoque anterior
-- ---------------------------------------------------------------------
create or replace function public.tg_visita_before() returns trigger
language plpgsql as $$
declare e public.expositores%rowtype;
begin
  select * into e from public.expositores where id = new.expositor_id for update;
  if not found then raise exception 'Expositor não encontrado'; end if;
  new.estoque_anterior := coalesce(e.estoque_atual, 0);
  new.preco_unitario   := coalesce(new.preco_unitario, e.preco_venda, 0);
  new.custo_unitario   := coalesce(new.custo_unitario, e.custo_unitario, 0);
  new.comissao_pct     := coalesce(new.comissao_pct, e.comissao_pct, 0);
  return new;
end $$;

create or replace function public.tg_visita_after() returns trigger
language plpgsql as $$
begin
  update public.expositores
     set estoque_atual = new.estoque_encontrado + new.repostos
   where id = new.expositor_id;
  update public.avisos
     set status = 'atendido', atendido_em = now()
   where expositor_id = new.expositor_id and status = 'aberto';
  return null;
end $$;

create or replace function public.tg_visita_delete() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.visitas
                  where expositor_id = old.expositor_id and created_at > old.created_at) then
    update public.expositores set estoque_atual = old.estoque_anterior where id = old.expositor_id;
  end if;
  return null;
end $$;

drop trigger if exists visita_before on public.visitas;
create trigger visita_before before insert on public.visitas
  for each row execute function public.tg_visita_before();
drop trigger if exists visita_after on public.visitas;
create trigger visita_after after insert on public.visitas
  for each row execute function public.tg_visita_after();
drop trigger if exists visita_delete on public.visitas;
create trigger visita_delete after delete on public.visitas
  for each row execute function public.tg_visita_delete();


-- ---------------------------------------------------------------------
-- Segurança (RLS): só admins leem/escrevem; o público só usa as 2 funções abaixo
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
     where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.admins      enable row level security;
alter table public.expositores enable row level security;
alter table public.visitas     enable row level security;
alter table public.avisos      enable row level security;

drop policy if exists admin_all on public.expositores;
create policy admin_all on public.expositores for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_all on public.visitas;
create policy admin_all on public.visitas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_all on public.avisos;
create policy admin_all on public.avisos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.expositores, public.visitas, public.avisos to authenticated;


-- ---------------------------------------------------------------------
-- Funções públicas (usadas pela tela do QR Code, sem login)
-- ---------------------------------------------------------------------

-- Mostra só o nome do local e o produto de um código de QR
create or replace function public.info_publica(p_codigo text)
returns table (estabelecimento text, produto text)
language sql stable security definer set search_path = public as $$
  select e.estabelecimento, e.produto
    from public.expositores e
   where e.codigo = p_codigo and e.ativo
   limit 1;
$$;

-- Cria um aviso de reposição. Retorna 'ok' ou 'ja_existe'
create or replace function public.criar_aviso(p_codigo text, p_estabelecimento text, p_mensagem text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_exp_id uuid;
  v_exp_nome text;
  v_nome text;
begin
  if coalesce(trim(p_codigo), '') <> '' then
    select id, estabelecimento into v_exp_id, v_exp_nome from public.expositores where codigo = trim(p_codigo);
  end if;
  if v_exp_id is null and coalesce(trim(p_estabelecimento), '') <> '' then
    select id, estabelecimento into v_exp_id, v_exp_nome from public.expositores
     where lower(estabelecimento) = lower(trim(p_estabelecimento)) limit 1;
  end if;

  v_nome := left(coalesce(nullif(trim(p_estabelecimento), ''), v_exp_nome), 120);
  if v_nome is null then
    raise exception 'Informe o nome do estabelecimento';
  end if;

  -- trava contra spam: muitos avisos no último minuto
  if (select count(*) from public.avisos where created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Muitos avisos agora, tente de novo em instantes';
  end if;

  -- já existe aviso aberto recente para o mesmo local
  if exists (
    select 1 from public.avisos a
     where a.status = 'aberto'
       and a.created_at > now() - interval '3 hours'
       and ((v_exp_id is not null and a.expositor_id = v_exp_id)
            or lower(a.estabelecimento) = lower(v_nome))
  ) then
    return 'ja_existe';
  end if;

  insert into public.avisos (expositor_id, estabelecimento, mensagem)
  values (v_exp_id, v_nome, left(nullif(trim(p_mensagem), ''), 500));
  return 'ok';
end $$;

revoke all on function public.info_publica(text)              from public;
revoke all on function public.criar_aviso(text, text, text)   from public;
grant execute on function public.info_publica(text)            to anon, authenticated;
grant execute on function public.criar_aviso(text, text, text) to anon, authenticated;
grant execute on function public.is_admin()                    to authenticated;
