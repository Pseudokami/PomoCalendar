// --- Supabase Config ---
const SUPABASE_URL = 'https://zgecgmpkjwsoesomzqfs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZWNnbXBrandzb2Vzb216cWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2NjAxMzEsImV4cCI6MjA4MDIzNjEzMX0.itaV4d8e2pHoWF4pQYroFepV5sSEPzpNPKAX_zcORCI';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Global Constants & State ---
const TIMER_DURATIONS = {
    pomodoro: 1500, // 25 min
    shortBreak: 300, 
    longBreak: 900
};

let currentMode = 'pomodoro';
let timeLeft = TIMER_DURATIONS[currentMode];
let timerInterval = null;
let clockInterval = null; 
let isRunning = false;
let cycle = 1;
let activeTaskId = null;
let currentUser = null; 

let globalTasks = []; 

// Generate Today's date string using Local Time (not ISO/UTC)
let currentDate = new Date(); 
let selectedDateString = getLocalDateString(new Date());

// --- DOM Elements ---
const timerDisplay = document.getElementById('timer-display');
const startButton = document.getElementById('start-button');
const statusMessage = document.getElementById('status-message');
const cycleCount = document.getElementById('cycle-count');
const focusedTaskDisplay = document.getElementById('focused-task');
const taskListContainer = document.getElementById('task-list');
const newTaskDate = document.getElementById('new-task-date');
const selectedDateDisplay = document.getElementById('selected-date-display');
const taskFilterDateDisplay = document.getElementById('current-task-filter-date');
const modalContainer = document.getElementById('modal-container');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const skipButton = document.getElementById('skip-button');
const appBody = document.getElementById('app-body');


// --- Utility Functions ---
function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; 
    const day = date.getDate();
    return `${year}-${pad(month)}-${pad(day)}`;
}

function formatDate(dateString) {
    const [y, m, d] = dateString.split('-').map(Number);
    const date = new Date(y, m - 1, d); 
    
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.getTime() === today.getTime()) return 'Today';
    if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function pad(number) {
    return number.toString().padStart(2, '0');
}


// --- Clock Functions ---
function displayCurrentClock() {
    const now = new Date();
    timerDisplay.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    document.title = "PomoFocus Calendar & Timer";
}

function startClock() {
    if (clockInterval) clearInterval(clockInterval);
    displayCurrentClock();
    clockInterval = setInterval(displayCurrentClock, 10000);
}

function stopClock() {
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = null;
}


// --- Modal Functions ---
function closeModal() {
    modalContainer.classList.add('hidden');
    modalContainer.classList.remove('flex');
}

function showModal(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalContainer.classList.remove('hidden');
    modalContainer.classList.add('flex');
}


// --- SUPABASE TASK LOGIC ---
async function fetchTasks() {
    if (!currentUser) return;

    taskListContainer.innerHTML = '<p class="text-center text-gray-medium pt-4">Loading tasks...</p>';

    const { data, error } = await supabaseClient
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching tasks:', error);
        return;
    }

    globalTasks = data || [];
    renderTasksForSelectedDate();
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
}

async function addTask() {
    if (!currentUser) {
        showModal('Login Required', 'Please login to save tasks.');
        return;
    }

    const newTaskTitle = document.getElementById('new-task-title');
    const newTaskDuration = document.getElementById('new-task-duration');
    const newTaskInstances = document.getElementById('new-task-instances'); // <--- NEW LINE

    const title = newTaskTitle.value.trim();
    const date = newTaskDate.value;

    // --- STRICT VALIDATION ---
    if (newTaskDuration.validity.badInput) {
        showModal('Input Error', 'Please only input integers!');
        return;
    }

    const durationInputStr = newTaskDuration.value.trim();
    let duration = 25; // Default

    if (durationInputStr !== '') {
        if (!/^\d+$/.test(durationInputStr)) {
            showModal('Input Error', 'Please only input integers!');
            return;
        }
        const durationNum = parseInt(durationInputStr, 10);
        if (durationNum < 1) {
            showModal('Input Error', 'Please only input positive integers!');
            return;
        }
        duration = (durationNum > 999) ? 999 : durationNum;
    }

    let targetInstances = 1; // Default
    if (newTaskInstances) {
        const val = parseInt(newTaskInstances.value);
        if (val > 0 && val <= 99) {
            targetInstances = val;
        }
    }

    if (title === '' || date === '') {
        showModal('Input Error', 'Please enter a title and valid date.');
        return;
    }

    const isDuplicate = globalTasks.some(t => 
        t.title.toLowerCase() === title.toLowerCase() && 
        t.date === date
    );

    if (isDuplicate) {
        showModal('Input Error', 'Task already exists!');
        return;
    }

    const tempTask = {
        id: 'temp-' + Date.now(),
        user_id: currentUser.id,
        title: title,
        date: date,
        duration: duration,
        completed: false,
        created_at: new Date().toISOString(),
        target_instances: targetInstances,
        completed_instances: 0
    };

    globalTasks.push(tempTask);
    renderTasksForSelectedDate();
    
    const { data, error } = await supabaseClient
        .from('tasks')
        .insert([{ 
            user_id: currentUser.id, 
            title: title, 
            date: date, 
            duration: duration,
            target_instances: targetInstances,
            completed_instances: 0
        }])
        .select();

    if (error) {
        console.error('Error adding task:', error);
        showModal('Error', 'Failed to save task.');
        globalTasks = globalTasks.filter(t => t.id !== tempTask.id);
        renderTasksForSelectedDate();
    } else {
        globalTasks = globalTasks.filter(t => t.id !== tempTask.id);
        globalTasks.push(data[0]);
        renderTasksForSelectedDate();
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    }

    newTaskTitle.value = '';
    newTaskDuration.value = ''; 
    if (newTaskInstances) newTaskInstances.value = '1';
}

async function toggleTaskDone(taskId, completed) {
    const taskIndex = globalTasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
        globalTasks[taskIndex].completed = completed;
        renderTasksForSelectedDate();
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    }

    const { error } = await supabaseClient
        .from('tasks')
        .update({ completed: completed })
        .eq('id', taskId);

    if (error) console.error('Error updating task:', error);
}

async function deleteTask(taskId) {
    globalTasks = globalTasks.filter(t => t.id !== taskId);
    renderTasksForSelectedDate();
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());

    const { error } = await supabaseClient
        .from('tasks')
        .delete()
        .eq('id', taskId);
        
    if (error) console.error('Error deleting task:', error);
}

// --- Clear All Finished Tasks ---
async function clearFinishedTasks() {
    if (!currentUser) return;

    const completedCount = globalTasks.filter(t => t.completed).length;
    if (completedCount === 0) {
        showModal('No Tasks', 'You have no finished tasks to clear.');
        return;
    }

    if (!confirm(`Are you sure you want to delete ${completedCount} finished task(s)? This cannot be undone.`)) {
        return;
    }

    globalTasks = globalTasks.filter(t => !t.completed);
    
    renderTasksForSelectedDate();
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());

    const { error } = await supabaseClient
        .from('tasks')
        .delete()
        .eq('completed', true)
        .eq('user_id', currentUser.id);

    if (error) {
        console.error('Error clearing tasks:', error);
        showModal('Error', 'Failed to delete some tasks from the database.');
    }
}

function renderTasksForSelectedDate() {
    const filteredTasks = globalTasks
        .filter(t => t.date === selectedDateString)
        .sort((a, b) => (a.completed - b.completed) || (b.duration - a.duration));

    taskListContainer.innerHTML = '';
    taskFilterDateDisplay.textContent = formatDate(selectedDateString);

    if (filteredTasks.length === 0) {
        taskListContainer.innerHTML = '<p class="text-center text-gray-medium pt-4">No tasks scheduled for this day. Defaulting to Focus (25m).</p>';
        if (!isRunning) switchMode('pomodoro');
        return;
    } else {
        if (!isRunning) switchMode('pomodoro');
    }

    filteredTasks.forEach(task => {
        const li = document.createElement('li');
        const completedClass = task.completed ? 'opacity-50 line-through' : 'bg-white shadow hover:shadow-md';
        const titleClass = task.completed ? 'text-gray-medium' : 'text-dark-text';

        li.className = `flex items-center justify-between p-4 rounded-xl transition duration-150 ease-in-out border border-gray-200 ${completedClass}`;

        const currentRep = (task.completed_instances || 0);
        const totalReps = (task.target_instances || 1);
        
        let repBadge = '';
        if (totalReps > 1) {
            repBadge = `<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                Rep ${currentRep}/${totalReps}
            </span>`;
        }

        li.innerHTML = `
            <div class="flex items-center space-x-4 min-w-0 flex-1">
                <input type="checkbox" ${task.completed ? 'checked' : ''} 
                    onchange="toggleTaskDone('${task.id}', this.checked)" 
                    class="task-checkbox h-5 w-5 rounded-full border-gray-300 bg-gray-100 checked:bg-primary-color focus:ring-primary-color shrink-0">
                
                <div class="flex flex-col min-w-0">
                    <span class="task-title text-base font-medium truncate ${titleClass}" title="${task.title}">
                        ${task.title}
                    </span>
                    <div class="flex items-center text-xs text-gray-medium mt-0.5">
                        <span>${task.duration} min focus</span>
                        ${repBadge} </div>
                </div>
            </div>

            <div class="flex space-x-2 shrink-0">
                <button onclick="startTaskFocus('${task.id}', ${task.duration}, '${task.title}')" 
                    class="text-sm font-medium py-1 px-3 rounded-lg bg-primary-color text-white hover:opacity-90 transition ${task.completed ? 'hidden' : ''}">
                    Focus
                </button>
                <button onclick="deleteTask('${task.id}')" class="text-gray-medium hover:text-red-500 transition p-1 rounded-full hover:bg-red-50" title="Delete Task">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        `;
        taskListContainer.appendChild(li);
    });
}


// --- Calendar Functions ---
function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
}

function selectDate(dateString, element) {
    if (isRunning) {
        showModal('Timer Running', 'Please pause the timer before changing the selected date.');
        return;
    }
    document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
    element.classList.add('selected');

    selectedDateString = dateString;
    newTaskDate.value = dateString;
    selectedDateDisplay.textContent = formatDate(selectedDateString);
    renderTasksForSelectedDate();
}

function renderCalendar(year, month) {
    const grid = document.getElementById('calendar-grid');
    const display = document.getElementById('month-year-display');
    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const todayString = getLocalDateString(new Date()); 
    
    // Only highlight days with INCOMPLETE tasks
    const activeTaskDates = new Set(
        globalTasks
        .filter(t => !t.completed) 
        .map(t => t.date)
    );

    display.textContent = firstDay.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    let startDay = firstDay.getDay(); 
    for (let i = 0; i < startDay; i++) {
        grid.appendChild(document.createElement('div'));
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
        const dateString = `${year}-${pad(month + 1)}-${pad(i)}`;
        
        const dayCell = document.createElement('div');
        dayCell.textContent = i;
        dayCell.className = 'calendar-day relative aspect-square flex items-center justify-center';

        if (activeTaskDates.has(dateString)) dayCell.classList.add('has-tasks');
        
        if (dateString === todayString) dayCell.classList.add('border-2', 'border-primary-color'); 
        if (dateString === selectedDateString) dayCell.classList.add('selected');

        dayCell.onclick = () => selectDate(dateString, dayCell);
        grid.appendChild(dayCell);
    }
}


// --- Core Timer Functions ---
function updateDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerDisplay.textContent = `${pad(minutes)}:${pad(seconds)}`;
    document.title = `${pad(minutes)}:${pad(seconds)} - ${currentMode.toUpperCase()}`;
}

function setTheme(mode) {
    appBody.classList.remove('matcha-theme', 'blue-theme'); 
    if (mode === 'longBreak') appBody.classList.add('matcha-theme');
    else if (mode === 'shortBreak') appBody.classList.add('blue-theme');
}

function switchMode(mode, customDurationMinutes = null) {
    if (isRunning) {
        showModal('Timer Active', 'Please pause before switching.');
        return;
    }

    stopClock();
    clearInterval(timerInterval);
    isRunning = false;
    currentMode = mode;
    skipButton.classList.add('hidden');

    let durationSeconds = TIMER_DURATIONS[mode];

    if (mode === 'pomodoro' && customDurationMinutes !== null) {
        durationSeconds = customDurationMinutes * 60;
        focusedTaskDisplay.textContent = `FOCUS: ${customDurationMinutes} minutes`;
        statusMessage.textContent = 'Focusing on assigned task.';
    } else {
        focusedTaskDisplay.textContent = '';
        statusMessage.textContent = mode === 'pomodoro' ? 'Ready to focus.' : 'Time for a break!';
    }

    timeLeft = durationSeconds;
    setTheme(mode); 

    startButton.textContent = 'START';
    startButton.classList.remove('animate-none');
    startButton.classList.add('animate-pulse');

    cycleCount.textContent = mode === 'pomodoro' ? `#${cycle}` : 'Break!';

    document.querySelectorAll('.mode-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`[data-mode="${mode}"]`).classList.add('active');

    updateDisplay();
}

function startTaskFocus(taskId, durationMinutes, title) {
    if (isRunning) {
        showModal('Timer Active', 'Pause timer first.');
        return;
    }
    activeTaskId = taskId;
    switchMode('pomodoro', durationMinutes);
    focusedTaskDisplay.textContent = `TASK: ${title}`;
    statusMessage.textContent = 'Ready to focus on task!';
}

function toggleTimer() {
    if (isRunning) {
        const clickSound = new Audio('assets/button-click.wav');
        clickSound.volume = 0.5; 
        clickSound.play().catch(e => console.error("Click sound failed:", e));

        clearInterval(timerInterval);
        isRunning = false;
        startButton.textContent = 'RESUME';
        startButton.classList.remove('animate-pulse');
        skipButton.classList.remove('hidden'); 
        return;
    }

    if (timeLeft === 0) {
        switchMode(currentMode);
        return;
    }

    const startSound = new Audio('assets/button-click.wav');
    startSound.volume = 0.5; 
    startSound.play().catch(e => console.error("Click sound failed:", e));

    if (currentMode === 'pomodoro' && !activeTaskId && timeLeft === TIMER_DURATIONS.pomodoro) {
        focusedTaskDisplay.textContent = 'Default 25-minute Focus';
        statusMessage.textContent = 'Default focus session active.';
    }

    stopClock();
    isRunning = true;
    startButton.textContent = 'PAUSE';
    startButton.classList.remove('animate-pulse');
    skipButton.classList.remove('hidden'); 

    timerInterval = setInterval(() => {
        timeLeft--;
        updateDisplay();
        if (timeLeft <= 0) handleTimerEnd();
    }, 1000);
}

function resetTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    activeTaskId = null;
    skipButton.classList.add('hidden');
    switchMode(currentMode, null);
    statusMessage.textContent = 'Timer reset.';
}

async function handleTimerEnd() {
    clearInterval(timerInterval);
    isRunning = false;
    skipButton.classList.add('hidden');

    const audio = new Audio('assets/alarm.mp3');
    audio.play().catch(e => console.error("Audio playback failed:", e));

    if (currentMode === 'pomodoro') {
        
        if (activeTaskId) {
            const taskIndex = globalTasks.findIndex(t => t.id === activeTaskId);
            
            if (taskIndex !== -1) {
                const task = globalTasks[taskIndex];
                
                const newCompletedCount = (task.completed_instances || 0) + 1;
                
                globalTasks[taskIndex].completed_instances = newCompletedCount;

                if (newCompletedCount >= task.target_instances) {
                    toggleTaskDone(activeTaskId, true);
                    activeTaskId = null;
                    showModal('Task Complete!', 'Great work! You finished all sessions.');
                } else {
                    
                    await supabaseClient
                        .from('tasks')
                        .update({ completed_instances: newCompletedCount })
                        .eq('id', activeTaskId);

                    renderTasksForSelectedDate();

                    showModal('Session Complete!', `Rep ${newCompletedCount} done. Take a break, then Rep ${newCompletedCount + 1}!`);
                }
            }
        } else {
            showModal('Focus Finished!', 'Good job!');
        }

        cycle++;
        switchMode((cycle - 1) % 4 === 0 ? 'longBreak' : 'shortBreak');

    } else {
        showModal('Break Finished!', 'Back to work!');
        if (activeTaskId) {
            const task = globalTasks.find(t => t.id === activeTaskId);
            if (task) {
                switchMode('pomodoro', task.duration);
                focusedTaskDisplay.textContent = `RESUMING: ${task.title}`;
            } else {
                switchMode('pomodoro');
            }
        } else {
            switchMode('pomodoro');
        }
    }
    
    startButton.textContent = 'START';
    startButton.classList.add('animate-pulse');
}

function skipTimer() {
    if (!isRunning && timeLeft === TIMER_DURATIONS[currentMode]) return;
    timeLeft = 1; 
    updateDisplay();
}


// --- Initialization ---
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    const welcomeHeader = document.querySelector('header h1');
    const authBtns = document.querySelectorAll('.auth-login-btn, .auth-signup-btn');

    if (session) {
        currentUser = session.user;
        welcomeHeader.textContent = `Hi, ${currentUser.user_metadata.full_name || 'User'}!`;
        authBtns.forEach(btn => btn.style.display = 'none');
        
        const headerDiv = document.querySelector('header .flex.items-center.space-x-2');
        const logoutBtn = document.createElement('button');
        logoutBtn.innerText = 'Logout';
        logoutBtn.className = 'text-sm font-bold text-gray-medium hover:text-red-500 transition px-2 py-2';
        logoutBtn.onclick = async () => {
            await supabaseClient.auth.signOut();
            window.location.reload();
        };
        headerDiv.appendChild(logoutBtn);

        fetchTasks();
    } else {
        welcomeHeader.textContent = "Welcome Guest";
        taskListContainer.innerHTML = '<p class="text-center text-gray-medium pt-4">Please log in to manage tasks.</p>';
    }
}

window.onload = function () {
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            if (isRunning) {
                 showModal('Timer Active', 'Pause first.');
                 return;
            }
            activeTaskId = null;
            switchMode(e.target.dataset.mode);
        });
    });

    window.closeModal = closeModal;
    window.addTask = addTask;
    window.toggleTimer = toggleTimer;
    window.resetTimer = resetTimer;
    window.changeMonth = changeMonth;
    window.startTaskFocus = startTaskFocus;
    window.toggleTaskDone = toggleTaskDone;
    window.deleteTask = deleteTask;
    window.skipTimer = skipTimer;
    window.openLogin = () => window.location.href = 'auth.html?mode=login';
    window.openRegister = () => window.location.href = 'auth.html?mode=signup';

    newTaskDate.value = selectedDateString;
    selectedDateDisplay.textContent = formatDate(selectedDateString);

    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    checkSession();

    // Clear Finished Tasks Button
    const clearBtn = document.createElement('button');
    clearBtn.innerText = 'Clear Finished Tasks';
    clearBtn.className = 'fixed bottom-6 right-6 bg-red-500 text-white font-bold py-3 px-6 rounded-full shadow-2xl hover:bg-red-600 transition z-50 hover:scale-105 active:scale-95 flex items-center shadow-red-500/20';
    clearBtn.onclick = clearFinishedTasks;
    document.body.appendChild(clearBtn);
};