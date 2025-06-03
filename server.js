const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {};

app.get('/', (req, res) => {
    const roomId = uuidv4().substring(0, 6);
    console.log("Redirecting to room:", roomId);
    return res.redirect(`/${roomId}`);
});

app.use(express.static("public"));
app.use("/dice_faces", express.static(__dirname + "/public/dice_faces"));

// Handle room route
app.get('/:roomId([a-zA-Z0-9]{6})', (req, res) => {
    const roomId = req.params.roomId;
    if (!rooms[roomId]) {
        rooms[roomId] = {
            drawHistory: [],
            diceHistory: [],
            stampHistory: [],
            textHistory: [],
            biomeCount: 3,
            landmarkCount: 1,
            lastActivityTS: Date.now(),
            lastActivity: []
        };
        console.log(`Created new room: ${roomId}`);
    } else {
        console.log(`Joining existing room: ${roomId}`);
    }
    
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

setInterval(() => {
    const now = Date.now();
    for (const roomId in rooms) {
        if (now - rooms[roomId].lastActivityTS > 24 * 60 * 60 * 1000) {
            delete rooms[roomId];
        }
    }
}, 60 * 60 * 1000);

io.on("connection", (socket) => {
    console.log("A user connected");
    let currentRoom = null;

    const referer = socket.handshake.headers.referer || '';
    const urlParts = referer.split('/');
    const roomId = urlParts[urlParts.length - 1];
    
    if (roomId && roomId.length > 0) {
        currentRoom = roomId;
        socket.join(roomId);
        
        if (!rooms[roomId]) {
            rooms[roomId] = {
                drawHistory: [],
                diceHistory: [],
                stampHistory: [],
                textHistory: [],
                biomeCount: 3,
                landmarkCount: 1,
                lastActivityTS: Date.now(),
                lastActivity: []
            };
        }
        
        console.log(`Client joined room: ${roomId}`);
    }

    socket.on("redrawAll", () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        rooms[currentRoom].lastActivityTS = Date.now();
        //not sure the use case for undo of redraw all
        
        socket.emit("drawExistingStamps", rooms[currentRoom].stampHistory);
        socket.emit("drawExistingDice", rooms[currentRoom].diceHistory);
        socket.emit("drawExistingText", rooms[currentRoom].textHistory);
        socket.emit("drawExistingCanvas", rooms[currentRoom].drawHistory);
    });

    socket.on("draw", (drawData) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        rooms[currentRoom].lastActivityTS = Date.now();
        rooms[currentRoom].lastActivity.push('draw');
        if (drawData.strokeArray) {
            for (let i = 0; i < drawData.strokeArray.length; i++) {
                drawData.strokeArray[i].x /= drawData.canvasWidth;
                drawData.strokeArray[i].y /= drawData.canvasHeight;
            }
        }
        rooms[currentRoom].drawHistory.push(drawData);
        socket.broadcast.to(currentRoom).emit("draw", drawData);
    });

    socket.on("client draw", (drawData) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        rooms[currentRoom].lastActivityTS = Date.now();
        rooms[currentRoom].lastActivity.push('draw');

        if (drawData.strokeArray) {
            for (let i = 0; i < drawData.strokeArray.length; i++) {
                drawData.strokeArray[i].x /= drawData.canvasWidth;
                drawData.strokeArray[i].y /= drawData.canvasHeight;
            }
        }
        socket.emit("client draw", drawData);
    });

    socket.on("erase", (eraseData) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        rooms[currentRoom].lastActivityTS = Date.now();
        rooms[currentRoom].lastActivity.push('erase');

        if (eraseData.strokeArray) {
            for (let i = 0; i < eraseData.strokeArray.length; i++) {
                eraseData.strokeArray[i].x /= eraseData.canvasWidth;
                eraseData.strokeArray[i].y /= eraseData.canvasHeight;
            }
        }
        rooms[currentRoom].drawHistory.push(eraseData);
        socket.broadcast.to(currentRoom).emit("erase", eraseData);
    });

    socket.on("client erase", (eraseData) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        rooms[currentRoom].lastActivityTS = Date.now();
        rooms[currentRoom].lastActivity.push('erase');

        if (eraseData.strokeArray) {
            for (let i = 0; i < eraseData.strokeArray.length; i++) {
                eraseData.strokeArray[i].x /= eraseData.canvasWidth;
                eraseData.strokeArray[i].y /= eraseData.canvasHeight;
            }
        }
        socket.emit("client erase", eraseData);
    });

    socket.on("clearDice", () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        rooms[currentRoom].lastActivityTS = Date.now();
        //rooms[currentRoom].lastActivity.push('clearDice');
        
        rooms[currentRoom].diceHistory = []; //TODO for undo...
        io.to(currentRoom).emit("clearDice");
    });

    socket.on("clearCanvas", () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        rooms[currentRoom].lastActivityTS = Date.now();
        //rooms[currentRoom].lastActivity.push('clearCanvas');
        
        rooms[currentRoom].diceHistory = [];
        rooms[currentRoom].drawHistory = [];
        rooms[currentRoom].stampHistory = [];
        rooms[currentRoom].textHistory = [];
        io.to(currentRoom).emit("clearCanvas");
    });

    socket.on("undoAction", () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        rooms[currentRoom].lastActivityTS = Date.now();
        //undoing and undo is a redo, would cause an infinite undo/redo loop
        
        //Determine last action type
        switch(rooms[currentRoom].lastActivity.pop()) {
            case 'draw':
                //remove last draw action from draw canvas cache
                rooms[currentRoom].drawHistory.pop();
                io.to(currentRoom).emit("drawExistingCanvas", rooms[currentRoom].drawHistory);
                break;
            case 'erase':
                //remove last erase action from draw canvas cache
                rooms[currentRoom].drawHistory.pop();
                io.to(currentRoom).emit("drawExistingCanvas", rooms[currentRoom].drawHistory);
                break;
            case 'dropStamp':
                //remove last drop action from stamp canvas cache
                rooms[currentRoom].stampHistory.pop();
                io.to(currentRoom).emit("drawExistingStamps", rooms[currentRoom].stampHistory);
                break;
            case 'clearDie':
                //remove last clear action from dice canvas cache
                //hoooowwwwwww.......?
                //TODO?
                break;
            case 'clearCanvas':
                //remove last clear action from proper canvas cache
                //eeeeewwwwwwwwwww..... keep each clear in it's own special cache??
                //TODO
                break;
            case 'dropDice':
            case 'moveDie':
                //remove last move action from dice canvas cache
                //rooms[currentRoom].diceHistory.pop();
                //io.to(currentRoom).emit("updateDice", rooms[currentRoom].diceHistory);
                break;
            case 'commitText':
                //remove last commit action from text canvas cache
                rooms[currentRoom].textHistory.pop();
                io.to(currentRoom).emit("drawExistingText", rooms[currentRoom].textHistory);
                break;
            }

        //emit to all clients to remove last action
        io.to(currentRoom).emit("undoAction");
    });

    socket.on("biomeCountChange", (increase) => {
        if (!currentRoom || !rooms[currentRoom]) return;

        if (increase) {
            rooms[currentRoom].biomeCount = rooms[currentRoom].biomeCount + 1;
        } else {
            rooms[currentRoom].biomeCount = rooms[currentRoom].biomeCount > 0 ? rooms[currentRoom].biomeCount -1 : 0;
        }
        io.to(currentRoom).emit("updateBiomeCount", rooms[currentRoom].biomeCount)
    });

    socket.on("landmarkCountChange", (increase) => {
        if (!currentRoom || !rooms[currentRoom]) return;

        if (increase) {
            rooms[currentRoom].landmarkCount = rooms[currentRoom].landmarkCount + 1;
        } else {
            rooms[currentRoom].landmarkCount = rooms[currentRoom].landmarkCount > 0 ? rooms[currentRoom].landmarkCount -1 : 0;
        }
        io.to(currentRoom).emit("updateLandmarkCount", rooms[currentRoom].landmarkCount)
    });

    socket.on("moveDie", (moveData) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        rooms[currentRoom].lastActivityTS = Date.now();
        //rooms[currentRoom].lastActivity.push('moveDie');
        
        const dieIndex = rooms[currentRoom].diceHistory.findIndex(die => die.id === moveData.id);
        if (dieIndex !== -1) {
            rooms[currentRoom].diceHistory[dieIndex].x = moveData.x / moveData.canvasWidth;
            rooms[currentRoom].diceHistory[dieIndex].y = moveData.y / moveData.canvasHeight;
            io.to(currentRoom).emit("updateDice", rooms[currentRoom].diceHistory);
        }
    });

    function isOverlapping(newDie, existingDice, spacing, canvasWidth, canvasHeight) {
        return existingDice.some(die => {
            const dx = (newDie.x * canvasWidth) - (die.x * canvasWidth);
            const dy = (newDie.y * canvasHeight) - (die.y * canvasHeight);
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance < (newDie.size + spacing);
        });
    }

    socket.on("commitText", (data) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        rooms[currentRoom].lastActivityTS = Date.now();
        rooms[currentRoom].lastActivity.push('commitText');
        
        newText = {
            x: data.x / data.canvasWidth,
            y: data.y / data.canvasHeight,
            text: data.text
        };
        rooms[currentRoom].textHistory.push(newText);
        io.to(currentRoom).emit("writeText", newText);
    });

    socket.on("dropStamp", (data) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        rooms[currentRoom].lastActivityTS = Date.now();
        rooms[currentRoom].lastActivity.push('dropStamp');
        
        newStamp = {
            x: data.x / data.canvasWidth,
            y: data.y / data.canvasHeight,
            value: data.value
        };

        rooms[currentRoom].stampHistory.push(newStamp);
        io.to(currentRoom).emit("dropStamp", newStamp);
    });

    socket.on("dropDice", (data) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        rooms[currentRoom].lastActivityTS = Date.now();
        //rooms[currentRoom].lastActivity.push('dropDice');
        
        let bCount = rooms[currentRoom].biomeCount;
        let lCount = rooms[currentRoom].landmarkCount;
        let diceDroppedArray = [];

        const diceCount = bCount + lCount;
        const spacing = data.size *5;
        const diceSize = data.size;
        const maxRadius = 30 * data.spread + data.size;
        const maxAttempts = 10;
    
        for (let i = 0; i < diceCount; i++) {
            let newDie;
            let val;
            let attempts = 0;
            if (bCount > 0) {
                val = Math.floor(Math.random() * 6) + 1
                bCount -= 1;
            } else if (lCount > 0) {
                val = Math.floor(Math.random() * 6) + 7
                lCount -= 1;
            };

            do {
                const angle = Math.random() * 2 * Math.PI;
                const radius = Math.random() * maxRadius;
                let rawX = Math.min(Math.max((data.x + Math.cos(angle) * radius), diceSize), data.canvasWidth - diceSize);
                let rawY = Math.min(Math.max((data.y + Math.sin(angle) * radius), diceSize), data.canvasHeight - diceSize);
                newDie = {
                    id: uuidv4(),
                    x: rawX / data.canvasWidth,
                    y: rawY / data.canvasHeight,
                    value: val
                };
                attempts++;
            } while (isOverlapping(newDie, rooms[currentRoom].diceHistory, spacing, data.canvasWidth, data.canvasHeight) && attempts < maxAttempts);
            diceDroppedArray.push(newDie);
            rooms[currentRoom].diceHistory.push(newDie);
        }
        io.to(currentRoom).emit("dropDice", diceDroppedArray);
    });

    function isOverDie(mouseX, mouseY, die, canvasWidth, canvasHeight, diceSize) {
        const dx = mouseX - (die.x * canvasWidth);
        const dy = mouseY - (die.y * canvasHeight);
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < diceSize / 2;
    }

    socket.on("checkDieClick", (data) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        let diceData = {
            die: null,
            x: data.x,
            y: data.y
        };
        for (let i = 0; i < rooms[currentRoom].diceHistory.length; i++) {
            if (isOverDie(data.x, data.y, rooms[currentRoom].diceHistory[i], data.canvasWidth, data.canvasHeight, data.size)) {
                diceData.die = rooms[currentRoom].diceHistory[i];
            }
        }
        socket.emit("dieClickResult", diceData);
    });

    socket.on("disconnect", () => {
        console.log("A user disconnected");
        if (currentRoom) {
            socket.leave(currentRoom);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});