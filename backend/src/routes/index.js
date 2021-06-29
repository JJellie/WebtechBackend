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
    let edgeInfo = {};
    let edges = {};
    let attrInfo = {max: {}, min: {}};
    let curId = 0;

    // Parse the node attributes
    let nodeAttr = Object.keys(config.nodeAttr);

    let fromAttr = nodeAttr.map((attr) => config.nodeAttr[attr][0]);
    let toAttr = nodeAttr.map((attr) => config.nodeAttr[attr][1]);

    // Parse the edge attributes
    let edgeAttr = config.edgeAttr.map((attr) => columnList[attr]);

    // returns true if str represents numeric value
    function isNumeric(str) {  
        return  !isNaN(str) && // use type coercion to parse the _entirety_ of the string 
                !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
    }

    // split edgeAttr to two arrays with ordinal and categorical attributes
    let edgeAttrCategorical = [];
    let edgeAttrOrdinal = [];
    let exampleRow = dataLines[0].split(",");
    for(var Attr of config.edgeAttr) {
      if(isNumeric(exampleRow[Attr])) {
        edgeAttrOrdinal.push(Attr);
      } else {
        edgeAttrCategorical.push(Attr);
      }
    }

    // create placeholder values for max and min for ordinal edge attributes
    for(var attrIndex of edgeAttrOrdinal) {
        attrInfo.max[columnList[attrIndex]] = 0;
        attrInfo.min[columnList[attrIndex]] = 0;
    }


    // Loop over every entry
    for(var entryLine of dataLines) {
        let entry = entryLine.split(",");
        
        // Construct an node object
        let from = addAttr(fromAttr, nodeAttr, entry);
        let to = addAttr(toAttr, nodeAttr, entry);

        let fromId, toId;
        if(config.fromId && config.toId) {
            // Id's are defined explicitely
            fromId = entry[config.fromId];
            toId = entry[config.toId];
        } else {
            // Need to define id's for unique nodes ourself
            fromId = checkForDuplicate(from, nodes);
            toId = checkForDuplicate(to, nodes);
            if(!fromId) fromId = ++curId;

            // Make sure the "to" isn't the same node as the "from"
            let fromArr = Object.values(from);
            let toArr = Object.values(to);
            if(!toId && (fromArr.every( (val, i) => val === toArr[i] ))) toId = fromId;
            else if (!toId) toId = ++curId;
        }

        // date is defined explicitely
        let date = Date.parse(entry[config.date]);

        // TODO: it's now hardcoded but implement something to detect if there are names.
        //from["Name"] = getNameFromEmail(entry[fromAttr[0]]);
        //to["Name"] = getNameFromEmail(entry[toAttr[0]]);

        // If the from/to node does not exist, add it
        if(!nodes[fromId]) nodes[fromId] = from;
        if(!nodes[toId]) nodes[toId] = to;

        // Look if the edgeId has appeared before
        // If not, create an empty placeholder for the edge
        let edgeId = `${fromId}-${toId}`;
        if(!edgeInfo[edgeId]) {
            edgeInfo[edgeId] = { count: 0, edges: {}, fromId, toId };
            for(var idx in edgeAttrOrdinal) {
                let attrIndex = edgeAttrOrdinal[idx];
                let attr = columnList[attrIndex];
                edgeInfo[edgeId][attr] = 0;
            }
        }

        // Add the values of attributes to the existing value so after the loop it becomes the total sum of values
        edgeInfo[edgeId].count++;
        for(var idx in edgeAttrOrdinal) {
            let attrIndex = edgeAttrOrdinal[idx];
            let attr = columnList[attrIndex];
            let value = parseFloat(entry[attrIndex]);
            edgeInfo[edgeId][attr] = edgeInfo[edgeId][attr] + value;
            // Update min/max in attrInfo
            if(value > attrInfo.max[attr]) attrInfo.max[attr] = value;
            else if(value < attrInfo.min[attr]) attrInfo.min[attr] = value;
        }

        // Add edge placeholder to edgeInfo if it doesn't exist yet
        if(!edgeInfo[edgeId]["edges"][date]) {
          edgeInfo[edgeId]["edges"][date] = [];
        }
        
        // construct an edge object
        let edge = addAttr(config.edgeAttr, edgeAttr, entry);

        // Add edge with attributes
        edgeInfo[edgeId]["edges"][date].push(edge);

        // Add date placeholder to edges if it doesn't exist yet
        if(!edges[date]) {
          edges[date] = { count : 0, edges : {} }
        }

        // Add edge placeholder to edges if it doesn't exist yet
        if(!edges[date]["edges"][edgeId]) {
          edges[date]["edges"][edgeId] = [];
        }

        // Add edge to edges and increase count in edges
        edges[date]["edges"][edgeId].push(edge);
        edges[date].count++

    }
    // Average all edgeId attributes
    for(var edgeId of Object.keys(edgeInfo)) {
      for(var attrIndex of edgeAttrOrdinal) {
        let attr = columnList[attrIndex];
        edgeInfo[edgeId][attr] = edgeInfo[edgeId][attr]/edgeInfo[edgeId].count;
      }
    }

    // Create sortedArray of dates.
    let datesSorted = Object.keys(edges).sort((a,b) => b-a);

    // Create an incremental ordering for the nodes
    let orderings = { incremental: [] };
    for(var i = 1; i <= Object.keys(nodes).length; i++) {
        orderings.incremental.push(i);
    }

    // Create attribute info object
    edgeAttrOrdinalNames = edgeAttrOrdinal.map((attr) => columnList[attr]);
    edgeAttrCategoricalNames = edgeAttrCategorical.map((attr) => columnList[attr]);
    attrInfo = { ...attrInfo, nodeAttr : nodeAttr, edgeAttrOrdinal : edgeAttrOrdinalNames, edgeAttrCategorical : edgeAttrCategoricalNames, nodeNameDisplay : "Name", nodeColorAttr: "Jobtitle", nodeColorAttrMapping: {'CEO':0,'President':1,'Vice President':2,'Director':3,'Managing Director':4,'Manager':5,'Trader':6,'Employee':6,'In House Lawyer':6,'Unknown':6}};


    //console.log("orderings", orderings);
    // Return a 200 OK code and send the dataset to the client
    res.status(200).json({ nodes, edgeInfo, edges, datesSorted, orderings, attrInfo }).end();
});

// Check for duplicate node
function checkForDuplicate(nodeAttr, nodes) {
    for(var id in nodes) {
        let node = nodes[id];

        let dupe = true;
        for(var key in nodeAttr) {
            let value = nodeAttr[key];
            let compValue = node[key];
            if(value !== compValue) dupe = false;
        }
        if(dupe) return id;
    }
    return false;
};

// Add attributes to a node
function addAttr(attrList, attrNames , entry) {
    let list = {};
    for(var attrIndex in attrList) {
        let idx = attrList[attrIndex];

        let attr = attrNames[attrIndex];
        let value = entry[idx];
        list[attr] = value;
    }
    return list;
}


function titleCase(str) {
  return str[0].toUpperCase() + str.substring(1);
}

// converting emails to names
function getNameFromEmail(email) {
  let nameParts = email.split("@")[0].split(".");
  let firstName = titleCase(nameParts[0]);
  let lastName = titleCase(nameParts[nameParts.length-1]) || "";
  return firstName + " " + lastName;
}



/*

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
    let curId = 1;

    // Loop over every entry
    for(var entryLine of dataLines) {
        let entry = entryLine.split(",");

        // Node attributes
        let fromAttr = config.fromAttr;
        let toAttr = config.toAttr;

        let fromAttrList = addAttr(fromAttr, columnList, entry);
        let toAttrList = addAttr(toAttr, columnList, entry);

        let fromId, toId;
        if(config.fromId && config.toId) {
            // Id's are defined explicitely
            fromId = entry[config.fromId];
            toId = entry[config.toId];
        } else {
            // Need to define id's for unique nodes ourself
            fromId = checkForDuplicate(fromAttrList, nodes);
            toId = checkForDuplicate(toAttrList, nodes);
            if(!fromId) fromId = curId++;

            // Make sure the "to" isn't the same node as the "from"
            let fromArr = Object.values(fromAttrList);
            let toArr = Object.values(toAttrList);
            if(!toId && (fromArr.every( (val, i) => val === toArr[i] ))) toId = fromId;
            else if (!toId) toId = curId++;
        }

        // Parse the node attributes and construct an object
        let from = { id: fromId, ...fromAttrList };
        let to = { id: toId, ...toAttrList };

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

function checkForDuplicate(nodeAttr, nodes) {
    for(var id in nodes) {
        let node = nodes[id];

        let dupe = true;
        for(var key in nodeAttr) {
            let value = nodeAttr[key];
            let compValue = node[key];
            if(value !== compValue) dupe = false;
        }
        if(dupe) return id;
    }
    return false;
};

*/




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