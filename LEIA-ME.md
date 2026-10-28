# Sistema de Expositores

Painel para controlar seus expositores (locais, estoque, visitas, vendas) e receber
avisos de reposição pelo QR Code colado em cada expositor.

## O que tem

- **Painel**: unidades vendidas, faturamento, comissão dos locais, lucro estimado,
  quanto já recebeu, gráfico por semana/mês, ranking dos expositores e uma
  **rota de reposição sugerida** (quem pediu reposição + quem deve estar acabando).
- **Expositores**: cadastro com local, endereço, bairro, responsável, WhatsApp,
  produto, capacidade, preço, seu custo, comissão do local, data de instalação.
- **Visitas**: em cada visita você informa quanto *encontrou*, as *perdas* e quanto
  *repôs*. O sistema calcula sozinho quanto vendeu, quanto o local tem que te pagar
  e atualiza o estoque. Registrar a visita fecha os avisos abertos daquele local.
- **QR Code** por expositor (botão "Imprimir etiqueta"). Quem escanear cai numa
  tela simples, sem login, e toca em **Enviar aviso**. Também tem um link geral em
  que a pessoa só digita o nome do estabelecimento.
- **Avisos**: lista de pedidos de reposição com botões de WhatsApp e Mapa.

## Testar agora (modo demonstração)

Abra o `index.html` no navegador. Com o `config.js` vazio ele roda com dados de
exemplo salvos só no seu navegador.

## Colocar no ar (grátis) — ~15 minutos

### 1. Banco de dados (Supabase)
1. Crie conta em https://supabase.com e um **New project** (região São Paulo).
2. Abra o arquivo `supabase.sql`, troque `SEU-EMAIL@gmail.com` pelo seu e-mail.
3. No Supabase: **SQL Editor > New query**, cole o arquivo inteiro e clique **Run**.
4. **Authentication > Users > Add user > Create new user**: seu e-mail + uma senha
   (marque "Auto Confirm User").
5. **Authentication > Sign In / Providers**: desligue **"Allow new users to sign up"**.
   (Mesmo se esquecer, só os e-mails da tabela `admins` veem os dados.)
6. **Project Settings > API**: copie a **Project URL** e a chave **anon public**
   e cole no `config.js`.

### 2. Hospedagem (escolha uma)
- **Netlify Drop** (mais fácil): entre em https://app.netlify.com/drop e arraste
  a pasta inteira. Pronto, ganha um link `https://algo.netlify.app`
  (dá para trocar o nome em *Site configuration*).
- **Vercel** ou **GitHub Pages**: suba a pasta num repositório e publique.

### 3. Usar
1. Abra o link, entre com seu e-mail e senha.
2. Cadastre os expositores e clique em **QR Code > Imprimir etiqueta**.
3. Cole a etiqueta no expositor. Quando o local escanear, o aviso aparece em
   **Avisos** (o contador atualiza a cada 30 s com o painel aberto).

> Importante: gere os QR Codes **depois** de publicar no endereço definitivo,
> porque o QR guarda o link do site. Se mudar o endereço, reimprima.

## Bom saber
- O plano grátis do Supabase **pausa o projeto após 7 dias sem nenhum acesso**.
  Usando o painel toda semana isso não acontece; se pausar, é só clicar em
  *Restore* no Supabase.
- Para backup: Supabase > Table Editor > cada tabela > *Export to CSV*.
- O código do QR de cada expositor não muda ao editar, então a etiqueta impressa
  continua valendo.

## Arquivos
- `index.html` — o site inteiro (painel + tela pública do QR)
- `config.js` — URL e chave do Supabase
- `supabase.sql` — tabelas, regras automáticas e segurança
