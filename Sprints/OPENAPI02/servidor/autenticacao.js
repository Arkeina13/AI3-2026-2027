import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// --- Configuração ---
const SEGREDO = process.env.JWT_SEGREDO;
if (!SEGREDO || SEGREDO.length < 32) {
  console.error(
    'JWT_SEGREDO em falta ou com menos de 32 caracteres. ' +
      'Crie o ficheiro .env a partir de .env.exemplo e defina um segredo aleatório.'
  );
  process.exit(1);
}

export const VALIDADE = Number.parseInt(process.env.JWT_VALIDADE || '900', 10);
if (!Number.isInteger(VALIDADE) || VALIDADE <= 0) {
  console.error('JWT_VALIDADE tem de ser um número inteiro positivo (segundos).');
  process.exit(1);
}

const PAPEIS = ['aluno', 'servicos'];

const UTILIZADORES = JSON.parse(
  readFileSync(new URL('./dados/utilizadores.json', import.meta.url), 'utf-8')
);


const HASH_FIXO = bcrypt.hashSync('palavra-passe-que-ninguem-tem', 10);

// --- Credenciais ---
export async function autenticar(utilizador, palavraPasse) {
  const registo = UTILIZADORES.find((u) => u.utilizador === utilizador);
  const hash = registo ? registo.hashPalavraPasse : HASH_FIXO;
  const correta = await bcrypt.compare(palavraPasse, hash);
  return registo && correta ? registo : null;
}

// --- Tokens ---
export function emitirToken(utilizador) {
  return jwt.sign({ nome: utilizador.nome, papel: utilizador.papel }, SEGREDO, {
    algorithm: 'HS256',
    subject: utilizador.utilizador,
    expiresIn: VALIDADE 
  });
}

function naoAutenticado(res, desafio, mensagem) {
  res
    .status(401)
    .set({ 'WWW-Authenticate': desafio, 'Cache-Control': 'no-store' })
    .json({ codigo: 401, mensagem });
}

export function exigirToken(req, res, next) {
  const correspondencia = /^Bearer +(\S+)$/i.exec(req.get('Authorization') ?? '');
  if (!correspondencia) {
    return naoAutenticado(res, 'Bearer', 'Autenticação necessária.');
  }

  try {
     const payload = jwt.verify(correspondencia[1], SEGREDO, { algorithms: ['HS256'] });

    if (typeof payload.sub !== 'string' || !PAPEIS.includes(payload.papel)) {
      throw new Error('claims inesperados');
    }
    req.utilizador = { sub: payload.sub, nome: payload.nome, papel: payload.papel };
    next();
  } catch {
    naoAutenticado(res, 'Bearer error="invalid_token"', 'Token inválido ou expirado.');
  }
}

export function exigirPapel(papel) {
  return (req, res, next) => {
    if (req.utilizador?.papel !== papel) {
      return res
        .status(403)
        .set('Cache-Control', 'no-store')
        .json({ codigo: 403, mensagem: 'Sem permissão para esta operação.' });
    }
    next();
  };
}