// Tests des étapes A et B. Lancer avec : node tests_AB.js
// Aucun navigateur requis : le DOM et le canvas sont simulés.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let failures = 0;
function check(name, ok, detail = "") {
    console.log((ok ? "OK   " : "ECHEC") + " " + name + (detail ? "  (" + detail + ")" : ""));
    if (!ok) failures++;
}

// Environnement simulé : un "navigateur" minimal pour chaque scénario
function makeEnv() {
    const listeners = {};
    const fills = [];            // couleurs des fillRect, pour tester la vue température
    let clock = 0;
    let rafCallback = null;

    const ctx = {
        fillStyle: "", strokeStyle: "", lineWidth: 1, font: "",
        fillRect(x, y, w, h) { fills.push(this.fillStyle); },
        strokeRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
        fillText() {}, measureText: () => ({ width: 10 }),
    };
    const canvas = { getContext: () => ctx, addEventListener() {}, width: 0, height: 0 };
    const add = (type, fn) => { (listeners[type] ??= []).push(fn); };

    const sandbox = {
        document: { getElementById: () => canvas, addEventListener: add, hidden: false },
        window: { innerWidth: 1280, innerHeight: 720, addEventListener: add },
        performance: { now: () => clock },
        requestAnimationFrame: (fn) => { rafCallback = fn; },
        Math, console, Infinity,
    };
    vm.createContext(sandbox);
    for (const f of ["draw.js", "menu.js", "materials_index.js", "main.js"]) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, f), "utf8"), sandbox, { filename: f });
    }
    const get = (expr) => vm.runInContext(expr, sandbox);
    const run = (code) => vm.runInContext(code, sandbox);
    const fire = (type, ev) => (listeners[type] || []).forEach((fn) => fn(ev));

    // Avance le "navigateur" de dtMs et exécute une image
    function frame(dtMs) {
        clock += dtMs;
        const cb = rafCallback;
        cb(clock);
    }
    return { get, run, fire, frame, fills, ctx };
}

// --- Test 1 : PI défini (étape A) ---------------------------------------
{
    const env = makeEnv();
    check("PI défini", env.get("PI") === Math.PI);
    let ok = true;
    try { env.run("fillCircle(ctx, 5, 5, 3, [1,2,3]); drawCircle(ctx, 5, 5, 3, [1,2,3]);"); } catch (e) { ok = false; }
    check("fillCircle / drawCircle ne plantent plus", ok);
}

// --- Test 2 : mixColors (étape A) ---------------------------------------
{
    const env = makeEnv();
    const r = env.get("mixColors([0,0,200],[100,100,0])");
    check("mixColors mélange bien R, G et B", r[0] === 50 && r[1] === 50 && r[2] === 100, JSON.stringify(r));
}

// --- Test 3 : vue température en niveaux de gris (étape A) --------------
{
    const env = makeEnv();
    env.run('state = "Play"; GRID[3][3].temperature = 260;');   // milieu de la plage
    env.run('GRID[3][4].temperature = 500;');                    // maximum
    env.frame(16.67);
    env.run('gridType = "Temperature"');
    env.fills.length = 0;
    env.frame(16.67);
    const colors = new Set(env.fills);
    const hasMid = [...colors].some((c) => /rgba\((\d+),\1,\1,1\)/.test(c) && !/rgba\((10|255),/.test(c));
    check("vue Température : niveaux de gris intermédiaires (R=G=B)", hasMid, [...colors].slice(0, 5).join(" "));
}

// --- Test 4 : touches AZERTY et perte de focus (étape A) ----------------
{
    const env = makeEnv();
    env.fire("keydown", { code: "Digit1", key: "1" });   // AZERTY + Shift => key "1"
    env.fire("keyup", { code: "Digit1", key: "&" });     // Shift relâché => key "&"
    check("touche relâchée avec une autre valeur de e.key : plus bloquée", env.get("keys['Digit1']") === false);

    env.fire("keydown", { code: "KeyT", key: "t" });
    env.fire("mousedown", { button: 0 });
    env.fire("blur", {});
    check("blur remet les touches à zéro", env.get("keys['KeyT']") === false);
    check("blur remet la souris à zéro", env.get("leftClick") === false);
}

// --- Test 5 : temps simulé indépendant du FPS (étape B) -----------------
function simulateSeconds(hz, realSeconds) {
    const env = makeEnv();
    env.run('state = "Play"');
    const dt = 1000 / hz;
    const n = Math.round(realSeconds * hz);
    for (let i = 0; i < n; i++) env.frame(dt);
    return { simTime: env.get("simTime"), env, fps: env.get("FPS") };
}
{
    const expected = 10 * 10; // 10 s réelles x TIME_SCALE 10
    for (const hz of [30, 60, 144, 240]) {
        const { simTime, fps } = simulateSeconds(hz, 10);
        check(`${hz} Hz : ~${expected} s simulées en 10 s réelles`,
            Math.abs(simTime - expected) <= 0.5, `simTime=${simTime.toFixed(2)} s, FPS affiché=${fps}`);
    }
}

// --- Test 6 : FPS affiché = FPS réel ------------------------------------
{
    const { fps } = simulateSeconds(144, 3);
    check("FPS affiché proche de 144", Math.abs(fps - 144) <= 2, "FPS=" + fps);
}

// --- Test 7 : pic de lag borné (étape B) --------------------------------
{
    const env = makeEnv();
    env.run('state = "Play"');
    for (let i = 0; i < 10; i++) env.frame(16.67);
    const before = env.get("simTime");
    env.frame(5000);   // l'onglet gèle 5 s
    const jump = env.get("simTime") - before;
    const maxJump = 5 * env.get("SIM_DT");
    check("gel de 5 s : au plus 5 ticks rattrapés", jump <= maxJump + 1e-9, `saut=${jump.toFixed(3)} s simulées (max ${maxJump.toFixed(3)})`);
    const acc = env.get("accumulator");
    check("retard abandonné après un gel (accumulateur < 1 tick)", acc < env.get("TICK_REAL"), "accumulator=" + acc.toFixed(5));
    env.frame(16.67);
    const normal = env.get("simTime") - before - jump;
    check("la simulation reprend normalement après le gel", normal <= env.get("SIM_DT") * 2 + 1e-9);
}

// --- Test 8 : retour au menu ne fait pas exploser l'accumulateur --------
{
    const env = makeEnv();
    env.run('state = "Menu"');
    for (let i = 0; i < 100; i++) env.frame(16.67);
    env.run('state = "Play"');
    const before = env.get("simTime");
    env.frame(16.67);
    check("entrée dans Play : pas de rafale de ticks", env.get("simTime") - before <= env.get("SIM_DT") * 2 + 1e-9);
}

// --- Test 9 : conservation de la matière et énergie thermique -----------
{
    const env = makeEnv();
    env.run(`
        state = "Play";
        for (let x = 20; x < 40; x++) for (let y = 30; y < 40; y++) GRID[y][x] = {...MATERIALS["water"]};
        for (let x = 45; x < 55; x++) for (let y = 5; y < 10; y++) GRID[y][x] = {...MATERIALS["sand"]};
        for (let x = 60; x < 65; x++) for (let y = 5; y < 8; y++) GRID[y][x] = {...MATERIALS["uranium"]};
    `);
    const count = () => JSON.parse(env.get(`JSON.stringify((() => {
        const c = {}; for (const row of GRID) for (const cell of row) c[cell.type] = (c[cell.type] || 0) + 1;
        return c; })())`));
    const before = count();
    const refs = () => env.get("new Set(GRID.flat()).size");
    for (let i = 0; i < 600; i++) env.frame(16.67);
    const after = count();
    // Comparaison indépendante de l'ordre des clés (l'ordre d'apparition des types change quand la matière bouge)
    const norm = (o) => JSON.stringify(Object.entries(o).sort());
    check("matière conservée (nombre de cellules par type)", norm(before) === norm(after), JSON.stringify(after));
    check("aucune cellule dupliquée (objets tous distincts)", refs() === 54 * 96);
    const ok = env.get("GRID.flat().every(c => Number.isFinite(c.temperature))");
    check("températures toutes finies", ok);
}

// --- Test 10 : énergie thermique, bilan avec production (étape B/C) -----
{
    const env = makeEnv();
    env.run(`
        state = "Play";
        for (let x = 10; x < 20; x++) for (let y = 10; y < 20; y++) GRID[y][x] = {...MATERIALS["wall"]};
        for (let x = 12; x < 17; x++) for (let y = 12; y < 17; y++) GRID[y][x] = {...MATERIALS["uranium"]};
        // On fige la matière pour ne mesurer que la thermique
        simulateMatter = () => {};
        window.__E = () => { let e = 0; for (const row of GRID) for (const c of row) e += getThermalCapacity(c) * c.temperature; return e; };
    `);
    const E = () => env.get("(() => { let e = 0; for (const row of GRID) for (const c of row) e += getThermalCapacity(c) * c.temperature; return e; })()");
    const P = env.get("25 * getThermalMass(MATERIALS['uranium']) * MATERIALS['uranium'].heatGeneration");
    const E0 = E(), t0 = env.get("simTime");
    for (let i = 0; i < 600; i++) env.frame(16.67);
    const dE = E() - E0;
    const produced = P * (env.get("simTime") - t0);
    const err = Math.abs(dE - produced) / produced;
    check("bilan énergétique : dE = énergie produite (bords adiabatiques)", err < 1e-6,
        `dE=${dE.toExponential(4)} J, produite=${produced.toExponential(4)} J, erreur relative=${err.toExponential(2)}`);
}

// --- Test 11 : nombre de sous-étapes thermiques avec SIM_DT -------------
{
    const env = makeEnv();
    env.run(`
        for (let y = 0; y < GRID_HEIGHT; y++) for (let x = 0; x < GRID_WIDTH; x++) GRID[y][x] = {...MATERIALS["uranium"]};
        GRID[5][5] = {...MATERIALS["air"]};
    `);
    const rate = env.get(`(() => {
        let g = 0;
        for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) g += getThermalConductance(GRID[5][5], GRID[5+dy][5+dx]);
        return g / getThermalCapacity(GRID[5][5]); })()`);
    const substeps = Math.ceil(env.get("SIM_DT") * rate / env.get("THERMAL_SAFETY_FACTOR"));
    check("pire cas (air entouré d'uranium) : sous-étapes calculées", substeps >= 1, `rate=${rate.toFixed(3)} 1/s, sous-étapes=${substeps}`);
}

console.log(failures === 0 ? "\nTous les tests passent." : `\n${failures} test(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
