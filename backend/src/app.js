var logger = require('morgan');
var express = require('express');
var cookieParser = require('cookie-parser');
var cors = require('cors')
var indexRouter = require('./routes/index');
var app = express();

app.use(cors())
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/', indexRouter);
app.use('/download', express.static('./src/TestFiles'))

module.exports = app;