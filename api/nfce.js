// Rota pública (sem login) que recebe a URL do QR Code da NFC-e e devolve os dados da nota em JSON.
//   GET  /api/nfce?url=<url do QR Code>
//   POST /api/nfce   { "url": "<url do QR Code>" }
// Use url=demo para receber uma nota de exemplo.
//
// Fontes, nesta ordem:
//   1. NFParse (ou outra API parecida), se NFPARSE_API_KEY estiver definida;
//   2. leitura direta da página da SEFAZ (funciona nos estados que usam o layout
//      padrão do portal da NFC-e: SP, RS, PR, BA, GO, entre outros).
//
// Variáveis de ambiente:
//   NFPARSE_API_URL  endpoint que recebe { url } e devolve a nota em JSON
//   NFPARSE_API_KEY  chave da API (enviada como Bearer e como x-api-key)

const NFPARSE_API_URL = process.env.NFPARSE_API_URL || 'https://api.nfparse.com.br/v1/parse';
const NFPARSE_API_KEY = process.env.NFPARSE_API_KEY || '';
const TIMEOUT_MS = 20000;
const { lerParam, enviar, normalizar, num, arred, limpar } = require('./_comum');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return enviar(res, 204);

  let url = '';
  try { url = await lerParam(req, 'url'); } catch (e) { return enviar(res, 400, { ok: false, erro: 'Corpo da requisição inválido.' }); }
  url = String(url || '').trim();
  if (!url) return enviar(res, 400, { ok: false, erro: 'Informe a URL do QR Code (parâmetro "url").' });

  if (url === 'demo') return enviar(res, 200, { ok: true, fonte: 'demo', ...NOTA_DEMO });

  let alvo;
  try { alvo = new URL(url); } catch (e) { return enviar(res, 400, { ok: false, erro: 'Isso não parece um link de nota fiscal.' }); }
  if (!/^https?:$/.test(alvo.protocol) || !/(^|\.)gov\.br$/i.test(alvo.hostname)) {
    return enviar(res, 400, { ok: false, erro: 'O QR Code lido não é de uma NFC-e (o link deve ser de um site da SEFAZ, .gov.br).' });
  }

  try {
    const nota = NFPARSE_API_KEY ? await viaNfparse(alvo.href) : await viaSefaz(alvo.href);
    if (!nota.produtos.length) throw new Error('A nota foi encontrada, mas nenhum produto veio na resposta.');
    return enviar(res, 200, { ok: true, ...nota });
  } catch (e) {
    const tempo = e.name === 'TimeoutError' || e.name === 'AbortError';
    return enviar(res, 502, { ok: false, erro: tempo ? 'A consulta demorou demais. Tente de novo em instantes.' : e.message });
  }
};

/* ---------- 1. API externa (NFParse ou similar) ---------- */
async function viaNfparse(url) {
  const r = await fetch(NFPARSE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + NFPARSE_API_KEY, 'x-api-key': NFPARSE_API_KEY },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const txt = await r.text();
  let json; try { json = JSON.parse(txt); } catch (e) { json = null; }
  if (!r.ok || !json) {
    const msg = json && (json.error || json.erro || json.message || json.mensagem);
    throw new Error('A API de notas respondeu com erro' + (msg ? ': ' + msg : ' (HTTP ' + r.status + ').'));
  }
  return { fonte: 'nfparse', ...normalizar(json) };
}

/* ---------- 2. Página da SEFAZ (layout padrão do portal NFC-e) ---------- */
async function viaSefaz(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36', Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error('O site da SEFAZ respondeu com erro (HTTP ' + r.status + '). Tente de novo em instantes.');
  const html = await r.text();

  const blocos = html.split(/<tr[^>]+id=["']Item\s*\+\s*\d+["'][^>]*>/i).slice(1);
  const produtos = blocos.map((b, i) => {
    b = b.split(/<\/tr>/i)[0];
    const qtd = num(campo(b, 'Rqtd'));
    const unit = num(campo(b, 'RvlUnit'));
    let total = num(campo(b, 'valor'));
    if (total == null && qtd != null && unit != null) total = arred(qtd * unit);
    return {
      id: i + 1,
      codigo: (campo(b, 'RCod').match(/\d+/) || [''])[0],
      nome: campo(b, 'txtTit') || 'Produto ' + (i + 1),
      quantidade: qtd ?? 1,
      unidade: campo(b, 'RUN') || 'UN',
      preco_unitario: unit,
      preco_total: total,
    };
  });
  if (!produtos.length) {
    throw new Error('Não deu para ler esta nota direto no site da SEFAZ (o layout deste estado é diferente ou a nota ainda não foi processada). Configure a chave NFPARSE_API_KEY para usar a API externa.');
  }

  const textoTodo = limpar(html);
  const data = (textoTodo.match(/Emiss[ãa]o:?\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(:\d{2})?)/i) || [])[1] || '';
  const totalTxt = (html.match(/class=["'][^"']*totalNumb[^"']*txtMax[^"']*["'][^>]*>([^<]+)</i) || [])[1];
  const valorTotal = num(totalTxt) ?? arred(produtos.reduce((s, p) => s + (p.preco_total || 0), 0));
  const cnpj = (textoTodo.match(/CNPJ:?\s*([\d./-]{14,18})/i) || [])[1] || '';
  const chave = ((html.match(/class=["']chave["'][^>]*>([^<]+)</i) || [])[1] || '').replace(/\D/g, '');

  return {
    fonte: 'sefaz',
    estabelecimento: limpar((html.match(/<div[^>]+(?:id=["']u20["']|class=["']txtTopo["'])[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '') || 'Estabelecimento',
    cnpj,
    endereco: '',
    data_emissao: data,
    chave,
    valor_total: valorTotal,
    quantidade_itens: produtos.length,
    produtos,
  };
}

// Texto do <span class="..."> sem o rótulo em <strong> (ex.: "Qtde.:", "UN:", "Vl. Unit.:").
function campo(html, classe) {
  const m = html.match(new RegExp('<(span|td)[^>]+class=["\'][^"\']*\\b' + classe + '\\b[^"\']*["\'][^>]*>([\\s\\S]*?)</\\1>', 'i'));
  if (!m) return '';
  return limpar(m[2].replace(/<strong[\s\S]*?<\/strong>/gi, ''));
}

const NOTA_DEMO = {
  estabelecimento: 'Supermercado Exemplo Ltda',
  cnpj: '12.345.678/0001-90',
  endereco: 'Av. Brasil, 1000 - Centro',
  data_emissao: '28/10/2026 10:42:15',
  chave: '35261012345678000190650010000123451000123450',
  valor_total: 87.43,
  quantidade_itens: 7,
  produtos: [
    { id: 1, codigo: '7891000100103', nome: 'LEITE INTEGRAL 1L', quantidade: 6, unidade: 'UN', preco_unitario: 4.99, preco_total: 29.94 },
    { id: 2, codigo: '7896004000015', nome: 'ARROZ TIPO 1 5KG', quantidade: 1, unidade: 'UN', preco_unitario: 24.9, preco_total: 24.9 },
    { id: 3, codigo: '2000123000000', nome: 'BANANA PRATA', quantidade: 1.235, unidade: 'KG', preco_unitario: 5.49, preco_total: 6.78 },
    { id: 4, codigo: '7891910000197', nome: 'ACUCAR REFINADO 1KG', quantidade: 2, unidade: 'UN', preco_unitario: 4.59, preco_total: 9.18 },
    { id: 5, codigo: '7894900011517', nome: 'REFRIGERANTE COLA 2L', quantidade: 1, unidade: 'UN', preco_unitario: 8.99, preco_total: 8.99 },
    { id: 6, codigo: '7896045104482', nome: 'PAO DE FORMA TRADICIONAL', quantidade: 1, unidade: 'UN', preco_unitario: 6.49, preco_total: 6.49 },
    { id: 7, codigo: '7891150000106', nome: 'SABONETE 85G', quantidade: 1, unidade: 'UN', preco_unitario: 1.15, preco_total: 1.15 },
  ],
};
