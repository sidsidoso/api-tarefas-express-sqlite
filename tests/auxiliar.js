import { once } from 'node:events';
import { abrirBanco } from '../src/db.js';
import { criarApp } from '../src/app.js';

/** Sobe a API em uma porta livre (0) com banco em memória. */
export async function iniciarServidor() {
  const db = abrirBanco(':memory:');
  const servidor = criarApp(db).listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const base = `http://127.0.0.1:${servidor.address().port}`;

  /** Atalho para requisições JSON; devolve { status, corpo, headers }. */
  async function req(metodo, caminho, corpo) {
    const resposta = await fetch(base + caminho, {
      method: metodo,
      headers: corpo === undefined ? {} : { 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
    });
    const texto = await resposta.text();
    return { status: resposta.status, headers: resposta.headers, corpo: texto ? JSON.parse(texto) : null };
  }

  async function fechar() {
    servidor.closeAllConnections();
    await new Promise((resolve) => servidor.close(resolve));
    db.close();
  }

  return { db, req, fechar };
}
