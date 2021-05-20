var express = require('express');
var router = express.Router();
var Papa = require('papaparse')

const fs = require("fs");

router.get('/', function(req, res, next) {
  return res.status(200).json({ message: 'Welcome to Express API template' });
});
router.get('/test', async function(req, res, next) {
    let file = await fs.readFileSync("./src/TestFiles/gek.txt");
    return res.status(200).json({ message : file.toString() });
});

router.get('/test/download', async function(req, res, next) {
  let file = await fs.readFileSync("./src/TestFiles/gek.json");
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", "attachment;filename=gek.json");
  res.status(200).write(file.toString());
  return res.end();
});
router.get('/test/download/csv.json', async function(req, res, next) {
        const csvFilePath = './src/TestFiles/enron-v1.csv'

    // Function to read csv which returns a promise so you can do async / await.

    const readCSV = async (filePath) => {
    const csvFile = fs.readFileSync(filePath)
    const csvData = csvFile.toString()  
    return new Promise(resolve => {
        Papa.parse(csvData, {
        header: true,
        complete: results => {
            console.log('Complete', results.data.length, 'records.'); 
            resolve(results.data);
        }
        });
    });
    };
    const test = async () => {
    let parsedData = await readCSV(csvFilePath);
    let returnData = [];
    for(let i = 0; i < parsedData.length; i++) {
        idAndMail = {"fromId" : parsedData[i].fromId,"fromEmail":parsedData[i].fromEmail, "toId":parsedData[i].toId, "toEmail":parsedData[i].toEmail}
        row = [idAndMail, 1]
    let control = false;
    for(let j = 0; j < returnData.length; j++) {
        if(returnData[j][0].fromId === idAndMail.fromId & returnData[j][0].toId === idAndMail.toId) {
            let num = returnData[j][1]
            returnData[j][1] = num+1
            control = true
            break;
        } 
    }
    if(!control) {
        returnData.push(row)
    }
    }
    console.log(returnData.length)
    res.json(returnData);
    return res.end();
    }
    test()
    

  });

module.exports = router;