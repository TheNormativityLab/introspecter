
# Introspecter Setup Guide

This guide will walk you through setting up the Introspecter project. The setup uses Dev Containers to make everything simple and consistent.

## Prerequisites

### 1. Docker Desktop

Docker is required to run the application.

**Windows:**

1.  Visit https://www.docker.com/products/docker-desktop/
2.  Click "Download for Windows"
3.  Run the installer (Docker Desktop Installer.exe)
4.  Follow the installation wizard (keep default settings)
5.  Restart your computer if prompted
6.  Launch Docker Desktop from the Start menu
7.  Accept the terms and conditions
8.  Docker Desktop may prompt you to install WSL 2 (Windows Subsystem for Linux) - follow the prompts to install it
9.  Wait for Docker Desktop to start (you'll see a green "Running" status)

**macOS:**

1.  Visit https://www.docker.com/products/docker-desktop/
2.  Click "Download for Mac" and choose:
    -   **Apple Silicon** (M1, M2, M3 chips) if you have a newer Mac
    -   **Intel Chip** if you have an older Mac
3.  Open the downloaded .dmg file
4.  Drag Docker.app to your Applications folder
5.  Open Docker from Applications
6.  Follow the setup wizard
7.  You may need to enter your password to grant permissions
8.  Wait for Docker Desktop to start (you'll see the Docker whale icon in your menu bar)

**Creating a Docker Account:**

-   Docker offers a free tier for personal use
-   You'll be prompted to create an account when you first launch Docker Desktop
-   Visit https://hub.docker.com/signup to create an account
-   Sign in through Docker Desktop

**Verify Installation:**

1.  Open Terminal (macOS) or Command Prompt (Windows)
2.  Type: `docker --version`
3.  You should see something like: `Docker version 24.0.6`

### 2. Visual Studio Code (VSCode)

VSCode is the code editor we'll use to work with the project.

**Windows:**

1.  Visit https://code.visualstudio.com/
2.  Click "Download for Windows"
3.  Run the installer (VSCodeSetup.exe)
4.  Follow the installation wizard
5.  Click Install

**macOS:**

1.  Visit https://code.visualstudio.com/
2.  Click "Download for Mac"
3.  Open the downloaded .zip file
4.  Drag "Visual Studio Code.app" to your Applications folder
5.  Open VSCode from Applications

**Install Required Extension:**

1.  Open VSCode
2.  Click the Extensions icon on the left sidebar (or press `Ctrl+Shift+X` on Windows/Linux, `Cmd+Shift+X` on macOS)
3.  In the search bar, type: `Dev Containers`
4.  Find "Dev Containers" by Microsoft
5.  Click the blue "Install" button
6.  Wait for installation to complete

### 3. Git

Git is needed to download the project code.

**Windows:**

1.  Visit https://git-scm.com/download/win
2.  Download will start automatically
3.  Run the installer (Git-2.x.x-64-bit.exe)
4.  Follow the installation wizard:
    -   Keep all default settings
    -   On "Choosing the default editor" page, select your preferred editor (or keep Vim)
    -   Click Next through all pages
5.  Click Install

**macOS:**

1.  Open Terminal (from Applications → Utilities)
2.  Type: `git --version`
3.  If Git is not installed, macOS will prompt you to install it automatically
4.  Click "Install" and follow the prompts
    
    **Alternative (using Homebrew):**
    
    -   If you have Homebrew installed: `brew install git`
    -   Don't have Homebrew? Visit https://brew.sh/ to install it first

**Verify Installation:**

1.  Open Terminal (macOS) or Command Prompt (Windows)
2.  Type: `git --version`
3.  You should see something like: `git version 2.x.x`

## Setup Steps

### Step 1: Clone the Repository

1.  **Open Terminal/Command Prompt:**
    
    -   **Windows**: Press `Win+R`, type `cmd`, press Enter
    -   **macOS**: Press `Cmd+Space`, type "Terminal", press Enter
2.  **Navigate to where you want the project:**
    
    ```bash
    cd Desktop
    
    ```
    
3.  **Clone the repository:**
    
    ```bash
    git clone <repository-url>
    cd introspecter
    
    ```
    

### Step 2: Open in VSCode

1.  **Launch VSCode**
2.  Click **File → Open Folder** (Windows/Linux) or **File → Open...** (macOS)
3.  Navigate to and select the `introspecter` folder
4.  Click **Open**

### Step 3: Configure Environment Variables

1.  **Locate the `.env.example` file** in the left sidebar (file explorer)
    
2.  **Right-click** on `.env.example` → **Copy**
    
3.  **Right-click** in the empty space below → **Paste**
    
4.  **Rename** the copied file to `.env` (remove "copy" and ".example")
    
5.  **Open the `.env` file** and update these values:
    
    **A. Update the project path:**
    
    ```bash
    HOST_PROJECT_PATH=/full/path/to/introspecter
    
    ```
    
    **How to find your path:**
    
    -   **Windows**: In the introspecter folder, click the address bar and copy the path. Replace backslashes with forward slashes:
        
        ```
        HOST_PROJECT_PATH=C:/Users/YourName/Desktop/introspecter
        
        ```
        
    -   **macOS**: In Terminal, navigate to the introspecter folder and type `pwd`. Copy the output:
        
        ```
        HOST_PROJECT_PATH=/Users/YourName/Desktop/introspecter
        
        ```
        
    
    **B. Add your API keys:**
    
    -   **OpenAI API Key:**
    
            ```
            OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
            ```
            
    -   **Kaleidoscope API:**
        
        ```
        KSCOPE_API_KEY=your_kscope_key_here
        KSCOPE_API_BASE=your_kscope_base_url_here
        ```
        
6.  **Save the file** (Ctrl+S or Cmd+S)
    

### Step 4: Download wandb_metadata Folder

1.  **Download the folder from:** [Link](https://drive.google.com/drive/folders/18xbqaHubmpQxrubngM7jGQF4QK_W6uXF?usp=drive_link)
2.  **Extract** the folder if it's in a zip file
3.  **Move the `wandb_metadata` folder** into the `backend` directory

**Final structure should be:**

```
introspecter/
├── backend/
│   └── wandb_metadata/     ← Place here
├── frontend/
├── api/
└── .env

```

### Step 5: Open in Dev Container

The Dev Container will set up everything automatically.

1.  **In VSCode**, you should see a popup in the bottom-right corner saying:
    
    > "Folder contains a Dev Container configuration file. Reopen folder to develop in a container"
    
    Click **"Reopen in Container"**
    
    **If you don't see the popup:**
    
    -   Press `F1` (or `Ctrl+Shift+P` on Windows/Linux, `Cmd+Shift+P` on macOS)
    -   Type: `Dev Containers: Reopen in Container`
    -   Press Enter
2.  **Wait for the container to build:**
    
    -   This will take 5-15 minutes the first time
    -   VSCode will show progress in the bottom-right corner
    -   You'll see: "Starting Dev Container (show log)"
    -   Click "show log" if you want to see what's happening
3.  **When complete**, you'll see:
    
    -   A green indicator in the bottom-left corner: "Dev Container: Introspecter"
    -   The terminal will be inside the container

### Step 6: Access the Application

Once the Dev Container finishes building:

 **The application starts automatically!**
    -   The Dev Container will automatically start all services
    -   You'll see logs in the VSCode terminal
    -   Wait about 1-2 minutes for everything to be ready
-   **Access the application:**
    -   Open your browser and go to: **[http://localhost:3000](http://localhost:3000)*
    
3.  **Wait for services to start:**
    
    -   You'll see logs from all services
    -   Wait until you see messages indicating services are ready
    -   This takes about 1-2 minutes
4.  **Access the application:**
    
    -   Open your browser and go to: **http://localhost:3000**


### Stopping the Application

#### If running inside a VSCode Dev Container:

1.  Press:
    
    -   **Ctrl + Shift + P** (Windows/Linux)
        
    -   **Cmd + Shift + P** (macOS)
        
2.  Type and select:
    
    `Dev Containers: Stop Container` 
    
3.  Alternatively, open **Docker Desktop → Containers**, find `introspecter`, and click the **Stop** (■) icon.
