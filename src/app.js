const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { swaggerUi, swaggerSpec } = require('./config/swagger');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function swaggerBasicAuth(req, res, next) {
  const user = process.env.SWAGGER_USER;
  const pass = process.env.SWAGGER_PASSWORD;
  // Se não configurado, bloqueia em produção e libera em dev
  if (!user || !pass) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Swagger desabilitado em produção.' });
    }
    return next();
  }
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="GuardaApp Docs"');
    return res.status(401).send('Autenticação necessária.');
  }
  const [authUser, authPass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
  if (authUser !== user || authPass !== pass) {
    res.set('WWW-Authenticate', 'Basic realm="GuardaApp Docs"');
    return res.status(401).send('Credenciais inválidas.');
  }
  next();
}

app.get('/docs/swagger.json', swaggerBasicAuth, (req, res) => res.json(swaggerSpec));
app.use('/docs', swaggerBasicAuth, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/v1/auth',          require('./routes/auth'));
app.use('/api/v1/users',         require('./routes/users'));
app.use('/api/v1/sessions',      require('./routes/sessions'));
app.use('/api/v1/children',      require('./routes/children'));
app.use('/api/v1/coparent',      require('./routes/coparent'));
app.use('/api/v1/events',        require('./routes/events'));
app.use('/api/v1/messages',      require('./routes/messages'));
app.use('/api/v1/expenses',      require('./routes/expenses'));
app.use('/api/v1/documents',     require('./routes/documents'));
app.use('/api/v1/health',        require('./routes/health'));
app.use('/api/v1/vaccines',      require('./routes/vaccines'));
app.use('/api/v1/milestones',    require('./routes/milestones'));
app.use('/api/v1/audit',         require('./routes/audit'));
app.use('/api/v1/notifications', require('./routes/notifications'));
app.use('/api/v1/lgpd',          require('./routes/lgpd'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

module.exports = app;
