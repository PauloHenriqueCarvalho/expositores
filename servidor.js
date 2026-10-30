// Servidor local (Express): serve o site e as rotas /api/nfce (cupom) e /api/nfe (NF-e por chave).
//   npm install && npm start  →  http://localhost:3000/nota
// Na Vercel este arquivo não é usado: ela publica os arquivos estáticos e a pasta api/ sozinha.
const express = require('express');
const path = require('path');
const nfce = require('./api/nfce');

const app = express();
app.use(express.json());
app.all('/api/nfce', nfce);
app.all('/api/nfe', require('./api/nfe'));
app.get('/nota', (req, res) => res.sendFile(path.join(__dirname, 'nota.html')));
app.use(express.static(__dirname, { index: 'index.html' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Rodando em http://localhost:' + PORT + '/nota'));
