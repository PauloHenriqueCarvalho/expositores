// Funções usadas pelas rotas /api/nfce e /api/nfe.
// (Arquivos que começam com "_" dentro de api/ não viram rota na Vercel.)

// Lê um parâmetro da query string ou do corpo JSON (POST).
async function lerParam(req, nome) {
  const q = req.query && req.query[nome] ? req.query[nome] : new URL(req.url, 'http://x').searchParams.get(nome);
  if (q) return q;
  if (req.method !== 'POST') return '';
  let corpo = req.body;
  if (corpo === undefined) {
    corpo = await new Promise((ok, falha) => {
      let d = ''; req.on('data', c => d += c); req.on('end', () => ok(d)); req.on('error', falha);
    });
  }
  if (typeof corpo === 'string') corpo = corpo ? JSON.parse(corpo) : {};
  return corpo && corpo[nome];
}

function enviar(res, status, obj) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.statusCode = status;
  if (obj === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

// Aceita os nomes de campo mais comuns (pt/en, snake/camel) para não depender do formato exato da API.
function normalizar(json) {
  const d = json.data || json.nota || json.nfce || json.result || json;
  const emit = d.emitente || d.estabelecimento || d.issuer || d.store || d.loja || {};
  const tot = d.totais || d.total_nota || d.totals || {};
  const lista = pegar(d, 'itens', 'produtos', 'items', 'products') || [];
  const produtos = lista.map((p, i) => {
    const qtd = num(pegar(p, 'quantidade', 'qtd', 'qtde', 'quantity'));
    const unit = num(pegar(p, 'preco_unitario', 'valor_unitario', 'valorUnitario', 'precoUnitario', 'unit_price', 'unitPrice', 'vUnCom'));
    let total = num(pegar(p, 'preco_total', 'valor_total', 'valorTotal', 'precoTotal', 'total', 'total_price', 'vProd'));
    if (total == null && qtd != null && unit != null) total = arred(qtd * unit);
    return {
      id: i + 1,
      codigo: str(pegar(p, 'codigo', 'cod', 'code', 'cProd')),
      nome: str(pegar(p, 'nome', 'descricao', 'description', 'name', 'xProd')) || 'Produto ' + (i + 1),
      quantidade: qtd ?? 1,
      unidade: str(pegar(p, 'unidade', 'un', 'unit', 'uCom')) || 'UN',
      preco_unitario: unit ?? (total != null && qtd ? arred(total / qtd) : null),
      preco_total: total,
    };
  });
  let valorTotal = num(pegar(d, 'valor_total', 'valorTotal', 'valor_pagar', 'valor_a_pagar', 'total', 'vNF')) ?? num(pegar(tot, 'valor_total', 'valor_pagar', 'total', 'vNF'));
  if (valorTotal == null) valorTotal = arred(produtos.reduce((s, p) => s + (p.preco_total || 0), 0));
  return {
    estabelecimento: str(typeof emit === 'string' ? emit : pegar(emit, 'nome_fantasia', 'nomeFantasia', 'nome', 'razao_social', 'razaoSocial', 'name', 'xNome')) || str(pegar(d, 'estabelecimento_nome', 'loja_nome')) || 'Estabelecimento',
    cnpj: str(pegar(emit, 'cnpj', 'CNPJ') || pegar(d, 'cnpj')),
    endereco: str(pegar(emit, 'endereco', 'address')),
    data_emissao: str(pegar(d, 'data_emissao', 'dataEmissao', 'emissao', 'issued_at', 'issue_date', 'dhEmi')),
    chave: str(pegar(d, 'chave', 'chave_acesso', 'chaveAcesso', 'access_key')),
    valor_total: valorTotal,
    quantidade_itens: produtos.length,
    produtos,
  };
}

/* ---------- utilidades ---------- */
function pegar(o, ...chaves) {
  if (!o || typeof o !== 'object') return undefined;
  for (const k of chaves) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
}
function str(v) { return v == null ? '' : String(v).trim(); }
function arred(n) { return Math.round(n * 100) / 100; }
// "1.234,56" → 1234.56 ; "3.49" → 3.49 ; 2 → 2
function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
function limpar(s) {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c))
    .replace(/\s+/g, ' ').trim();
}

module.exports = { lerParam, enviar, normalizar, pegar, str, num, arred, limpar };
