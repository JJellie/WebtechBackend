var express = require('express');
var router = express.Router();
var Papa = require('papaparse')

const fs = require("fs");
let app;

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



// New backend

router.get("/download/columns", async (req, res) => {

    let reqFile = req.query.file;
    let filePath = "./src/TestFiles/" + reqFile;

    // Try to read the file data
    let fileData;
    try {
        fileData = fs.readFileSync(filePath).toString();
    } catch(e) {
        res.status(404).json({ error: "Requested file was not found on the server." });
        return res.end();
    }

    // Check if there are columns present
    let dataLines = fileData.split("\r\n");
    let columns = dataLines[0].split(",");
    if(columns.length < 2) {
        res.status(400).json({ error: "No columns were specified in the csv-file." });
        return res.end()
    }
    if(!dataLines[1]) {
        res.status(400).json({ error: "There is no data to display in the csv-file." });
        return res.end()
    }

    // Send an array containing the column names and an example line from the dataset
    res.status(200).json([columns, dataLines[1].split(",") ]);
    return res.end();
});




let columnConfig = {};





// POST requests only work to the parent app, so we call and pass the app from the parent module
let initApp = (parentApp) => {
    app = parentApp;

    // Set the column configuration
    app.post("/upload/columns", (req, res) => {

        let reqFile = req.query.file;
        columnConfig[reqFile] = req.body;
    
        return res.status(200).end();
    });
};


// Download request for the dataset
router.get("/download/dataset", (req, res) => {

    let reqFile = req.query.file;
    let filePath = "./src/TestFiles/" + reqFile;

    // See if the columns has been uploaded yet
    if(!columnConfig[reqFile]) {
        res.status(400).json({ error: "This dataset does not have a column configuration set." });
        return res.end();
    }

    // Try to read the file data
    let fileData;
    try {
        fileData = fs.readFileSync(filePath).toString();
    } catch(e) {
        res.status(404).json({ error: "Requested file was not found on the server." });
        return res.end();
    }


    // Parse the dataset
    let config = columnConfig[reqFile];

    // Split the dataset into per-entry lines (and keep the first line as the columns list)
    let dataLines = fileData.split("\r\n");
    let columnList = dataLines.shift().split(",");
    if(dataLines[dataLines.length-1] === "") dataLines.pop();

    let nodes = {};
    let edges = {};

    // Loop over every entry
    for(var entryLine of dataLines) {
        let entry = entryLine.split(",");

        // Id's are defined explicitely
        let fromId = entry[config.fromId];
        let toId = entry[config.toId];

        // Parse the node attributes and construct an object
        let fromAttr = config.fromAttr;
        let from = { id: fromId, ...addAttr(fromAttr, columnList, entry) };
        
        let toAttr = config.toAttr;
        let to = { id: toId, ...addAttr(toAttr, columnList, entry) };

        // If the from/to node does not exist, add it
        if(!nodes[from.id]) nodes[from.id] = from;
        if(!nodes[to.id]) nodes[to.id] = to;

        // Look if the edge has appeared before
        // If not, create an empty placeholder for the edge
        let edgeId = `${fromId}-${toId}`;
        if(!edges[edgeId]) {
            edges[edgeId] = { count: 0 };
            for(var idx in config.edgeAttr) {
                let attrIndex = config.edgeAttr[idx];
                let attr = columnList[attrIndex];
                edges[edgeId][attr] = [];
            }
        }

        // Add the attributes to the edge object
        edges[edgeId].count++;
        for(var idx in config.edgeAttr) {
            let attrIndex = config.edgeAttr[idx];
            let attr = columnList[attrIndex];
            let value = entry[attrIndex];
            edges[edgeId][attr].push(value);
        }

    }

    // Create an incremental ordering for the nodes
    let orderings = { incremental: [null] };
    for(var i = 1; i < Object.keys(nodes).length; i++) {
        orderings.incremental.push(i);
    }

    // Return a 200 OK code and send the dataset to the client
    res.status(200).json({ nodes, edges, orderings }).end();
});

// Add attributes to a node
function addAttr(attrList, columnList, entry) {
    let list = {};
    for(var attrIndex in attrList) {
        let idx = attrList[attrIndex];

        let attr = columnList[idx];
        let value = entry[idx];
        list[attr] = value;
    }
    return list;
}



// {fromId : columnIndex, toId : columnIndex, fromAttr: [columnIndex, columnIndex, ...], toAttr: [columnIndex, columnIndex, ...], edgeAttr : [columnIndex, columnIndex, ...]}
// For the standard dataset
// {fromId: 1, fromAttr: [2, 3], toId: 4, toAttr: [5, 6], edgeAttr: [0, 8]}

/*
Steps for the current backend:

- Upload the dataset
Dataset is already in TestFiles

- Download the columns from the .csv from backend
(async () => {
    console.log(await fetch("http://localhost:3001/download/columns?file=enron-v1.csv", { method: "GET" }));
})()

- Upload the column configuration to the backend
var indexes = {fromId: 1, fromAttr: [2, 3], toId: 4, toAttr: [5, 6], edgeAttr: [0, 8]};
(async () => {
    console.log(await fetch("http://localhost:3001/upload/columns?file=enron-v1.csv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(indexes) }));
})()

- Get the new dataset
(async () => {
    console.log(await fetch("http://localhost:3001/download/dataset?file=enron-v1.csv", { method: "GET" }));
})()

*/



// Old backend

router.get('/test/download/csv.json', async function(req, res, next) {

    let reqFilename = req.query.file;
    const csvFilePath = './src/TestFiles/' + reqFilename;

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
            idAndMail = {"fromId" : parsedData[i].fromId,"fromEmail":parsedData[i].fromEmail, "toId":parsedData[i].toId, "toEmail":parsedData[i].toEmail, 'fromJob':parsedData[i].fromJobtitle, 'toJob': parsedData[i].toJobtitle}
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

    test();
    

});

function titleCase(str) {
    return str[0].toUpperCase() + str.substring(1);
}

function getNameFromEmail(email) {
    let nameParts = email.split("@")[0].split(".");
    let firstName = titleCase(nameParts[0]);
    let lastName = titleCase(nameParts[nameParts.length-1]) || "";
    return { firstName, lastName };
}

const ranks = {
    "Unknown": 0,
    "Employee": 1,
    "Trader": 1,
    "Manager": 2,
    "Managing Director": 2,
    "In House Lawyer": 3,
    "Director": 3,
    "Vice President": 3,
    "President": 4,
    "CEO": 5
};

function getDirection(from, to) {
    let fromRank = ranks[from.jobTitle];
    let toRank = ranks[to.jobTitle];
    if(!fromRank || !toRank || fromRank === toRank) return 0;
    else return fromRank > toRank ? -1 : 1;
}

router.get(`/test/download/am.json`, async (req, res) => {
    
    let reqFilename = req.query.file;
    const csvFilePath = './src/TestFiles/' + reqFilename;

    let rawData = (await fs.readFileSync(csvFilePath)).toString();

    let dataLines = rawData.replace(/\r/g, "").split("\n");
    dataLines.shift();
    dataLines.pop();

    let people = [];
    let edges = {};
    for(var mail of dataLines) {
        mail = mail.split(",");

        let from = { id: mail[1], email: mail[2], jobTitle: mail[3], ...getNameFromEmail(mail[2]) };
        let to = { id: mail[4], email: mail[5], jobTitle: mail[6], ...getNameFromEmail(mail[5]) };

        if(!people[from.id]) people[from.id] = from;
        if(!people[to.id]) people[to.id] = to;

        let edgeId = `${from.id}-${to.id}`;
        if(!edges[edgeId]) edges[edgeId] = { numMails: 0, sentiments: [], direction: getDirection(from, to) };
        
        edges[edgeId].numMails++;
        edges[edgeId].sentiments.push(parseFloat(mail[8]));
        
    }

    for(let e in edges) {
        let edge = edges[e];
        let avg = edge.sentiments.reduce((a, b) => a + b, 0) / edge.sentiments.length;
        edge.sentiments = undefined;
        edge.avgSentiment = avg;
    }

    let min = 10000;
    let max = -10000;
    let maxMails = 0;
    for(var e in edges) {
        let edge = edges[e];
        let avg = edge.avgSentiment;
        if(avg < min) min = avg;
        if(avg > max) max = avg;
        if(edge.numMails > maxMails) maxMails = edge.numMails;
    }

    let nodeOrdering = [];
    for(var i = 1; i < people.length; i++) {
      nodeOrdering.push(i);
    }

    res.json({ nodeHash: people, nodeOrdering, edges, maxSentiment: max, minSentiment: min, maxMails });
    res.status(200);
    return res.end();
});








module.exports = {
    router,
    initApp
};