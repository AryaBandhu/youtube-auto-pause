<!-- First prompt -->
[chrome-extensions](slashCommand;chrome-extensions) Act as a senior Chrome Extension developer specializing in Manifest V3 and Chromium browsers.

Analyze my existing YouTube auto-pause extension and **fix the actual root causes instead of blindly rewriting it**.

### Goal

The extension should:

* Pause YouTube when I switch tabs or browser windows, or lose window focus.
* Resume when I return.
* Never resume a video that I manually paused.
* Continue working with YouTube's SPA navigation and dynamically replaced `<video>` elements.
* Work reliably in Chrome, Comet, and other Chromium-based browsers.

### Tasks

1. Inspect all existing files and identify exactly why the extension currently fails.
2. Use the most reliable combination of:

   * `document.hidden` / `visibilitychange`
   * `chrome.tabs.onActivated`
   * `chrome.windows.onFocusChanged`
3. Prevent duplicate event handlers and repeated `pause()`/`play()` calls.
4. Handle YouTube SPA navigation and recreated video elements.
5. Use only Manifest V3 APIs and minimum required permissions.
6. Safely handle `video.play()` promise failures.
7. Fix popup communication and make the popup safe on non-YouTube pages.
8. Provide the **complete corrected code** for every changed file, not snippets.

### Final Output

Give:

1. Root-cause analysis.
2. Brief explanation of the final architecture.
3. Complete corrected files.
4. Exact steps to load/test the extension in Chrome.
5. Any remaining limitations.

Do not use Manifest V2 syntax or unnecessary permissions.

Use AGENTS.md for the project guide.



<!-- Second prompt -->

Act as a senior Chrome Extension developer specializing in Manifest V3, Chromium browsers, YouTube, and browser media APIs.

My existing YouTube auto-pause extension is already working correctly. **Do not break or rewrite the existing functionality.** Add only the feature described below.

### New Feature

Add a second toggle in the popup:

**Picture-in-Picture: ON/OFF**

This toggle controls whether Picture-in-Picture should be allowed when I leave the YouTube tab or browser window.

### Required Behavior

When **Picture-in-Picture = ON**:

* Prevent the YouTube video from entering Picture-in-Picture when I switch tabs or windows.
* If a Picture-in-Picture window is already active when I leave YouTube, automatically exit Picture-in-Picture.
* The existing auto-pause/resume behavior must continue working normally.

When **Picture-in-Picture = OFF**:

* Do not interfere with Picture-in-Picture behavior.
* Keep the existing extension functionality unchanged.

### Important

The user is referring specifically to the **Picture-in-Picture Extension (by Google)** behavior. Determine the correct browser/media APIs or event handling needed to prevent or exit PiP without depending on undocumented hacks.

Investigate APIs such as:

* `document.pictureInPictureElement`
* `document.exitPictureInPicture()`
* `HTMLVideoElement.requestPictureInPicture()`
* `enterpictureinpicture`
* `leavepictureinpicture`

Also consider how YouTube and the Google PiP extension interact, and make the solution compatible with modern Chromium browsers.

### Requirements

* Keep Manifest V3.
* Keep the existing tab/window auto-pause feature unchanged.
* Persist the new toggle using extension storage.
* Make the toggle state available to the content script.
* Handle YouTube SPA navigation and recreated `<video>` elements.
* Avoid duplicate event listeners.
* Safely handle cases where PiP APIs are unavailable.
* Do not interfere with PiP when the toggle is OFF.
* Use minimum required permissions.
* Do not use Manifest V2 APIs.

### Final Output

Provide:

1. A brief explanation of how the PiP feature works.
2. Exactly what files need to change.
3. Complete updated code for every changed file.
4. A short explanation of how the existing pause/resume logic and new PiP toggle work together.
5. Testing steps for:

   * PiP ON + switch tab
   * PiP ON + switch window
   * PiP OFF + switch tab
   * Existing manual-pause behavior
   * YouTube SPA navigation
   * Multiple YouTube tabs
   * Browser/PiP API unavailable

**Important: Modify the existing project incrementally. Do not replace working functionality unless there is a concrete technical reason.**




<!--  Creating README.md prompt -->

Read the entire codebase carefully and edit the README.md file for this project.

The README should be written for someone who is new to the repository and wants to understand, install, and use it confidently. It must be accurate, well-structured, and based only on what is actually present in the codebase.

Include the following sections in this order:

1. Title  
2. Short project overview  
3. Table of contents at the top that lists all headings in the README  
4. Who this project is for / who will use this  
5. Features  
6. Project structure overview  
7. Prerequisites  
8. Step-by-step installation instructions  
9. Configuration / environment setup  
10. How to run the project  
11. Usage examples  
12. Mermaid usage or Mermaid-related skills/examples, if the codebase supports them  
13. Troubleshooting  
14. Contributing  
15. License  
16. Contact / support, if applicable

Instructions:
- First, inspect the whole codebase before writing anything.
- Infer the project’s actual purpose, setup, commands, dependencies, and usage from the source files, config files, scripts, and documentation.
- Do not invent features, commands, or setup steps that are not supported by the codebase.
- If Mermaid is used in the project, explain how to use it with clear examples.
- If Mermaid is not present, mention that clearly and briefly.
- Write installation steps in a clear, numbered, beginner-friendly format.
- Explain what each installation step does, not just the command to run.
- Make the README easy to scan with headings, bullets, and code blocks where appropriate.
- Keep the tone professional, helpful, and concise.
- Start the README with a content section that lists all headings and links to them.
- Make sure the final result is ready to paste directly into `README.md`.

Now generate the full README.md content.
