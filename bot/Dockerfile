# Cloud Run 用イメージ
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
# 用語集・組織図はランタイムで読む（systemPrompt.ts が参照）
COPY context ./context
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/src/index.js"]
