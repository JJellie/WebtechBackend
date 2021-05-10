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
module.exports = router;