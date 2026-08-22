# Serviço mínimo: recebe POST /run (autenticado e limitado pelo nginx na frente) e dispara
# `docker compose run --rm spider` no host via /var/run/docker.sock montado (docker-compose.yml).
FROM node:24.9.0-alpine

RUN apk add --no-cache docker-cli docker-cli-compose

WORKDIR /app
COPY index.mjs ./

# Roda como root deliberadamente: o acesso a /var/run/docker.sock já equivale a root no host
# (dá pra subir um container privilegiado e escapar), então rodar o processo Node como um uid
# não-root aqui não reduz o raio de explosão real — só criaria a aparência de menor privilégio.
EXPOSE 3100
CMD ["node", "index.mjs"]
