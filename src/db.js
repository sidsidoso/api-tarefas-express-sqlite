import Database from 'better-sqlite3';

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS tarefas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo        TEXT    NOT NULL CHECK (length(titulo) BETWEEN 1 AND 200),
  descricao     TEXT    NOT NULL DEFAULT '' CHECK (length(descricao) <= 2000),
  status        TEXT    NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente', 'em_andamento', 'concluida')),
  prioridade    INTEGER NOT NULL DEFAULT 2 CHECK (prioridade BETWEEN 1 AND 3),
  criada_em     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizada_em TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Índice composto: atende ao filtro por status já ordenado por data de criação.
CREATE INDEX IF NOT EXISTS idx_tarefas_status_criada ON tarefas (status, criada_em);
CREATE INDEX IF NOT EXISTS idx_tarefas_prioridade ON tarefas (prioridade);
`;

/**
 * Abre (ou cria) o banco SQLite e garante o esquema.
 * @param {string} caminho arquivo do banco ou ':memory:' (testes)
 */
export function abrirBanco(caminho = ':memory:') {
  const db = new Database(caminho);
  db.pragma('journal_mode = WAL'); // leituras não bloqueiam escritas
  db.pragma('foreign_keys = ON');
  db.exec(ESQUEMA);
  return db;
}
