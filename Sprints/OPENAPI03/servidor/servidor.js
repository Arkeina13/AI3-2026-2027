import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  autenticar,
  emitirToken,
  exigirPapel,
  exigirToken,
  sessaoDe,
  sessaoDoToken,
  VALIDADE
} from './autenticacao.js';

const PORTA = 3000;
const PUBLICO = fileURLToPath(new URL('./public', import.meta.url));
const CONTRATO = new URL('../sugestoes.openapi.yaml', import.meta.url);
const SUGESTOES = JSON.parse(
  readFileSync(new URL('./dados/sugestoes.json', import.meta.url), 'utf-8')
);

const PADRAO_UTILIZADOR = /^([0-9]{5,8}|[a-z]+\.[a-z]+)$/;
const CATEGORIAS = ['instalacoes', 'ensino', 'servicos', 'atividades', 'outra'];

const app = express();

app.use(['/v2/tokens', '/v2/sessao'], (req, res, next) => {
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

// Valida o corpo e verifica as credenciais. Responde 400 ou 401 e devolve null se falhar.
async function verificarPedido(req, res) {
  const corpo =
    req.body !== null && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body
      : {};

  const detalhes = validarCredenciais(corpo);
  if (detalhes.length > 0) {
    res.status(400).json({ codigo: 400, mensagem: 'Pedido inválido.', detalhes });
    return null;
  }

  const utilizador = await autenticar(corpo.utilizador, corpo.palavraPasse);
  if (!utilizador) {
    res.status(401).json({ codigo: 401, mensagem: 'Credenciais inválidas.' });
    return null;
  }
  return utilizador;
}

app.post('/v2/tokens', async (req, res, next) => {
  try {
    const utilizador = await verificarPedido(req, res);
    if (!utilizador) return;

    res.status(200).json({ token: emitirToken(utilizador), tipo: 'Bearer', expiraEm: VALIDADE });
  } catch (erro) {
    next(erro);
  }
});

// --- /v2/sessao: o mesmo token, num cookie ---
app.post('/v2/sessao', async (req, res, next) => {
  try {
    const utilizador = await verificarPedido(req, res);
    if (!utilizador) return;

    const token = emitirToken(utilizador);
    res.cookie('sessao', token, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/v2',
      maxAge: VALIDADE * 1000 // em Express, maxAge é em milissegundos
    });
    res.status(200).json(sessaoDoToken(token));
  } catch (erro) {
    next(erro);
  }
});

app.get('/v2/sessao', exigirToken, (req, res) => {
  res.json(sessaoDe(req.utilizador));
});

app.delete('/v2/sessao', (req, res) => {
  res.clearCookie('sessao', { path: '/v2' }); // o path tem de ser o do cookie criado
  res.status(204).end();
});

app.get('/v2/sugestoes', exigirToken, (req, res) => {
  const { sub, papel } = req.utilizador;
  const itens =
    papel === 'servicos' ? SUGESTOES : SUGESTOES.filter((s) => s.numeroAluno === sub);

  res
    .set('Cache-Control', 'private, no-cache')
    .json({ itens, total: itens.length, pagina: 1, tamanhoPagina: 20 });
});

function validarSugestao(corpo) {
  const detalhes = [];
  const { titulo, descricao, categoria } = corpo;

  if (typeof titulo !== 'string' || titulo.length < 10 || titulo.length > 120) {
    detalhes.push({ campo: 'titulo', problema: 'Deve ser um texto com 10 a 120 caracteres.' });
  }
  if (typeof descricao !== 'string' || descricao.length < 20 || descricao.length > 2000) {
    detalhes.push({ campo: 'descricao', problema: 'Deve ser um texto com 20 a 2000 caracteres.' });
  }
  if (!CATEGORIAS.includes(categoria)) {
    detalhes.push({ campo: 'categoria', problema: `Deve ser uma de: ${CATEGORIAS.join(', ')}.` });
  }
  return detalhes;
}

// Apenas alunos. O numeroAluno vem do token; o que o corpo eventualmente traga é ignorado.
// As sugestões novas ficam só em memória: perdem-se quando o servidor reinicia.
app.post('/v2/sugestoes', exigirToken, exigirPapel('aluno'), (req, res) => {
  const corpo =
    req.body !== null && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body
      : {};

  const detalhes = validarSugestao(corpo);
  if (detalhes.length > 0) {
    return res
      .status(400)
      .set('Cache-Control', 'no-store')
      .json({ codigo: 400, mensagem: 'Pedido inválido.', detalhes });
  }

  const agora = new Date().toISOString();
  const sugestao = {
    id: Math.max(0, ...SUGESTOES.map((s) => s.id)) + 1,
    titulo: corpo.titulo,
    descricao: corpo.descricao,
    categoria: corpo.categoria,
    numeroAluno: req.utilizador.sub,
    estado: 'submetida',
    dataCriacao: agora,
    dataAtualizacao: agora,
    dataResolucao: null
  };
  SUGESTOES.push(sugestao);

  res
    .status(201)
    .set({ Location: `/v2/sugestoes/${sugestao.id}`, 'Cache-Control': 'no-store' })
    .json(sugestao);
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