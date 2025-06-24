document.addEventListener('DOMContentLoaded', () => {
    // --- STATE VARIABLES ---
    let appState = {
        structure: null,
        mockTestBlueprint: null,
        currentUiStep: 'step-subject',
        selectedSubject: null,
        selectedUnit: null,
        selectedTopic: null,
        generalStudiesLanguage: null,
        testQuestions: [],
        userAnswers: [],
        currentQuestionIndex: 0,
        currentReviewIndex: 0,
        currentTopicPage: 0,
        timerInterval: null,
        isPaused: false,
        chatHistory: []
    };
    const TOPICS_PER_PAGE = 8;

    // --- DOM ELEMENTS ---
    const selectionScreen = document.getElementById('selection-screen');
    const testScreen = document.getElementById('test-screen');
    const resultsScreen = document.getElementById('results-screen');
    const languageModal = document.getElementById('language-modal');
    const chatContainer = document.getElementById('chat-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingText = document.getElementById('loading-text');
    const progressBar = document.getElementById('progress-bar');
    const pauseBtn = document.getElementById('pause-btn');
    const pauseIndicator = document.getElementById('pause-indicator');

    const uiSteps = {
        'step-subject': document.getElementById('step-subject'),
        'step-topic': document.getElementById('step-topic'),
        'step-config': document.getElementById('step-config')
    };
    
    // --- UTILITY ---
    /**
     * Handles API responses, parsing JSON or extracting text from errors.
     * @param {Response} response The fetch response object.
     * @returns {Promise<any>} A promise that resolves with the parsed JSON data.
     * @throws {Error} Throws an error with a message from the server.
     */
    async function handleApiResponse(response) {
        if (!response.ok) {
            let errorMsg;
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                const errorData = await response.json();
                errorMsg = errorData.error || JSON.stringify(errorData);
            } else {
                // Handle HTML or text errors from the server/hosting platform
                errorMsg = await response.text();
            }
            throw new Error(errorMsg);
        }
        return response.json();
    }


    // --- INITIALIZATION ---
    function initializeApp() {
        fetchStructure();
        fetchMockTestBlueprint();
        addInitialEventListeners();
    }

    async function fetchStructure() {
        try {
            const response = await fetch('/api/get-structure');
            appState.structure = await handleApiResponse(response);
            if(appState.structure.error) {
                alert(`Error from server: ${appState.structure.error}.`);
            }
        } catch (error) {
            console.error('Error fetching structure:', error);
            document.getElementById('dynamic-selection-area').innerHTML = `<p class="error">Could not load test structure: ${error.message}</p>`;
        }
    }

    async function fetchMockTestBlueprint() {
        try {
            const response = await fetch('/api/get-mock-test-structure');
            appState.mockTestBlueprint = await handleApiResponse(response);
        } catch (error) {
            console.error('Error fetching mock test blueprint:', error);
            const mockTestBtn = document.getElementById('mock-test-btn');
            mockTestBtn.disabled = true;
            mockTestBtn.title = 'Could not load mock test data. Please refresh.';
            mockTestBtn.style.opacity = '0.5';
        }
    }

    function addInitialEventListeners() {
        document.getElementById('mock-test-btn').addEventListener('click', handleMockTestClick);
        document.querySelectorAll('.subject-btn').forEach(button => {
            button.addEventListener('click', () => handleSubjectSelection(button.dataset.subject));
        });
        document.querySelectorAll('.back-btn').forEach(button => {
            button.addEventListener('click', () => navigateToStep(button.dataset.target));
        });
        document.getElementById('modal-close-btn').addEventListener('click', () => languageModal.classList.add('hidden'));
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
                // Check if this selection was for a mock test or a standard one
                if (languageModal.dataset.testType === 'mock') {
                    languageModal.dataset.testType = ''; // Reset
                    generateMockTestQuestions();
                } else {
                    displayUnits(appState.selectedSubject);
                }
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
        if (subject === 'General Studies') {
            languageModal.dataset.testType = 'standard'; // Specify standard test
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
        appState.currentTopicPage = 0; // Reset page number
        renderCurrentTopicsPage();
    }
    
    function renderCurrentTopicsPage() {
        const allTopics = appState.structure[appState.selectedSubject][appState.selectedUnit] || [];
        const dynamicArea = document.getElementById('dynamic-selection-area');
        if (allTopics.length === 0) {
            dynamicArea.innerHTML += `<p class="error">No topics found for ${appState.selectedUnit.replace(/_/g, ' ')}. Please add .txt files.</p>`;
            return;
        }

        const startIndex = appState.currentTopicPage * TOPICS_PER_PAGE;
        const endIndex = startIndex + TOPICS_PER_PAGE;
        const pageTopics = allTopics.slice(startIndex, endIndex);

        let html = `<h3>Select a Topic from ${appState.selectedUnit.replace(/_/g, ' ')}</h3>`;
        pageTopics.forEach(topic => { html += `<button class="topic-btn" data-topic="${topic}">${topic.replace(/_/g, ' ')}</button>`; });
        
        const showPrev = appState.currentTopicPage > 0;
        const showNext = endIndex < allTopics.length;
        
        html += `<div class="pagination-controls">`;
        if (showPrev) html += `<button id="prev-topics-btn">Previous Topics</button>`;
        else html += `<div></div>`; // Placeholder for alignment
        if (showNext) html += `<button id="next-topics-btn">Next Topics</button>`;
        else html += `<div></div>`; // Placeholder for alignment
        html += `</div>`;

        dynamicArea.innerHTML = html;

        document.querySelectorAll('.topic-btn').forEach(button => {
            button.addEventListener('click', () => {
                appState.selectedTopic = button.dataset.topic;
                displayConfig();
            });
        });

        if (showPrev) {
            document.getElementById('prev-topics-btn').addEventListener('click', () => {
                appState.currentTopicPage--;
                renderCurrentTopicsPage();
            });
        }
        if (showNext) {
            document.getElementById('next-topics-btn').addEventListener('click', () => {
                appState.currentTopicPage++;
                renderCurrentTopicsPage();
            });
        }
    }

    function displayConfig() { navigateToStep('step-config'); }

    // --- TEST GENERATION ---
    async function startStandardTest() {
        loadingText.textContent = 'Generating your custom test with VidhAI... Please wait.';
        progressBar.style.width = '0%';
        progressBar.parentElement.classList.add('hidden'); // Hide progress bar for standard test
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
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
            });
            appState.testQuestions = await handleApiResponse(response);
            if (appState.testQuestions.length === 0) {
                throw new Error("The AI returned an empty list of questions. Please try again.");
            }
            const duration = parseInt(document.getElementById('test-duration').value) * 60;
            renderTest(duration, `${appState.selectedTopic.replace(/_/g, ' ')} Test`);
        } catch (error) {
            console.error('Error starting test:', error);
            alert(`Error: ${error.message}`);
            location.reload();
        } finally {
            loadingIndicator.classList.add('hidden');
        }
    }
    
    function handleMockTestClick() {
        languageModal.dataset.testType = 'mock'; // Specify mock test
        languageModal.classList.remove('hidden');
    }

    async function generateMockTestQuestions() {
        progressBar.parentElement.classList.remove('hidden'); // Show progress bar
        loadingIndicator.classList.remove('hidden');
        Object.values(uiSteps).forEach(step => step.classList.add('hidden'));

        appState.testQuestions = [];
        const allTasks = [];
        let totalQuestionsToGenerate = 0;

        appState.mockTestBlueprint.subjects.forEach(subject => {
            const lang = subject.language === 'USER_CHOICE' ? appState.generalStudiesLanguage : subject.language;
            subject.topics.forEach(topicInfo => {
                allTasks.push({ subject: subject.name, topic: topicInfo.topic, count: topicInfo.count, language: lang });
                totalQuestionsToGenerate += topicInfo.count;
            });
        });

        let questionsGeneratedSoFar = 0;
        for (const task of allTasks) {
            try {
                const progress = Math.round((questionsGeneratedSoFar / totalQuestionsToGenerate) * 100);
                progressBar.style.width = `${progress}%`;
                loadingText.textContent = `(${progress}%) Generating ${task.count} questions for "${task.topic}"...`;
                
                const response = await fetch('/api/generate-test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subject: task.subject,
                        topic: task.topic,
                        num_questions: task.count,
                        language: task.language,
                        unit: null // Mock test topics don't map to units
                    }),
                });

                const newQuestions = await handleApiResponse(response);
                if (!newQuestions || newQuestions.length === 0) {
                     throw new Error(`The AI returned no questions for ${task.topic}.`);
                }
                appState.testQuestions.push(...newQuestions);
                questionsGeneratedSoFar += newQuestions.length;

            } catch (error) {
                console.error('Error during mock test generation:', error);
                alert(`A problem occurred while generating the mock test: ${error.message}\nThe process has been stopped. Please try again.`);
                location.reload();
                return;
            }
        }
        
        loadingText.textContent = 'Finalizing your test...';
        progressBar.style.width = '100%';
        renderTest(180 * 60, "Full Mock Test"); // 3 hours
        loadingIndicator.classList.add('hidden');
    }

    function renderTest(durationInSeconds, testTitle) {
        selectionScreen.classList.add('hidden');
        testScreen.classList.remove('hidden');
        chatContainer.classList.remove('hidden');
        document.getElementById('test-title').textContent = testTitle;
        
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
        updatePaletteHighlight(); // Show answered status immediately
        const currentPaletteBtn = document.querySelector(`.palette-btn.current`);
        if(currentPaletteBtn) currentPaletteBtn.classList.add('answered');

        displayQuestion(appState.currentQuestionIndex); // Re-render to show selection
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
        if (appState.timerInterval) clearInterval(appState.timerInterval);
        
        appState.timerInterval = setInterval(() => {
            if (appState.isPaused) return;
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
        if(unanswered > 0) {
            if (confirm(`You have ${unanswered} unanswered questions. Are you sure you want to submit?`)) {
                submitTest();
            }
        } else {
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
            if (appState.userAnswers[i] === q.correct_answer_index) score++;
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
    function toggleChatWindow() { document.getElementById('chat-window').classList.toggle('hidden'); }

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
            const data = await handleApiResponse(response);
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