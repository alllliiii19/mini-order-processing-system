
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies.
COPY package*.json ./

RUN npm ci --omit=dev

# Copy application source code.
COPY --chown=node:node src ./src

# Run as a non-root user.
USER node

EXPOSE 3000

CMD ["npm", "start"]
