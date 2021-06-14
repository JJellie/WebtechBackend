var logger = require('morgan');
var express = require('express');
var cookieParser = require('cookie-parser');
var cors = require('cors')
var indexRouter = require('./routes/index');
var app = express();
var fileUpload = require("express-fileupload");
var bodyParser = require("body-parser");

app.use(cors())
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/', indexRouter.router);
app.use('/download', express.static('./src/TestFiles'))
app.use(fileUpload());
app.use(bodyParser.json());

app.post("/upload", (req, res) => {

    console.log("received POST");
    console.log(req.files);

    req.files.file.mv("./src/TestFiles/" + req.files.file.name);

    res.status(200);
    return res.end();
});

app.post("/upload/dataset", (req, res) => {

    // Check for file attachment
    if(!req.files?.file) {
        res.status(400);
        res.json({ error: "No file was attached." });
        return res.end();
    }

    // Check for correct file type
    if(!req.files.file.name.endsWith(".csv")) {
        res.status(415);
        res.json({ error: "Invalid file type (only csv-files are supported)." });
        return res.end();
    }

    // All checks are passed, so download the file and save it server-side
    req.files.file.mv("./src/TestFiles/" + req.files.file.name);
    res.status(200);
    return res.end();
});

// Pass down the app object to the router child
indexRouter.initApp(app);

module.exports = app;