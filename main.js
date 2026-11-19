const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const PI = Math.PI;
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

// ---------------------------------------------------------------------------
// Temps de simulation
// ---------------------------------------------------------------------------
// Le moteur avance par "ticks" de durée fixe, quel que soit le FPS de l'écran.
//   TICK_REAL : durée réelle d'un tick (s)            -> 60 ticks par seconde réelle
//   TIME_SCALE: secondes simulées par seconde réelle  -> 10 = le jeu va 10x plus vite que la réalité
//   SIM_DT    : durée SIMULÉE d'un tick (s)           -> c'est CE dt que la physique utilise
// Ne jamais utiliser le temps réel entre deux images (deltaTime) dans la physique.
const TICK_REAL = 1 / 60;
const TIME_SCALE = 10;
const SIM_DT = TICK_REAL * TIME_SCALE;

// Protection contre la "spirale de la mort" (navigateur ralenti, onglet en arrière-plan) :
// on ne rattrape jamais plus de MAX_STEPS_PER_FRAME ticks par image, et le retard
// accumulé au-delà de MAX_FRAME_TIME secondes réelles est abandonné.
const MAX_FRAME_TIME = 0.25;
const MAX_STEPS_PER_FRAME = 5;

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

// Buffer de la simulation de matière :
// 1 = la cellule a déjà été déplacée pendant ce tick
let MATTER_MOVED = Array.from(
    { length: GRID_HEIGHT },
    () => new Uint8Array(GRID_WIDTH)
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
// On stocke e.code (position PHYSIQUE de la touche : "Digit1", "KeyT"...) et non e.key.
// e.key dépend de la disposition (AZERTY : "&" ou "1" selon Shift), donc le keyup
// pouvait ne pas correspondre au keydown et laisser une touche "bloquée".
const keys = {};

document.addEventListener("keydown", (e) => {
    keys[e.code] = true;
});

document.addEventListener("keyup", (e) => {
    keys[e.code] = false;
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

// Perte de focus (Alt+Tab, clic hors de la fenêtre, onglet masqué) : le navigateur
// n'envoie plus keyup/mouseup, donc on remet tout à zéro pour éviter les entrées bloquées.
function resetInputs() {
    for (const code in keys) keys[code] = false;
    onClick = false;
    leftClick = false;
    rightClick = false;
}

window.addEventListener("blur", resetInputs);
document.addEventListener("visibilitychange", () => {
    if (document.hidden) resetInputs();
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
let state = "Menu";
let gridType = "Normal";

let deltaTime = 0;      // temps RÉEL écoulé entre deux images (s) : affichage / accumulateur uniquement
let lastFrameTime = null;
let accumulator = 0;    // temps réel (s) en attente d'être converti en ticks de simulation
let simTime = 0;        // temps SIMULÉ total écoulé (s)

let FPS = 0;
let fpsFrames = 0;
let fpsTimer = 0;

// Menu
let selectedOption = 0;
let options = ["Play","How to play","Credits"];
let lastPress = performance.now();

// Game
let hoverSize = 5; // by cell
let hoverX = mouseX;
let hoverY = mouseY;
let hoverGridX = 0;
let hoverGridY = 0;
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

function getThermalMass(cell) {
    const density = cell.thermalDensity ?? cell.density;

    if (!Number.isFinite(density) || density <= 0) return 0;

    const volume = CELL_SIZE_METERS ** 3;

    return density * volume;
}

function getThermalCapacity(cell) {
    const mass = getThermalMass(cell);

    if (
        mass <= 0 ||
        !Number.isFinite(cell.heatCapacity) ||
        cell.heatCapacity <= 0
    ) {
        return 0;
    }

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

// Calcule la zone survolée par la souris (en cellules et en pixels).
// Séparé de drawGame : handleGameInput en dépend, et l'ordre d'appel ne doit plus
// dépendre du dessin.
function updateHover() {
    hoverGridX = max(0, min(
        Math.floor((mouseX - GAME_OFFSET_X) / CELL_SIZE),
        GRID_WIDTH - hoverSize
    ));

    hoverGridY = max(0, min(
        Math.floor((mouseY - GAME_OFFSET_Y) / CELL_SIZE),
        GRID_HEIGHT - hoverSize
    ));

    hoverX = GAME_OFFSET_X + hoverGridX * CELL_SIZE;
    hoverY = GAME_OFFSET_Y + hoverGridY * CELL_SIZE;
}

function drawGame(gridType) {
    fillRect(ctx, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, ThemeColors["font"]);
    fillRect(ctx, GAME_OFFSET_X, GAME_OFFSET_Y, GAME_WIDTH, GAME_HEIGHT, [0, 0, 0]);

    for (let y = 0; y < GRID_HEIGHT; y++) {
        const row = GRID[y];

        for (let x = 0; x < GRID_WIDTH; x++) {
            const current = row[x];
            // if (current.type === "air") continue;

            let cellColor = [0, 0, 0];
            if (gridType === "Normal") {
                 cellColor = CellsColors[current.type] ?? [0, 0, 0];
            }
            else if (gridType === "Temperature") {
                const temp = current.temperature;
                const minTemp = 20;
                const maxTemp = 500;

                // Racine carrée : les petits écarts restent visibles
                const t = Math.sqrt(
                    Math.min(1, Math.max(0, (temp - minTemp) / (maxTemp - minTemp)))
                );

                // Niveau de gris de 10 (froid) à 255 (chaud) sur les 3 canaux.
                // Le Math.floor doit envelopper tout le produit : floor(t) vaut toujours 0 sauf à t = 1.
                const level = 10 + Math.floor(245 * t);

                cellColor = [level, level, level];
            }

            const cellX = GAME_OFFSET_X + x * CELL_SIZE;
            const cellY = GAME_OFFSET_Y + y * CELL_SIZE;

            fillRect(ctx, cellX, cellY, CELL_SIZE, CELL_SIZE, cellColor);
        }
    }

    const hoverSelection = GRID[hoverGridY][hoverGridX];

    drawRect(ctx, hoverX, hoverY, hoverSize * CELL_SIZE, hoverSize * CELL_SIZE, [255, 255, 255]);

    drawText(ctx, hoverSelection.type.toString(), GAME_OFFSET_X + 4, GAME_OFFSET_Y + 30, 13, ThemeColors["text"]);
    drawText(ctx, hoverSelection.temperature.toFixed(1) + "°C", GAME_OFFSET_X + 4, GAME_OFFSET_Y + 47, 13, ThemeColors["text"]);

    drawText(ctx, "Fps: " + FPS.toString(), GAME_OFFSET_X + 4, GAME_OFFSET_Y + 13, 13, ThemeColors["text"]);
    drawText(ctx, "t = " + simTime.toFixed(1) + " s (x" + TIME_SCALE + ")", GAME_OFFSET_X + 4, GAME_OFFSET_Y + 64, 13, ThemeColors["text"]);
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

    // Rangée de chiffres : touches physiques 1 à 4 (sur AZERTY : & é " ')
    if (keys['Digit1']) hoverCell = MATERIALS["water"];
    if (keys['Digit2']) hoverCell = MATERIALS["sand"];
    if (keys['Digit3']) hoverCell = MATERIALS["wall"];
    if (keys['Digit4']) hoverCell = MATERIALS["uranium"];

    // Vues : N / pavé numérique 1 = normale, T / pavé numérique 2 = température
    // (avant : "1" et "2", qui exigent Shift sur AZERTY)
    if (keys['KeyN'] || keys['Numpad1']) gridType = "Normal";
    if (keys['KeyT'] || keys['Numpad2']) gridType = "Temperature";
}

// Sens de balayage des colonnes, inversé à chaque tick
let MATTER_SCAN_LEFT_TO_RIGHT = true;

function clearMatterBuffer() {
    for (const row of MATTER_MOVED) {
        row.fill(0);
    }
}

function isInsideGrid(x, y) {
    return x >= 0 && x < GRID_WIDTH &&
           y >= 0 && y < GRID_HEIGHT;
}

// Une cellule peut recevoir un déplacement seulement si elle existe
// et n'a pas déjà bougé pendant ce tick
function canMoveInto(x, y) {
    return isInsideGrid(x, y) && MATTER_MOVED[y][x] === 0;
}

// Échange deux cellules : aucune cellule n'est créée ni perdue.
// Seule la destination de la cellule active est marquée :
// la cellule déplacée passivement reste disponible pour les autres.
function swapCells(x1, y1, x2, y2) {
    const temp = GRID[y1][x1];

    GRID[y1][x1] = GRID[y2][x2];
    GRID[y2][x2] = temp;

    MATTER_MOVED[y2][x2] = 1;
}

// Chute (poudres et liquides), puis étalement latéral (liquides)
function trySettle(x, y, current) {
    // Ordre des diagonales tiré au hasard pour supprimer le biais gauche/droite
    const firstDiagonal = Math.random() < 0.5 ? -1 : 1;

    // Bas, puis première diagonale, puis seconde diagonale
    for (let i = 0; i < 3; i++) {
        let dx = 0;

        if (i === 1) dx = firstDiagonal;
        else if (i === 2) dx = -firstDiagonal;

        const targetX = x + dx;
        const targetY = y + 1;

        if (!canMoveInto(targetX, targetY)) continue;

        if (current.density > GRID[targetY][targetX].density) {
            swapCells(x, y, targetX, targetY);
            return true;
        }
    }

    if (current.state !== "liquid") return false;

    const n = Math.random();
    let dx = 0;

    if (n < 0.33) dx = -1;
    else if (n > 0.66) dx = 1;
    else return false;

    const targetX = x + dx;

    if (!canMoveInto(targetX, y)) return false;

    if (current.density > GRID[y][targetX].density) {
        swapCells(x, y, targetX, y);
        return true;
    }

    return false;
}

// Convection : un fluide chaud monte en échangeant sa place
// avec le même fluide plus froid (au-dessus ou en diagonale haute)
function tryConvection(x, y, current) {
    const targetY = y - 1;

    // Tout droit d'abord, puis les deux diagonales dans un ordre aléatoire
    // (évite un biais gauche/droite)
    const firstSide = Math.random() < 0.5 ? -1 : 1;
    const offsets = [0, firstSide, -firstSide];

    for (const dx of offsets) {
        const targetX = x + dx;

        if (!canMoveInto(targetX, targetY)) continue;

        const other = GRID[targetY][targetX];

        if (other.type !== current.type || other.state !== current.state) continue;

        if (current.temperature > other.temperature) {
            swapCells(x, y, targetX, targetY);
            return true;
        }
    }

    return false;
}

// Un tick de matière = 1 déplacement maximum par cellule.
// Approximation (corrigée à l'étape D/F) : la mécanique est cadencée en ticks (60/s réelles)
// et non en secondes simulées. Elle utilise donc le même nombre de ticks que le thermique,
// mais sans vitesse ni accélération physiques.
function simulateMatter() {
    clearMatterBuffer();

    for (let y = GRID_HEIGHT - 1; y >= 0; y--) {
        for (let i = 0; i < GRID_WIDTH; i++) {

            const x = MATTER_SCAN_LEFT_TO_RIGHT
                ? i
                : GRID_WIDTH - 1 - i;

            if (MATTER_MOVED[y][x] === 1) continue;

            const current = GRID[y][x];

            if (current.state === "powder" || current.state === "liquid") {
                if (trySettle(x, y, current)) continue;
            }

            if (current.state === "gas" || current.state === "liquid") {
                tryConvection(x, y, current);
            }
        }
    }

    MATTER_SCAN_LEFT_TO_RIGHT = !MATTER_SCAN_LEFT_TO_RIGHT;
}

// Avance la thermique de SIM_DT secondes simulées (un tick), en sous-étapes si nécessaire
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
            SIM_DT * maxRate / THERMAL_SAFETY_FACTOR
        )
    );

    // Durée simulée d'une sous-étape (s). Nommé subDt pour ne pas masquer
    // le deltaTime global (temps réel entre deux images).
    const subDt = SIM_DT / substeps;

    // 4. Simulation des échanges thermiques
    for (let step = 0; step < substeps; step++) {
        simulateHeatGeneration(subDt);

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
                        subDt;

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

function simulateHeatGeneration(dt) {

    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {

            const current = GRID[y][x];

            const heatGeneration = current.heatGeneration ?? 0;

            if (heatGeneration <= 0) continue;

            const mass = getThermalMass(current);

            const generatedEnergy =
                heatGeneration * mass * dt;

            ENERGY_BUFFER[y][x] += generatedEnergy;
        }
    }
}

// Un tick complet de simulation : matière puis thermique, avancée de SIM_DT secondes simulées
function simulateStep() {
    simulateMatter();
    simulateThermal();
    simTime += SIM_DT;
}

// Convertit le temps réel écoulé en un nombre entier de ticks de durée fixe.
// Retourne le nombre de ticks exécutés.
function runFixedSteps() {
    // Une image anormalement longue (onglet en arrière-plan, gel du navigateur)
    // ne doit pas déclencher un énorme rattrapage.
    accumulator += min(deltaTime, MAX_FRAME_TIME);

    let steps = 0;

    while (accumulator >= TICK_REAL && steps < MAX_STEPS_PER_FRAME) {
        simulateStep();
        accumulator -= TICK_REAL;
        steps++;
    }

    // Plafond atteint : on garde seulement la fraction de tick restante,
    // le retard est abandonné (le jeu ralentit au lieu de geler).
    if (accumulator >= TICK_REAL) accumulator %= TICK_REAL;

    return steps;
}

function gameLoop(now) {
    // now = horodatage (ms) fourni par requestAnimationFrame
    if (lastFrameTime === null) lastFrameTime = now;

    // Temps RÉEL entre deux images (s). Ne sert ni à la physique ni au temps simulé.
    deltaTime = (now - lastFrameTime) * 0.001;
    lastFrameTime = now;

    // FPS réel, moyenné sur 0,5 s
    fpsFrames++;
    fpsTimer += deltaTime;
    if (fpsTimer >= 0.5) {
        FPS = Math.round(fpsFrames / fpsTimer);
        fpsFrames = 0;
        fpsTimer = 0;
    }

    if (state === "Menu") {
        accumulator = 0;
        drawMenu(selectedOption, options);

        if (keys['ArrowUp'] && now - lastPress > 150) {
            selectedOption--;
            lastPress = now;

        } else if (keys['ArrowDown'] && now - lastPress > 150) {
            selectedOption++;
            lastPress = now;

        } else if ((keys['Enter'] || keys['NumpadEnter']) && now - lastPress > 150) {
            state = options[selectedOption];
            lastPress = now;
        }

        selectedOption = max(0, min(options.length - 1, selectedOption));
    }

    else if (state === "How to play") {
        accumulator = 0;
        drawHowToPlay();

        if ((keys['Enter'] || keys['NumpadEnter']) && now - lastPress > 150) {
            state = "Menu";
            lastPress = now;
        }
    }

    else if (state === "Credits") {
        accumulator = 0;
        drawCredits();

        if ((keys['Enter'] || keys['NumpadEnter']) && now - lastPress > 150) {
            state = "Menu";
            lastPress = now;
        }
    }

    else if (state === "Play") {
        updateHover();

        handleGameInput();

        runFixedSteps();

        drawGame(gridType);
    }

    if (running) {
        requestAnimationFrame(gameLoop);
    }

    loops++;
}

requestAnimationFrame(gameLoop);
