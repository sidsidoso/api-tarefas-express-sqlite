# API de Tarefas — Express + SQLite

[![CI](https://github.com/sidsidoso/api-tarefas-express-sqlite/actions/workflows/ci.yml/badge.svg)](https://github.com/sidsidoso/api-tarefas-express-sqlite/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/node-%3E%3D20.12-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/express-5.x-000000?logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/sqlite-better--sqlite3-003B57?logo=sqlite&logoColor=white)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-yellow.svg)](LICENSE)

API REST para gerenciamento de tarefas, desenvolvida como trabalho da disciplina de **Desenvolvimento Web Back-end**. Implementa o CRUD completo, filtros por status e prioridade, paginação e ordenação, com foco em boas práticas: validação de entrada, tratamento centralizado de erros, *prepared statements* e testes automatizados de integração.

## Sumário

- [Tecnologias](#tecnologias)
- [Arquitetura](#arquitetura)
- [Modelo de dados](#modelo-de-dados)
- [Endpoints](#endpoints)
- [Exemplos de uso](#exemplos-de-uso)
- [Decisões de implementação](#decisões-de-implementação)
- [Como executar](#como-executar)
- [Testes](#testes)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Referências](#referências)

## Tecnologias

| Tecnologia | Uso |
| --- | --- |
| [Node.js](https://nodejs.org/) ≥ 20.12 | Ambiente de execução (ES Modules) |
| [Express 5](https://expressjs.com/) | Roteamento HTTP e middlewares |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Acesso síncrono e rápido ao SQLite |
| `node:test` + `fetch` nativo | Testes de integração sem dependências extras |
| GitHub Actions | Integração contínua (Node 20 e 22) |

## Arquitetura

O projeto separa a **criação do app** (`src/app.js`) da **inicialização do servidor** (`src/server.js`). O banco é recebido por injeção de dependência, então os testes sobem a mesma aplicação com um banco `:memory:`.

```
  Cliente HTTP
       │  requisição (JSON)
       ▼
┌──────────────────────────────────────────────────────────┐
│ Express                                                  │
│  express.json({ limit: '100kb' })                        │
│        │                                                 │
│        ▼                                                 │
│  Router /tarefas ──► validarId / validarCorpo / query    │
│        │                  │ inválido                     │
│        │                  └──────────► next(ErroHttp)    │
│        ▼                                    │            │
│  handler da rota                            │            │
│        │ prepared statement                 ▼            │
│        ▼                          tratadorErros (JSON)   │
│  ┌───────────────┐                naoEncontrado (404)    │
│  │ SQLite (WAL)  │                                       │
│  └───────────────┘                                       │
└──────────────────────────────────────────────────────────┘
       │  resposta JSON
       ▼
  Cliente HTTP
```

## Modelo de dados

Tabela **`tarefas`**

| Coluna | Tipo | Restrições |
| --- | --- | --- |
| `id` | INTEGER | PK, autoincremento |
| `titulo` | TEXT | obrigatório, 1–200 caracteres |
| `descricao` | TEXT | padrão `''`, até 2000 caracteres |
| `status` | TEXT | `pendente` \| `em_andamento` \| `concluida` (padrão `pendente`) |
| `prioridade` | INTEGER | 1 (baixa) a 3 (alta), padrão 2 |
| `criada_em` | TEXT | ISO 8601 (UTC), preenchido pelo banco |
| `atualizada_em` | TEXT | ISO 8601 (UTC), atualizado a cada alteração |

Índices: `idx_tarefas_status_criada (status, criada_em)` e `idx_tarefas_prioridade (prioridade)`.

As regras de domínio também existem como `CHECK` no banco: mesmo que um bug passe pela validação da API, o SQLite recusa dados inválidos.

## Endpoints

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| `GET` | `/saude` | — | Verificação de disponibilidade |
| `GET` | `/tarefas` | — | Lista tarefas com filtros, paginação e ordenação |
| `GET` | `/tarefas/:id` | — | Busca uma tarefa |
| `POST` | `/tarefas` | — | Cria uma tarefa (`201` + cabeçalho `Location`) |
| `PUT` | `/tarefas/:id` | — | Substitui a tarefa inteira |
| `PATCH` | `/tarefas/:id` | — | Altera somente os campos enviados |
| `DELETE` | `/tarefas/:id` | — | Remove a tarefa (`204`) |

**Parâmetros de `GET /tarefas`**

| Parâmetro | Valores | Padrão |
| --- | --- | --- |
| `status` | `pendente`, `em_andamento`, `concluida` | — |
| `prioridade` | `1`, `2`, `3` | — |
| `pagina` | inteiro ≥ 1 | `1` |
| `limite` | inteiro de 1 a 100 | `10` |
| `ordenar` | `criadaEm`, `atualizadaEm`, `prioridade`, `titulo` | `criadaEm` |
| `direcao` | `asc`, `desc` | `desc` |

**Códigos de resposta:** `200` ok · `201` criado · `204` sem conteúdo · `400` dados/parâmetros inválidos ou JSON malformado · `404` tarefa/rota inexistente · `413` corpo acima de 100kb · `500` erro interno (sem detalhes vazados).

## Exemplos de uso

> No Windows (PowerShell), use `curl.exe` em vez de `curl` e troque as aspas simples externas por aspas duplas, escapando as internas.

**Criar tarefa**

```bash
curl -X POST http://localhost:3000/tarefas \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Estudar índices no SQLite","descricao":"Ler a documentação de EXPLAIN QUERY PLAN","prioridade":3}'
```

`201 Created` — `Location: /tarefas/1`

```json
{
  "id": 1,
  "titulo": "Estudar índices no SQLite",
  "descricao": "Ler a documentação de EXPLAIN QUERY PLAN",
  "status": "pendente",
  "prioridade": 3,
  "criadaEm": "2026-11-05T19:29:38.942Z",
  "atualizadaEm": "2026-11-05T19:29:38.942Z"
}
```

**Listar com filtro, ordenação e paginação**

```bash
curl "http://localhost:3000/tarefas?status=pendente&ordenar=prioridade&direcao=desc&limite=2&pagina=1"
```

```json
{
  "dados": [
    {
      "id": 1,
      "titulo": "Estudar índices no SQLite",
      "descricao": "Ler a documentação de EXPLAIN QUERY PLAN",
      "status": "pendente",
      "prioridade": 3,
      "criadaEm": "2026-11-05T19:29:38.942Z",
      "atualizadaEm": "2026-11-05T19:29:38.942Z"
    },
    {
      "id": 3,
      "titulo": "Revisar slides",
      "descricao": "",
      "status": "pendente",
      "prioridade": 2,
      "criadaEm": "2026-11-05T19:29:38.961Z",
      "atualizadaEm": "2026-11-05T19:29:38.961Z"
    }
  ],
  "paginacao": {
    "pagina": 1,
    "limite": 2,
    "total": 2,
    "totalPaginas": 1
  }
}
```

**Atualizar parcialmente**

```bash
curl -X PATCH http://localhost:3000/tarefas/1 \
  -H "Content-Type: application/json" \
  -d '{"status":"concluida"}'
```

```json
{
  "id": 1,
  "titulo": "Estudar índices no SQLite",
  "descricao": "Ler a documentação de EXPLAIN QUERY PLAN",
  "status": "concluida",
  "prioridade": 3,
  "criadaEm": "2026-11-05T19:29:38.942Z",
  "atualizadaEm": "2026-11-05T19:29:38.971Z"
}
```

**Erro de validação**

```bash
curl -X POST http://localhost:3000/tarefas \
  -H "Content-Type: application/json" \
  -d '{"status":"feita"}'
```

`400 Bad Request`

```json
{
  "erro": "Dados inválidos",
  "detalhes": [
    { "campo": "titulo", "mensagem": "campo obrigatório" },
    { "campo": "status", "mensagem": "deve ser um de: pendente, em_andamento, concluida" }
  ]
}
```

**Ordenação por campo não permitido**

```bash
curl "http://localhost:3000/tarefas?ordenar=senha"
```

`400 Bad Request`

```json
{
  "erro": "Parâmetros de consulta inválidos",
  "detalhes": [
    { "campo": "ordenar", "mensagem": "deve ser um de: criadaEm, atualizadaEm, prioridade, titulo" }
  ]
}
```

**Remover e consultar novamente**

```bash
curl -i -X DELETE http://localhost:3000/tarefas/3   # HTTP/1.1 204 No Content
curl http://localhost:3000/tarefas/3
```

`404 Not Found`

```json
{ "erro": "Tarefa não encontrada" }
```

## Decisões de implementação

**Desempenho**

- *Prepared statements* são criados **uma única vez** na montagem do router e reutilizados em todas as requisições. As consultas de listagem (que variam conforme filtros e ordenação) são preparadas na primeira utilização de cada combinação e guardadas em um `Map`.
- Índice composto `(status, criada_em)`: o filtro mais comum (por status, ordenado por data) é resolvido pelo próprio índice, sem ordenação em memória.
- `PRAGMA journal_mode = WAL`: leitores não bloqueiam o escritor, o que melhora a concorrência.
- `INSERT/UPDATE ... RETURNING` devolve a linha alterada em um único comando, evitando um `SELECT` extra.
- `PATCH` usa `COALESCE(@campo, campo)` em um único statement, sem montar SQL dinâmico por requisição.

**Segurança**

- Nenhum valor do usuário é concatenado em SQL; tudo passa por parâmetros nomeados. Os nomes de coluna usados em `ORDER BY`/`WHERE` vêm de uma **lista branca** fixa (há teste cobrindo tentativa de injeção).
- Validação de corpo com rejeição de campos desconhecidos (evita *mass assignment*), limites de tamanho e tipos estritos.
- `express.json({ limit: '100kb' })` limita o tamanho do corpo (resposta `413`).
- `app.disable('x-powered-by')` não divulga o framework utilizado.
- Erros `500` são registrados no servidor, mas o cliente recebe apenas uma mensagem genérica.
- Restrições `CHECK` no banco funcionam como segunda camada de validação.

**Outras escolhas**

- Datas em ISO 8601 UTC geradas pelo próprio SQLite, independentes do fuso do servidor.
- JSON em *camelCase*, banco em *snake_case* (conversão por alias no `SELECT`).
- Encerramento gracioso (`SIGINT`/`SIGTERM`) fecha o servidor e o banco.
- O `.env` é lido com `process.loadEnvFile()`, recurso nativo do Node — sem `dotenv`.

## Como executar

**Pré-requisitos:** Node.js 20.12 ou superior e npm.

```bash
git clone https://github.com/sidsidoso/api-tarefas-express-sqlite.git
cd api-tarefas-express-sqlite
npm install
```

**Configuração (opcional)** — copie o arquivo de exemplo e ajuste se quiser:

```bash
# Linux/macOS
cp .env.example .env
```

```powershell
# Windows (PowerShell)
Copy-Item .env.example .env
```

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `3000` | Porta HTTP |
| `DB_PATH` | `tarefas.db` | Arquivo do banco SQLite |

**Executar**

```bash
npm start      # produção
npm run dev    # recarrega ao salvar (node --watch)
```

A API ficará disponível em `http://localhost:3000`.

## Testes

```bash
npm test
```

Os testes usam `node:test` e `fetch` nativo contra a aplicação real escutando em uma porta aleatória (porta `0`) com banco em memória. Cobrem CRUD, validações, paginação, filtros, ordenação, JSON malformado, limite de corpo e tentativa de injeção SQL. O mesmo comando funciona no Windows, Linux e macOS, e roda no GitHub Actions a cada *push*.

```
ℹ tests 20
ℹ pass 20
ℹ fail 0
```

## Estrutura de pastas

```
api-tarefas-express-sqlite/
├── .github/workflows/ci.yml   # CI: Node 20 e 22
├── src/
│   ├── app.js                 # cria o app Express (recebe o db)
│   ├── server.js              # inicia o servidor HTTP
│   ├── db.js                  # abre o SQLite, pragmas e esquema
│   ├── rotas/
│   │   └── tarefas.js         # CRUD, listagem e prepared statements
│   └── middlewares/
│       ├── erros.js           # ErroHttp, 404 e tratador central
│       └── validacao.js       # validação de corpo e de :id
├── tests/
│   ├── auxiliar.js            # sobe a API na porta 0 com banco :memory:
│   └── tarefas.test.js
├── .env.example
├── package.json
└── LICENSE
```

## Referências

- Express 5 — [Guia e referência da API](https://expressjs.com/en/5x/api.html)
- better-sqlite3 — [Documentação da API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- SQLite — [Write-Ahead Logging](https://www.sqlite.org/wal.html), [Query Planning](https://www.sqlite.org/queryplanner.html), [RETURNING](https://www.sqlite.org/lang_returning.html)
- Node.js — [Test runner (`node:test`)](https://nodejs.org/api/test.html)
- OWASP — [SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- Fielding, R. T. *Architectural Styles and the Design of Network-based Software Architectures*. Tese (Doutorado) — University of California, Irvine, 2000.

## Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE).
