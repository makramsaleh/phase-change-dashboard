// Dashboard for Phase Change book project
// Loads data from data.json and renders the status

const WORKFLOW_STEPS = [
    { key: 'writing', label: 'WRT' },
    { key: 'automatedQA', label: 'QA' },
    { key: 'automatedFixes', label: 'FIX' },
    { key: 'manualQA', label: 'MAN' }
];

async function loadData() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error('Failed to load data');
        return await response.json();
    } catch (error) {
        console.error('Error loading data:', error);
        return null;
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getWorkflowStatus(workflow) {
    // Returns the current step name and completion count
    const steps = WORKFLOW_STEPS;
    let completed = 0;
    let currentStep = null;

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepData = workflow[step.key];
        if (stepData && stepData.done) {
            completed++;
        } else if (!currentStep) {
            currentStep = step.key;
        }
    }

    // Check editorial
    const editorial = workflow.editorial;
    const editorialComplete = editorial && editorial.rounds.length >= editorial.targetRounds;

    if (completed === steps.length && !currentStep) {
        if (editorialComplete || workflow.completed) {
            return { completed: steps.length + 1, total: steps.length + 1, current: null, status: 'complete' };
        }
        return { completed, total: steps.length + 1, current: 'editorial', status: 'editorial' };
    }

    return { completed, total: steps.length + 1, current: currentStep, status: currentStep || 'pending' };
}

function getChapterStatus(chapter) {
    const workflow = chapter.workflow;
    if (workflow.completed) return 'complete';
    if (workflow.editorial && workflow.editorial.rounds.length > 0) return 'review';
    if (workflow.writing && workflow.writing.done) return 'writing';
    return 'pending';
}

function getEditorialRound(chapter) {
    const editorial = chapter.workflow.editorial;
    if (!editorial) return 0;
    return editorial.rounds.length;
}

function isReadyForReview(chapter) {
    const workflow = chapter.workflow;
    // Ready for review if manual QA is done and not completed
    if (workflow.manualQA && workflow.manualQA.done && !workflow.completed) {
        return true;
    }
    return false;
}

function getQAScoreClass(score) {
    if (score === null || score === undefined) return 'score-none';
    if (score >= 90) return 'score-high';
    if (score >= 75) return 'score-medium';
    return 'score-low';
}

function renderOverallProgress(chapters) {
    const total = chapters.length;
    let drafted = 0;
    let qaed = 0;
    let reviewed = 0;
    let complete = 0;

    chapters.forEach(ch => {
        if (ch.workflow.writing && ch.workflow.writing.done) drafted++;
        if (ch.workflow.automatedQA && ch.workflow.automatedQA.done) qaed++;
        if (ch.workflow.editorial && ch.workflow.editorial.rounds.length > 0) reviewed++;
        if (ch.workflow.completed) complete++;
    });

    // Calculate overall progress (weighted)
    // Writing: 25%, QA: 25%, Editorial: 25%, Complete: 25%
    const progress = Math.round(
        (complete / total) * 100
    );

    // Update DOM
    document.getElementById('overallPercent').textContent = `${progress}%`;
    document.getElementById('statDrafted').textContent = `${drafted}/${total}`;
    document.getElementById('statQAd').textContent = `${qaed}/${total}`;
    document.getElementById('statReviewed').textContent = `${reviewed}/${total}`;
    document.getElementById('statComplete').textContent = `${complete}/${total}`;

    // Animate progress ring
    const ring = document.getElementById('progressRing');
    const circumference = 2 * Math.PI * 52; // r=52
    const offset = circumference - (progress / 100) * circumference;
    ring.style.strokeDashoffset = offset;
}

function renderEditorSection(chapters, editorName) {
    const container = document.getElementById('editorCards');
    document.getElementById('editorName').textContent = editorName || 'Editor';

    const readyChapters = chapters.filter(isReadyForReview);

    if (readyChapters.length === 0) {
        container.innerHTML = '<div class="no-reviews">No chapters ready for review</div>';
        return;
    }

    // Show only the first ready chapter (single action item)
    const ch = readyChapters[0];
    const round = getEditorialRound(ch) + 1;
    const chapterLabel = ch.number ? `Chapter ${ch.number}` : ch.part;

    let noteHtml = '';
    if (ch.noteToEditor) {
        noteHtml = `
            <div class="editor-card-note">
                <div class="editor-card-note-label">Note from author</div>
                <div class="editor-card-note-text">"${ch.noteToEditor}"</div>
            </div>
        `;
    }

    let docLinkHtml = '';
    if (ch.docLink) {
        docLinkHtml = `
            <a href="${ch.docLink}" target="_blank" class="editor-doc-link">Open in Google Docs</a>
        `;
    }

    container.innerHTML = `
        <div class="editor-card featured">
            <div class="editor-card-header">
                <div>
                    <div class="editor-card-title">${ch.title}</div>
                    <div class="editor-card-chapter">${chapterLabel}</div>
                </div>
                <span class="editor-card-round">Round ${round}</span>
            </div>
            ${noteHtml}
            ${docLinkHtml}
        </div>
    `;
}

function renderChaptersGrid(chapters) {
    const container = document.getElementById('chaptersGrid');

    container.innerHTML = chapters.map(ch => {
        const status = getChapterStatus(ch);
        const chapterLabel = ch.number ? `<span class="chapter-card-number">${ch.number}.</span>` : '';
        const qaScore = ch.qaScore;
        const scoreClass = getQAScoreClass(qaScore);
        const scoreText = qaScore !== null ? qaScore : 'N/A';

        // Workflow steps
        const workflowHtml = WORKFLOW_STEPS.map(step => {
            const stepData = ch.workflow[step.key];
            const isDone = stepData && stepData.done;
            const isCurrent = !isDone && step.key === getWorkflowStatus(ch.workflow).current;
            const className = isDone ? 'done' : (isCurrent ? 'current' : '');
            return `<div class="workflow-step ${className}" data-label="${step.label}"></div>`;
        }).join('');

        // Editorial dots
        const editorial = ch.workflow.editorial || { targetRounds: 3, rounds: [] };
        const editorialHtml = Array.from({ length: editorial.targetRounds }, (_, i) => {
            const isDone = i < editorial.rounds.length;
            const isCurrent = i === editorial.rounds.length && ch.workflow.manualQA && ch.workflow.manualQA.done;
            const className = isDone ? 'done' : (isCurrent ? 'current' : '');
            return `<div class="editorial-dot ${className}"></div>`;
        }).join('');

        // Tags
        let tagsHtml = '';
        if (ch.workflow.automatedQA && ch.workflow.automatedQA.usedLoop) {
            tagsHtml += '<span class="tag tag-loop">Loop</span>';
        }
        if (ch.adversarial && ch.adversarial.hasRun) {
            tagsHtml += '<span class="tag tag-adversarial">Adversarial</span>';
        }

        const lastEdited = ch.lastEdited ? `<span class="last-edited">${formatDate(ch.lastEdited)}</span>` : '';

        return `
            <div class="chapter-card status-${status}">
                <div class="chapter-card-header">
                    <div class="chapter-card-info">
                        <div class="chapter-card-part">${ch.part}</div>
                        <div class="chapter-card-title">${chapterLabel}${ch.title}</div>
                    </div>
                    <div class="qa-score ${scoreClass}">${scoreText}</div>
                </div>
                <div class="workflow-progress">${workflowHtml}</div>
                <div class="editorial-progress">
                    <span class="editorial-label">Editorial</span>
                    <div class="editorial-dots">${editorialHtml}</div>
                </div>
                <div class="chapter-card-meta">
                    ${tagsHtml}
                    ${lastEdited}
                </div>
            </div>
        `;
    }).join('');
}

async function init() {
    const data = await loadData();
    if (!data) {
        document.body.innerHTML = '<div style="padding: 2rem; text-align: center; color: #ef4444;">Failed to load dashboard data. Make sure data.json exists.</div>';
        return;
    }

    // Update last updated
    document.getElementById('lastUpdated').textContent = formatDateTime(data.meta.lastUpdated);

    // Render sections
    renderCondensedTable(data.chapters);
    renderOverallProgress(data.chapters);
    renderEditorSection(data.chapters, data.meta.editorName);
    renderChaptersGrid(data.chapters);

    // Setup interactions
    setupToggle();
}

function renderCondensedTable(chapters) {
    const tbody = document.getElementById('condensedTableBody');

    // Group by part for visual separation
    let currentPart = '';
    let rows = [];

    chapters.forEach(ch => {
        // Add section header row when part changes
        if (ch.part !== currentPart) {
            currentPart = ch.part;
            rows.push(`
                <tr class="section-header-row">
                    <td colspan="9" class="section-header-cell">${ch.part}</td>
                </tr>
            `);
        }

        const chNum = ch.number || '—';

        // Status dots
        const wrtDone = ch.workflow.writing && ch.workflow.writing.done;
        const qaDone = ch.workflow.automatedQA && ch.workflow.automatedQA.done;
        const fixDone = ch.workflow.automatedFixes && ch.workflow.automatedFixes.done;
        const manDone = ch.workflow.manualQA && ch.workflow.manualQA.done;

        // Editorial progress - visual segments
        // Yellow = needs ST's attention (current round awaiting review)
        const editorial = ch.workflow.editorial || { targetRounds: 3, rounds: [] };
        const isReady = manDone && !ch.workflow.completed;
        const currentRound = editorial.rounds.length; // 0-indexed next round
        const edSegments = Array.from({ length: editorial.targetRounds }, (_, i) => {
            const filled = i < editorial.rounds.length;
            const isCurrent = isReady && i === currentRound;
            const className = filled ? 'filled' : (isCurrent ? 'current' : '');
            return `<span class="ed-segment ${className}"></span>`;
        }).join('');

        // Doc link
        const docLink = ch.docLink
            ? `<a href="${ch.docLink}" target="_blank" class="doc-link">Open</a>`
            : '<span style="color: var(--text-muted)">—</span>';

        const lastEdited = ch.lastEdited ? formatDate(ch.lastEdited) : '—';

        rows.push(`
            <tr>
                <td class="col-num">${chNum}</td>
                <td class="chapter-title-cell">${ch.title}</td>
                <td class="col-link">${docLink}</td>
                <td class="col-status"><span class="status-dot ${wrtDone ? 'done' : ''}"></span></td>
                <td class="col-status"><span class="status-dot ${qaDone ? 'done' : ''}"></span></td>
                <td class="col-status"><span class="status-dot ${fixDone ? 'done' : ''}"></span></td>
                <td class="col-status"><span class="status-dot ${manDone ? 'done' : ''}"></span></td>
                <td class="col-status"><span class="ed-bar">${edSegments}</span></td>
                <td class="col-date">${lastEdited}</td>
            </tr>
        `);
    });

    tbody.innerHTML = rows.join('');
}

function setupToggle() {
    const toggle = document.getElementById('condensedToggle');
    const content = document.getElementById('condensedContent');

    toggle.addEventListener('click', () => {
        toggle.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
    });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
