/* =========================================================
   VIBRA v2.0 - FIREBASE REAL-TIME ENGINE (SDK v12)
   Con bancos ampliados de Trivia, Verdadero/Falso, Adivina y Batallas
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    const checkFirebaseReady = setInterval(() => {
        if (window.db && window.FB_Firestore) {
            clearInterval(checkFirebaseReady);
            initVibraApp();
        }
    }, 100);
});

function initVibraApp() {
    const { doc, setDoc, getDoc, addDoc, deleteDoc, onSnapshot, query, orderBy, limit, serverTimestamp, collection } = window.FB_Firestore;
    const db = window.db;

    let userId = localStorage.getItem("vibraUserId");
    if (!userId) {
        userId = "user_" + Math.random().toString(36).substr(2, 9);
        localStorage.setItem("vibraUserId", userId);
    }

    let user = {
        name: "Jugador Vibra",
        avatar: "😎",
        points: 460,
        votes: 1,
        wins: 6,
        streak: 1,
        level: 3,
        xp: 60,
        challengeVotes: 0,
        votedToday: false
    };

    const userDocRef = doc(db, "users", userId);

    getDoc(userDocRef).then((docSnap) => {
        if (docSnap.exists()) {
            user = { ...user, ...docSnap.data() };
        } else {
            setDoc(userDocRef, user);
        }
        updateUI();
        initRealtimeListeners();
    }).catch((error) => {
        console.error("Error al cargar usuario:", error);
        updateUI();
    });

    const sections = {
        home: document.getElementById("homeSection"),
        play: document.getElementById("playSection"),
        challenges: document.getElementById("challengesSection"),
        ranking: document.getElementById("rankingSection"),
        profile: document.getElementById("profileSection")
    };

    const navItems = document.querySelectorAll(".nav-item");
    const quickCards = document.querySelectorAll(".quick-card");
    const textButtons = document.querySelectorAll(".text-button");
    const btnVoteDaily = document.getElementById("btnVoteDaily");
    const btnPopularVote = document.getElementById("btnPopularVote");
    const voteModal = document.getElementById("voteModal");
    const closeVoteModal = document.getElementById("closeVoteModal");
    const notificationsModal = document.getElementById("notificationsModal");
    const closeNotifications = document.getElementById("closeNotifications");
    const btnNotifications = document.getElementById("btnNotifications");
    const btnProfileHeader = document.getElementById("btnProfileHeader");
    const toast = document.getElementById("toast");
    const toastMessage = document.getElementById("toastMessage");

    const totalPoints = document.getElementById("totalPoints");
    const streakCount = document.getElementById("streakCount");
    const winsCount = document.getElementById("winsCount");
    const userLevel = document.getElementById("userLevel");
    const profileLevel = document.getElementById("profileLevel");
    const profileXP = document.getElementById("profileXP");
    const profilePoints = document.getElementById("profilePoints");
    const profileVotes = document.getElementById("profileVotes");
    const profileWins = document.getElementById("profileWins");
    const xpBar = document.getElementById("xpBar");
    const profileName = document.getElementById("profileName");
    const profileAvatar = document.getElementById("profileAvatar");
    const headerAvatar = document.getElementById("headerAvatar");
    const challengeProgress = document.getElementById("challengeProgress");
    const challengeBar = document.getElementById("challengeBar");

    function saveUserToFirebase() {
        setDoc(userDocRef, user, { merge: true }).catch((error) => {
            console.error("Error al guardar en Firebase:", error);
        });
    }

    function navigateTo(sectionName) {
        if (!sections[sectionName]) return;
        Object.values(sections).forEach(sec => sec.classList.remove("active"));
        sections[sectionName].classList.add("active");
        navItems.forEach(item => {
            item.classList.remove("active");
            if (item.dataset.section === sectionName) item.classList.add("active");
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    navItems.forEach(item => item.addEventListener("click", () => navigateTo(item.dataset.section)));
    quickCards.forEach(card => card.addEventListener("click", () => navigateTo(card.dataset.section)));
    textButtons.forEach(button => button.addEventListener("click", () => navigateTo(button.dataset.section)));
    btnProfileHeader.addEventListener("click", () => navigateTo("profile"));

    function openVoteModal() {
        if (user.votedToday) {
            showToast("Ya participaste en la Vibra de hoy 🔥");
            return;
        }
        voteModal.classList.add("active");
        document.body.style.overflow = "hidden";
    }

    function closeVote() {
        voteModal.classList.remove("active");
        document.body.style.overflow = "";
    }

    if (btnVoteDaily) btnVoteDaily.addEventListener("click", openVoteModal);
    if (btnPopularVote) btnPopularVote.addEventListener("click", openVoteModal);
    if (closeVoteModal) closeVoteModal.addEventListener("click", closeVote);

    document.querySelectorAll(".vote-option[data-choice]").forEach(option => {
        option.addEventListener("click", () => {
            user.votes++;
            user.points += 20;
            user.challengeVotes = Math.min(3, user.challengeVotes + 1);
            user.votedToday = true;
            addXP(20);
            saveUserToFirebase();
            updateUI();
            closeVote();
            showToast("¡Voto registrado en Firebase! +20 XP 🔥");
        });
    });

    function addXP(amount) {
        user.xp += amount;
        const XP_PER_LEVEL = 100;
        while (user.xp >= XP_PER_LEVEL) {
            user.xp -= XP_PER_LEVEL;
            user.level++;
            user.points += 50;
            showToast(`🎉 ¡Subiste al nivel ${user.level}!`);
        }
    }

    function updateUI() {
        if (!totalPoints) return;
        totalPoints.textContent = Number(user.points).toLocaleString("es-CO");
        streakCount.textContent = user.streak;
        winsCount.textContent = user.wins;
        userLevel.textContent = `Nivel ${user.level}`;

        profileName.textContent = user.name;
        profileAvatar.textContent = user.avatar;
        headerAvatar.textContent = user.avatar;
        profileLevel.textContent = user.level;
        profilePoints.textContent = Number(user.points).toLocaleString("es-CO");
        profileVotes.textContent = user.votes;
        profileWins.textContent = user.wins;

        profileXP.textContent = `${user.xp} / 100 XP`;
        if (xpBar) xpBar.style.width = `${Math.min((user.xp / 100) * 100, 100)}%`;

        const challengeAmount = Math.min(user.challengeVotes, 3);
        if (challengeProgress) challengeProgress.textContent = `${challengeAmount} / 3`;
        if (challengeBar) challengeBar.style.width = `${(challengeAmount / 3) * 100}%`;
    }

    const btnEditName = document.getElementById("btnEditName");
    if (btnEditName) {
        btnEditName.addEventListener("click", () => {
            const newName = prompt("Escribe tu nuevo nombre de usuario:", user.name);
            if (newName && newName.trim() !== "") {
                user.name = newName.trim();
                saveUserToFirebase();
                updateUI();
                showToast("¡Nombre actualizado!");
            }
        });
    }

    function initRealtimeListeners() {
        const q = query(collection(db, "users"), orderBy("points", "desc"), limit(10));
        onSnapshot(q, (snapshot) => {
            const rankingList = document.getElementById("rankingList");
            if (!rankingList) return;
            rankingList.innerHTML = "";

            let index = 0;
            snapshot.forEach((docSnap) => {
                const p = docSnap.data();
                const item = document.createElement("div");
                item.className = "ranking-item" + (index === 0 ? " first" : "");
                item.innerHTML = `
                    <span class="position">${index + 1}</span>
                    <span class="ranking-avatar">${p.avatar || "😎"}</span>
                    <div class="ranking-user">
                        <strong>${escapeHTML(p.name || "Jugador")}</strong>
                        <small>Nivel ${p.level || 1}</small>
                    </div>
                    <strong class="ranking-points">${Number(p.points || 0).toLocaleString("es-CO")} XP</strong>
                `;
                rankingList.appendChild(item);
                index++;
            });
        });
    }

    function escapeHTML(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    // =====================================================
    // BANCOS AMPLIADOS DE JUEGOS Y MODAL
    // =====================================================
    const gameCards = document.querySelectorAll(".game-card");
    const genericGameModal = document.getElementById("genericGameModal");
    const closeGenericModal = document.getElementById("closeGenericModal");
    const gameModalTitle = document.getElementById("gameModalTitle");
    const gameModalIcon = document.getElementById("gameModalIcon");
    const gameModalQuestion = document.getElementById("gameModalQuestion");
    const gameModalOptionsContainer = document.getElementById("gameModalOptionsContainer");

    gameCards.forEach(card => {
        card.addEventListener("click", () => {
            const gameType = card.dataset.game;
            if (gameType === "battle") {
                openBattleLobby();
            } else {
                openGenericGame(gameType);
            }
        });
    });

    function openGenericGame(type) {
        if (!genericGameModal) return;
        genericGameModal.classList.add("active");
        document.body.style.overflow = "hidden";
        gameModalOptionsContainer.innerHTML = "";

        if (type === "questions") {
            gameModalIcon.textContent = "🧠";
            gameModalTitle.textContent = "Pregunta de Trivia";
            
            const triviaPool = [
                { q: "¿Cuál es el lenguaje de programación principal para la web interactiva?", options: [{ text: "Python", correct: false }, { text: "JavaScript", correct: true }, { text: "C++", correct: false }] },
                { q: "¿En qué continente se encuentra el país de Egipto?", options: [{ text: "África", correct: true }, { text: "Asia", correct: false }, { text: "Europa", correct: false }] },
                { q: "¿Cuál es el planeta más grande del sistema solar?", options: [{ text: "Saturno", correct: false }, { text: "Júpiter", correct: true }, { text: "Marte", correct: false }] },
                { q: "¿Quién escribió 'Cien años de soledad'?", options: [{ text: "Mario Vargas Llosa", correct: false }, { text: "Gabriel García Márquez", correct: true }, { text: "Isabel Allende", correct: false }] },
                { q: "¿Cuál es el elemento químico cuyo símbolo es Au?", options: [{ text: "Plata", correct: false }, { text: "Oro", correct: true }, { text: "Cobre", correct: false }] },
                { q: "¿En qué año llegó el hombre a la Luna?", options: [{ text: "1969", correct: true }, { text: "1975", correct: false }, { text: "1961", correct: false }] },
                { q: "¿Cuál es el océano más grande de la Tierra?", options: [{ text: "Océano Atlántico", correct: false }, { text: "Océano Pacífico", correct: true }, { text: "Océano Índico", correct: false }] }
            ];
            
            const randomTrivia = triviaPool[Math.floor(Math.random() * triviaPool.length)];
            gameModalQuestion.textContent = randomTrivia.q;
            renderGameOptions(randomTrivia.options);

        } else if (type === "truefalse") {
            gameModalIcon.textContent = "✅";
            gameModalTitle.textContent = "Verdadero o Falso";
            
            const tfPool = [
                { q: "¿El sol es una estrella de tipo enana amarilla?", correct: true },
                { q: "¿Los seres humanos tenemos cuatro pulmones?", correct: false },
                { q: "¿El agua hierve a los 100 grados Celsius a nivel del mar?", correct: true },
                { q: "¿El idioma Guaraní es cooficial en Paraguay?", correct: true },
                { q: "¿Los murciélagos son aves?", correct: false },
                { q: "¿La Gran Muralla China se puede ver claramente desde la Luna a simple vista?", correct: false },
                { q: "¿El monte Everest es la montaña más alta sobre el nivel del mar?", correct: true },
                { q: "¿Los delfines son peces?", correct: false }
            ];

            const randomTF = tfPool[Math.floor(Math.random() * tfPool.length)];
            gameModalQuestion.textContent = randomTF.q;
            renderGameOptions([
                { text: "Verdadero", correct: randomTF.correct === true },
                { text: "Falso", correct: randomTF.correct === false }
            ]);

        } else if (type === "guess") {
            gameModalIcon.textContent = "🤔";
            gameModalTitle.textContent = "Adivina el acertijo";
            
            const guessPool = [
                { q: "Blanco por dentro, verde por fuera. Si quieres que te lo cuente, espera.", options: [{ text: "La Pera", correct: true }, { text: "La Manzana", correct: false }, { text: "El Plátano", correct: false }] },
                { q: "Tiene dientes y no muerde, ¿qué es?", options: [{ text: "El Peine", correct: true }, { text: "El Tiburón", correct: false }, { text: "La Sierra", correct: false }] },
                { q: "Cuanto más le quitas, más grande se vuelve. ¿Qué es?", options: [{ text: "Un agujero", correct: true }, { text: "Una montaña", correct: false }, { text: "Una piedra", correct: false }] },
                { q: "Vuela sin alas y silba sin boca, ¿qué es?", options: [{ text: "El viento", correct: true }, { text: "Un pájaro", correct: false }, { text: "Una flecha", correct: false }] },
                { q: "Oro parece, plata no es. ¿Qué fruta es?", options: [{ text: "El Plátano", correct: true }, { text: "La Naranja", correct: false }, { text: "El Melón", correct: false }] }
            ];

            const randomGuess = guessPool[Math.floor(Math.random() * guessPool.length)];
            gameModalQuestion.textContent = randomGuess.q;
            renderGameOptions(randomGuess.options);
        }
    }

    function renderGameOptions(options) {
        options.forEach(opt => {
            const btn = document.createElement("button");
            btn.className = "vote-option";
            btn.innerHTML = `<strong>${opt.text}</strong>`;
            btn.addEventListener("click", () => {
                if (opt.correct) {
                    user.points += 30;
                    user.wins += 1;
                    addXP(25);
                    saveUserToFirebase();
                    updateUI();
                    showToast("¡Correcto! +30 Puntos y +1 Victoria 🏆");
                } else {
                    showToast("¡Incorrecto! Sigue intentando ❌");
                }
                genericGameModal.classList.remove("active");
                document.body.style.overflow = "";
            });
            gameModalOptionsContainer.appendChild(btn);
        });
    }

    if (closeGenericModal) {
        closeGenericModal.addEventListener("click", () => {
            genericGameModal.classList.remove("active");
            document.body.style.overflow = "";
        });
    }

    // =====================================================
    // LOBBY DE BATALLAS (TIPOS DE DUELO EN TIEMPO REAL)
    // =====================================================
    const gameGrid = document.querySelector(".game-grid");
    const battleLobbyView = document.getElementById("battleLobbyView");
    const btnBackToGames = document.getElementById("btnBackToGames");
    const btnCreateBattle = document.getElementById("btnCreateBattle");
    const battleRoomsList = document.getElementById("battleRoomsList");

    function openBattleLobby() {
        if (gameGrid) gameGrid.style.display = "none";
        if (battleLobbyView) battleLobbyView.style.display = "block";
        loadBattleRooms();
    }

    if (btnBackToGames) {
        btnBackToGames.addEventListener("click", () => {
            if (battleLobbyView) battleLobbyView.style.display = "none";
            if (gameGrid) gameGrid.style.display = "grid";
        });
    }

    if (btnCreateBattle) {
        btnCreateBattle.addEventListener("click", () => {
            // Tipos de batalla variados al crear sala
            const battleModes = [
                "⚔️ Duelo 1v1: Trivia Flash", 
                "🔥 Supervivencia Extrema", 
                "👥 Batalla de Predicciones"
            ];
            const randomMode = battleModes[Math.floor(Math.random() * battleModes.length)];

            addDoc(collection(db, "battles"), {
                host: user.name,
                mode: randomMode,
                status: "Esperando oponente",
                createdAt: serverTimestamp()
            }).then(() => {
                showToast(`⚔️ Sala creada (${randomMode}) en la nube!`);
            });
        });
    }

    function loadBattleRooms() {
        const qBattles = query(collection(db, "battles"), orderBy("createdAt", "desc"), limit(5));
        onSnapshot(qBattles, (snapshot) => {
            if (!battleRoomsList) return;
            battleRoomsList.innerHTML = "";
            
            if (snapshot.empty) {
                battleRoomsList.innerHTML = `<div class="ranking-item"><div class="ranking-user"><strong>No hay salas activas. ¡Crea una!</strong></div></div>`;
                return;
            }

            snapshot.forEach((docSnap) => {
                const room = docSnap.data();
                const roomId = docSnap.id;
                const item = document.createElement("div");
                item.className = "ranking-item";
                item.innerHTML = `
                    <span class="position">⚔️</span>
                    <span class="ranking-avatar">🎮</span>
                    <div class="ranking-user">
                        <strong>Sala de ${escapeHTML(room.host || "Jugador")}</strong>
                        <small>${escapeHTML(room.mode || "Duelo 1v1 en tiempo real")}</small>
                    </div>
                    <button class="secondary-button" style="padding: 6px 12px; margin-top:0;">Unirse</button>
                `;
                item.querySelector("button").addEventListener("click", () => {
                    deleteDoc(doc(db, "battles", roomId));
                    user.wins += 1;
                    user.points += 50;
                    addXP(40);
                    saveUserToFirebase();
                    updateUI();
                    showToast("🏆 ¡Ganaste la Batalla Multijugador! +50 Puntos");
                    if (battleLobbyView) battleLobbyView.style.display = "none";
                    if (gameGrid) gameGrid.style.display = "grid";
                });
                battleRoomsList.appendChild(item);
            });
        });
    }

    if (btnNotifications) {
        btnNotifications.addEventListener("click", () => {
            notificationsModal.classList.add("active");
            document.body.style.overflow = "hidden";
        });
    }

    if (closeNotifications) {
        closeNotifications.addEventListener("click", () => {
            notificationsModal.classList.remove("active");
            document.body.style.overflow = "";
        });
    }

    let toastTimer;
    function showToast(message) {
        if (!toast || !toastMessage) return;
        toastMessage.textContent = message;
        toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
    }

    navigateTo("home");
}
