const express = require('express');

const router = express.Router();

// Read
router.get('/', (req, res) => {
  res.sendStatus(200);
});

// Update
router.put('/', (req, res) => {
  res.sendStatus(200);
});

// Delete
router.delete('/', (req, res) => {
  res.sendStatus(200);
});

// Create
router.post('/', (req, res) => {
  res.sendStatus(200);
});

module.exports = router;
