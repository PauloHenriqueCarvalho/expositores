// Rota pública (sem login) para NF-e de revendedor/distribuidor (DANFE), a partir da chave de acesso de 44 dígitos.
//   GET  /api/nfe?chave=<44 dígitos>
//   POST /api/nfe   { "chave": "<44 dígitos>" }
//
// Sempre devolve os dados que estão dentro da própria chave (UF, mês de emissão, CNPJ do
// emitente, modelo, série, número). Os produtos só vêm se houver uma API externa configurada,
// porque a consulta completa da NF-e na SEFAZ pede captcha ou certificado digital.
//
// Variáveis de ambiente:
//   NFE_API_URL  endpoint que recebe { chave } e devolve a nota em JSON (ex.: NFParse, se aceitar chave)
//   NFE_API_KEY  chave da API (enviada como Bearer e como x-api-key)

const { lerParam, enviar, normalizar } = require('./_comum');

const NFE_API_URL = process.env.NFE_API_URL || '';
const NFE_API_KEY = process.env.NFE_API_KEY || '';
const TIMEOUT_MS = 20000;

const UFS = { 11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF' };
const MODELOS = { 55: 'NF-e', 65: 'NFC-e', 57: 'CT-e', 58: 'MDF-e' };

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return enviar(res, 204);

  let chave = '';
  try { chave = await lerParam(req, 'chave'); } catch (e) { return enviar(res, 400, { ok: false, erro: 'Corpo da requisição inválido.' }); }
  chave = String(chave || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

  const problema = validarChave(chave);
  if (problema) return enviar(res, 400, { ok: false, erro: problema });

  const info = decodificarChave(chave);
  if (chave === CHAVE_DEMO) return enviar(res, 200, { ok: true, fonte: 'demo', ...info, ...NOTA_DEMO });

  if (!NFE_API_URL) {
    return enviar(res, 200, { ok: true, fonte: 'chave', ...info, produtos: [], aviso: 'Chave lida e conferida. Para listar os produtos, configure uma API de consulta de NF-e (NFE_API_URL).' });
  }
  try {
    const nota = await viaApi(chave);
    return enviar(res, 200, { ok: true, fonte: 'api', ...info, ...semVazios(nota) });
  } catch (e) {
    const tempo = e.name === 'TimeoutError' || e.name === 'AbortError';
    // Mesmo sem os produtos, a chave é válida: devolve o que dá para saber dela.
    return enviar(res, 200, { ok: true, fonte: 'chave', ...info, produtos: [], aviso: tempo ? 'A consulta dos produtos demorou demais. Tente de novo em instantes.' : e.message });
  }
};

/* ---------- chave de acesso ---------- */
// Layout: cUF(2) AAMM(4) CNPJ(14) modelo(2) série(3) número(9) tpEmis(1) código(8) DV(1).
// Desde 2026 o CNPJ pode ser alfanumérico; no cálculo do DV cada caractere vale (código ASCII − 48).
// O mesmo cálculo (módulo 11, pesos 2–9) serve para o DV da chave e para os DVs do CNPJ.
function dvChave(base43) {
  let soma = 0, peso = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += (base43.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function validarChave(c) {
  if (c.length !== 44) return 'A chave de acesso precisa ter 44 dígitos (veio com ' + c.length + ').';
  if (!/^\d{6}[0-9A-Z]{12}\d{26}$/.test(c)) return 'A chave de acesso tem caracteres inválidos.';
  if (!UFS[c.slice(0, 2)]) return 'Os 2 primeiros dígitos da chave não são de um estado válido. Confira a chave.';
  if (dvChave(c.slice(0, 43)) !== +c[43]) return 'A chave não confere (dígito verificador errado). Algum número foi lido ou digitado errado.';
  const mes = +c.slice(4, 6), doc = c.slice(6, 20);
  if (mes < 1 || mes > 12) return 'O mês de emissão dentro da chave é inválido. Confira a chave.';
  if (!cnpjValido(doc) && !(doc.startsWith('000') && cpfValido(doc.slice(3)))) return 'O CNPJ do emitente dentro da chave não confere. Algum número foi lido ou digitado errado.';
  return '';
}

// CNPJ (numérico ou alfanumérico): DVs módulo 11 com pesos 2–9 da direita para a esquerda.
function cnpjValido(d) {
  return dvChave(d.slice(0, 12)) === +d[12] && dvChave(d.slice(0, 13)) === +d[13];
}
function cpfValido(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const dv = b => { let s = 0; for (let i = 0; i < b.length; i++) s += +b[i] * (b.length + 1 - i); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(d.slice(0, 9)) === +d[9] && dv(d.slice(0, 10)) === +d[10];
}

function decodificarChave(c) {
  const doc = c.slice(6, 20);
  const cpf = /^000\d{11}$/.test(doc) && c[34] === '3'; // emissão por pessoa física (raro)
  return {
    chave: c,
    uf: UFS[c.slice(0, 2)],
    mes_emissao: c.slice(4, 6) + '/20' + c.slice(2, 4),
    cnpj: cpf ? '' : doc.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5'),
    modelo: MODELOS[c.slice(20, 22)] || 'modelo ' + c.slice(20, 22),
    serie: String(+c.slice(22, 25)),
    numero: String(+c.slice(25, 34)),
  };
}

/* ---------- API externa ---------- */
async function viaApi(chave) {
  const r = await fetch(NFE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + NFE_API_KEY, 'x-api-key': NFE_API_KEY },
    body: JSON.stringify({ chave }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const txt = await r.text();
  let json; try { json = JSON.parse(txt); } catch (e) { json = null; }
  if (!r.ok || !json) {
    const msg = json && (json.error || json.erro || json.message || json.mensagem);
    throw new Error('A API de notas respondeu com erro' + (msg ? ': ' + msg : ' (HTTP ' + r.status + ').'));
  }
  return normalizar(json);
}

// Não deixa campo vazio da API apagar o que já veio da chave (ex.: cnpj, chave).
function semVazios(o) {
  const r = {};
  for (const k in o) if (o[k] !== '' && o[k] != null && !(k === 'estabelecimento' && o[k] === 'Estabelecimento')) r[k] = o[k];
  return r;
}

const CHAVE_DEMO = '35261012345678000195550010000456781123456787';
const NOTA_DEMO = {
  estabelecimento: 'Distribuidora Exemplo Ltda',
  data_emissao: '27/10/2026 14:05:00',
  valor_total: 1452.6,
  quantidade_itens: 4,
  produtos: [
    { id: 1, codigo: '1001', nome: 'CAFE TORRADO MOIDO 500G CX 20UN', quantidade: 3, unidade: 'CX', preco_unitario: 289.9, preco_total: 869.7 },
    { id: 2, codigo: '1045', nome: 'ACUCAR CRISTAL 5KG FD 6UN', quantidade: 4, unidade: 'FD', preco_unitario: 92.4, preco_total: 369.6 },
    { id: 3, codigo: '2210', nome: 'BISCOITO CREAM CRACKER 400G CX 24UN', quantidade: 2, unidade: 'CX', preco_unitario: 84.5, preco_total: 169 },
    { id: 4, codigo: '3307', nome: 'COPO DESCARTAVEL 200ML PCT 100UN', quantidade: 5, unidade: 'PCT', preco_unitario: 8.86, preco_total: 44.3 },
  ],
};
