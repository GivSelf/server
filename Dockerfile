FROM node:20-alpine AS build

WORKDIR /app

# Install contracts from tarball
COPY givself-contracts-0.2.0.tgz ./
COPY package.json package-lock.json ./

# Replace local file dependency with tarball
RUN sed -i 's|"file:../givself-contracts/gen/ts"|"file:./givself-contracts-0.2.0.tgz"|' package.json
RUN npm install

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Copy built output and dependencies
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

EXPOSE 3002

CMD ["node", "dist/index.js"]
