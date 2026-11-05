import { ErroHttp } from './erros.js';

/**
 * Valida um valor contra uma regra simples.
 * Regras: { tipo: 'texto' | 'inteiro', obrigatorio, min, max, valores }
 * Retorna a mensagem de erro ou undefined.
 */
function verificar(valor, regra) {
  if (regra.tipo === 'texto') {
    if (typeof valor !== 'string') return 'deve ser um texto';
    const tamanho = valor.trim().length;
    if (regra.min !== undefined && tamanho < regra.min) return `deve ter ao menos ${regra.min} caractere(s)`;
    if (regra.max !== undefined && tamanho > regra.max) return `deve ter no máximo ${regra.max} caracteres`;
    if (regra.valores && !regra.valores.includes(valor.trim())) return `deve ser um de: ${regra.valores.join(', ')}`;
    return undefined;
  }
  if (regra.tipo === 'inteiro') {
    if (!Number.isInteger(valor)) return 'deve ser um número inteiro';
    if (regra.min !== undefined && valor < regra.min) return `deve ser maior ou igual a ${regra.min}`;
    if (regra.max !== undefined && valor > regra.max) return `deve ser menor ou igual a ${regra.max}`;
    return undefined;
  }
  return 'tipo de regra desconhecido';
}

/**
 * Middleware que valida req.body contra um esquema e grava os dados limpos em req.dados.
 * Com `parcial: true` (PATCH) nenhum campo é obrigatório, mas ao menos um deve vir.
 */
export function validarCorpo(esquema, { parcial = false } = {}) {
  return (req, res, next) => {
    const corpo = req.body;
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
      return next(new ErroHttp(400, 'O corpo da requisição deve ser um objeto JSON'));
    }

    const erros = [];
    const dados = {};
    for (const campo of Object.keys(corpo)) {
      if (!Object.hasOwn(esquema, campo)) erros.push({ campo, mensagem: 'campo não permitido' });
    }
    for (const [campo, regra] of Object.entries(esquema)) {
      const valor = corpo[campo];
      if (valor === undefined) {
        if (regra.obrigatorio && !parcial) erros.push({ campo, mensagem: 'campo obrigatório' });
        continue;
      }
      const mensagem = verificar(valor, regra);
      if (mensagem) erros.push({ campo, mensagem });
      else dados[campo] = typeof valor === 'string' ? valor.trim() : valor;
    }
    if (parcial && erros.length === 0 && Object.keys(dados).length === 0) {
      erros.push({ campo: null, mensagem: 'informe ao menos um campo para atualizar' });
    }

    if (erros.length) return next(new ErroHttp(400, 'Dados inválidos', erros));
    req.dados = dados;
    next();
  };
}

/** Garante que :id seja um inteiro positivo. */
export function validarId(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return next(new ErroHttp(400, 'O parâmetro id deve ser um inteiro positivo'));
  }
  req.id = id;
  next();
}
