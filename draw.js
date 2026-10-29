const colorCache = new Map();

function RGBtoHEX(col, A = 1) {
    const key = `${col[0]},${col[1]},${col[2]},${A}`;

    if (!colorCache.has(key)) {
        colorCache.set(key, `rgba(${col[0]},${col[1]},${col[2]},${A})`);
    }

    return colorCache.get(key);
}

function mixColors(col1,col2,c1=0.5,c2=0.5){
    return [Math.round(col1[0]*c1+col2[0]*c2),Math.round(col1[1]*c1+col2[1]*c2),Math.round(col1[0]*c1+col2[1]*c2)]
}

function fillRect(ctx, x, y, w, h, color, A = 1) {
    ctx.fillStyle = RGBtoHEX(color, A);
    ctx.fillRect(x, y, w, h);
}

function drawRect(ctx, x, y, w, h, color, A = 1, L = 1) {
    ctx.strokeStyle = RGBtoHEX(color, A);
    ctx.lineWidth = L;
    ctx.strokeRect(x, y, w, h);
}

function fillCircle(ctx, x, y, r, color, A = 1) {
    ctx.fillStyle = RGBtoHEX(color, A);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * PI);
    ctx.fill();
}

function drawCircle(ctx, x, y, r, color, A = 1, L = 1) {
    ctx.strokeStyle = RGBtoHEX(color, A);
    ctx.lineWidth = L;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * PI);
    ctx.stroke();
}

function drawText(ctx, text, x, y, s, color, A = 1, center=false, style="courier") {
    ctx.font = `${s}px ${style}`;
    ctx.fillStyle = RGBtoHEX(color, A);
    if (center) {
        ctx.fillText(text, x - ctx.measureText(text).width * 0.5, y);
    } else {
        ctx.fillText(text, x, y);
    }
}