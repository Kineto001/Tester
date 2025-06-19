document.addEventListener('DOMContentLoaded', () => {
    // --- STATE VARIABLES ---
    let appState = {
        structure: null,
        currentStep: 'subject', // subject -> unit -> topic -> config
        selectedSubject: null,
        selectedUnit: null,
        selectedTopic: null,
        generalStudiesLanguage: null,
        testQuestions: [],
        userAnswers: [],
        currentQuestionIndex: 0,
        currentReviewIndex: 0, // *** NEW: For review slider
        timerInterval: null
    };

    // --- DOM ELEMENTS ---
    const selectionScreen = document.getElementById('selection-screen');
    const testScreen = document.getElementById('test-screen');
    const resultsScreen = document.getElementById('results-screen');
    const languageModal = document.getElementById('language-modal');

    // --- INITIALIZATION (No changes here) ---
    // ... (All functions from initializeApp to startTimer are the same)
    function initializeApp() {
        fetchStructure();
        addInitialEventListeners();
    }

    async function fetchStructure() {
        try {
            const response = await fetch('/api/get-structure');
            if (!response.ok) throw new Error('Failed to load subject structure.');
            appState.structure = await response.json();
            if(appState.structure.error) {
                alert(`Error from server: ${appState.structure.error}. Please check your 'source_material' folder structure.`);
            }
        } catch (error) {
            console.error('Error fetching structure:', error);
            document.getElementById('dynamic-selection-area').innerHTML = `<p class="error">Could not load test structure. Please ensure the backend is running and the folder structure is correct.</p>`;
        }
    }

    function addInitialEventListeners() {
        document.querySelectorAll('.subject-btn').forEach(button => {
            button.addEventListener('click', () => handleSubjectSelection(button.dataset.subject));
        });

        document.getElementById('start-test-btn').addEventListener('click', startTest);
        document.getElementById('next-btn').addEventListener('click', showNextQuestion);
        document.getElementById('prev-btn').addEventListener('click', showPrevQuestion);
        document.getElementById('submit-btn').addEventListener('click', confirmAndSubmitTest);
        document.getElementById('restart-btn').addEventListener('click', () => location.reload());

        document.querySelectorAll('.lang-select-btn').forEach(button => {
            button.addEventListener('click', () => {
                appState.generalStudiesLanguage = button.dataset.lang;
                languageModal.classList.add('hidden');
                displayUnits(appState.selectedSubject);
            });
        });
        
        // *** NEW: Event listeners for review navigation
        document.getElementById('next-review-btn').addEventListener('click', showNextReviewQuestion);
        document.getElementById('prev-review-btn').addEventListener('click', showPrevReviewQuestion);
    }
    
    // ... (All UI flow functions like handleSubjectSelection, displayUnits, displayTopics, displayConfig are the same)
    function handleSubjectSelection(subject) {
        appState.selectedSubject = subject;
        appState.currentStep = 'unit';
        if (subject === 'General Studies' && !appState.generalStudiesLanguage) {
            languageModal.classList.remove('hidden');
        } else {
            displayUnits(subject);
        }
    }
    function displayUnits(subject) {
        const units = Object.keys(appState.structure[subject] || {});
        if (units.length === 0) {
            document.getElementById('dynamic-selection-area').innerHTML = `<p class="error">No units found for ${subject}. Please add unit folders.</p>`;
            document.getElementById('dynamic-selection-area').classList.remove('hidden');
            return;
        }
        let html = `<h3>Select a Unit for ${subject}</h3>`;
        units.forEach(unit => { html += `<button class="unit-btn" data-unit="${unit}">${unit.replace(/_/g, ' ')}</button>`; });
        document.getElementById('dynamic-selection-area').innerHTML = html;
        document.getElementById('dynamic-selection-area').classList.remove('hidden');
        document.querySelectorAll('.unit-btn').forEach(button => {
            button.addEventListener('click', () => displayTopics(subject, button.dataset.unit));
        });
    }
    function displayTopics(subject, unit) {
        appState.selectedUnit = unit;
        appState.currentStep = 'topic';
        const topics = appState.structure[subject][unit] || [];
        if (topics.length === 0) {
            document.getElementById('dynamic-selection-area').innerHTML += `<p class="error">No topics found for ${unit}. Please add .txt files.</p>`;
            return;
        }
        let html = `<h3>Select a Topic from ${unit.replace(/_/g, ' ')}</h3>`;
        topics.forEach(topic => { html += `<button class="topic-btn" data-topic="${topic}">${topic.replace(/_/g, ' ')}</button>`; });
        document.getElementById('dynamic-selection-area').innerHTML = html;
        document.querySelectorAll('.topic-btn').forEach(button => {
            button.addEventListener('click', () => {
                appState.selectedTopic = button.dataset.topic;
                displayConfig();
            });
        });
    }
    function displayConfig() {
        appState.currentStep = 'config';
        document.getElementById('dynamic-selection-area').classList.add('hidden');
        document.getElementById('test-config-area').classList.remove('hidden');
    }

    // --- TEST GENERATION & EXECUTION (No changes here) ---
    // ... (All functions from startTest to confirmAndSubmitTest are the same)
    async function startTest() {
        document.getElementById('loading-indicator').classList.remove('hidden');
        document.getElementById('test-config-area').classList.add('hidden');
        document.getElementById('initial-selection').classList.add('hidden');

        const params = {
            subject: appState.selectedSubject,
            unit: appState.selectedUnit,
            topic: appState.selectedTopic,
            language: appState.selectedSubject === 'General Tamil' ? 'Tamil' : appState.generalStudiesLanguage,
            num_questions: document.getElementById('num-questions').value,
        };

        try {
            const response = await fetch('/api/generate-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate test.');
            }
            appState.testQuestions = await response.json();
            if (appState.testQuestions.length === 0) {
                throw new Error("The AI returned an empty list of questions. Please try again.");
            }
            appState.userAnswers = new Array(appState.testQuestions.length).fill(null);
            renderTest();
        } catch (error) {
            console.error('Error starting test:', error);
            alert(`Error: ${error.message}`);
            location.reload();
        } finally {
            document.getElementById('loading-indicator').classList.add('hidden');
        }
    }
    function renderTest() {
        selectionScreen.classList.add('hidden');
        testScreen.classList.remove('hidden');
        const duration = parseInt(document.getElementById('test-duration').value) * 60;
        startTimer(duration);
        buildQuestionPalette();
        displayQuestion(0);
    }
    function displayQuestion(index) {
        appState.currentQuestionIndex = index;
        const question = appState.testQuestions[index];
        document.getElementById('question-number').textContent = `Question ${index + 1} of ${appState.testQuestions.length}`;
        document.getElementById('question-text').textContent = question.question;
        const optionsContainer = document.getElementById('options-container');
        optionsContainer.innerHTML = '';
        question.options.forEach((option, i) => {
            const optionEl = document.createElement('div');
            optionEl.className = 'option';
            optionEl.textContent = option;
            optionEl.dataset.index = i;
            if (appState.userAnswers[index] === i) {
                optionEl.classList.add('selected');
            }
            optionEl.addEventListener('click', () => selectOption(i));
            optionsContainer.appendChild(optionEl);
        });
        updateNavButtons();
        updatePaletteHighlight();
    }
    function selectOption(optionIndex) {
        appState.userAnswers[appState.currentQuestionIndex] = optionIndex;
        displayQuestion(appState.currentQuestionIndex);
        updatePaletteHighlight(); // Update palette immediately
        setTimeout(() => {
            if (appState.currentQuestionIndex < appState.testQuestions.length - 1) {
                showNextQuestion();
            }
        }, 300);
    }
    function showNextQuestion() { if (appState.currentQuestionIndex < appState.testQuestions.length - 1) { displayQuestion(appState.currentQuestionIndex + 1); } }
    function showPrevQuestion() { if (appState.currentQuestionIndex > 0) { displayQuestion(appState.currentQuestionIndex - 1); } }
    function updateNavButtons() {
        document.getElementById('prev-btn').disabled = appState.currentQuestionIndex === 0;
        document.getElementById('next-btn').disabled = appState.currentQuestionIndex === appState.testQuestions.length - 1;
    }
    function buildQuestionPalette() {
        const palette = document.getElementById('question-palette');
        palette.innerHTML = '';
        appState.testQuestions.forEach((_, index) => {
            const btn = document.createElement('button');
            btn.textContent = index + 1;
            btn.className = 'palette-btn';
            btn.addEventListener('click', () => displayQuestion(index));
            palette.appendChild(btn);
        });
    }
    function updatePaletteHighlight() {
        document.querySelectorAll('.palette-btn').forEach((btn, index) => {
            btn.classList.remove('current', 'answered');
            if (appState.userAnswers[index] !== null) {
                btn.classList.add('answered');
            }
            if (index === appState.currentQuestionIndex) {
                btn.classList.add('current');
            }
        });
    }
    function startTimer(duration) {
        let timer = duration;
        const timerEl = document.getElementById('timer');
        appState.timerInterval = setInterval(() => {
            let minutes = parseInt(timer / 60, 10);
            let seconds = parseInt(timer % 60, 10);
            minutes = minutes < 10 ? "0" + minutes : minutes;
            seconds = seconds < 10 ? "0" + seconds : seconds;
            timerEl.textContent = `${minutes}:${seconds}`;
            if (--timer < 0) {
                clearInterval(appState.timerInterval);
                alert("Time's up!");
                submitTest();
            }
        }, 1000);
    }
    function confirmAndSubmitTest() {
        const unanswered = appState.userAnswers.filter(a => a === null).length;
        let confirmation = true;
        if(unanswered > 0) {
            confirmation = confirm(`You have ${unanswered} unanswered questions. Are you sure you want to submit?`);
        }
        if(confirmation) {
            submitTest();
        }
    }
    function submitTest() {
        clearInterval(appState.timerInterval);
        calculateAndShowResults();
    }

    // --- RESULTS & REVIEW (*** UPDATED SECTION ***) ---

    function calculateAndShowResults() {
        let score = 0;
        appState.testQuestions.forEach((q, i) => {
            if (appState.userAnswers[i] === q.correct_answer_index) {
                score++;
            }
        });

        testScreen.classList.add('hidden');
        resultsScreen.classList.remove('hidden');

        const scoreSummary = document.getElementById('score-summary');
        scoreSummary.innerHTML = `
            <p>You scored <strong>${score}</strong> out of <strong>${appState.testQuestions.length}</strong>.</p>
            <p>Percentage: <strong>${((score / appState.testQuestions.length) * 100).toFixed(2)}%</strong></p>
        `;
        
        // Initialize the review slider to the first question
        appState.currentReviewIndex = 0;
        displayReviewQuestion(appState.currentReviewIndex);
    }
    
    function displayReviewQuestion(index) {
        const question = appState.testQuestions[index];
        const userAnswer = appState.userAnswers[index];
        
        document.getElementById('review-question-number').textContent = `Reviewing Question ${index + 1} of ${appState.testQuestions.length}`;
        document.getElementById('review-question-text').textContent = question.question;
        document.getElementById('review-explanation-text').textContent = question.explanation;

        const reviewOptionsContainer = document.getElementById('review-options-container');
        reviewOptionsContainer.innerHTML = '';
        
        question.options.forEach((optionText, optIndex) => {
            const optionEl = document.createElement('div');
            optionEl.className = 'option'; // Base class
            optionEl.textContent = optionText;

            if (optIndex === question.correct_answer_index) {
                optionEl.classList.add('review-correct');
            } else if (optIndex === userAnswer) {
                optionEl.classList.add('review-incorrect');
            } else {
                optionEl.classList.add('review-neutral');
            }
            reviewOptionsContainer.appendChild(optionEl);
        });

        updateReviewNavButtons();
    }

    function updateReviewNavButtons() {
        document.getElementById('prev-review-btn').disabled = appState.currentReviewIndex === 0;
        document.getElementById('next-review-btn').disabled = appState.currentReviewIndex === appState.testQuestions.length - 1;
    }

    function showNextReviewQuestion() {
        if (appState.currentReviewIndex < appState.testQuestions.length - 1) {
            appState.currentReviewIndex++;
            displayReviewQuestion(appState.currentReviewIndex);
        }
    }

    function showPrevReviewQuestion() {
        if (appState.currentReviewIndex > 0) {
            appState.currentReviewIndex--;
            displayReviewQuestion(appState.currentReviewIndex);
        }
    }

    // --- START THE APP ---
    initializeApp();
});