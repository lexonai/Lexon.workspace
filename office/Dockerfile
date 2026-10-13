# One container = web app + API + mobile admin + SQLite.   docker build -t lexon-office .  (run `npm run build:web` first)
FROM node:20-slim
WORKDIR /app
RUN npm i better-sqlite3@13 --no-audit --no-fund
COPY server ./server
COPY shared ./shared
COPY web ./web
ENV PORT=8787
VOLUME /app/data
EXPOSE 8787
CMD ["node","server/index.mjs"]
