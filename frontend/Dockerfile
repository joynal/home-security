FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Dev server binding all interfaces so the published port works.
# For a production build, swap to: npm run build && npx vite preview --host
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
