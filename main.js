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

let ENERGY_BUFFER = Array.from(
    { length: GRID_HEIGHT },
    () => Array(GRID_WIDTH).fill(0)
);

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

const NEIGHBOR_DIRECTIONS = [
    [-1, -1], [0, -1], [1, -1],
    [-1,  0],          [1,  0],
    [-1,  1], [0,  1], [1,  1]
];

const THERMAL_DIRECTIONS = [
    [1, 0], // Droite
    [0, 1]  // Bas
];

const THERMAL_SAFETY_FACTOR = 0.45;

function getThermalCapacity(cell) {
    const density = cell.thermalDensity ?? cell.density;

    if (
        !Number.isFinite(density) ||
        density <= 0 ||
        cell.heatCapacity <= 0
    ) {
        return 0;
    }

    const volume =
        CELL_SIZE_METERS *
        CELL_SIZE_METERS *
        CELL_SIZE_METERS;

    const mass = density * volume;

    return mass * cell.heatCapacity;
}

function getThermalConductance(cellA, cellB) {
    const k1 = cellA.thermalConductivity;
    const k2 = cellB.thermalConductivity;

    if (k1 <= 0 || k2 <= 0) return 0;

    // Moyenne harmonique des conductivités
    const k = (2 * k1 * k2) / (k1 + k2);

    // Conductance thermique : G = k * surface / distance
    const surface = CELL_SIZE_METERS * CELL_SIZE_METERS;
    const distance = CELL_SIZE_METERS;

    return k * surface / distance;
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
            if (current.state === "gas" || current.state === "liquid") {
                if (current.temperature > up.temperature || current.density > up.density) {
                    GRID[y - 1][x] = current;
                    GRID[y][x] = up;
                }
            }
        }
    }
}

function simulateThermal() {

    const capacities = [];
    const conductanceSums = [];

    // 1. Calcul des capacités thermiques
    for (let y = 0; y < GRID_HEIGHT; y++) {
        capacities[y] = [];
        conductanceSums[y] = [];

        for (let x = 0; x < GRID_WIDTH; x++) {
            capacities[y][x] = getThermalCapacity(GRID[y][x]);
            conductanceSums[y][x] = 0;
        }
    }

    // 2. Calcul de la conductance totale autour de chaque cellule
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {

            const current = GRID[y][x];

            if (capacities[y][x] <= 0) continue;

            for (const [dx, dy] of THERMAL_DIRECTIONS) {

                const nx = x + dx;
                const ny = y + dy;

                if (nx >= GRID_WIDTH || ny >= GRID_HEIGHT) continue;

                const other = GRID[ny][nx];

                if (capacities[ny][nx] <= 0) continue;

                const conductance =
                    getThermalConductance(current, other);

                conductanceSums[y][x] += conductance;
                conductanceSums[ny][nx] += conductance;
            }
        }
    }

    // 3. Détermination du nombre de sous-étapes nécessaires
    let maxRate = 0;

    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {

            if (capacities[y][x] <= 0) continue;

            const rate =
                conductanceSums[y][x] / capacities[y][x];

            maxRate = Math.max(maxRate, rate);
        }
    }

    const substeps = Math.max(
        1,
        Math.ceil(
            THERMAL_RATE * maxRate / THERMAL_SAFETY_FACTOR
        )
    );

    const deltaTime = THERMAL_RATE / substeps;

    // 4. Simulation des échanges thermiques
    for (let step = 0; step < substeps; step++) {

        // Calcul des échanges
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {

                const current = GRID[y][x];

                if (capacities[y][x] <= 0) continue;

                for (const [dx, dy] of THERMAL_DIRECTIONS) {

                    const nx = x + dx;
                    const ny = y + dy;

                    if (nx >= GRID_WIDTH || ny >= GRID_HEIGHT) continue;

                    const other = GRID[ny][nx];

                    if (capacities[ny][nx] <= 0) continue;

                    const conductance =
                        getThermalConductance(current, other);

                    const energy =
                        conductance *
                        (current.temperature - other.temperature) *
                        deltaTime;

                    ENERGY_BUFFER[y][x] -= energy;
                    ENERGY_BUFFER[ny][nx] += energy;
                }
            }
        }

        // Application des échanges
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {

                if (capacities[y][x] > 0) {

                    GRID[y][x].temperature +=
                        ENERGY_BUFFER[y][x] / capacities[y][x];
                }

                ENERGY_BUFFER[y][x] = 0;
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

        simulateThermal();

    }

    if (running) {
        requestAnimationFrame(gameLoop);
    }

    loops++;
    endTime = performance.now();
    deltaTime = (endTime - startTime)*0.001;
}

gameLoop();
