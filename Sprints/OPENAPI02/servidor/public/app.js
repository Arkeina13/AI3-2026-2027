let token = null;
let temporizador = null;
let expiracao = 0;

const $ = (id) => document.getElementById(id);

const ESTADOS = {
  submetida: 'Submetida',
  em_analise: 'Em análise',
  aceite: 'Aceite',
  rejeitada: 'Rejeitada',
  resolvida: 'Resolvida'
};
const CATEGORIAS = {
  instalacoes: 'Instalações',
  ensino: 'Ensino',
  servicos: 'Serviços',
  atividades: 'Atividades',
  outra: 'Outra'
};

const MENSAGEM_EXPIRADA = 'Sessão expirada. É necessária nova autenticação.';

function mostrarErro(texto) {
  $('mensagens').textContent = texto;
}

function limparMensagem() {
  $('mensagens').textContent = '';
}

function descodificarPayload(jwt) {
  const parte = jwt.split('.')[1];
  const base64 = parte.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parte.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8').decode(bytes));
}

function iniciarSessao() {
  const payload = descodificarPayload(token);
  expiracao = payload.exp * 1000;

  $('nome').textContent = payload.nome;
  $('papel').textContent = payload.papel === 'servicos' ? 'serviços' : 'aluno';
  $('expira').textContent = new Date(expiracao).toLocaleTimeString('pt-PT');
  $('expira').dateTime = new Date(expiracao).toISOString();
  $('validade').max = payload.exp - payload.iat;
  $('botao-sugestoes').textContent =
    payload.papel === 'servicos' ? 'Todas as sugestões' : 'As minhas sugestões';

  $('entrada').hidden = true;
  $('sessao').hidden = false;

  atualizarRestante();
  temporizador = setInterval(atualizarRestante, 1000);
}

function atualizarRestante() {
  const segundos = Math.max(0, Math.ceil((expiracao - Date.now()) / 1000));
  $('restante').textContent = `${Math.floor(segundos / 60)} min ${String(segundos % 60).padStart(2, '0')} s`;
  $('validade').value = segundos;
  if (segundos === 0) {
    terminarSessao(MENSAGEM_EXPIRADA); // sem aguardar um pedido ao servidor
  }
}

function terminarSessao(mensagem) {
  token = null;
  clearInterval(temporizador);
  temporizador = null;
  $('lista-sugestoes').replaceChildren();
  $('sessao').hidden = true;
  $('entrada').hidden = false;
  limparMensagem();
  if (mensagem) mostrarErro(mensagem);
  $('utilizador').focus();
}

async function pedidoAutenticado(url) {
  if (token === null) return null;
  const resposta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (resposta.status === 401) {
    terminarSessao(MENSAGEM_EXPIRADA);
    return null;
  }
  return resposta;
}

function mostrarSugestoes(itens) {
  const lista = $('lista-sugestoes');
  lista.replaceChildren();

  if (itens.length === 0) {
    const vazio = document.createElement('li');
    vazio.textContent = 'Não há sugestões para mostrar.';
    lista.append(vazio);
    return;
  }

  for (const sugestao of itens) {
    const item = document.createElement('li');
    const titulo = document.createElement('strong');
    const categoria = document.createElement('span');
    const estado = document.createElement('span');

    titulo.textContent = sugestao.titulo;
    categoria.textContent = `Categoria: ${CATEGORIAS[sugestao.categoria] ?? sugestao.categoria}`;
    estado.textContent = `Estado: ${ESTADOS[sugestao.estado] ?? sugestao.estado}`;

    item.append(titulo, categoria, estado);
    lista.append(item);
  }
}

$('formulario-entrada').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limparMensagem();
  $('botao-entrar').disabled = true;

  try {
    const resposta = await fetch('/v2/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        utilizador: $('utilizador').value.trim(),
        palavraPasse: $('palavraPasse').value
      })
    });

    if (resposta.status === 200) {
      token = (await resposta.json()).token;
      $('palavraPasse').value = '';
      iniciarSessao();
    } else if (resposta.status === 400 || resposta.status === 401) {
      
      const erro = await resposta.json();
      mostrarErro(erro.mensagem);
    } else {
      mostrarErro('O servidor não conseguiu tratar o pedido. Tente novamente mais tarde.');
    }
  } catch {
    mostrarErro('Não foi possível contactar o servidor. Verifique a ligação e tente novamente.');
  } finally {
    $('botao-entrar').disabled = false;
  }
});

$('botao-sugestoes').addEventListener('click', async () => {
  limparMensagem();
  try {
    const resposta = await pedidoAutenticado('/v2/sugestoes');
    if (resposta === null) return; // sessão terminada por 401
    if (!resposta.ok) {
      mostrarErro('Não foi possível obter as sugestões.');
      return;
    }
    mostrarSugestoes((await resposta.json()).itens);
  } catch {
    mostrarErro('Não foi possível contactar o servidor. Verifique a ligação e tente novamente.');
  }
});

$('botao-terminar').addEventListener('click', () => terminarSessao());