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
    // example row
    let exampleRow = dataLines[0].split(",");

    let nodes = {};
    let edgeInfo = {};
    let edges = {};
    let attrInfo = {max: {}, min: {}};
    let maxCount = 0;
    let curId = 0;

    // Parse the node attributes
    let nodeAttr = Object.keys(config.nodeAttr);

    // split nodeAttr to two arrays with ordinal and categorical attributes
    let nodeAttrCategorical = {};
    let nodeAttrCategoricalLocation = {};
    let nodeAttrCategoricalDifferentValues = {};
    let nodeAttrOrdinal = [];
    for(var Attr of nodeAttr) {
      if(isNumeric(exampleRow[config.nodeAttr[Attr][0]])) {
        nodeAttrOrdinal.push(Attr);
      } else {
        nodeAttrCategorical[Attr] = [];
        nodeAttrCategoricalLocation[Attr] = {};
        nodeAttrCategoricalDifferentValues[Attr] = 0;
      }
    }

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
        if(!nodes[fromId]) {
          nodes[fromId] = from;
          for(let Attr of Object.keys(nodeAttrCategorical)) {
            if(!nodeAttrCategoricalLocation[Attr][from[Attr]]) {
              nodeAttrCategorical[Attr].push({Attr: from[Attr], count: 1});
              nodeAttrCategoricalLocation[Attr][from[Attr]] = nodeAttrCategorical[Attr].length-1;
              nodeAttrCategoricalDifferentValues[Attr]++;
            } else {
              nodeAttrCategorical[Attr][nodeAttrCategoricalLocation[Attr][from[Attr]]].count++;
            }
          }
        }
        if(!nodes[toId]) {
          nodes[toId] = to;
          for(let Attr of Object.keys(nodeAttrCategorical)) {
            if(!nodeAttrCategoricalLocation[Attr][to[Attr]]) {
              nodeAttrCategorical[Attr].push({Attr: to[Attr], count: 1});
              nodeAttrCategoricalLocation[Attr][to[Attr]] = nodeAttrCategorical[Attr].length-1;
              nodeAttrCategoricalDifferentValues[Attr]++;
            } else {
              nodeAttrCategorical[Attr][nodeAttrCategoricalLocation[Attr][to[Attr]]].count++;
            }
          }
        }

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

        //check if this is the maxCount
        if(edges[date].count > maxCount) {
          maxCount = edges[date].count;
        }
 
    }
    // Average all edgeId attributes
    for(var edgeId of Object.keys(edgeInfo)) {
      for(var attrIndex of edgeAttrOrdinal) {
        let attr = columnList[attrIndex];
        edgeInfo[edgeId][attr] = edgeInfo[edgeId][attr]/edgeInfo[edgeId].count;
      }
    }

    // Create sortedArray of dates.
    let datesSorted = Object.keys(edges).sort((a,b) => a-b);

    // Create an incremental ordering for the nodes
    let orderings = { incremental: [...Object.keys(nodes)].sort((a,b) => a-b)};

    // sort attributes in nodeAttrCategorical
    for(Attr of Object.keys(nodeAttrCategorical)) {
      nodeAttrCategorical[Attr] = nodeAttrCategorical[Attr].sort((a,b) => b.count-a.count);
    }

    let nodeAttrUnique = [];
    // Find unique node attributes
    for(Attr of Object.keys(nodeAttrCategoricalDifferentValues)) {
      if(nodeAttrCategoricalDifferentValues[Attr] === Object.keys(nodes).length) {
        nodeAttrUnique.push(Attr);
      }
    }

    // Create attribute info object
    edgeAttrOrdinalNames = edgeAttrOrdinal.map((attr) => columnList[attr]);
    edgeAttrCategoricalNames = edgeAttrCategorical.map((attr) => columnList[attr]);
    attrInfo = { ...attrInfo, maxCount: maxCount, edgeAttrOrdinal : edgeAttrOrdinalNames, edgeAttrCategorical : edgeAttrCategoricalNames, nodeNameDisplay : "Name", nodeAttrCategorical : nodeAttrCategorical, nodeAttrOrdinal : nodeAttrOrdinal, nodeAttrUnique : nodeAttrUnique, nodeAttr : nodeAttr};


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



module.exports = {
    router,
    initApp
};