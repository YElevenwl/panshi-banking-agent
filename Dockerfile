FROM node:24-alpine
WORKDIR /app

# 零运行时依赖：无需 npm install
COPY . .

ENV PORT=8787 \
    PANSHI_DB=/app/data/panshi.db \
    PANSHI_DEMO_NOW=2026-10-31T09:00:00+08:00

EXPOSE 8787
CMD ["node", "--no-warnings", "src/server.js"]
