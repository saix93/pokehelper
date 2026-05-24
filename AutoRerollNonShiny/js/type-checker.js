const TypeChecker = (() => {

    let state = {
        panel: null,
        els: {}
    };

    let selected = [null, null];
    let activeSlot = null;

    function build(container) {
        state.panel = document.createElement("div");
        state.panel.id = "tc-panel";

        state.panel.innerHTML = `
            <div id="tc-wrapper" style="display: block;">
                ${typeCheckerTemplates.panel()}
            </div>
        `;

        // Visual styles only - no positioning
        state.panel.style.zIndex = "99998";
        state.panel.style.minWidth = "240px";
        state.panel.style.maxWidth = "320px";
        state.panel.style.background = "#1a1a2e";
        state.panel.style.border = "2px solid #4ecca3";
        state.panel.style.borderRadius = "10px";
        state.panel.style.color = "#eee";
        state.panel.style.fontFamily = "monospace";
        state.panel.style.fontSize = "13px";
        state.panel.style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.5)";

        container.appendChild(state.panel);

        // Initialize elements
        state.els = {
            slot1: state.panel.querySelector("#tc-slot-1"),
            slot2: state.panel.querySelector("#tc-slot-2"),
            mosaic: state.panel.querySelector("#tc-mosaic-container"),
            effective2: state.panel.querySelector("#tc-effective-2"),
            effective4: state.panel.querySelector("#tc-effective-4"),
            weak2: state.panel.querySelector("#tc-weak-2"),
            weak4: state.panel.querySelector("#tc-weak-4"),
            resistsHalf: state.panel.querySelector("#tc-resists-half"),
            resistsQuarter: state.panel.querySelector("#tc-resists-quarter"),
            immune: state.panel.querySelector("#tc-immune"),
        };

        // Make sure slot buttons are clickable
        if (state.els.slot1) {
            state.els.slot1.style.pointerEvents = "auto";
            state.els.slot1.style.cursor = "pointer";
            state.els.slot1.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleMosaic(0);
            });
        }
        
        if (state.els.slot2) {
            state.els.slot2.style.pointerEvents = "auto";
            state.els.slot2.style.cursor = "pointer";
            state.els.slot2.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleMosaic(1);
            });
        }

        if (state.els.mosaic) {
            state.els.mosaic.classList.add("tc-hidden");
            state.els.mosaic.addEventListener("click", (e) => {
                const tile = e.target.closest(".tc-type-tile");
                if (!tile || activeSlot === null) return;

                const type = tile.dataset.type;
                selected[activeSlot] = selected[activeSlot] === type ? null : type;

                updateSlots();
                closeMosaic();

                if (selected[0] || selected[1]) {
                    loadMatchups(selected[0], selected[1]);
                } else {
                    hideAll();
                }
            });
        }

        hideAll();
    }

    function updateSlots() {
        const fmt = (type) =>
            type
                ? `<div class="tc-slot-icon">
                        <img src="${TYPE_ICON_CACHE[type]}" />
                   </div>`
                : "—";

        if (state.els.slot1) state.els.slot1.innerHTML = fmt(selected[0]);
        if (state.els.slot2) state.els.slot2.innerHTML = fmt(selected[1]);
    }

    function toggleMosaic(slot) {
        if (!state.els.mosaic) return;
        
        const open = !state.els.mosaic.classList.contains("tc-hidden");
        const same = activeSlot === slot;

        if (open && same) {
            closeMosaic();
        } else {
            activeSlot = slot;
            openMosaic();
        }
    }

    function openMosaic() {
        if (state.els.mosaic) {
            state.els.mosaic.classList.remove("tc-hidden");
            regenerateMosaic();
        }
    }

    function regenerateMosaic() {
        if (!state.els.mosaic) return;
        
        const selectedTypes = selected.filter(s => s !== null);
        state.els.mosaic.innerHTML = `
            <div class="tc-mosaic">
                ${PokeAPI.ALL_TYPES.map(type => `
                    <div class="tc-type-tile ${selectedTypes.includes(type) ? "tc-type-selected" : ""}"
                        data-type="${type}"
                        style="background:${TYPE_COLORS[type]};">
                        <img class="tc-type-icon" src="${TYPE_ICON_CACHE[type] || ""}" alt="${type}" />
                    </div>
                `).join("")}
            </div>
        `;
    }

    function closeMosaic() {
        activeSlot = null;
        if (state.els.mosaic) {
            state.els.mosaic.classList.add("tc-hidden");
        }
    }

    function reset() {
        selected = [null, null];
        activeSlot = null;

        if (state.els.slot1) state.els.slot1.innerHTML = "—";
        if (state.els.slot2) state.els.slot2.innerHTML = "—";
        if (state.els.mosaic) state.els.mosaic.classList.add("tc-hidden");
        hideAll();
    }

    function hideAll() {
        [
            "effective2","effective4",
            "weak2","weak4",
            "resistsHalf","resistsQuarter",
            "immune"
        ].forEach(k => {
            if (state.els[k]) {
                const section = state.els[k].closest(".tc-section");
                if (section) section.style.display = "none";
            }
        });
    }

    async function loadMatchups(t1, t2) {
        const m1 = t1 ? await PokeAPI.getTypeMatchups(t1) : null;
        const m2 = t2 ? await PokeAPI.getTypeMatchups(t2) : null;

        const def = (m, t) =>
            !m ? 1 :
            m.doubleDamageFrom?.includes(t) ? 2 :
            m.halfDamageFrom?.includes(t) ? 0.5 :
            m.noDamageFrom?.includes(t) ? 0 : 1;

        const off = (m, t) =>
            !m ? 1 :
            m.doubleDamageTo?.includes(t) ? 2 :
            m.halfDamageTo?.includes(t) ? 0.5 :
            m.noDamageTo?.includes(t) ? 0 : 1;

        const defMap = {};
        const offMap = {};

        PokeAPI.ALL_TYPES.forEach(t => {
            defMap[t] = def(m1, t) * def(m2, t);
            offMap[t] = off(m1, t) * off(m2, t);
        });

        const render = (map, value, el, cls) => {
            if (!el) return;
            const list = Object.entries(map)
                .filter(([, v]) => v === value)
                .map(([t]) => `<span class="tc-badge ${cls}">${t}</span>`);

            const section = el.closest(".tc-section");
            if (section) section.style.display = list.length ? "block" : "none";
            el.innerHTML = list.join("");
        };

        render(offMap, 2, state.els.effective2, "tc-badge-effective");
        render(offMap, 4, state.els.effective4, "tc-badge-effective-4");
        render(defMap, 2, state.els.weak2, "tc-badge-weak");
        render(defMap, 4, state.els.weak4, "tc-badge-weak-4");
        render(defMap, 0.5, state.els.resistsHalf, "tc-badge-resists");
        render(defMap, 0.25, state.els.resistsQuarter, "tc-badge-resists-quarter");
        render(defMap, 0, state.els.immune, "tc-badge-immune");
    }

    return { build, reset };
})();