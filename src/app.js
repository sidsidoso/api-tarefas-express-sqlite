import express from 'express';
import { criarRotasTarefas } from './rotas/tarefas.js';
import { naoEncontrado, tratadorErros } from './middlewares/erros.js';

/**
 * Cria a aplicação Express. O banco é recebido por injeção de dependência,
 * o que permite usar um banco em memória nos testes.
 * @param {import('better-sqlite3').Database} db
 */
export function criarApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/saude', (req, res) => res.json({ status: 'ok' }));
  app.use('/tarefas', criarRotasTarefas(db));

  app.use(naoEncontrado);
  app.use(tratadorErros);
  return app;
}
