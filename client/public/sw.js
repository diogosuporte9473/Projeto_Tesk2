/*
 * Service worker do DStasks.
 *
 * Existe para o app poder ser instalado (tela inicial do celular / janela própria
 * no computador). De propósito, NÃO guarda páginas nem dados em cache: o app
 * sempre carrega a versão publicada mais recente e nunca mostra dados antigos
 * de outra sessão.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Sem respondWith: todas as requisições seguem direto para a rede.
self.addEventListener("fetch", () => {});
