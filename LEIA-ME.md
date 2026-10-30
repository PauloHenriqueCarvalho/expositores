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

---

# MVP: Leitor de Nota Fiscal (NFC-e) por QR Code

Rota pública, **sem login**: `/nota` (ou `/nota.html`).

1. **Tela da câmera** (`#/`): lê o QR Code do cupom com o leitor nativo do navegador (Chrome
   no Android) ou com o [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (iPhone e computador). Também dá para colar o link
   na mão ou abrir uma **nota de exemplo**.
2. **Tela da nota** (`#/nota?url=...`): mostra "Carregando…", chama o backend e lista
   estabelecimento, data, total e os produtos (quantidade × preço unitário = total).

### Nota de distribuidor (NF-e / DANFE) — aba "Nota de distribuidor"

Para notas que não são cupom (revendedor, distribuidor), o sistema usa a **chave de acesso**
de 44 dígitos. Há três jeitos de ler, do mais rápido ao mais manual:

1. **Código de barras ao vivo**: a câmera lê o código de barras do topo da DANFE (ele contém a chave).
2. **Foto**: a pessoa tira uma foto. Primeiro o sistema procura o código de barras na foto
   ampliada (as barras da DANFE são finas). Se achar, a leitura é direta. Se não, ela **arrasta o dedo sobre os números** da chave. A tela aproxima na área
   marcada para conferir, e o OCR ([Tesseract.js](https://github.com/naptha/tesseract.js),
   carregado só nessa hora) lê os números. Antes do OCR, ele tenta de novo o código de barras logo
   acima da área marcada. O OCR lê a imagem de vários jeitos e só dá a chave como certa quando
   duas leituras concordam.
3. **Digitar**: um campo com os números agrupados de 4 em 4 e contador.

Em todos os casos, a chave é conferida pelo **dígito verificador** (módulo 11) e pelos dígitos do
CNPJ do emitente que está dentro dela. Se o OCR errar
um número, a chave não confere e a tela pede para **marcar de novo, tirar outra foto ou
corrigir à mão**. Uma leitura errada nunca é aceita como certa.

### Teste: produtos da DANFE por OCR, sem API (`#/ocr`)

Link "Teste: extrair todo o texto da nota" na aba de distribuidor. A pessoa fotografa a nota
inteira e o sistema, no próprio celular e sem custo:
1. amplia a foto, passa para preto e branco e **apaga as bordas da tabela** (elas viram lixo no OCR);
2. lê o texto em português com o Tesseract, endireitando a foto se estiver torta;
3. monta a lista de produtos a partir das linhas da tabela "Dados dos produtos" (as que têm NCM);
4. **confere cada linha** pela conta quantidade × valor unitário = valor total. Se o OCR perdeu a
   vírgula de um número, testa as posições possíveis e fica com a que fecha a conta. A soma dos
   produtos é comparada com os totais impressos na nota;
5. gera um **PDF pesquisável** (imagem da nota com o texto reconhecido, dá para copiar e buscar).

Linhas que não fecham a conta aparecem com ⚠ para a pessoa conferir.

## Backend: `GET|POST /api/nfe` (chave de acesso)

```
POST /api/nfe   { "chave": "<44 dígitos>" }
```

Sempre devolve o que está dentro da própria chave: `uf`, `mes_emissao`, `cnpj` do emitente,
`modelo`, `serie` e `numero`. **Os produtos só vêm com uma API externa configurada**
(`NFE_API_URL` + `NFE_API_KEY`, recebe `POST { chave }`), porque a consulta completa da NF-e na
SEFAZ pede captcha ou certificado digital. Sem API, a resposta vem com `produtos: []` e um `aviso`.
A chave `35261012345678000195550010000456781123456787` devolve uma nota de exemplo.

## Backend: `GET|POST /api/nfce`

```
POST /api/nfce        { "url": "<link do QR Code>" }
GET  /api/nfce?url=<link do QR Code>       (url=demo devolve um exemplo)
```

Resposta:

```json
{
  "ok": true,
  "fonte": "nfparse | sefaz | demo",
  "estabelecimento": "Supermercado Exemplo Ltda",
  "cnpj": "12.345.678/0001-90",
  "data_emissao": "28/10/2026 10:42:15",
  "valor_total": 87.43,
  "quantidade_itens": 7,
  "produtos": [
    { "id": 1, "codigo": "789...", "nome": "LEITE INTEGRAL 1L", "quantidade": 6,
      "unidade": "UN", "preco_unitario": 4.99, "preco_total": 29.94 }
  ]
}
```

Em caso de erro: `{ "ok": false, "erro": "mensagem" }`.

De onde vêm os dados:
- Com a variável **`NFPARSE_API_KEY`** definida, o backend faz `POST { url }` para
  **`NFPARSE_API_URL`** (padrão `https://api.nfparse.com.br/v1/parse`; confira o
  endereço certo na documentação da NFParse) e converte a resposta. Os nomes de campo
  mais comuns (pt/en) são aceitos, então dá para trocar por outra API parecida.
- Sem chave, ele lê direto a página da SEFAZ. Isso funciona nos estados com o layout
  padrão do portal da NFC-e (SP, RS, PR, BA, GO e outros). Só aceita links `.gov.br`.

## Rodar

- **No computador**: `npm install` e depois `npm start`. Abra http://localhost:3000/nota.
  Para usar a chave: `NFPARSE_API_KEY=xxx npm start`.
- **No celular (precisa de https para a câmera)**: publique na **Vercel** (importe o
  repositório). Ela publica as páginas e a função `api/nfce.js` sem nenhuma configuração.
  Em *Settings > Environment Variables*, adicione `NFPARSE_API_KEY` (e `NFPARSE_API_URL`,
  se precisar). O Netlify Drop **não** roda o backend, então use a Vercel para esta parte.

Arquivos: `nota.html` (todas as telas), `api/nfce.js` (cupom), `api/nfe.js` (NF-e por chave),
`api/_comum.js` (funções compartilhadas), `servidor.js` (Express local), `vercel.json` (atalho `/nota`).
