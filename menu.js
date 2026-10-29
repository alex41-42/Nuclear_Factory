function drawMenu(selectedOption = 0, options = ["Play","How to play","Quit"]) {
    fillRect(ctx, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, ThemeColors["font"]);
    drawText(ctx, "Nuclear Factory", SCREEN_WIDTH * 0.5, SCREEN_HEIGHT * 0.1, 32, ThemeColors["title"], 1, true);

    const gap = 48;
    const yStart = SCREEN_HEIGHT * 0.2;
    const maxWidth = Math.max(...options.map(option => {return ctx.measureText(option).width}));
    const textX = (SCREEN_WIDTH - maxWidth) * 0.5;
    options.forEach((label, index) => {
        const y = yStart + index * gap;
        const textSize = index === selectedOption ? 28 : 24;
        const textY = y + textSize * 0.5;
        const text = index === selectedOption ? "> " + label : label;
        const color = index === selectedOption ? ThemeColors["sel_text"] : ThemeColors["text"];
        drawText(ctx, text, textX, textY, textSize, color);
    });
}

function drawHowToPlay() {
    fillRect(ctx, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, ThemeColors["font"]);
    drawText(ctx, "Nuclear Factory", SCREEN_WIDTH * 0.5, SCREEN_HEIGHT * 0.1, 32, ThemeColors["title"], 1, true);
    
    drawText(ctx, "Press [Enter] to return to the Menu", SCREEN_WIDTH * 0.5, SCREEN_HEIGHT * 0.9, 18, ThemeColors["text"], 1, true);
}

function drawCredits() {
    fillRect(ctx, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, ThemeColors["font"]);
    drawText(ctx, "Nuclear Factory", SCREEN_WIDTH * 0.5, SCREEN_HEIGHT * 0.1, 32, ThemeColors["title"], 1, true);
    
    drawText(ctx, "Press [Enter] to return to the Menu", SCREEN_WIDTH * 0.5, SCREEN_HEIGHT * 0.9, 18, ThemeColors["text"], 1, true);
    
}