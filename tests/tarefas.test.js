import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarServidor } from './auxiliar.js';

describe('API de tarefas', () => {
  let api;
  before(async () => {
    api = await iniciarServidor();
  });
  after(() => api.fechar());

  describe('CRUD', () => {
    let id;

    it('cria uma tarefa com valores padrão (201)', async () => {
      const { status, corpo, headers } = await api.req('POST', '/tarefas', { titulo: '  Estudar SQL  ' });
      assert.equal(status, 201);
      assert.equal(corpo.titulo, 'Estudar SQL');
      assert.equal(corpo.status, 'pendente');
      assert.equal(corpo.prioridade, 2);
      assert.equal(headers.get('location'), `/tarefas/${corpo.id}`);
      id = corpo.id;
    });

    it('busca a tarefa pelo id', async () => {
      const { status, corpo } = await api.req('GET', `/tarefas/${id}`);
      assert.equal(status, 200);
      assert.equal(corpo.id, id);
    });

    it('PATCH altera apenas os campos enviados', async () => {
      const { status, corpo } = await api.req('PATCH', `/tarefas/${id}`, { status: 'concluida' });
      assert.equal(status, 200);
      assert.equal(corpo.status, 'concluida');
      assert.equal(corpo.titulo, 'Estudar SQL');
    });

    it('PUT substitui a tarefa inteira', async () => {
      const { status, corpo } = await api.req('PUT', `/tarefas/${id}`, { titulo: 'Nova', prioridade: 3 });
      assert.equal(status, 200);
      assert.deepEqual(
        { titulo: corpo.titulo, status: corpo.status, prioridade: corpo.prioridade, descricao: corpo.descricao },
        { titulo: 'Nova', status: 'pendente', prioridade: 3, descricao: '' },
      );
    });

    it('remove a tarefa (204) e depois responde 404', async () => {
      assert.equal((await api.req('DELETE', `/tarefas/${id}`)).status, 204);
      assert.equal((await api.req('GET', `/tarefas/${id}`)).status, 404);
      assert.equal((await api.req('DELETE', `/tarefas/${id}`)).status, 404);
      assert.equal((await api.req('PATCH', `/tarefas/${id}`, { titulo: 'x' })).status, 404);
    });
  });

  describe('validação', () => {
    it('rejeita título ausente, status inválido e campos extras (400)', async () => {
      const { status, corpo } = await api.req('POST', '/tarefas', { status: 'feita', admin: true });
      assert.equal(status, 400);
      const campos = corpo.detalhes.map((d) => d.campo).sort();
      assert.deepEqual(campos, ['admin', 'status', 'titulo']);
    });

    it('rejeita prioridade fora do intervalo', async () => {
      const { status } = await api.req('POST', '/tarefas', { titulo: 'a', prioridade: 9 });
      assert.equal(status, 400);
    });

    it('rejeita PATCH vazio', async () => {
      const { corpo: t } = await api.req('POST', '/tarefas', { titulo: 'temp' });
      const { status } = await api.req('PATCH', `/tarefas/${t.id}`, {});
      assert.equal(status, 400);
    });

    it('rejeita id não numérico (400)', async () => {
      assert.equal((await api.req('GET', '/tarefas/abc')).status, 400);
    });

    it('responde 400 para JSON malformado', async () => {
      const { status, corpo } = await api.req('POST', '/tarefas', '{"titulo": ');
      assert.equal(status, 400);
      assert.match(corpo.erro, /JSON malformado/);
    });

    it('responde 413 para corpo acima de 100kb', async () => {
      const { status } = await api.req('POST', '/tarefas', { titulo: 'x', descricao: 'a'.repeat(110_000) });
      assert.equal(status, 413);
    });

    it('responde 404 em JSON para rota inexistente', async () => {
      const { status, corpo } = await api.req('GET', '/nao-existe');
      assert.equal(status, 404);
      assert.ok(corpo.erro);
    });

    it('não expõe o cabeçalho X-Powered-By', async () => {
      const { headers } = await api.req('GET', '/saude');
      assert.equal(headers.get('x-powered-by'), null);
    });
  });

  describe('listagem', () => {
    before(async () => {
      api.db.exec('DELETE FROM tarefas');
      const tarefas = [
        { titulo: 'Bravo', status: 'pendente', prioridade: 1 },
        { titulo: 'Alfa', status: 'concluida', prioridade: 3 },
        { titulo: 'Delta', status: 'pendente', prioridade: 3 },
        { titulo: 'Charlie', status: 'em_andamento', prioridade: 2 },
        { titulo: 'Eco', status: 'pendente', prioridade: 2 },
      ];
      for (const t of tarefas) await api.req('POST', '/tarefas', t);
    });

    it('pagina os resultados', async () => {
      const { corpo } = await api.req('GET', '/tarefas?limite=2&pagina=3');
      assert.equal(corpo.dados.length, 1);
      assert.deepEqual(corpo.paginacao, { pagina: 3, limite: 2, total: 5, totalPaginas: 3 });
    });

    it('filtra por status', async () => {
      const { corpo } = await api.req('GET', '/tarefas?status=pendente');
      assert.equal(corpo.paginacao.total, 3);
      assert.ok(corpo.dados.every((t) => t.status === 'pendente'));
    });

    it('combina filtros de status e prioridade', async () => {
      const { corpo } = await api.req('GET', '/tarefas?status=pendente&prioridade=3');
      assert.deepEqual(corpo.dados.map((t) => t.titulo), ['Delta']);
    });

    it('ordena por título ascendente', async () => {
      const { corpo } = await api.req('GET', '/tarefas?ordenar=titulo&direcao=asc');
      assert.deepEqual(corpo.dados.map((t) => t.titulo), ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco']);
    });

    it('ordena por prioridade descendente (desempate pelo id)', async () => {
      const { corpo } = await api.req('GET', '/tarefas?ordenar=prioridade&direcao=desc');
      assert.deepEqual(corpo.dados.map((t) => t.titulo), ['Delta', 'Alfa', 'Eco', 'Charlie', 'Bravo']);
    });

    it('rejeita parâmetros de consulta inválidos', async () => {
      for (const q of ['status=x', 'limite=0', 'limite=101', 'pagina=-1', 'ordenar=senha', 'direcao=up', 'status=a&status=b']) {
        const { status } = await api.req('GET', `/tarefas?${q}`);
        assert.equal(status, 400, q);
      }
    });

    it('impede injeção de SQL pelo parâmetro de ordenação', async () => {
      const { status } = await api.req('GET', '/tarefas?ordenar=' + encodeURIComponent('id; DROP TABLE tarefas'));
      assert.equal(status, 400);
      assert.equal((await api.req('GET', '/tarefas')).status, 200);
    });
  });
});
