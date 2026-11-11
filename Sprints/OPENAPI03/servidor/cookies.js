export function lerCookie(req, nome) {
  const cabecalho = req.get('Cookie');
  if (!cabecalho) return null;

  for (const par of cabecalho.split(';')) {
    const posicao = par.indexOf('=');
    if (posicao === -1) continue;
    if (par.slice(0, posicao).trim() !== nome) continue;
    try {
      return decodeURIComponent(par.slice(posicao + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}