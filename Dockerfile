# ponytail: 24 jam online — image minimal untuk Render/Railway/Fly (laptop mati tetap jalan)
FROM node:20-slim
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev
COPY . .
# uploads & data ephemeral di free tier — pakai Disk/Volume jika perlu persist
RUN mkdir -p backend/uploads/avatars backend/uploads/news backend/uploads/community library
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "backend/server.js"]
