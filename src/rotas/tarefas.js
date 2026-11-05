import { Router } from 'express';
import { ErroHttp } from '../middlewares/erros.js';
import { validarCorpo, validarId } from '../middlewares/validacao.js';

export const STATUS = ['pendente', 'em_andamento', 'concluida'];

// Colunas devolvidas pela API (snake_case no banco, camelCase no JSON).
const COLUNAS = `id, titulo, descricao, status, prioridade,
  criada_em AS criadaEm, atualizada_em AS atualizadaEm`;

// Lista branca: só estes nomes podem chegar ao ORDER BY / WHERE montados abaixo.
const CAMPOS_ORDENACAO = {
  criadaEm: 'criada_em',
  atualizadaEm: 'atualizada_em',
  prioridade: 'prioridade',
  titulo: 'titulo',
};
const FILTROS = ['status', 'prioridade'];
const LIMITE_PADRAO = 10;
const LIMITE_MAXIMO = 100;

const esquemaTarefa = {
  titulo: { tipo: 'texto', obrigatorio: true, min: 1, max: 200 },
  descricao: { tipo: 'texto', max: 2000 },
  status: { tipo: 'texto', valores: STATUS },
  prioridade: { tipo: 'inteiro', min: 1, max: 3 },
};

/** Converte e valida a query string da listagem. */
function lerConsulta(query) {
  const erros = [];
  const texto = (nome) => {
    const v = query[nome];
    if (v === undefined) return undefined;
    if (typeof v !== 'string') {
      erros.push({ campo: nome, mensagem: 'informe o parâmetro uma única vez' });
      return undefined;
    }
    return v;
  };
  const inteiro = (nome, padrao, min, max) => {
    const v = texto(nome);
    if (v === undefined) return padrao;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      erros.push({ campo: nome, mensagem: `deve ser um inteiro entre ${min} e ${max}` });
    }
    return n;
  };

  const status = texto('status');
  if (status !== undefined && !STATUS.includes(status)) {
    erros.push({ campo: 'status', mensagem: `deve ser um de: ${STATUS.join(', ')}` });
  }
  const prioridade = inteiro('prioridade', undefined, 1, 3);
  const pagina = inteiro('pagina', 1, 1, Number.MAX_SAFE_INTEGER);
  const limite = inteiro('limite', LIMITE_PADRAO, 1, LIMITE_MAXIMO);
  const ordenar = texto('ordenar') ?? 'criadaEm';
  if (!Object.hasOwn(CAMPOS_ORDENACAO, ordenar)) {
    erros.push({ campo: 'ordenar', mensagem: `deve ser um de: ${Object.keys(CAMPOS_ORDENACAO).join(', ')}` });
  }
  const direcao = (texto('direcao') ?? 'desc').toLowerCase();
  if (direcao !== 'asc' && direcao !== 'desc') {
    erros.push({ campo: 'direcao', mensagem: 'deve ser asc ou desc' });
  }

  if (erros.length) throw new ErroHttp(400, 'Parâmetros de consulta inválidos', erros);
  return { status, prioridade, pagina, limite, ordenar, direcao };
}

export function criarRotasTarefas(db) {
  // Prepared statements criados uma única vez e reutilizados em todas as requisições.
  const sql = {
    buscar: db.prepare(`SELECT ${COLUNAS} FROM tarefas WHERE id = ?`),
    inserir: db.prepare(`
      INSERT INTO tarefas (titulo, descricao, status, prioridade)
      VALUES (@titulo, @descricao, @status, @prioridade)
      RETURNING ${COLUNAS}`),
    atualizar: db.prepare(`
      UPDATE tarefas SET
        titulo        = COALESCE(@titulo, titulo),
        descricao     = COALESCE(@descricao, descricao),
        status        = COALESCE(@status, status),
        prioridade    = COALESCE(@prioridade, prioridade),
        atualizada_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = @id
      RETURNING ${COLUNAS}`),
    remover: db.prepare('DELETE FROM tarefas WHERE id = ?'),
  };

  // Consultas de listagem variam por filtro/ordenação: cada combinação é
  // preparada na primeira vez e guardada em cache (no máximo 4 x 4 x 2 + 4).
  const cache = new Map();
  function preparar(chave, gerarSql) {
    let stmt = cache.get(chave);
    if (!stmt) {
      stmt = db.prepare(gerarSql());
      cache.set(chave, stmt);
    }
    return stmt;
  }

  const router = Router();

  router.get('/', (req, res) => {
    const c = lerConsulta(req.query);
    const ativos = FILTROS.filter((f) => c[f] !== undefined);
    const where = ativos.length ? `WHERE ${ativos.map((f) => `${f} = @${f}`).join(' AND ')}` : '';
    const params = Object.fromEntries(ativos.map((f) => [f, c[f]]));

    const contar = preparar(`contar:${ativos}`, () => `SELECT COUNT(*) AS total FROM tarefas ${where}`);
    const listar = preparar(`listar:${ativos}:${c.ordenar}:${c.direcao}`, () => `
      SELECT ${COLUNAS} FROM tarefas ${where}
      ORDER BY ${CAMPOS_ORDENACAO[c.ordenar]} ${c.direcao}, id ${c.direcao}
      LIMIT @limite OFFSET @deslocamento`);

    const { total } = contar.get(params);
    const dados = listar.all({ ...params, limite: c.limite, deslocamento: (c.pagina - 1) * c.limite });

    res.json({
      dados,
      paginacao: {
        pagina: c.pagina,
        limite: c.limite,
        total,
        totalPaginas: Math.ceil(total / c.limite),
      },
    });
  });

  router.get('/:id', validarId, (req, res) => {
    const tarefa = sql.buscar.get(req.id);
    if (!tarefa) throw new ErroHttp(404, 'Tarefa não encontrada');
    res.json(tarefa);
  });

  router.post('/', validarCorpo(esquemaTarefa), (req, res) => {
    const { titulo, descricao = '', status = 'pendente', prioridade = 2 } = req.dados;
    const tarefa = sql.inserir.get({ titulo, descricao, status, prioridade });
    res.status(201).location(`${req.baseUrl}/${tarefa.id}`).json(tarefa);
  });

  // PUT substitui a tarefa inteira (campos ausentes voltam ao valor padrão).
  router.put('/:id', validarId, validarCorpo(esquemaTarefa), (req, res) => {
    const { titulo, descricao = '', status = 'pendente', prioridade = 2 } = req.dados;
    const tarefa = sql.atualizar.get({ id: req.id, titulo, descricao, status, prioridade });
    if (!tarefa) throw new ErroHttp(404, 'Tarefa não encontrada');
    res.json(tarefa);
  });

  // PATCH altera apenas os campos enviados.
  router.patch('/:id', validarId, validarCorpo(esquemaTarefa, { parcial: true }), (req, res) => {
    const { titulo = null, descricao = null, status = null, prioridade = null } = req.dados;
    const tarefa = sql.atualizar.get({ id: req.id, titulo, descricao, status, prioridade });
    if (!tarefa) throw new ErroHttp(404, 'Tarefa não encontrada');
    res.json(tarefa);
  });

  router.delete('/:id', validarId, (req, res) => {
    const { changes } = sql.remover.run(req.id);
    if (changes === 0) throw new ErroHttp(404, 'Tarefa não encontrada');
    res.status(204).end();
  });

  return router;
}
