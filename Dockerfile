FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++ libc6-compat

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# JWT_SECRET нужен только чтобы модуль auth-edge.ts не падал при сборе данных
# страниц во время build — реальный секрет приходит в рантайме через env_file
ENV JWT_SECRET=build-time-placeholder-not-used-at-runtime
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/certs ./certs
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/instrumentation.ts ./
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/tsconfig.json ./

EXPOSE 3000
CMD ["npm", "run", "start"]
