document.addEventListener('DOMContentLoaded', () => {
    // --- STATE VARIABLES ---
    let appState = {
        structure: null,
        currentUiStep: 'step-subject',
        selectedSubject: null,
        selectedUnit: null,
        selectedTopic: null,
        generalStudiesLanguage: null,
        testQuestions: [],
        userAnswers: [],
        currentQuestionIndex: 0,
        currentReviewIndex: 0,
        timerInterval: null,
        isPaused: false,
        chatHistory: []
    };

    // --- DOM ELEMENTS ---
    const selectionScreen = document.getElementById('selection-screen');
    const testScreen = document.getElementById('test-screen');
    const resultsScreen = document.getElementById('results-screen');
    const languageModal = document.getElementById('language-modal');
    const chatContainer = document.getElementById('chat-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingText = loadingIndicator.querySelector('p');
    const pauseBtn = document.getElementById('pause-btn');
    const pauseIndicator = document.getElementById('pause-indicator');

    const uiSteps = {
        'step-subject': document.getElementById('step-subject'),
        'step-topic': document.getElementById('step-topic'),
        'step-config': document.getElementById('step-config')
    };
    
    // --- INITIALIZATION ---
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
                alert(`Error from server: ${appState.structure.error}.`);
            }
        } catch (error) {
            console.error('Error fetching structure:', error);
            document.getElementById('dynamic-selection-area').innerHTML = `<p class="error">Could not load test structure.</p>`;
        }
    }

    function addInitialEventListeners() {
        document.getElementById('mock-test-btn').addEventListener('click', startMockTest);
        document.querySelectorAll('.subject-btn').forEach(button => {
            button.addEventListener('click', () => handleSubjectSelection(button.dataset.subject));
        });
        document.querySelectorAll('.back-btn').forEach(button => {
            button.addEventListener('click', () => navigateToStep(button.dataset.target));
        });
        document.getElementById('start-test-btn').addEventListener('click', startStandardTest);
        document.getElementById('next-btn').addEventListener('click', showNextQuestion);
        document.getElementById('prev-btn').addEventListener('click', showPrevQuestion);
        document.getElementById('submit-btn').addEventListener('click', confirmAndSubmitTest);
        document.getElementById('restart-btn').addEventListener('click', () => location.reload());
        document.getElementById('pause-btn').addEventListener('click', togglePauseTimer);
        document.querySelectorAll('.lang-select-btn').forEach(button => {
            button.addEventListener('click', () => {
                appState.generalStudiesLanguage = button.dataset.lang;
                languageModal.classList.add('hidden');
                displayUnits(appState.selectedSubject);
            });
        });
        document.getElementById('next-review-btn').addEventListener('click', showNextReviewQuestion);
        document.getElementById('prev-review-btn').addEventListener('click', showPrevReviewQuestion);
        document.getElementById('chat-toggle-btn').addEventListener('click', toggleChatWindow);
        document.getElementById('chat-close-btn').addEventListener('click', toggleChatWindow);
        document.getElementById('chat-send-btn').addEventListener('click', handleChatSubmit);
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleChatSubmit();
        });
    }

    // --- UI WIZARD FLOW ---
    function navigateToStep(stepId) {
        Object.values(uiSteps).forEach(step => step.classList.add('hidden'));
        if (uiSteps[stepId]) {
            uiSteps[stepId].classList.remove('hidden');
            appState.currentUiStep = stepId;
        }
    }
    
    function handleSubjectSelection(subject) {
        appState.selectedSubject = subject;
        if (subject === 'General Studies' && !appState.generalStudiesLanguage) {
            languageModal.classList.remove('hidden');
        } else {
            displayUnits(subject);
        }
    }

    function displayUnits(subject) {
        const units = Object.keys(appState.structure[subject] || {});
        const dynamicArea = document.getElementById('dynamic-selection-area');
        if (units.length === 0) {
            dynamicArea.innerHTML = `<p class="error">No units found for ${subject}. Please add unit folders.</p>`;
            navigateToStep('step-topic');
            return;
        }
        let html = `<h3>Select a Unit for ${subject}</h3>`;
        units.forEach(unit => { html += `<button class="unit-btn" data-unit="${unit}">${unit.replace(/_/g, ' ')}</button>`; });
        dynamicArea.innerHTML = html;
        document.querySelectorAll('.unit-btn').forEach(button => {
            button.addEventListener('click', () => displayTopics(subject, button.dataset.unit));
        });
        document.getElementById('topic-selection-header').textContent = `Step 2: Select a Unit & Topic`;
        navigateToStep('step-topic');
    }

    function displayTopics(subject, unit) {
        appState.selectedUnit = unit;
        const topics = appState.structure[subject][unit] || [];
        const dynamicArea = document.getElementById('dynamic-selection-area');
        if (topics.length === 0) {
            dynamicArea.innerHTML += `<p class="error">No topics found for ${unit}. Please add .txt files.</p>`;
            return;
        }
        let html = `<h3>Select a Topic from ${unit.replace(/_/g, ' ')}</h3>`;
        topics.forEach(topic => { html += `<button class="topic-btn" data-topic="${topic}">${topic.replace(/_/g, ' ')}</button>`; });
        dynamicArea.innerHTML = html;
        document.querySelectorAll('.topic-btn').forEach(button => {
            button.addEventListener('click', () => {
                appState.selectedTopic = button.dataset.topic;
                displayConfig();
            });
        });
    }

    function displayConfig() {
        navigateToStep('step-config');
    }


    // --- TEST GENERATION ---
    async function startStandardTest() {
        loadingText.textContent = 'Generating your custom test with VidhAI... Please wait.';
        loadingIndicator.classList.remove('hidden');
        Object.values(uiSteps).forEach(step => step.classList.add('hidden'));

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
            const duration = parseInt(document.getElementById('test-duration').value) * 60;
            renderTest(duration);
        } catch (error) {
            console.error('Error starting test:', error);
            alert(`Error: ${error.message}`);
            location.reload();
        } finally {
            loadingIndicator.classList.add('hidden');
        }
    }

    async function startMockTest() {
        loadingText.innerHTML = 'Generating Full Mock Test (200 Questions)...<br>This is a complex process and may take 1-3 minutes. Please be patient.';
        loadingIndicator.classList.remove('hidden');
        Object.values(uiSteps).forEach(step => step.classList.add('hidden'));

        try {
            const response = await fetch('/api/generate-mock-test', {
                method: 'POST'
            });
             if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate mock test.');
            }
            appState.testQuestions = await response.json();
            if (appState.testQuestions.length < 180) {
                throw new Error("The AI failed to generate a complete mock test. Please try again later.");
            }
            const duration = 180 * 60;
            renderTest(duration);

        } catch (error) {
            console.error('Error starting mock test:', error);
            alert(`Error: ${error.message}`);
            location.reload();
        } finally {
            loadingIndicator.classList.add('hidden');
        }
    }


    function renderTest(durationInSeconds) {
        selectionScreen.classList.add('hidden');
        testScreen.classList.remove('hidden');
        chatContainer.classList.remove('hidden');
        
        appState.userAnswers = new Array(appState.testQuestions.length).fill(null);
        startTimer(durationInSeconds);
        buildQuestionPalette();
        displayQuestion(0);
    }
    
    // --- TEST EXECUTION ---
    function displayQuestion(index) {
        if(appState.isPaused) return;
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
        if(appState.isPaused) return;
        appState.userAnswers[appState.currentQuestionIndex] = optionIndex;
        updatePaletteHighlight();
        displayQuestion(appState.currentQuestionIndex);
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

    // --- TIMER & PAUSE LOGIC ---
    function startTimer(duration) {
        let timer = duration;
        const timerEl = document.getElementById('timer');
        if (appState.timerInterval) {
            clearInterval(appState.timerInterval);
        }
        appState.timerInterval = setInterval(() => {
            if (appState.isPaused) {
                return;
            }
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
    
    function togglePauseTimer() {
        appState.isPaused = !appState.isPaused;
        if (appState.isPaused) {
            pauseBtn.textContent = 'Resume';
            pauseBtn.classList.add('resume-active');
            testScreen.classList.add('test-paused');
            pauseIndicator.classList.remove('hidden');
        } else {
            pauseBtn.textContent = 'Pause';
            pauseBtn.classList.remove('resume-active');
            testScreen.classList.remove('test-paused');
            pauseIndicator.classList.add('hidden');
        }
    }
    
    // --- SUBMISSION & RESULTS ---
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
        chatContainer.classList.add('hidden');
        calculateAndShowResults();
    }

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
        appState.currentReviewIndex = 0;
        displayReviewQuestion(appState.currentReviewIndex);
    }
    
    // --- REVIEW ---
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
            optionEl.className = 'option';
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

    // --- CHAT SUPPORT ---
    function toggleChatWindow() {
        document.getElementById('chat-window').classList.toggle('hidden');
    }

    async function handleChatSubmit() {
        const input = document.getElementById('chat-input');
        const userQuery = input.value.trim();
        if (!userQuery) return;
        addMessageToChat('user', userQuery);
        input.value = '';
        addMessageToChat('ai', 'VidhAI is thinking...');
        try {
            const response = await fetch('/api/chat-support', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_query: userQuery,
                    question_text: appState.testQuestions[appState.currentQuestionIndex].question
                })
            });
            if (!response.ok) throw new Error('Failed to get response from VidhAI tutor.');
            const data = await response.json();
            const messagesContainer = document.getElementById('chat-messages');
            messagesContainer.removeChild(messagesContainer.lastChild);
            addMessageToChat('ai', data.reply);
        } catch (error) {
            console.error("Chat error:", error);
            const messagesContainer = document.getElementById('chat-messages');
            messagesContainer.removeChild(messagesContainer.lastChild);
            addMessageToChat('ai', 'Sorry, I encountered an error. Please try again.');
        }
    }

    function addMessageToChat(sender, text) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${sender}-message`;
        messageEl.textContent = text;
        messagesContainer.appendChild(messageEl);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // --- START THE APP ---
    initializeApp();
});