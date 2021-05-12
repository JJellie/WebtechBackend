var express = require('express');
var router = express.Router();

const fs = require("fs");

router.get('/', function(req, res, next) {
  return res.status(200).json({ message: 'Welcome to Express API template' });
});
router.get('/test', async function(req, res, next) {
    let file = await fs.readFileSync("./src/TestFiles/gek.txt");
    return res.status(200).json({ message : file.toString() });
});

router.get('/test/download', async function(req, res, next) {
  let file = await fs.readFileSync("./src/TestFiles/gek.txt");
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", "attachment;filename=gek.txt");
  res.status(200).write(file.toString());
  return res.end();
});

module.exports = router;