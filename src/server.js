import { abrirBanco } from './db.js';
import { criarApp } from './app.js';

// Carrega o .env se existir (recurso nativo do Node, sem dependências).
try {
  process.loadEnvFile();
} catch {
  // sem .env: usa apenas as variáveis do ambiente
}

const porta = Number(process.env.PORT) || 3000;
const db = abrirBanco(process.env.DB_PATH || 'tarefas.db');
const servidor = criarApp(db).listen(porta, () => {
  console.log(`API de tarefas ouvindo em http://localhost:${porta}`);
});

// Encerramento gracioso: termina as requisições e fecha o banco.
function encerrar() {
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
