import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import expressLayouts from 'express-ejs-layouts';
import { pinoHttp } from 'pino-http';
import { env, isProd, isTest } from './config/env.js';
import { logger } from './lib/logger.js';
import { csrfProtection } from './middleware/csrf.js';
import { locals } from './middleware/locals.js';
import { globalLimiter } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import webRoutes from './routes/web.js';
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MySQLStore = MySQLStoreFactory(session as never);

export function createApp(opts: { sessionStore?: session.Store } = {}) {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('layout', 'layouts/main');
  app.disable('x-powered-by');

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        autoLogging: { ignore: (req) => /^\/(assets|uploads|favicon)/.test(req.url ?? '') },
      }),
    );
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'https://*.googleusercontent.com', 'https://i.ytimg.com'],
          'frame-src': ['https://www.google.com', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com'],
          'form-action': ["'self'", new URL(env.ESEWA_FORM_URL).origin, 'https://*.khalti.com'],
          'upgrade-insecure-requests': isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: isProd ? { maxAge: 15_552_000, includeSubDomains: true } : false,
    }),
  );

  app.use(compression());
  app.use(
    '/assets',
    express.static(path.join(__dirname, '../public/assets'), { maxAge: isProd ? '30d' : 0, immutable: isProd }),
  );
  app.use('/uploads', express.static(path.join(__dirname, '../public/uploads'), { maxAge: '7d', dotfiles: 'deny', index: false }));
  app.use(express.static(path.join(__dirname, '../public'), { index: false, maxAge: '1d' }));

  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser(env.SESSION_SECRET));

  app.use(
    session({
      name: 'ek.sid',
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store:
        opts.sessionStore ??
        new MySQLStore({
          host: env.DB_HOST,
          port: env.DB_PORT,
          user: env.DB_USER,
          password: env.DB_PASSWORD,
          database: env.DB_NAME,
          createDatabaseTable: true,
          clearExpired: true,
          checkExpirationInterval: 15 * 60 * 1000,
        }),
      cookie: {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 14,
      },
    }),
  );

  app.use(globalLimiter);
  app.use(expressLayouts);
  app.use(locals);

  // eSewa/Khalti callbacks are GET redirects, so CSRF only applies to state changing methods.
  app.use('/api/v1', csrfProtection, apiRoutes);
  app.use('/admin', csrfProtection, adminRoutes);
  app.use('/', csrfProtection, webRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
