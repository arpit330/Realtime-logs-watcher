const webSocket = require('ws');
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const socketServer = new webSocket.Server({ server });
const logFilePath = path.join(__dirname, 'logs.txt');

let lastReadLinePosistion = 0;

app.get('/log', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * Function to read Last 10 line of a given log file
 * 
 * @param {string} filePath 
 * @param {*} cb 
 */
async function readLogFile(filePath, cb) {
    fs.stat(filePath, (err, data) => {
        if (err) {
            console.log(err);
            throw err;
        }

        const fileSize = data.size;
        const startPosition = Math.max(0, fileSize - 1024); // reading last 1kb chunk of log file

        const readFileStream = fs.createReadStream(filePath, {
            start: startPosition,
            end: fileSize,
            encoding: 'UTF-8',
        });

        let lastReadLines = [];

        readFileStream.on('data', (chunk) => {
            console.log(chunk);

            lastReadLines = chunk.split('\n');

            if (lastReadLines.length > 10) {
                lastReadLines = lastReadLines.slice(-10);
            }

            lastReadLinePosistion = fileSize;
        })

        readFileStream.on('end', () => {
            cb(lastReadLines.join('\n\n'));
        })

    })
}

/**
 * Broadcast the log file updates to all connected clients
 * 
 * @param {string} data 
 */
function sendFileUpdatesToClient(data) {
    socketServer.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    })
}

/**
 * Monitoring log file for real time updates and only sending the new updates to client
 * 
 * @param {string} filePath 
 */
function monitorLogFile(filePath) {
    fs.watch(filePath, { encoding: 'utf8' }, (eventType, fileName) => {
        if (eventType == 'change') {
            fs.stat(filePath, (err, data) => {
                if (err) {
                    console.log(err);
                    throw err;
                }

                const fileSize = data.size;
                console.log(`fileStart: ${lastReadLinePosistion}, ${fileSize}`);

                const readFileStream = fs.createReadStream(filePath, {
                    start: lastReadLinePosistion,
                    end: fileSize,
                    encoding: 'UTF-8',
                });

                let lastReadLines = [];

                readFileStream.on('data', (chunk) => {

                    lastReadLines = chunk.split('\n');

                    if (lastReadLines.length > 10) {
                        lastReadLines = lastReadLines.slice(-10);
                    }
                    lastReadLinePosistion = fileSize;

                })

                readFileStream.on('end', () => {
                    console.log(`Lines: ${lastReadLines}`);

                    if (lastReadLines) {
                        sendFileUpdatesToClient(lastReadLines.join('\n\n'));
                    }
                })

            })
        }
    })
}

// WebSocket management
socketServer.on('connection', async (socket) => {
    console.log('Client connected to socket');

    await readLogFile(logFilePath, (lastTenLines) => {
        socket.send(lastTenLines);
    });

    monitorLogFile(logFilePath);

    socket.on('close', () => {
        console.log('Client disconnected');
    })
});

server.listen('3000', () => {
    console.log('Server is running on PORT 3000');
});