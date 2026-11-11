const POR_OMISSAO = { tema: 'claro', ordenacao: 'recentes' };
const VALORES = {
  tema: ['claro', 'escuro'],
  ordenacao: ['recentes', 'estado']
};

export function lerConfiguracoes() {
  try {
    const guardado = JSON.parse(localStorage.getItem('configuracoes'));
    const valido =
      guardado !== null &&
      typeof guardado === 'object' &&
      Object.keys(VALORES).every((chave) => VALORES[chave].includes(guardado[chave]));
    return valido ? { tema: guardado.tema, ordenacao: guardado.ordenacao } : { ...POR_OMISSAO };
  } catch {
    return { ...POR_OMISSAO };
  }
}

export function guardarConfiguracoes(configuracoes) {
  localStorage.setItem('configuracoes', JSON.stringify(configuracoes));
}