const router = require('express').Router();
const path = require('path');

const checksRouter = require('./v1/checks');
const messageRouter = require('./v1/message');
const mergeRouter = require('./v1/merge');

// Base v1 Responder
router.get('/', (_req, res) => {
  res.status(200).json({
    endpoints: [
      '/checks'
    ]
  });
});

// OpenAPI Docs
router.get('/docs', (_req, res) => {
  const docs = require('../docs/docs');
  res.send(docs.getDocHTML('v1'));
});

// OpenAPI YAML Spec
router.get('/api-spec.yaml', (_req, res) => {
  res.sendFile(path.join(__dirname, '../docs/v1.api-spec.yaml'));
});

// Checks
router.use('/checks', checksRouter);

// Message
router.use('/message', messageRouter);

// Merge
router.use('/merge', mergeRouter);

module.exports = router;
