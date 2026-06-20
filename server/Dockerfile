# Cloud Voice relay server — container image for GCP Cloud Run.
FROM node:20-slim AS build
WORKDIR /app

# Install deps using only the server manifest (the server is self-contained).
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=build /app/dist ./dist
COPY public ./public

# Cloud Run injects PORT (defaults to 8080); the server reads it.
EXPOSE 8080
CMD ["node", "dist/index.js"]
