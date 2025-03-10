const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { text } = require("stream/consumers");
const { v4: uuidv4 } = require('uuid'); // You'll need to install this: npm install uuid

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use("/dice_faces", express.static(__dirname + "/public/dice_faces"));

let drawHistory = []; // Store all drawn lines
let diceHistory = []; // Store all dice
let stampHistory = []; //Store all stamps
let textHistory = []; //Store all texts

io.on("connection", (socket) => {
    console.log("A user connected");

    socket.emit("drawHistory", drawHistory);
    socket.emit("dropDice", diceHistory);
    socket.emit("dropStamp", stampHistory);
    socket.emit("writeText", textHistory);

    // Add handler for history requests (for canvas resize)
    socket.on("requestHistory", () => {
        socket.emit("drawHistory", drawHistory);
        socket.emit("dropDice", diceHistory);
        socket.emit("dropStamp", stampHistory);
        socket.emit("writeText", textHistory);
    });

    socket.on("draw", (data) => {
        drawHistory.push(data);
        socket.broadcast.emit("draw", data); // Send to all users except the sender
    });

    socket.on("erase", (data) => {
        drawHistory.push({ ...data, erase: true });
        socket.broadcast.emit("erase", data); // Send erase event to others
    });

    socket.on("clearDice", () => {
        diceHistory = []; // Clear dice history
        io.emit("clearDice"); // Notify all users
        io.emit("dropDice", []); // Send empty dice array to clear dice
    });

    socket.on("clearCanvas", () => {
        diceHistory = []; // Clear dice history
        drawHistory = [];
        stampHistory = [];
        textHistory = [];
        io.emit("clearCanvas"); // Notify all users
        io.emit("dropDice", []); // Send empty dice array to clear dice
    });

    // Handle dice movement
    socket.on("moveDie", (moveData) => {
        // Find the die in our history
        const dieIndex = diceHistory.findIndex(die => die.id === moveData.id);
        
        if (dieIndex !== -1) {
            // Update die position
            diceHistory[dieIndex].x = moveData.x / moveData.canvasWidth;
            diceHistory[dieIndex].y = moveData.y / moveData.canvasHeight;
            // Broadcast the update to all clients
            io.emit("moveDie", diceHistory[dieIndex]);
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

    socket.on("writeText", (data) => {
        newText = {
            x: data.x / data.canvasWidth,
            y: data.y / data.canvasHeight,
            size: data.size,
            value: data.value
        };
        textHistory.push(newText);
        io.emit("writeText", textHistory);
    });

    socket.on("dropStamp", (data) => {
        newStamp = {
            x: data.x / data.canvasWidth,
            y: data.y / data.canvasHeight,
            size: data.size,
            value: data.value
        };

        stampHistory.push(newStamp);
        io.emit("dropStamp", stampHistory);
    });

    socket.on("dropDice", (data) => {
        let bCount = data.bCount;
        let lCount = data.lCount;
        const diceCount = bCount + lCount;
        const spacing = 100;
        const diceSize = data.size;
        const maxRadius = 50 * data.spread + 200;
        const maxAttempts = 10; // Prevent infinite loops
    
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
                    size: diceSize,
                    value: val
                };
                attempts++;
            } while (isOverlapping(newDie, diceHistory, spacing, data.canvasWidth, data.canvasHeight) && attempts < maxAttempts);
            diceHistory.push(newDie);
        }
    
        io.emit("dropDice", diceHistory);
    });
    
    socket.on("disconnect", () => {
        console.log("A user disconnected");
    });
});

server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});