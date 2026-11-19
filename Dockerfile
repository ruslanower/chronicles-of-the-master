FROM node:20-alpine
WORKDIR /app
COPY .output .output
COPY .env* ./
ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["node", "--env-file-if-exists=.env", "--env-file-if-exists=.env.local", ".output/server/index.mjs"]

