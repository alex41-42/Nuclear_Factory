const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
// const PI = Math.PI;
// const sqrt = Math.sqrt;
const min = Math.min
const max = Math.max

let SCREEN_WIDTH;
let SCREEN_HEIGHT;

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;
const CELL_SIZE = 10;
const GRID_WIDTH = GAME_WIDTH / CELL_SIZE;
const GRID_HEIGHT = GAME_HEIGHT / CELL_SIZE;

const MATERIALS = {
    "air": {
        type: "air",
        state: "gas",
        density: 1.2,
        temperature: 20,
        heatCapacity: 1000,
        thermalConductivity: 0.026,
        pressure: 1,
        heatGeneration: 0,
    },
    "sand": {
        type: "sand",
        state: "powder",
        density: 1500,
        temperature: 20,
        heatCapacity: 830,
        thermalConductivity: 0.3,
        pressure: 1,
        heatGeneration: 0,
    },
    "water": {
        type: "water",
        state: "liquid",
        density: 1000,
        temperature: 20,
        heatCapacity: 4180,
        thermalConductivity: 0.6,
        pressure: 1,
        heatGeneration: 0,
    },
    "uranium": {
        type: "uranium",
        state: "powder",
        density: 19100,
        temperature: 400,
        heatCapacity: 116,
        thermalConductivity: 22.5,
        pressure: 1,
        heatGeneration: 1,
    },
    "wall": {
        type: "wall",
        state: "solid",
        density: Infinity,
        thermalDensity: 2400,
        temperature: 20,
        heatCapacity: 840,
        thermalConductivity: 1.4,
        pressure: 1,
        heatGeneration: 0,
    },
};

const CELL_SIZE_METERS = 0.01;
const THERMAL_TIME_STEP = 0.1;
const THERMAL_RATE = THERMAL_TIME_STEP;

const EMPTY_CELL = {...MATERIALS["air"]};
const WALL_CELL = {...MATERIALS["wall"]};

let GRID = Array.from(
    { length: GRID_HEIGHT },
    () => Array.from(
        { length: GRID_WIDTH },
        () => ({...EMPTY_CELL})
    )
);

const NEIGHBOR_DIRECTIONS = [
    [-1, -1], [0, -1], [1, -1],
    [-1,  0],          [1,  0],
    [-1,  1], [0,  1], [1,  1]
];

let GAME_OFFSET_X;
let GAME_OFFSET_Y;

// Resize
function resizeCanvas() {
    SCREEN_WIDTH = window.innerWidth;
    SCREEN_HEIGHT = window.innerHeight;
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;
    GAME_OFFSET_X = Math.floor((SCREEN_WIDTH - GAME_WIDTH) * 0.5);
    GAME_OFFSET_Y = Math.floor((SCREEN_HEIGHT - GAME_HEIGHT) * 0.5);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Keys
const keys = {};

document.addEventListener("keydown", (e) => {
    keys[e.key] = true;
});

document.addEventListener("keyup", (e) => {
    keys[e.key] = false;
});

// Mouse
let mouseX = 0;
let mouseY = 0;

document.addEventListener('mousemove', (mouse) => {
    mouseX = mouse.clientX, mouseY = mouse.clientY;
});

let onClick = false;
let leftClick = false;
let rightClick = false;

document.addEventListener('mousedown', (e) => {
    onClick = true;
    if (e.button === 0) leftClick = true;
    if (e.button === 2) rightClick = true;
});

document.addEventListener('mouseup', (e) => {
    onClick = false;
    if (e.button === 0) leftClick = false;
    if (e.button === 2) rightClick = false;
});

canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
});

// Theme color
const ThemeColors = {
    "font" : [50, 50, 50],
    "title" : [255, 255, 255],
    "text" : [200, 200, 200],
    "sel_text" : [200, 220, 200],
    
};

// Loop
let running = true;
let loops = 0;
let state = "Menu"

let startTime;
let endTime;
let deltaTime = 0;
let FPS = 0;

// Menu
let selectedOption = 0;
let options = ["Play","How to play","Credits"];
let lastPress = performance.now();

// Game
let hoverSize = 5; // by cell
let hoverX = mouseX;
let hoverY = mouseY;
let hoverGridX;
let hoverGridY;
let lastClick = performance.now();
let hoverCell = {...EMPTY_CELL};

// cells
const CellsColors = {
    "water":[50, 120, 255],
    "sand":[255, 220, 100],
    "wall":[150, 150, 150],
    "uranium":[100, 230, 100],
}

function getNeighbors(x, y) {
    let neighbors = [];

    for (const [offsetX, offsetY] of NEIGHBOR_DIRECTIONS) {
        const neighborX = x + offsetX;
        const neighborY = y + offsetY;

        const insideGrid =
            neighborX >= 0 && neighborX < GRID_WIDTH &&
            neighborY >= 0 && neighborY < GRID_HEIGHT;

        neighbors.push({
            x: neighborX,
            y: neighborY,
            cell: insideGrid ? GRID[neighborY][neighborX] : WALL_CELL
        });
    }

    return neighbors;
}

function drawGame() {
    fillRect(ctx, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, ThemeColors["font"]);
    fillRect(ctx, GAME_OFFSET_X, GAME_OFFSET_Y, GAME_WIDTH, GAME_HEIGHT, [0, 0, 0]);

    for (let y = 0; y < GRID_HEIGHT; y++) {
        const row = GRID[y];

        for (let x = 0; x < GRID_WIDTH; x++) {
            const current = row[x];
            if (current.type === "air") continue;

            const cellColor = CellsColors[current.type] ?? [0, 0, 0];
            const cellX = GAME_OFFSET_X + x * CELL_SIZE;
            const cellY = GAME_OFFSET_Y + y * CELL_SIZE;

            fillRect(ctx, cellX, cellY, CELL_SIZE, CELL_SIZE, cellColor);
        }
    }

    hoverGridX = max(0, min(
        Math.floor((mouseX - GAME_OFFSET_X) / CELL_SIZE),
        GRID_WIDTH - hoverSize
    ));

    hoverGridY = max(0, min(
        Math.floor((mouseY - GAME_OFFSET_Y) / CELL_SIZE),
        GRID_HEIGHT - hoverSize
    ));

    const hoverSelection = GRID[hoverGridY][hoverGridX];

    hoverX = GAME_OFFSET_X + hoverGridX * CELL_SIZE;
    hoverY = GAME_OFFSET_Y + hoverGridY * CELL_SIZE;

    drawRect(ctx, hoverX, hoverY, hoverSize * CELL_SIZE, hoverSize * CELL_SIZE, [255, 255, 255]);

    drawText(ctx, hoverSelection.type.toString(), GAME_OFFSET_X + 4, GAME_OFFSET_Y + 30, 13, ThemeColors["text"]);
    drawText(ctx, hoverSelection.temperature.toString() + "°C", GAME_OFFSET_X + 4, GAME_OFFSET_Y + 47, 13, ThemeColors["text"]);

    if (loops % 15 === 0) FPS = Math.round(1 / (deltaTime ?? 1));
    drawText(ctx, "Fps: " + FPS.toString(), GAME_OFFSET_X + 4, GAME_OFFSET_Y + 13, 13, ThemeColors["text"]);
}

function handleGameInput() {
    if (leftClick) {
        for (let y = 0; y < hoverSize; y++) {
            const row = GRID[hoverGridY + y];

            for (let x = 0; x < hoverSize; x++) {
                if (row[hoverGridX + x].type === "air") {
                    row[hoverGridX + x] = { ...hoverCell };
                }
            }
        }
    }
    else if (rightClick) {
        for (let y = 0; y < hoverSize; y++) {
            const row = GRID[hoverGridY + y];

            for (let x = 0; x < hoverSize; x++) {
                row[hoverGridX + x] = { ...EMPTY_CELL };
            }
        }
    }

    if (keys['Backspace']) {
        GRID = Array.from(
            { length: GRID_HEIGHT },
            () => Array.from(
                { length: GRID_WIDTH },
                () => ({ ...EMPTY_CELL })
            )
        );
    }

    if (keys['&']) hoverCell = MATERIALS["water"];
    if (keys['é']) hoverCell = MATERIALS["sand"];
    if (keys['"']) hoverCell = MATERIALS["wall"];
    if (keys["'"]) hoverCell = MATERIALS["uranium"];
}

function simulateMatter() {
    for (let y = GRID_HEIGHT - 2; y >= 0; y--) {
        const previous_row = GRID[y - 1] ?? Array.from({ length: GRID_WIDTH }, () => ({...WALL_CELL}));
        const row = GRID[y];
        const next_row = GRID[y + 1];

        for (let x = 0; x < GRID_WIDTH; x++) {
            const current = row[x];

            const current_left = row[x - 1] ?? WALL_CELL;
            const current_right = row[x + 1] ?? WALL_CELL;

            const down = next_row[x];
            const down_left = next_row[x - 1] ?? WALL_CELL;
            const down_right = next_row[x + 1] ?? WALL_CELL;

            const up = previous_row[x] ?? WALL_CELL;
            const up_left = previous_row[x - 1] ?? WALL_CELL;
            const up_right = previous_row[x + 1] ?? WALL_CELL;

            const n = Math.random();

            if (current.state === "liquid" || current.state === "powder") {
                if (current.density > down.density) {
                    next_row[x] = current;
                    row[x] = down;
                }
                else if (current.density > down_left.density) {
                    next_row[x - 1] = current;
                    row[x] = down_left;
                }
                else if (current.density > down_right.density) {
                    next_row[x + 1] = current;
                    row[x] = down_right;
                }
                else if (current.state === "liquid" && n < 0.33 && current.density > current_left.density) {
                    row[x - 1] = current;
                    row[x] = current_left;
                }
                else if (current.state === "liquid" && n > 0.66 && current.density > current_right.density) {
                    row[x + 1] = current;
                    row[x] = current_right;
                }
            }
            if (current.state === "liquid") {
                if (current.temperature > up.temperature && current.type === up.type && current.state === up.state) {
                    previous_row[x] = current;
                    row[x] = up;
                }
            }
        }
    }
}

function gameLoop() {
    startTime = performance.now();

    if (state === "Menu") {
        drawMenu(selectedOption, options);

        if (keys['ArrowUp'] && startTime - lastPress > 150) {
            selectedOption--;
            lastPress = startTime;

        } else if (keys['ArrowDown'] && startTime - lastPress > 150) {
            selectedOption++;
            lastPress = startTime;

        } else if (keys['Enter'] && startTime - lastPress > 150) {
            state = options[selectedOption];
            lastPress = startTime;
        }

        selectedOption = max(0, min(options.length - 1, selectedOption));
    }
    
    else if (state === "How to play") {
        drawHowToPlay();
        
        if (keys['Enter'] && startTime - lastPress > 150) {
            state = "Menu";
            lastPress = startTime;
        }
    }
    
    else if (state === "Credits") {
        drawCredits();
        
        if (keys['Enter'] && startTime - lastPress > 150) {
            state = "Menu";
            lastPress = startTime;
        }
    }

    else if (state === "Play") {
        drawGame();

        handleGameInput();

        simulateMatter();

    }

    if (running) {
        requestAnimationFrame(gameLoop);
    }

    loops++;
    endTime = performance.now();
    deltaTime = (endTime - startTime)*0.001;
}

gameLoop();
