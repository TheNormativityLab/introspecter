# Local Setup Guide

For most development work, we recommend running Introspecter inside a **Dev Container**. This ensures you have all dependencies, databases, and tools pre-installed without messing up your local machine.

## 1. Prerequisites

Ensure you have the following tools installed.

=== "Windows"

    **1. Docker Desktop**  
    [Download here](https://www.docker.com/products/docker-desktop/). When installing, ensure **WSL 2** is selected.

    **2. VSCode**  
    [Download here](https://code.visualstudio.com/).

    **3. Dev Containers Extension**  
    Open VSCode, press `Ctrl+Shift+X`, and install **Dev Containers** (Microsoft).

    **4. Git**  
    [Download Git for Windows](https://git-scm.com/download/win).

=== "macOS"

    **1. Docker Desktop**  
    [Download here](https://www.docker.com/products/docker-desktop/). Choose *Apple Silicon* (M1/M2/M3) or *Intel* based on your machine.

    **2. VSCode**  
    [Download here](https://code.visualstudio.com/).

    **3. Dev Containers Extension**  
    Open VSCode, press `Cmd+Shift+X`, and install **Dev Containers** (Microsoft).

    **4. Git**  
    Usually pre-installed. Run `git --version` in terminal to check.

---

## 2. Clone and Configure

### Clone the Repository

```bash
git clone https://github.com/TheNormativityLab/introspecter.git
cd introspecter
```

### Configure Environment

Create your environment file and fill in the required variables.

```bash
cp .env.example .env
```

You need to set `HOST_PROJECT_PATH` in your `.env` file so the container knows where files are located.

=== "Windows"

    1. Navigate to the `introspecter` folder in File Explorer.
    2. Click the address bar to copy the path.
    3. Important: Replace backslashes `\` with forward slashes `/`.

    ```bash
    # Example .env
    HOST_PROJECT_PATH=C:/Users/JDOE/Desktop/introspecter
    ```

=== "macOS"

    1. Open Terminal inside the `introspecter` directory.
    2. Run `pwd` to get the full path.

    ```bash
    # Example .env
    HOST_PROJECT_PATH=/Users/jdoe/Desktop/introspecter
    ```

!!! note "API Keys"
    Add your `OPENAI_API_KEY` and `TOGETHER_API_KEY`! See [Configuration](./configuration.md) for details.

---

## 3. Install Metadata

The backend requires specific metadata files to initialize correctly.

!!! warning "Manual Step Required"
    1. [Download the wandb_metadata folder from Google Drive](https://drive.google.com/drive/folders/18xbqaHubmpQxrubngM7jGQF4QK_W6uXF){ .md-button }
    2. Extract the zip file.
    3. Move the `wandb_metadata` folder into `backend/`.

**Final structure:**

```
introspecter/
├── backend/
│   └── wandb_metadata/  <-- Folder goes here
├── frontend/
└── .env
```

---

## 4. Launch Application

We offer two ways to run the environment: the VSCode Dev Container (easiest for development) or standard Docker Compose.

=== "VSCode Dev Container (Recommended)"

    1. Press **Ctrl/Cmd + Shift + P** to open the command palette.
    2. Search for **Dev Containers: Rebuild and Reopen in Container** and select it.

    !!! info "First Run Speed"
        The first time you build the container, it may take **5-15 minutes** to download Docker images. You can view progress by clicking "Show Log" in the notification.

    **Success:**  
    Once the terminal opens *inside* the container, the app starts automatically. Look for "Listening on port 3000" or similar logs.

=== "Docker Compose (Terminal)"

    If you prefer not to use the Dev Container extension, you can run the app directly via Docker Compose.

    1. Open your terminal (PowerShell, Command Prompt, or Terminal).
    2. Navigate to the `introspecter` directory.
    3. Run the following command:

    ```bash
    docker compose up --build
    ```

    **Success:**  
    The logs will stream in your terminal. Wait until you see the success message indicating the server is running (e.g., "Listening on port 3000").

---

## Access the UI

Once the services are running, open your browser:

[http://localhost:3000](http://localhost:3000){ .md-button}

---

## Stopping the App

To shut down the environment cleanly:

=== "In VSCode"

    1. Press `F1`
    2. Select `Dev Containers: Stop Container`

=== "Command Line"

    If you are running `docker compose` in the terminal:

    1. Press `Ctrl + C` to stop the process.
    2. To remove containers completely, run:

    ```bash
    docker compose down
    ```

=== "Docker Desktop"

    1. Open the Docker Dashboard.
    2. Find the `introspecter` container group.
    3. Click the Stop (square) icon.