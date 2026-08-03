# Playwright base image — Chromium + all system deps preinstalled.
# The tag MUST match the `playwright` version in server/package.json (1.62.1),
# or the bundled browser won't match the npm package and launch will fail.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first (better layer caching). Copy only manifests.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci

# Copy the rest of the source and build web -> server/public, then server tsc.
COPY . .
RUN npm run build

# tsc doesn't copy non-TS assets; make the recorded-run fixture available to
# the built server so the demo works without the API.
RUN cp -r server/src/fixtures server/dist/fixtures 2>/dev/null || true

# Drop dev dependencies to slim the runtime image.
RUN npm prune --omit=dev

# Render injects PORT; our server reads it (defaults to 8787 locally).
EXPOSE 8787
CMD ["npm", "start"]
