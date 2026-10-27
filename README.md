# Bistrô de Sabores — Frontend

Interface web do sistema de controle financeiro, desenvolvida com React, Vite e Bootstrap.

## Publicar no Render

1. Publique primeiro a API pelo [repositório backend](https://github.com/Olywwer/bistro-controle-financeiro-backend) e copie a URL HTTPS criada pelo Render.
2. No Render, crie um Blueprint usando este repositório e `render.yaml`.
3. Configure `VITE_API_BASE_URL` com a URL HTTPS da API, sem barra final, por exemplo `https://bistro-financeiro-api.onrender.com`.
4. Após o deploy, abra a URL do site fornecida pelo Render. Se a URL do site for diferente da origem informada no backend, atualize `FRONTEND_ORIGIN` no serviço da API para a origem exata, sem barra final.

`VITE_API_BASE_URL` é uma URL pública, não uma senha. Nunca configure credenciais do PostgreSQL no frontend.

## Executar localmente

1. Instale o Node.js.
2. Na pasta deste repositório, execute `npm ci`.
3. Inicie o frontend com `npm run dev` e abra o endereço indicado pelo Vite.

O frontend encaminha as chamadas `/api` para `http://127.0.0.1:3001`. Inicie também a API do [repositório backend](https://github.com/Olywwer/bistro-controle-financeiro-backend) antes de entrar ou consultar os dados.

Use `npm run build` para gerar a versão de produção em `dist/`.
