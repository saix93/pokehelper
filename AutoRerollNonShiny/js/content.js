// ==UserScript==
// @name         Pokelike Shiny Helper (Stable)
// @namespace    pokelike
// @version      1.6
// @match        https://pokelike.xyz/*
// @grant        none
// ==/UserScript==

(function () {

    console.log("Helper loaded");

    // -------------------------
    // STATE
    // -------------------------
    let state = {
        enabled: true,
        rerolls: 0,
        shinyFound: false,
        targets: [],
        sleepMs: 150,
        muted: false,
        volume: 0.5,
        shinyOnly: true,
        pokemonList: []
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
            return Array.from(document.querySelector("#catch-screen")?.querySelectorAll(".poke-card") || []);
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
            if (hasTargets && state.shinyOnly)  return shiny && matchesTarget;
            if (hasTargets && !state.shinyOnly) return matchesTarget;
            if (!hasTargets && state.shinyOnly) return shiny;
            return false;
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

     build(root) {
        ui.panel = document.createElement("div");
        ui.panel.id = "sh-panel";
        
    
        
        ui.panel.style.zIndex = "99999";
        ui.panel.style.overflow = "visible";
        
        ui.panel.innerHTML = templates.panel();
        
        root.appendChild(ui.panel);  // Only append once, not to body
        
        ui.els = {
            input:       ui.panel.querySelector("#sh-target"),
            add:         ui.panel.querySelector("#sh-add"),
            tagList:     ui.panel.querySelector("#sh-tag-list"),
            toggle:      ui.panel.querySelector("#sh-toggle"),
            clear:       ui.panel.querySelector("#sh-clear"),
            mute:        ui.panel.querySelector("#sh-mute"),
            rerolls:     ui.panel.querySelector("#sh-rerolls"),
            state:       ui.panel.querySelector("#sh-state"),
            shinyToggle: ui.panel.querySelector("#sh-shiny-toggle"),
            delay:       ui.panel.querySelector("#sh-delay"),
        };
    
        ui.bindEvents();
    },

        showPreview(name) {
            ui.hidePreview();
            const preview = document.createElement("div");
            preview.id = "sh-preview";
            preview.innerHTML = templates.preview();
            document.body.appendChild(preview);

            const panelRect = ui.panel.getBoundingClientRect();
            preview.style.top  = `${panelRect.top}px`;
            preview.style.left = `${panelRect.left - preview.offsetWidth - 10}px`;

            PokeAPI.getPokemon(name).then(p => {
                const img    = document.getElementById("sh-preview-sprite");
                const nameEl = document.getElementById("sh-preview-name");
                if (img)    img.src = p.sprites.front_default;
                if (nameEl) nameEl.textContent = p.name;
                preview.style.left = `${panelRect.left - preview.offsetWidth - 10}px`;
            }).catch(() => {});
            PokeAPI.getPokemonEvolutions(name).then(evos => {
                const evosEl = document.getElementById("sh-preview-evos");
                if (evosEl) evosEl.innerHTML = evos
                    .map(e => `<div>${"→ ".repeat(e.stage - 1)}${e.name}</div>`)
                    .join("");
            }).catch(() => {});
        },

        hidePreview() {
            document.getElementById("sh-preview")?.remove();
        },

        showDropdown(matches) {
            ui.hideDropdown();
            if (!matches.length) return;

            const dd = document.createElement("div");
            dd.id = "sh-dropdown";

            matches.forEach(name => {
                const item = document.createElement("div");
                item.className = "sh-dropdown-item";
                item.textContent = name;
                item.addEventListener("mouseover", () => ui.showPreview(name));
                item.addEventListener("mouseout",  () => {});
                item.addEventListener("mousedown", () => ui.addTarget(name));
                dd.appendChild(item);
            });

            const inputRow = ui.els.input.parentElement;
            inputRow.appendChild(dd);
        },

        hideDropdown() {
            document.getElementById("sh-dropdown")?.remove();
        },

        bindEvents() {
            const { input, add, toggle, clear, mute, delay } = ui.els;
            const star = ui.panel.querySelector("#sh-shiny-star");

            ui.els.shinyToggle.addEventListener("change", () => {
                state.shinyOnly = ui.els.shinyToggle.checked;
                star.style.opacity = state.shinyOnly ? "1" : "0.3";
            });

            star.addEventListener("click", () => ui.els.shinyToggle.click());

            ["keydown", "keyup", "keypress"].forEach(ev =>
                input.addEventListener(ev, e => e.stopPropagation())
            );

            input.addEventListener("blur", () => {
                setTimeout(() => {
                    ui.hideDropdown();
                    ui.hidePreview();
                }, 150);
            });

            input.addEventListener("input", () => {
                const val = input.value.trim().toLowerCase();
                if (!val || val.length < 2) { ui.hideDropdown(); return; }
                const matches = state.pokemonList.filter(n => n.startsWith(val)).slice(0, 6);
                ui.showDropdown(matches);
            });

            input.addEventListener("keydown", e => {
                if (e.key === "Enter") ui.addTarget();
            });

            delay.addEventListener("keydown", e => {
                if (e.key === "Enter") ui.updateDelay();
            });

            add.addEventListener("click",   () => ui.addTarget());
            toggle.addEventListener("click", () => toggleEnabled());

            clear.addEventListener("click", () => {
                state.targets = [];
                state.shinyFound = false;
                ui.renderTags();
                ui.setState("Running", "#4ecca3");
                TypeChecker.reset();
            });

            mute.addEventListener("click", () => {
                state.muted = !state.muted;
                mute.textContent = state.muted ? "🔇" : "🔊";
            });

            delay.value = state.sleepMs;

           const typeToggle = ui.panel.querySelector("#sh-type-toggle");

            typeToggle.addEventListener("click", () => {
            const typePanel = document.getElementById("tc-panel");
            if (typePanel) {
                // Check current display state
                const isHidden = typePanel.style.display === "none";
                
                if (isHidden) {
                    // Show the panel
                    typePanel.style.display = "block";  // Use "block", not "flex"
                    // Reposition it below Shiny Helper
                    positionTypeChecker();
                } else {
                    // Hide the panel
                    typePanel.style.display = "none";
                }
            }
        });
        },

        async addTarget(rawName) {
            const name = (rawName || ui.els.input.value.trim()).toLowerCase();
            if (!name) return;
            ui.els.input.value = "";
            ui.hideDropdown();
            ui.hidePreview();

            const evos  = await PokeAPI.getPokemonEvolutions(name).catch(() => null);
            const names = evos ? evos.map(e => e.name) : [name];

            names.forEach(n => {
                if (!state.targets.map(t => t.toLowerCase()).includes(n)) {
                    state.targets.push(n);
                }
            });

            ui.renderTags();
        },

        updateDelay() {
            const val = parseInt(ui.els.delay.value.trim());
            if (!val || isNaN(val)) return;
            state.sleepMs = val;
        },

        removeTarget(name) {
            state.targets = state.targets.filter(t => t !== name);
            ui.renderTags();
        },

        renderTags() {
            const list = ui.els.tagList;
            list.innerHTML = "";

            state.targets.forEach(name => {
                const tag = document.createElement("div");
                tag.className = "sh-tag";
                tag.innerHTML = templates.tag(name);
                tag.querySelector(".sh-tag-remove").addEventListener("click", () => ui.removeTarget(name));
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

    // -------------------------
    // TOGGLE
    // -------------------------
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
// DRAGGABLE - Single container
// -------------------------
// -------------------------
// DRAGGABLE - Entire container
// -------------------------
function makeContainerDraggable(container) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    
    // Make the entire container draggable
    container.style.cursor = "grab";
    container.style.userSelect = "none";
    
    container.addEventListener("mousedown", startDrag);
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
    
    function startDrag(e) {
        // Don't drag if clicking on interactive elements
        if (e.target.closest('button') || 
            e.target.closest('input') || 
            e.target.closest('select') ||
            e.target.closest('.tc-type-tile') ||
            e.target.closest('.sh-tag-remove')) {
            return;
        }
        
        dragging = true;
        const rect = container.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        
        container.style.cursor = "grabbing";
        e.preventDefault();
    }
    
    function onDrag(e) {
        if (!dragging) return;
        
        let newLeft = e.clientX - offsetX;
        let newTop = e.clientY - offsetY;
        
        // Keep within viewport bounds
        const rect = container.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;
        
        newLeft = Math.max(0, Math.min(newLeft, maxX));
        newTop = Math.max(0, Math.min(newTop, maxY));
        
        container.style.position = "fixed";
        container.style.left = `${newLeft}px`;
        container.style.top = `${newTop}px`;
        container.style.margin = "0";
    }
    
    function stopDrag() {
        dragging = false;
        container.style.cursor = "grab";
    }
}
// -------------------------
// INIT
// -------------------------
(async () => {
    // Create root container (just a holding div, not draggable)
    const root = document.createElement("div");
    root.id = "helper-root";
    document.body.appendChild(root);

    // Build both panels inside root
    ui.build(root);
    TypeChecker.build(root);
    
    // AFTER building, position TypeChecker below Shiny Helper
    positionTypeChecker();
    
    // Make ONLY Shiny Helper draggable
    makeShinyDraggable();
    
    await PokeAPI.preloadTypeIcons();
    state.pokemonList = await PokeAPI.getAllPokemonNames();

    log("Pokémon list loaded:", state.pokemonList.length);
    loop();
})();

// -------------------------
// Position TypeChecker below Shiny Helper
// -------------------------
function positionTypeChecker() {
    const shinyPanel = document.getElementById("sh-panel");
    const typePanel = document.getElementById("tc-panel");
    
    if (!shinyPanel || !typePanel) return;
    
    const shinyRect = shinyPanel.getBoundingClientRect();
    
    typePanel.style.position = "fixed";
    typePanel.style.left = `${shinyRect.left}px`;
    typePanel.style.top = `${shinyRect.bottom + 8}px`;  // 8px gap
}

// -------------------------
// Make ONLY Shiny Helper draggable (TypeChecker follows)
// -------------------------
function makeShinyDraggable() {
    const shinyPanel = document.getElementById("sh-panel");
    if (!shinyPanel) return;
    
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    
    shinyPanel.addEventListener("mousedown", startDrag);
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
    
    function startDrag(e) {
        if (e.target.closest('button') || 
            e.target.closest('input') || 
            e.target.closest('select') ||
            e.target.closest('.sh-tag-remove')) {
            return;
        }
        
        dragging = true;
        const rect = shinyPanel.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        
        shinyPanel.style.cursor = "grabbing";
        e.preventDefault();
    }
    
    function onDrag(e) {
        if (!dragging) return;
        
        let newLeft = e.clientX - offsetX;
        let newTop = e.clientY - offsetY;
        
        // Keep within viewport
        const rect = shinyPanel.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;
        
        newLeft = Math.max(0, Math.min(newLeft, maxX));
        newTop = Math.max(0, Math.min(newTop, maxY));
        
        // Move Shiny Helper
        shinyPanel.style.left = `${newLeft}px`;
        shinyPanel.style.top = `${newTop}px`;
        
        // Move Type Checker to follow (below Shiny Helper)
        const typePanel = document.getElementById("tc-panel");
        if (typePanel) {
            typePanel.style.left = `${newLeft}px`;
            typePanel.style.top = `${newTop + rect.height + 8}px`;
        }
    }
    
    function stopDrag() {
        dragging = false;
        shinyPanel.style.cursor = "grab";
    }
}
})();