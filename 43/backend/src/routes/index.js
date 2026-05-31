const express = require('express');
const authRoutes = require('./auth');
const { applicationsRouter, approvalsRouter } = require('./application');
const chemicalRoutes = require('./chemical');
const userRoutes = require('./user');
const ledgerRoutes = require('./ledger');
const inventoryRoutes = require('./inventory');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/applications', applicationsRouter);
router.use('/approvals', approvalsRouter);
router.use('/chemicals', chemicalRoutes);
router.use('/', userRoutes);
router.use('/ledger', ledgerRoutes);
router.use('/inventory', inventoryRoutes);

module.exports = router;
