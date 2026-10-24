FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
    && mkdir -p /usr/share/postgresql-common/pgdg \
    && curl --fail --silent --show-error --proto '=https' --tlsv1.2 https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && test "$(gpg --batch --show-keys --with-colons /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc 2>/dev/null | awk -F: '$1=="fpr" {print $10;exit}')" = B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8 \
    && printf '%s\n' 'Types: deb' 'URIs: https://apt.postgresql.org/pub/repos/apt' 'Suites: bookworm-pgdg' 'Components: main' 'Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc' > /etc/apt/sources.list.d/pgdg.sources \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16 postgresql-client-17 postgresql-client-18 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY dist ./dist
COPY scripts ./scripts
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
