// Servidor local (Express): serve o site e a rota /api/nfce.
//   npm install && npm start  →  http://localhost:3000/nota
// Na Vercel este arquivo não é usado: ela publica os arquivos estáticos e api/nfce.js sozinha.
const express = require('express');
const path = require('path');
const nfce = require('./api/nfce');

const app = express();
app.use(express.json());
app.all('/api/nfce', nfce);
app.get('/nota', (req, res) => res.sendFile(path.join(__dirname, 'nota.html')));
app.use(express.static(__dirname, { index: 'index.html' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Rodando em http://localhost:' + PORT + '/nota'));
