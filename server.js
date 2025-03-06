const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid'); // You'll need to install this: npm install uuid

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use("/dice_faces", express.static(__dirname + "/public/dice_faces"));

let drawHistory = []; // Store all drawn lines
let diceHistory = []; // Store all dice

io.on("connection", (socket) => {
    console.log("A user connected");

    socket.emit("drawHistory", drawHistory);
    socket.emit("dropDice", diceHistory);

    // Add handler for history requests (for canvas resize)
    socket.on("requestHistory", () => {
        socket.emit("drawHistory", drawHistory);
        socket.emit("dropDice", diceHistory);
    });

    socket.on("draw", (data) => {
        drawHistory.push(data);
        socket.broadcast.emit("draw", data); // Send to all users except the sender
    });

    socket.on("erase", (data) => {
        drawHistory.push({ ...data, erase: true });
        socket.broadcast.emit("erase", data); // Send erase event to others
    });

    socket.on("clearCanvas", () => {
        drawHistory = []; // Clear draw history
        diceHistory = []; // Clear dice history
        io.emit("clearCanvas"); // Notify all users
        io.emit("dropDice", []); // Send empty dice array to clear dice
    });

    // Handle dice movement
    socket.on("moveDie", (moveData) => {
        // Find the die in our history
        const dieIndex = diceHistory.findIndex(die => die.id === moveData.id);
        
        if (dieIndex !== -1) {
            // Update die position
            diceHistory[dieIndex].x = moveData.x;
            diceHistory[dieIndex].y = moveData.y;
            
            // Broadcast the update to all clients
            io.emit("moveDie", diceHistory[dieIndex]);
        }
    });

    function isOverlapping(newDie, existingDice, spacing) {
        return existingDice.some(die => {
            const dx = newDie.x - die.x;
            const dy = newDie.y - die.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance < (newDie.size + spacing); // Dice are too close
        });
    }

    socket.on("dropDice", (data) => {
        // If we don't receive size data, use a relative size instead
        // This ensures dice rendering works consistently across different screens
        let bCount = data.bCount;
        let lCount = data.lCount;
        const diceCount = bCount + lCount;
        const spacing = 20;
        const diceSize = data.size || 40; // Use provided size or default
        const maxRadius = 50 * data.spread + 50;
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

                newDie = {
                    id: uuidv4(), // Generate unique ID for each die
                    x: data.x + Math.cos(angle) * radius,
                    y: data.y + Math.sin(angle) * radius,
                    size: diceSize,
                    value: val
                };
                attempts++;
            } while (isOverlapping(newDie, diceHistory, spacing) && attempts < maxAttempts);
    
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