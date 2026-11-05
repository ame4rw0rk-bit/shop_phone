# TechGadget — صورة الإنتاج (واجهة + API في عملية واحدة)
FROM node:24-alpine AS deps
WORKDIR /app
# bcrypt يترجم من C إن لم يتوفر prebuild لنسخة Node/musl المطابقة
RUN apk add --no-cache python3 make g++
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# bcrypt/node-gyp يحتاج أدوات بناء فقط إن لم يتوفر حزمة مُجهّزة
RUN apk add --no-cache tini

COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend ./backend
COPY frontend ./frontend

# تشغيل بمستخدم غير جذر
RUN addgroup -S -g 10001 app && adduser -S -u 10000 -G app app \
    && chown -R 10000:10001 /app
USER 10000

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:5000/api/health || exit 1

# tini يعيد توجيه إشارات الإيقاف فيُغلق السيرفر بلطف
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "backend/app.js"]
