const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

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

    function isOverlapping(newDie, existingDice, spacing) {
        return existingDice.some(die => {
            const dx = newDie.x - die.x;
            const dy = newDie.y - die.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance < (newDie.size + spacing); // Dice are too close
        });
    }

    socket.on("dropDice", (mousePos) => {
        // If we don't receive size data, use a relative size instead
        // This ensures dice rendering works consistently across different screens
        const diceCount = 5;
        const spacing = 20;
        const diceSize = mousePos.size || 40; // Use provided size or default
        const maxRadius = 350;
        const maxAttempts = 10; // Prevent infinite loops
    
        for (let i = 0; i < diceCount; i++) {
            let newDie;
            let attempts = 0;

            do {
                const angle = Math.random() * 2 * Math.PI;
                const radius = Math.random() * maxRadius;

                newDie = {
                    x: mousePos.x + Math.cos(angle) * radius,
                    y: mousePos.y + Math.sin(angle) * radius,
                    size: diceSize,
                    value: Math.floor(Math.random() * 6) + 1
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