// ==UserScript==
// @name         Pokelike Shiny Helper (Stable)
// @namespace    pokelike
// @version      1.5
// @match        https://pokelike.xyz/*
// @grant        none
// ==/UserScript==

(function () {

    console.log("[Helper] loaded");

    // -------------------------
    // STATE
    // -------------------------
    let state = {
        enabled: true,
        rerolls: 0,
        shinyFound: false,
        targets: [], // list of pokemon names to hunt
        sleepMs: 150,
        muted: false,
        volume: 0.5,
        shinyOnly : true
    };

    // -------------------------
    // UTILS
    // -------------------------
    const log = (...a) => console.log("[Helper]", ...a);
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function pressKey(key) {
        ["keydown", "keypress", "keyup"].forEach(type => {
            document.dispatchEvent(new KeyboardEvent(type, {
                key,
                code: `Key${key.toUpperCase()}`,
                keyCode: key.toUpperCase().charCodeAt(0),
                bubbles: true,
                cancelable: true
            }));
        });
    }

    function clickElement(el) {
        if (!el) return false;
        el.scrollIntoView({ block: "center" });
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        ["pointerdown", "mousedown", "mouseup", "click"].forEach(type => {
            el.dispatchEvent(new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y
            }));
        });
        return true;
    }

    function waitFor(conditionFn, timeout = 3000, interval = 80) {
        return new Promise((resolve) => {
            const start = Date.now();
            const check = () => {
                const result = conditionFn();
                if (result) return resolve(result);
                if (Date.now() - start > timeout) return resolve(null);
                setTimeout(check, interval);
            };
            check();
        });
    }

    // -------------------------
    // GAME
    // -------------------------
    const game = {
        isOnCatchScreen() {
            return document.querySelector("#catch-screen")?.classList.contains("active");
        },

        getCards() {
            return Array.from(document.querySelectorAll(".poke-card"));
        },

        isShiny(card) {
            return !!(
                card.querySelector(".shiny-badge") ||
                card.querySelector(".trait-preview-new-tag") ||
                card.querySelector("img.shiny") ||
                card.querySelector('img[src*="shiny"]') ||
                card.classList.contains("shiny") ||
                (card.innerHTML || "").toLowerCase().includes("shiny")
            );
        },

        isTargetPokemon(card) {
            if (!state.targets.length) return false;
            const text = (card.innerText || "").toLowerCase();
            return state.targets.some(t => text.includes(t.toLowerCase()));
        },

        matchedTarget(card) {
            const text = (card.innerText || "").toLowerCase();
            return state.targets.find(t => text.includes(t.toLowerCase())) || null;
        },

        isMatch(card) {
            const shiny = game.isShiny(card);
            const matchesTarget = game.isTargetPokemon(card);
            const hasTargets = state.targets.length > 0;

            if (hasTargets && state.shinyOnly) return shiny && matchesTarget;
            if (hasTargets && !state.shinyOnly) return matchesTarget;
            if (!hasTargets && state.shinyOnly) return shiny;
            return false; // no targets, shiny not required = nothing to hunt
        },

        getRerollButtons() {
            return Array.from(document.querySelectorAll(".reroll-btn")).filter(b => !b.disabled);
        },

        getPokeball() {
            return document.querySelector('image[href*="catchPokemon"]')
                || document.querySelector('image[xlink\\:href*="catchPokemon"]');
        },

        playAlert() {
            const audio = new Audio(chrome.runtime.getURL("jaja.ogg"));
            audio.play();
        }
    };

    // -------------------------
    // UI
    // -------------------------
    const ui = {
        panel: null,
        els: {},

        build() {
            ui.panel = document.createElement("div");
            ui.panel.style.cssText = `
                position: fixed;
                top: 12px;
                right: 12px;
                z-index: 99999;
                background: #1a1a2e;
                border: 2px solid #e94560;
                border-radius: 10px;
                padding: 12px 16px;
                font-family: monospace;
                font-size: 13px;
                color: #eee;
                min-width: 230px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                user-select: none;
            `;

            ui.panel.innerHTML = `
                <div style="font-weight:bold; font-size:14px; margin-bottom:10px; color:#e94560;">
                    ✨ Shiny Helper 
                </div>

                <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                    <button id="sh-toggle"
                        style="padding:5px 8px; border-radius:6px; border:none; cursor:pointer;
                            background:#e94560; color:#fff; font-weight:bold; font-size:13px;">
                        ⏸
                    </button>
                    <button id="sh-clear"
                        style="padding:5px 8px; border-radius:6px; border:none; cursor:pointer;
                            background:#333; color:#ccc; font-size:13px;">
                        🧹
                    </button>
                    <button id="sh-mute"
                        style="padding:5px 8px; border-radius:6px; border:none; cursor:pointer;
                            background:#333; color:#ccc; font-size:13px;">
                        🔊
                </div>

                <div style="margin-bottom:6px;">
                    <label style="font-size:11px; color:#aaa;">Target Pokémon</label>
                    <div style="display:flex; gap:4px; margin-top:4px; align-items:center;">
                        <input id="sh-shiny-toggle" type="checkbox" checked
                            style="width:14px; height:14px; accent-color:#e94560; cursor:pointer; flex-shrink:0;" />
                        <span id="sh-shiny-star" style="cursor:pointer; font-size:14px; line-height:1;">⭐</span>
                        <input id="sh-target" type="text" placeholder="e.g. Charizard"
                            style="flex:1; padding:5px 8px; border-radius:6px; border:1px solid #444;
                                background:#0f0f1a; color:#fff; font-family:monospace; font-size:13px;" />
                        <button id="sh-add"
                            style="padding:5px 10px; border-radius:6px; border:none; cursor:pointer;
                                background:#e94560; color:#fff; font-size:13px; font-weight:bold;">
                            +
                        </button>
                    </div>
                </div>

                <div id="sh-tag-list" style="display:flex; flex-direction:column; gap:4px; margin-bottom:8px;">
                </div>

                <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
                    <label style="font-size:10px; color:#aaa; white-space:nowrap;">ms</label>
                    <input id="sh-delay" type="number" placeholder="150" value="150"
                        style="width:60px; padding:3px 6px; border-radius:6px;
                            border:1px solid #444; background:#0f0f1a; color:#fff;
                            font-family:monospace; font-size:11px;" />
                </div>

                <div id="sh-status" style="font-size:11px; color:#aaa;">
                    Rerolls: <span id="sh-rerolls">0</span> &nbsp;|&nbsp;
                    <span id="sh-state" style="color:#4ecca3;">Running</span>
                </div>
            `;

            document.body.appendChild(ui.panel);

            ui.els = {
                input:   ui.panel.querySelector("#sh-target"),
                add:     ui.panel.querySelector("#sh-add"),
                tagList: ui.panel.querySelector("#sh-tag-list"),
                toggle:  ui.panel.querySelector("#sh-toggle"),
                clear:   ui.panel.querySelector("#sh-clear"),
                mute:    ui.panel.querySelector("#sh-mute"),            
                rerolls: ui.panel.querySelector("#sh-rerolls"),
                state:   ui.panel.querySelector("#sh-state"),
                shinyToggle: ui.panel.querySelector("#sh-shiny-toggle"),
                delay: ui.panel.querySelector("#sh-delay"),
            };

            ui.bindEvents();
        },

        bindEvents() {
            const { input, add, toggle, clear, mute, delay } = ui.els;

            const star = ui.panel.querySelector("#sh-shiny-star");
            ui.els.shinyToggle.addEventListener("change", () => {
                state.shinyOnly = ui.els.shinyToggle.checked;
                star.style.opacity = state.shinyOnly ? "1" : "0.3";
            });
            
            star.addEventListener("click", () => {
                ui.els.shinyToggle.click();
            });

            ["keydown", "keyup", "keypress"].forEach(ev =>
                input.addEventListener(ev, e => e.stopPropagation())
            );

            // Add on Enter
            input.addEventListener("keydown", e => {
                if (e.key === "Enter") ui.addTarget();
            });

            // Update delay on Enter
            delay.addEventListener("keydown", e => {
                if (e.key === "Enter") ui.updateDelay();
            });

            add.addEventListener("click", () => ui.addTarget());

            toggle.addEventListener("click", () => toggleEnabled());
            clear.addEventListener("click", () => {
                state.targets = [];
                ui.renderTags();
                ui.setState("Running", "#4ecca3");
            });

            mute.addEventListener("click", () => {
                state.muted = !state.muted;
                mute.textContent = state.muted ? "🔇" : "🔊";
            });

            delay.value = state.sleepMs;
        },

        addTarget() {
            const val = ui.els.input.value.trim();
            if (!val) return;
            if (state.targets.map(t => t.toLowerCase()).includes(val.toLowerCase())) {
                ui.els.input.value = "";
                return;
            }
            state.targets.push(val);
            ui.els.input.value = "";
            ui.renderTags();
        },

        updateDelay() {
            const val = ui.els.delay.value.trim();
            if (!val) return;

            state.sleepMs = val;
        },

        removeTarget(name) {
            state.targets = state.targets.filter(t => t !== name);
            ui.renderTags();
        },
        
        renderTags() {
            const list = ui.els.tagList;
            list.innerHTML = "";
            list.style.cssText = "display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px; align-items:flex-start; max-width:230px;";

            state.targets.forEach(name => {
                const tag = document.createElement("div");
                tag.style.cssText = `
                    display:flex; align-items:center; gap:4px;
                    background:#2a2a4a; border:1px solid #444;
                    border-radius:12px; padding:2px 8px;
                    font-size:11px; color:#eee;
                    width:fit-content;
                `;
                tag.innerHTML = `
                    <span>${name}</span>
                    <span style="cursor:pointer; color:#e94560; font-size:13px; line-height:1;">×</span>
                `;
                tag.querySelector("span:last-child").addEventListener("click", () => ui.removeTarget(name));
                list.appendChild(tag);
            });
        },

        setState(text, color) {
            ui.els.state.textContent = text;
            ui.els.state.style.color = color;
        },

        updateRerolls() {
            ui.els.rerolls.textContent = state.rerolls;
        },

        setFound(label) {
            ui.setState(`${label} FOUND!`, "gold");
        }
        
    };

    function toggleEnabled() {
        state.enabled = !state.enabled;
        if (state.enabled) state.shinyFound = false;
        ui.els.toggle.textContent = state.enabled ? "⏸" : "▶";
        ui.setState(state.enabled ? "Running" : "Paused", state.enabled ? "#4ecca3" : "#e94560");
        log(state.enabled ? "ON" : "OFF");
    }
    // -------------------------
    // CORE LOOP
    // -------------------------
    async function loop() {
        while (true) {
            if (!game.isOnCatchScreen()) {
                await sleep(300);
                continue;
            }

            if (!state.enabled || state.shinyFound) {
                await sleep(state.sleepMs);
                continue;
            }

            const cards = await waitFor(() => {
                const c = game.getCards();
                return c.length > 0 ? c : null;
            });

            if (!cards) {
                log("No cards found, retrying...");
                await sleep(state.sleepMs);
                continue;
            }

            // Match check
            for (const card of cards) {
                if (game.isMatch(card)) {
                    state.shinyFound = true;                         
                    card.style.outline = "4px solid gold";

                    const matched = game.matchedTarget(card);
                    const label = matched ? `🎯 ${matched} SHINY` : "✨ SHINY";
                    log(`${label} FOUND`);
                    ui.setFound(label);
                    game.playAlert();                
                    toggleEnabled();
                }
            }

            if (state.shinyFound) continue;

            log("Pressing R to reset...");
            pressKey("r");
            await sleep(state.sleepMs);

            // Reopen selector
            const ball = game.getPokeball();
            if (ball) {
                log("Opening selector...");
                clickElement(ball);
                await sleep(state.sleepMs);
            } else {
                log("No pokeball/opener found");
                await sleep(state.sleepMs);
            }
        }
    }

    // -------------------------
    // HOTKEYS
    // -------------------------
    window.addEventListener("keydown", (e) => {
        if (e.key === "F8") ui.els.toggle.click();
        if (e.key === "F9") {
            const ball = game.getPokeball();
            if (ball) clickElement(ball);
        }
    });

    // -------------------------
    // INIT
    // -------------------------
    ui.build();
    loop();

})();

