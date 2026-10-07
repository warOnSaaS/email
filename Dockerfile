FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3990 FILES_DIR=/data/files SQLITE_FILE=/data/email.sqlite
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 3990
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3990/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "standalone.mjs"]
