FROM node:20-alpine
WORKDIR /app
COPY .output .output
COPY .env .env
ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
