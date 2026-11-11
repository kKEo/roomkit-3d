# The sync server for shared events (server/index.js). Build from the repository root:
#   docker build -f server/Dockerfile -t scene-rooms-sync .
#   docker run -p 8787:8787 -e ORIGINS=https://example.github.io scene-rooms-sync
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
# only the server's runtime dependencies, at the versions the repository pins: ws and zod (the rest is the viewer's)
RUN node -e "const p=require('./package.json');require('fs').writeFileSync('package.json',JSON.stringify({name:'scene-rooms-sync',private:true,type:'module',dependencies:{ws:p.dependencies.ws,zod:p.dependencies.zod}}))" \
 && npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY server ./server
COPY src/net/protocol.js ./src/net/protocol.js
COPY src/lib/easing.js ./src/lib/easing.js
# a volume mounted on /state takes this ownership, so the unprivileged server can write its snapshots
RUN mkdir /state && chown node:node /state
EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "server/index.js"]
