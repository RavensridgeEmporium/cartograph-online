const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use("/dice_faces", express.static(__dirname + "/public/dice_faces"));

const rooms = {};

app.get('/', (req, res) => {
    const roomId = uuidv4().substring(0, 6);
    res.redirect(`/${roomId}`);
    console.log("room Id: ", roomId);
});

// Handle room route
app.get('/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    console.log(`User accessing room: ${roomId}`);
    if (!rooms[roomId]) {
        rooms[roomId] = {
            drawHistory: [],
            diceHistory: [],
            stampHistory: [],
            textHistory: [],
            lastActivity: Date.now()
        };
    }
    
    res.sendFile(__dirname + '/public/index.html');
});

// Clean up inactive rooms periodically (optional)
setInterval(() => {
    const now = Date.now();
    for (const roomId in rooms) {
        // Remove rooms inactive for more than 24 hours
        if (now - rooms[roomId].lastActivity > 24 * 60 * 60 * 1000) {
            delete rooms[roomId];
        }
    }
}, 60 * 60 * 1000); // Check every hour

io.on("connection", (socket) => {
    console.log("A user connected");
    let currentRoom = null;

    // Extract room ID from referer URL
    const referer = socket.handshake.headers.referer || '';
    const urlParts = referer.split('/');
    const roomId = urlParts[urlParts.length - 1];
    
    if (roomId && roomId.length > 0) {
        currentRoom = roomId;
        socket.join(roomId);
        
        // Initialize room if it doesn't exist (fallback)
        if (!rooms[roomId]) {
            rooms[roomId] = {
                drawHistory: [],
                diceHistory: [],
                stampHistory: [],
                textHistory: [],
                lastActivity: Date.now()
            };
        }
        
        console.log(`Client joined room: ${roomId}`);
    }

    socket.on("redrawAll", () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        // Update room activity timestamp
        rooms[currentRoom].lastActivity = Date.now();
        
        socket.emit("drawExistingStamps", rooms[currentRoom].stampHistory);
        socket.emit("drawExistingDice", rooms[currentRoom].diceHistory);
        socket.emit("drawExistingText", rooms[currentRoom].textHistory);
        socket.emit("drawExistingCanvas", rooms[currentRoom].drawHistory);
    });

    socket.on("draw", (drawData) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        // Update room activity timestamp
        rooms[currentRoom].lastActivity = Date.now();
        
        drawData.lastX = drawData.lastX / drawData.canvasWidth;
        drawData.lastY = drawData.lastY / drawData.canvasHeight;
        drawData.x = drawData.x / drawData.canvasWidth;
        drawData.y = drawData.y / drawData.canvasHeight;

        rooms[currentRoom].drawHistory.push(drawData);
        io.to(currentRoom).emit("draw", drawData);
    });

    socket.on("erase", (eraseData) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        // Update room activity timestamp
        rooms[currentRoom].lastActivity = Date.now();
        
        eraseData.x = eraseData.x / eraseData.canvasWidth;
        eraseData.y = eraseData.y / eraseData.canvasHeight;

        rooms[currentRoom].drawHistory.push(eraseData);
        io.to(currentRoom).emit("erase", eraseData);
    });

    socket.on("clearDice", () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        // Update room activity timestamp
        rooms[currentRoom].lastActivity = Date.now();
        
        rooms[currentRoom].diceHistory = [];
        io.to(currentRoom).emit("clearDice");
    });

    socket.on("clearCanvas", () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        // Update room activity timestamp
        rooms[currentRoom].lastActivity = Date.now();
        
        rooms[currentRoom].diceHistory = [];
        rooms[currentRoom].drawHistory = [];
        rooms[currentRoom].stampHistory = [];
        rooms[currentRoom].textHistory = [];
        io.to(currentRoom).emit("clearCanvas");
    });

    socket.on("moveDie", (moveData) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        // Update room activity timestamp
        rooms[currentRoom].lastActivity = Date.now();
        
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
            return distance < (newDie.size + spacing); // Dice are too close
        });
    }

    socket.on("commitText", (data) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        // Update room activity timestamp
        rooms[currentRoom].lastActivity = Date.now();
        
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
        
        // Update room activity timestamp
        rooms[currentRoom].lastActivity = Date.now();
        
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
        
        // Update room activity timestamp
        rooms[currentRoom].lastActivity = Date.now();
        
        let bCount = data.bCount;
        let lCount = data.lCount;
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
                    id: uuidv4(), // Generate unique ID for each die
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
                rooms[currentRoom].diceHistory[i].moving = true;
                diceData.die = rooms[currentRoom].diceHistory[i];
            }
        }
        socket.emit("dieClickResult", diceData);
    });

    socket.on("stopDragging", (data) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        
        const dieIndex = rooms[currentRoom].diceHistory.findIndex(die => die.id === data.dieId);
        if (dieIndex !== -1) {
            rooms[currentRoom].diceHistory[dieIndex].moving = false;
        }

        io.to(currentRoom).emit("updateDice", rooms[currentRoom].diceHistory);
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