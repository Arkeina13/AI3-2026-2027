import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { autenticar, emitirToken, exigirToken, VALIDADE } from './autenticacao.js';

const PORTA = 3000;
const PUBLICO = fileURLToPath(new URL('./public', import.meta.url));
const CONTRATO = new URL('../sugestoes.openapi.yaml', import.meta.url);
const SUGESTOES = JSON.parse(
  readFileSync(new URL('./dados/sugestoes.json', import.meta.url), 'utf-8')
);

const PADRAO_UTILIZADOR = /^([0-9]{5,8}|[a-z]+\.[a-z]+)$/;

const app = express();

app.use('/v2/tokens', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use(express.json());
app.use(express.static(PUBLICO));


// --- Contrato -
app.get('/v2/openapi.yaml', (req, res, next) => {
  try {
    res.type('application/yaml').send(readFileSync(CONTRATO, 'utf-8'));
  } catch (erro) {
    next(erro);
  }
});

// --- POST /v2/tokens -
function validarCredenciais(corpo) {
  const detalhes = [];
  const { utilizador, palavraPasse } = corpo;

  if (utilizador === undefined) {
    detalhes.push({ campo: 'utilizador', problema: 'Campo obrigatório.' });
  } else if (typeof utilizador !== 'string' || !PADRAO_UTILIZADOR.test(utilizador)) {
    detalhes.push({
      campo: 'utilizador',
      problema: 'Deve ser um texto: número de aluno (5 a 8 algarismos) ou nome.apelido.'
    });
  }

  if (palavraPasse === undefined) {
    detalhes.push({ campo: 'palavraPasse', problema: 'Campo obrigatório.' });
  } else if (
    typeof palavraPasse !== 'string' ||
    palavraPasse.length < 8 ||
    palavraPasse.length > 128
  ) {
    detalhes.push({
      campo: 'palavraPasse',
      problema: 'Deve ser um texto com 8 a 128 caracteres.'
    });
  }
  return detalhes;
}

app.post('/v2/tokens', async (req, res, next) => {
  try {
    const corpo =
      req.body !== null && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body
        : {};

    const detalhes = validarCredenciais(corpo);
    if (detalhes.length > 0) {
      return res.status(400).json({ codigo: 400, mensagem: 'Pedido inválido.', detalhes });
    }

    const utilizador = await autenticar(corpo.utilizador, corpo.palavraPasse);
    if (!utilizador) {
      return res.status(401).json({ codigo: 401, mensagem: 'Credenciais inválidas.' });
    }

    res.status(200).json({ token: emitirToken(utilizador), tipo: 'Bearer', expiraEm: VALIDADE });
  } catch (erro) {
    next(erro);
  }
});

app.get('/v2/sugestoes', exigirToken, (req, res) => {
  const { sub, papel } = req.utilizador;
  const itens =
    papel === 'servicos' ? SUGESTOES : SUGESTOES.filter((s) => s.numeroAluno === sub);

  res
    .set('Cache-Control', 'private, no-cache')
    .json({ itens, total: itens.length, pagina: 1, tamanhoPagina: 20 });
});

app.use((erro, req, res, next) => {
  if (res.headersSent) return next(erro);

  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({ codigo: 400, mensagem: 'Corpo JSON mal formado.' });
  }
  console.error(erro); // detalhes só no servidor
  res.status(500).json({ codigo: 500, mensagem: 'Erro interno do servidor.' });
});

app.listen(PORTA, () => {
  console.log(`Servidor em http://localhost:${PORTA}`);
});