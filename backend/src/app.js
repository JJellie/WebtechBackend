var logger = require('morgan');
var express = require('express');
var cookieParser = require('cookie-parser');
var cors = require('cors')
var indexRouter = require('./routes/index');
var app = express();
var fileUpload = require("express-fileupload");

app.use(cors())
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/', indexRouter);
app.use('/download', express.static('./src/TestFiles'))
app.use(fileUpload());

app.post("/upload", (req, res) => {

    console.log("received POST");
    console.log(req.files);

    req.files.file.mv("./src/TestFiles/" + req.files.file.name);

    res.status(200);
    return res.end();
});

module.exports = app;