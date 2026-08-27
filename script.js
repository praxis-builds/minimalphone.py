const dateDisplay = document.getElementById("date-display");
const timeDisplay = document.getElementById("time-display");
const priorityInput = document.getElementById("priority-input");
const priorityForm = document.getElementById("priority-form");
const priorityDisplay = document.getElementById("priority-display"
);
const clearButton = document.getElementById("clear-button");
const taskForm = document.getElementById("task-form");
const taskInput = document.getElementById("task-input");
const taskList = document.getElementById("task-list");
const clearTasksButton = document.getElementById("clear-tasks-button");
const timerDisplay = document.getElementById("timer-display");
const startTimerButton = document.getElementById("start-timer-button");
const resetTimerButton = document.getElementById("reset-timer-button");
let tasks = JSON.parse(localStorage.getItem("tasks")) || [];
let completedTasks = JSON.parse(localStorage.getItem("completedTasks")) || [];

let timeRemaining = 25 * 60;
let timerInterval = null;

function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;

    timerDisplay.textContent =
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

updateTimerDisplay();



function updateClock() {

    const now = new Date();

    dateDisplay.textContent = now.toLocaleDateString("en-CA", {
        weekday: "long",
        month: "long",
        day: "numeric"
    });

    timeDisplay.textContent = now.toLocaleTimeString("en-CA", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

updateClock();
setInterval(updateClock, 1000);
const savedPriority = localStorage.getItem("priority");

if (savedPriority) {
    priorityDisplay.textContent = savedPriority;
}
tasks.forEach(function (task) {
    const listItem = document.createElement("li");
    listItem.textContent = task;

    if (completedTasks.includes(task)) {
        listItem.classList.add("completed");
    }

    taskList.appendChild(listItem);
});

priorityForm.addEventListener("submit", function (event) {
    event.preventDefault();
    
    const priority = priorityInput.value.trim();

    if (priority === "") {
        priorityDisplay.textContent = "Enter a priority first.";
        return;
    }

    priorityDisplay.textContent = priority;
    localStorage.setItem("priority", priority);
    priorityInput.value = "";
});

clearButton.addEventListener("click", function () {
    priorityDisplay.textContent = "";
    localStorage.removeItem("priority");
});

taskForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const task = taskInput.value.trim();

    if (task === "") {
        return;
    }
    tasks.push(task);
    if (tasks.length >= 10) {
    alert("Maximum 10 tasks.");
    return;
}
    console.log(tasks);
    localStorage.setItem("tasks", JSON.stringify(tasks));

    const listItem = document.createElement("li");
    listItem.textContent = task;
    taskList.appendChild(listItem);

    taskInput.value = "";
});

taskList.addEventListener("click", function (event) {
    if (event.target.tagName === "LI") {
        const clickedTask = event.target.textContent;

        event.target.classList.toggle("completed");

        if (event.target.classList.contains("completed")) {
            completedTasks.push(clickedTask);
        } else {
            completedTasks = completedTasks.filter(function (task) {
                return task !== clickedTask;
            });
        }

        localStorage.setItem(
            "completedTasks",
            JSON.stringify(completedTasks)
        );
    }
});

clearTasksButton.addEventListener("click", function () {
    tasks = [];
    completedTasks = [];

    localStorage.removeItem("tasks");
    localStorage.removeItem("completedTasks");

    taskList.innerHTML = "";
});
startTimerButton.addEventListener("click", function () {
    if (timerInterval !== null) {
        clearInterval(timerInterval);
        timerInterval = null;
        startTimerButton.textContent = "Start";
        return;
    }

    startTimerButton.textContent = "Pause";

    timerInterval = setInterval(function () {
        if (timeRemaining > 0) {
            timeRemaining--;
            updateTimerDisplay();
        } else {
            clearInterval(timerInterval);
            timerInterval = null;
            startTimerButton.textContent = "Start";
            alert("Focus session complete.");
        }
    }, 1000);
});
resetTimerButton.addEventListener("click", function () {
    clearInterval(timerInterval);
    timerInterval = null;
    startTimerButton.textContent = "Start";s
    timeRemaining = 25 * 60;
    updateTimerDisplay();
});
if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
        navigator.serviceWorker
            .register("./service-worker.js")
            .catch(function (error) {
                console.error("Service worker registration failed:", error);
            });
    });
}