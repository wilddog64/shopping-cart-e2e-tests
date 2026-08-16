# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/playwright:v1.57.0-jammy
WORKDIR /e2e
COPY package.json package-lock.json ./
# Base image already ships the matching Playwright browsers; skip re-download.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci
COPY . .
# Tests are invoked by the k8s Job command; default to the api+flows projects.
ENV CI=true
ENTRYPOINT ["npx", "playwright", "test"]
CMD ["--project=api", "--project=flows"]
