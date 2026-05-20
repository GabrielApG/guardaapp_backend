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

app.get('/docs/swagger.json', (req, res) => res.json(swaggerSpec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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
