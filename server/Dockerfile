FROM node:24-alpine
WORKDIR /app
COPY sync-server.mjs .
ENV PORT=8787 HOST=0.0.0.0 DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8787
USER node
CMD ["node", "sync-server.mjs"]
