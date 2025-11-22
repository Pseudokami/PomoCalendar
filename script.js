// --- Global Constants & State ---
const TIMER_DURATIONS = {
    pomodoro: 1500, // 25 minutes
    shortBreak: 300, // 5 minutes
    longBreak: 900 // 15 minutes
};
const TASKS_KEY = 'pomo_tasks_v2'; // Key for localStorage

let currentMode = 'pomodoro';
let timeLeft = TIMER_DURATIONS[currentMode];
let timerInterval = null;
let clockInterval = null; 
let isRunning = false;
let cycle = 1;
let activeTaskId = null;

let currentDate = new Date(); // Tracks the currently displayed calendar month
let selectedDateString = new Date().toISOString().split('T')[0]; // Tracks the selected day (YYYY-MM-DD)

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

// Body element for theme switching
const appBody = document.getElementById('app-body');


// --- Utility Functions ---

/** Formats a date string (YYYY-MM-DD) into a readable format. */
function formatDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const isToday = date.toDateString() === today.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    if (isToday) return 'Today';
    if (isTomorrow) return 'Tomorrow';

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Pads a number with leading zeros for display. */
function pad(number) {
    return number.toString().padStart(2, '0');
}

// --- Clock Functions (kept for robustness, though not primary) ---

/** Displays the current time in the timer display area. */
function displayCurrentClock() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    timerDisplay.textContent = `${pad(hours)}:${pad(minutes)}`;
    document.title = "PomoFocus Calendar & Timer";
}

/** Manages the real-time clock interval. */
function startClock() {
    if (clockInterval) clearInterval(clockInterval);
    displayCurrentClock();
    clockInterval = setInterval(displayCurrentClock, 10000);
}

/** Stops the real-time clock interval. */
function stopClock() {
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = null;
}


// --- Modal Functions (for alerts) ---

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

// --- Task Storage (Local Simulation) ---

/** Retrieves all tasks from localStorage. */
function getTasksFromStorage() {
    const tasksJson = localStorage.getItem(TASKS_KEY);
    return tasksJson ? JSON.parse(tasksJson) : [];
}

/** Saves the updated list of tasks to localStorage. */
function saveTasksToStorage(tasks) {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

/** Adds a new task to storage. */
function addTask() {
    const newTaskTitle = document.getElementById('new-task-title');
    const newTaskDuration = document.getElementById('new-task-duration');
    const title = newTaskTitle.value.trim();
    const date = newTaskDate.value;
    const duration = parseInt(newTaskDuration.value);

    if (title === '' || date === '' || duration < 1) {
        showModal('Input Error', 'Please enter a title, valid date, and duration for the task.');
        return;
    }

    const tasks = getTasksFromStorage();
    const newTask = {
        id: crypto.randomUUID(),
        title: title,
        date: date, // YYYY-MM-DD string
        durationMinutes: duration,
        completed: false,
        createdAt: Date.now()
    };

    tasks.push(newTask);
    saveTasksToStorage(tasks);

    // Update UI
    newTaskTitle.value = '';
    newTaskDuration.value = '50';
    renderTasksForSelectedDate();
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Refresh calendar for task markers
}

/** Updates a task's 'completed' status in storage. */
function toggleTaskDone(taskId, completed) {
    const tasks = getTasksFromStorage();
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
        tasks[taskIndex].completed = completed;
        saveTasksToStorage(tasks);
        renderTasksForSelectedDate();
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth()); // Refresh calendar for task markers
    }
}

/** Deletes a task from storage. */
function deleteTask(taskId) {
    const tasks = getTasksFromStorage();
    const updatedTasks = tasks.filter(t => t.id !== taskId);
    saveTasksToStorage(updatedTasks);
    renderTasksForSelectedDate();
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
}

/** Renders the tasks for the currently selected date. */
function renderTasksForSelectedDate() {
    const allTasks = getTasksFromStorage();

    // Sort tasks: Incomplete first, then by duration
    const filteredTasks = allTasks
        .filter(t => t.date === selectedDateString)
        .sort((a, b) => (a.completed - b.completed) || (b.durationMinutes - a.durationMinutes));

    taskListContainer.innerHTML = ''; // Clear existing list

    taskFilterDateDisplay.textContent = formatDate(selectedDateString);

    if (filteredTasks.length === 0) {
        taskListContainer.innerHTML = '<p class="text-center text-gray-medium pt-4">No tasks scheduled for this day. Defaulting to Focus (25m).</p>';
        // If no tasks, switch to Pomodoro mode
        switchMode('pomodoro');
        return;
    } else {
        // If tasks are present, switch back to Pomodoro mode (if not running)
        if (!isRunning) {
            switchMode('pomodoro');
        }
    }

    filteredTasks.forEach(task => {
        const li = document.createElement('li');
        const completedClass = task.completed ? 'opacity-50 line-through' : 'bg-white shadow hover:shadow-md';
        const titleClass = task.completed ? 'text-gray-medium' : 'text-dark-text';

        li.className = `flex items-center justify-between p-4 rounded-xl transition duration-150 ease-in-out border border-gray-200 ${completedClass}`;

        li.innerHTML = `
            <div class="flex items-center space-x-4 min-w-0 flex-1">
                <input type="checkbox" ${task.completed ? 'checked' : ''} 
                    onchange="toggleTaskDone('${task.id}', this.checked)" 
                    class="task-checkbox h-5 w-5 rounded-full border-gray-300 bg-gray-100 checked:bg-primary-color focus:ring-primary-color shrink-0">
                <div class="flex flex-col min-w-0">
                    <span class="task-title text-base font-medium truncate ${titleClass}" title="${task.title}">${task.title}</span>
                    <span class="text-xs text-gray-medium">${task.durationMinutes} min focus</span>
                </div>
            </div>
            <div class="flex space-x-2 shrink-0">
                <button onclick="startTaskFocus('${task.id}', ${task.durationMinutes}, '${task.title}')" 
                    class="text-sm font-medium py-1 px-3 rounded-lg bg-primary-color text-white hover:opacity-90 transition ${task.completed ? 'hidden' : ''}">
                    Focus
                </button>
                <button onclick="deleteTask('${task.id}')" class="text-gray-medium hover:text-red-500 transition p-1 rounded-full hover:bg-red-50" title="Delete Task">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        `;
        taskListContainer.appendChild(li);
    });
}


// --- Calendar Functions ---

/** Updates the global calendar month/year. */
function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
}

/** Handles clicking a date on the calendar. */
function selectDate(dateString, element) {
    // Do not interrupt a running timer when selecting a date
    if (isRunning) {
        showModal('Timer Running', 'Please pause the timer before changing the selected date.');
        return;
    }

    // Remove 'selected' class from all previous days
    document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));

    // Add 'selected' class to the clicked day
    element.classList.add('selected');

    selectedDateString = dateString;
    newTaskDate.value = dateString; // Update new task input date
    selectedDateDisplay.textContent = formatDate(selectedDateString); // Update new task button label
    renderTasksForSelectedDate(); // Filter and render tasks, which handles mode switch
}

/** Renders the calendar grid for a specific month. */
function renderCalendar(year, month) {
    const grid = document.getElementById('calendar-grid');
    const display = document.getElementById('month-year-display');
    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const todayString = new Date().toISOString().split('T')[0];
    const allTasks = getTasksFromStorage();
    const taskDates = new Set(allTasks.map(t => t.date));

    display.textContent = firstDay.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    // Calculate start padding (empty cells before the 1st)
    let startDay = firstDay.getDay(); // 0 (Sunday) to 6 (Saturday)
    for (let i = 0; i < startDay; i++) {
        const emptyCell = document.createElement('div');
        grid.appendChild(emptyCell);
    }

    // Render days
    for (let i = 1; i <= lastDay.getDate(); i++) {
        const date = new Date(year, month, i);
        const dateString = date.toISOString().split('T')[0];
        const dayCell = document.createElement('div');

        dayCell.textContent = i;
        dayCell.className = 'calendar-day';
        dayCell.classList.add('relative', 'aspect-square', 'flex', 'items-center', 'justify-center');

        // Check for tasks
        if (taskDates.has(dateString)) {
            dayCell.classList.add('has-tasks');
        }

        // Highlight today
        if (dateString === todayString) {
            // This class is targeted by CSS for theme changes
            dayCell.classList.add('border-2', 'border-primary-color'); 
        }

        // Highlight selected date
        if (dateString === selectedDateString) {
            dayCell.classList.add('selected');
        }

        dayCell.onclick = () => selectDate(dateString, dayCell);
        grid.appendChild(dayCell);
    }
}


// --- Core Timer Functions ---

/** Updates the timer display and document title. */
function updateDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeStr = `${pad(minutes)}:${pad(seconds)}`;
    timerDisplay.textContent = timeStr;
    document.title = timeStr + ` - ${currentMode.toUpperCase()}`;
}

/** Applies or removes the theme classes based on the current mode. */
function setTheme(mode) {
    // 1. Clear all theme classes first
    appBody.classList.remove('matcha-theme', 'blue-theme'); 

    // 2. Apply the specific theme based on mode
    if (mode === 'longBreak') {
        appBody.classList.add('matcha-theme');
    } else if (mode === 'shortBreak') { // NEW: Apply blue theme for Short Break
        appBody.classList.add('blue-theme');
    } 
    // Default (pomodoro) needs no class.
}

/** Switches the timer mode. */
function switchMode(mode, customDurationMinutes = null) {
    if (isRunning) {
        showModal('Timer Active', 'Please pause the current timer before switching modes or starting a new task.');
        return;
    }

    stopClock(); // Stop the real-time clock if it was running (reusing existing clock function)

    clearInterval(timerInterval);
    isRunning = false;
    currentMode = mode;

    let durationSeconds = TIMER_DURATIONS[mode];

    // Custom Pomodoro duration based on task assignment
    if (mode === 'pomodoro' && customDurationMinutes !== null) {
        durationSeconds = customDurationMinutes * 60;
        focusedTaskDisplay.textContent = `FOCUS: ${customDurationMinutes} minutes`;
        statusMessage.textContent = 'Focusing on assigned task.';
    } else {
        activeTaskId = null;
        focusedTaskDisplay.textContent = '';
        if (mode === 'pomodoro') {
            statusMessage.textContent = 'Ready to start a default focus session.';
        } else {
            statusMessage.textContent = 'Time for a break!';
        }
    }

    timeLeft = durationSeconds;

    // Apply the theme change BEFORE updating UI elements
    setTheme(mode); 

    // Update UI elements
    startButton.textContent = 'START';
    startButton.classList.remove('animate-none');
    startButton.classList.add('animate-pulse');

    cycleCount.textContent = mode === 'pomodoro' ? `#${cycle}` : 'Break!';

    // Update tab styles
    document.querySelectorAll('.mode-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`[data-mode="${mode}"]`).classList.add('active');

    updateDisplay();
}

/** Assigns a task's duration to the pomodoro timer and sets it as active. */
function startTaskFocus(taskId, durationMinutes, title) {
    if (isRunning) {
        showModal('Timer Active', 'Please pause the current timer before starting a new task.');
        return;
    }
    activeTaskId = taskId;
    switchMode('pomodoro', durationMinutes);
    focusedTaskDisplay.textContent = `TASK: ${title}`;
    statusMessage.textContent = 'Ready to focus on task!';
}

/** Main function to start, pause, or resume the timer. */
function toggleTimer() {
    // 1. PAUSE LOGIC (Takes absolute priority if running)
    if (isRunning) {
        clearInterval(timerInterval);
        isRunning = false;
        startButton.textContent = 'RESUME';
        startButton.classList.remove('animate-pulse');
        return;
    }

    // 2. START/RESUME LOGIC (Only runs if not running)

    // Check constraints BEFORE starting
    if (timeLeft === 0) {
        // If the timer is at zero and paused, reset the state
        if (currentMode === 'pomodoro') {
            switchMode('pomodoro');
        } else {
            // Break timers should reset based on cycle context, but here we just reset the time
            switchMode(currentMode);
        }
        return;
    }

    // Handle starting a Pomodoro session when no task is attached but time is set to 25:00
    if (currentMode === 'pomodoro' && !activeTaskId && timeLeft === TIMER_DURATIONS.pomodoro) {
        focusedTaskDisplay.textContent = 'Default 25-minute Focus';
        statusMessage.textContent = 'Default focus session active.';
    }

    // Stop the clock if it was running (in the no-task state)
    stopClock();

    // If we reach here, we are starting/resuming
    isRunning = true;
    startButton.textContent = 'PAUSE';
    startButton.classList.remove('animate-pulse');

    timerInterval = setInterval(() => {
        timeLeft--;
        updateDisplay();

        if (timeLeft <= 0) {
            handleTimerEnd();
        }
    }, 1000);
}

/** Resets the current timer mode back to its initial time. */
function resetTimer() {
    // Stop the timer if it's running
    clearInterval(timerInterval);
    isRunning = false;
    activeTaskId = null; // Clear any active task

    // Call switchMode to reset the time, UI, and state for the current mode
    switchMode(currentMode, null);

    statusMessage.textContent = 'Timer reset. Ready to start.';
}

/** Handles actions when the timer reaches zero. */
function handleTimerEnd() {
    clearInterval(timerInterval);
    isRunning = false;

    // Simple sound notification (a quick sine wave beep, synthesized)
    const audio = new Audio('data:audio/wav;base64,UklGRqj4AABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAAABkYXRh4qj3AAAI');
    audio.play().catch(e => console.error("Audio playback failed:", e));

    if (currentMode === 'pomodoro') {
        if (activeTaskId) {
            // Only log task completion if the timer matches the task's duration (simple check)
            const tasks = getTasksFromStorage();
            const task = tasks.find(t => t.id === activeTaskId);
            if (task && task.durationMinutes * 60 === TIMER_DURATIONS.pomodoro) {
                toggleTaskDone(activeTaskId, true); // Log completion
            }
            activeTaskId = null; // Clear active task
        }

        showModal('Focus Finished!', 'Time for a break! Your progress has been logged.');

        cycle++;
        if ((cycle - 1) % 4 === 0) {
            switchMode('longBreak');
        } else {
            switchMode('shortBreak');
        }

    } else {
        showModal('Break Finished!', 'Time to get back to work!');
        switchMode('pomodoro');
    }

    // Ensure the button is reset for the new mode
    startButton.textContent = 'START';
    startButton.classList.add('animate-pulse');
}

// --- Initialization ---
window.onload = function () {
    // Setup mode tab click handlers
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            if (isRunning) {
                 showModal('Timer Active', 'Please pause the current timer before switching modes.');
                 return;
            }
            activeTaskId = null; // Clear active task when manually changing mode
            switchMode(e.target.dataset.mode);
        });
    });

    // Make functions globally accessible for HTML onclick attributes
    window.closeModal = closeModal;
    window.addTask = addTask;
    window.toggleTimer = toggleTimer;
    window.resetTimer = resetTimer;
    window.changeMonth = changeMonth;
    window.startTaskFocus = startTaskFocus;
    window.toggleTaskDone = toggleTaskDone;
    window.deleteTask = deleteTask;

    // Set default date for task input and calendar
    newTaskDate.value = selectedDateString;
    selectedDateDisplay.textContent = formatDate(selectedDateString);

    // Initial render
    renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    renderTasksForSelectedDate(); // Load tasks for today initially (and handles mode switch)
};