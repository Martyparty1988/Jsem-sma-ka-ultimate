// DOM Elements
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureButton = document.getElementById('captureButton');
const retakeButton = document.getElementById('retakeButton');
const analyzeButton = document.getElementById('analyzeButton');
const resultDiv = document.getElementById('result');
const loadingDiv = document.getElementById('loading');
const previewContainer = document.getElementById('previewContainer');
const previewImg = document.getElementById('preview');
const cameraError = document.getElementById('cameraError');
const uploadButton = document.getElementById('uploadButton');
const uploadInput = document.getElementById('uploadInput');
const generalError = document.getElementById('generalError');

// State
let currentImageData = null;
let cameraStream = null;
let lastAnalysisResult = { title: '', description: '' };
let responseLibrary = []; // Zde bude knihovna hlášek

// Načte hlášky z JSON souboru
async function loadResponses() {
    try {
        const response = await fetch('responses.json');
        if (!response.ok) {
            throw new Error('Nepodařilo se načíst soubor responses.json');
        }
        responseLibrary = await response.json();
        console.log('Knihovna hlášek načtena:', responseLibrary.length, 'hlášek');
    } catch (err) {
        console.error(err);
        showError("Chyba: Nepodařilo se načíst knihovnu hlášek. Zkuste obnovit stránku.");
        // Záložní hláška, kdyby selhalo načtení JSON
        responseLibrary = [
            { category: "Chyba", description: "Nepodařilo se načíst hlášky. Ale stejně vypadáš skvěle!" }
        ];
    }
}


// Zobrazí chybu v UI
function showError(message) {
    generalError.innerHTML = message;
    generalError.classList.remove('hidden');
}

// Initialize camera
async function initCamera() {
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        video.srcObject = cameraStream;
        video.style.display = 'block';
        cameraError.classList.add('hidden');
    } catch (err) {
        console.error("Chyba při získávání přístupu ke kameře: ", err);
        cameraError.textContent = "⚠️ Nepodařilo se získat přístup ke kameře. Zkontrolujte oprávnění.";
        cameraError.classList.remove('hidden');
        captureButton.disabled = true;
    }
}

// Stop camera stream
function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

// Capture photo
captureButton.addEventListener('click', () => {
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    currentImageData = canvas.toDataURL('image/jpeg', 0.8);
    previewImg.src = currentImageData;
    previewContainer.classList.remove('hidden');
    video.style.display = 'none';
    stopCamera();

    captureButton.classList.add('hidden');
    uploadButton.classList.add('hidden');
    retakeButton.classList.remove('hidden');
    analyzeButton.classList.remove('hidden');
    resultDiv.classList.add('hidden');
    generalError.classList.add('hidden');
});

// Nahrání fotky
uploadButton.addEventListener('click', () => {
    uploadInput.click();
});

uploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showError("Prosím, nahrajte obrázek (JPEG, PNG, atd.).");
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        currentImageData = event.target.result;
        previewImg.src = currentImageData;
        previewContainer.classList.remove('hidden');
        video.style.display = 'none';
        stopCamera();

        captureButton.classList.add('hidden');
        uploadButton.classList.add('hidden');
        retakeButton.classList.remove('hidden');
        analyzeButton.classList.remove('hidden');
        resultDiv.classList.add('hidden');
        generalError.classList.add('hidden');
    }
    reader.readAsDataURL(file);
    uploadInput.value = null;
});


// Retake photo
retakeButton.addEventListener('click', () => {
    initCamera();
    previewContainer.classList.add('hidden');

    captureButton.classList.remove('hidden');
    uploadButton.classList.remove('hidden');
    retakeButton.classList.add('hidden');
    analyzeButton.classList.add('hidden');
    resultDiv.classList.add('hidden');
    generalError.classList.add('hidden');
    currentImageData = null;
});

// Analyze photo
analyzeButton.addEventListener('click', () => {
    if (!currentImageData) {
        showError("Nejprve vyfotěte nebo nahrajte obličej!");
        return;
    }
    generalError.classList.add('hidden');
    runAnalysis();
});


// Display result with styling
function displayResult(result) {
    const { category, description } = result;

    lastAnalysisResult = { title: category, description: description };

    // --- AKTUALIZOVANÁ MAPA EMOJI ---
    const emojiMap = {
        "Začátečník večírků": "😊",
        "Pátek odpoledne": "😴",
        "Sobota po tahu": "🥴",
        "Legenda nonstopu": "😵",
        "Zombie z baru": "🧟",
        "Chce to detox, kámo": "💀",
        "Svěží jak rybička": "🐟",
        "Mírně použitý": "😅",
        "Stav nouze": "🆘",
        "Zatím v klidu": "😎",
        "Plnej energie": "⚡",
        "Čistý rejstřík": "📝",
        "Hydratovanej": "💧",
        "Nultá úroveň": "👌",
        "První varování": "👀",
        "Včerejší echo": "🤔",
        "Lehce rozostřeno": "😵‍💫",
        "Sociální baterka": "🪫",
        "Decentní lesk": "✨",
        "Na půl plynu": "💨",
        "Mistr Afterparty": "🥳",
        "Hledá se paměť": "❓",
        "Kebab volá": "🥙",
        "Vybitej mobil": "🔋",
        "Hydratace nutná": "🚱",
        "Jedeš na výpary": "⛽",
        "Poslední Mohykán": "🗿",
        "Pohled tisíce mil": "😳",
        "Duchem nepřítomen": "👻",
        "Solidní nálož": "💣",
        "Autopilot": "✈️",
        "Mírně rozpadlej": "🧱",
        "Ranní ptáče": "🐦",
        "Hrdina noci": "🦸",
        "Ztracená existence": "🤷",
        "Kreatura noci": "🦇",
        "Prokletej básník": "✒️",
        "Ještě žiješ?": "🤨",
        "Vypnuto/Zapnuto": "🔄",
        "Tovární nastavení": "⚙️",
        "Přeživší": "🪳",
        "Level 'Už nikdy'": "🙏",
        "Rozsypanej čaj": "🍂",
        "Smrt v očích": "☠️",
        "Ztracen v překladu": "🌐",
        "Vesmírnej prach": "🚀",
        "Error 404": "⁉️",
        "Mrtvola na tripu": "⚰️",
        "Návrat do hrobu": "⚱️",
        "Mimozemský kontakt": "👽",
        "Duch": "👻",
        "Finální boss": "👑",
        "Existenční krize": "🤯",
        "Chodící lékárna": "💊",
        "Vygumováno": "🧼",
        "Třesavka": "🥶",
        "Oči jak angorák": "👹",
        "Filozof": "🧐",
        "Mimo provoz": "🚫",
        "Kaput": "💔",
        "Pohřební služba": "⚰️",
        "Sešrotovanej": "🔩",
        "Hromádka neštěstí": "😢",
        "Lidská troska": "🗑️",
        "Vyflusnutej": "🌬️",
        "Zombifikace": "🧟‍♂️",
        "Generálka": "🛠️",
        "Odpojenej": "🔌",
        "K.O.": "🥊",
        "Boss level": "🏆",
        "Absolutní vyplej": "🌀",
        "Vyvolenej": "🕶️",
        "Dimenze X": "🌌",
        "Posmrtnej život": "👼",
        "Návštěva z pekla": "🔥",
        "Černá díra": "⚫"
    };
    // Zbytek kategorií dostane robota
    const emoji = emojiMap[category] || "🤖";

    resultDiv.innerHTML = `
        <h2>${emoji} ${category}</h2>
        <p class="description">${description}</p>
        
        <button id="shareResultButton" class="share-button">
            <span class="button-icon">🚀</span>
            <span>Sdílet / Stáhnout</span>
        </button>
    `;

    resultDiv.classList.remove('hidden');

    document.getElementById('shareResultButton').addEventListener('click', shareResult);

    prepareShareImage(category, description);
    triggerConfetti();
}

// Toto je teď hlavní "analyzační" funkce
function runAnalysis() {
    loadingDiv.classList.remove('hidden');
    resultDiv.classList.add('hidden');
    analyzeButton.disabled = true;
    retakeButton.disabled = true;

    // Simulace práce AI
    setTimeout(() => {
        if (responseLibrary.length === 0) {
            showError("Chyba: Knihovna hlášek je prázdná.");
            loadingDiv.classList.add('hidden');
            analyzeButton.disabled = false;
            retakeButton.disabled = false;
            return;
        }

        // Vybere náhodný výsledek z knihovny
        const randomResult = responseLibrary[Math.floor(Math.random() * responseLibrary.length)];
        
        displayResult(randomResult); // Zobrazí výsledek

        loadingDiv.classList.add('hidden');
        analyzeButton.disabled = false;
        retakeButton.disabled = false;
    }, 2000); // Simulujeme 2 sekundy přemýšlení
}

// Spustí konfety
function triggerConfetti() {
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { x: 0.3, y: 0.6 }
    });
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { x: 0.7, y: 0.6 }
    });
}

// Připraví obrázek pro sdílení (nakreslí na canvas)
function prepareShareImage(title, description) {
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
        const textHeight = 200;
        canvas.width = img.width;
        canvas.height = img.height + textHeight;

        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, img.height, canvas.width, textHeight);

        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';

        // Upraveno pro lepší zobrazení delších titulků
        let titleFontSize = 48;
        ctx.font = `bold ${titleFontSize}px "Segoe UI", sans-serif`;
        // Zmenšuje font, dokud se text nevejde
        while (ctx.measureText(title).width > canvas.width - 40) {
            titleFontSize--;
            ctx.font = `bold ${titleFontSize}px "Segoe UI", sans-serif`;
        }
        ctx.fillText(title, canvas.width / 2, img.height + 70);


        ctx.font = 'italic 32px "Segoe UI", sans-serif';
        // Zkrácení popisku
        const shortDesc = description.length > 50 ? description.substring(0, 50) + '...' : description;
        ctx.fillText(shortDesc, canvas.width / 2, img.height + 120);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '24px "Segoe UI", sans-serif';
        ctx.fillText('🍺 JsemSmazka.cz', canvas.width / 2, img.height + 170);
    };
    // Ošetření chyby při načítání obrázku (CORS, atd.)
    img.onerror = () => {
        console.error("Chyba: Nelze načíst obrázek do canvasu pro sdílení.");
        // Můžete zde zkusit nakreslit placeholder, pokud by `currentImageData` byl vadný
    };
    img.src = currentImageData;
}

// Sdílení / Stažení výsledku
async function shareResult() {
    const dataUrl = canvas.toDataURL('image/png');
    const title = `Jsem ${lastAnalysisResult.title}!`;
    const text = `${lastAnalysisResult.description} - Zjisti, jak jsi na tom!`;

    try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], 'jsem_smazka.png', { type: 'image/png' });

        if (navigator.share && navigator.canShare({ files: [file] })) {
            await navigator.share({
                title: title,
                text: text,
                files: [file],
            });
        } else {
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = 'jsem_smazka.png';
            link.click();
        }
    } catch (err) {
        console.error("Chyba při sdílení: ", err);
        // Fallback, kdyby selhalo i sdílení s blobem
        try {
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = 'jsem_smazka.png';
            link.click();
        } catch (downloadErr) {
            console.error("Selhalo i stažení:", downloadErr);
            showError("Nelze sdílet ani stáhnout obrázek.");
        }
    }
}

// Inicializace
loadResponses(); // Načteme hlášky hned po spuštění
initCamera(); // Spustíme kameru

window.addEventListener('beforeunload', () => {
    stopCamera();
});


