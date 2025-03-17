const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid'); // You'll need to install this: npm install uuid

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use("/dice_faces", express.static(__dirname + "/public/dice_faces"));

let drawHistory = [];
let diceHistory = [];
let stampHistory = [];
let textHistory = [];

io.on("connection", (socket) => {
    console.log("A user connected");
    // socket.emit("drawExistingCanvas", drawHistory);
    // socket.emit("drawExistingStamps", stampHistory);
    // socket.emit("drawExistingDice", diceHistory);

    socket.on("redrawAll", () => {
        socket.emit("drawExistingCanvas", drawHistory);
        socket.emit("drawExistingStamps", stampHistory);
        socket.emit("drawExistingDice", diceHistory);
    });

    socket.on("draw", (drawData) => {
        drawData.lastX = drawData.lastX / drawData.canvasWidth;
        drawData.lastY = drawData.lastY / drawData.canvasHeight;
        drawData.x = drawData.x / drawData.canvasWidth;
        drawData.y = drawData.y / drawData.canvasHeight;

        drawHistory.push(drawData);
        io.emit("draw", drawData);
    });

    socket.on("erase", (eraseData) => {
        eraseData.x = eraseData.x / eraseData.canvasWidth;
        eraseData.y = eraseData.y / eraseData.canvasHeight;

        drawHistory.push(eraseData);
        io.emit("erase", eraseData);
    });

    socket.on("clearDice", () => {
        diceHistory = []; // Clear dice history
        io.emit("clearDice"); // Notify all users
        io.emit("dropDice", []); // Send empty dice array to clear dice
    });

    socket.on("clearCanvas", () => {
        diceHistory = [];
        drawHistory = [];
        stampHistory = [];
        textHistory = [];
        io.emit("clearCanvas");
    });

    socket.on("moveDie", (moveData) => {
        const dieIndex = diceHistory.findIndex(die => die.id === moveData.id);
        if (dieIndex !== -1) {
            diceHistory[dieIndex].x = moveData.x / moveData.canvasWidth;
            diceHistory[dieIndex].y = moveData.y / moveData.canvasHeight;
            io.emit("updateDice", diceHistory);
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
            value: data.value
        };

        stampHistory.push(newStamp);
        io.emit("dropStamp", newStamp);
    });

    socket.on("dropDice", (data) => {
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
            } while (isOverlapping(newDie, diceHistory, spacing, data.canvasWidth, data.canvasHeight) && attempts < maxAttempts);
            diceDroppedArray.push(newDie);
            diceHistory.push(newDie);
        }
        io.emit("dropDice", diceDroppedArray);
    });

    function isOverDie(mouseX, mouseY, die, canvasWidth, canvasHeight, diceSize) {
        const dx = mouseX - (die.x * canvasWidth);
        const dy = mouseY - (die.y * canvasHeight);
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < diceSize / 2;
    }

    socket.on("checkDieClick", (data) => {
        let diceData = {
            die: null,
            x: data.x,
            y: data.y
        };
        for (let i = 0; i < diceHistory.length; i++) {
            if (isOverDie(data.x, data.y, diceHistory[i], data.canvasWidth, data.canvasHeight, data.size)) {
                diceHistory[i].moving = true;
                diceData.die = diceHistory[i];
            }
        }
        socket.emit("dieClickResult", diceData);
    });

    socket.on("stopDragging", (data) => {
        const dieIndex = diceHistory.findIndex(die => die.id === data.dieId);
        if (dieIndex !== -1) {
            diceHistory[dieIndex].moving = false;
        }

        io.emit("updateDice", diceHistory);
    })

    

    socket.on("disconnect", () => {
        console.log("A user disconnected");
    });
});

server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});