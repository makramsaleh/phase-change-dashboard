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

function createStatusPie(value, total, label) {
    const percent = total > 0 ? Math.round((value / total) * 100) : 0;
    const circumference = 2 * Math.PI * 34; // r=34
    const offset = circumference - (percent / 100) * circumference;

    return `
        <div class="status-chart">
            <div class="status-pie-container">
                <svg class="status-pie" viewBox="0 0 80 80">
                    <circle class="status-pie-bg" cx="40" cy="40" r="34"/>
                    <circle class="status-pie-fill" cx="40" cy="40" r="34"
                        stroke-dasharray="${circumference}"
                        stroke-dashoffset="${offset}"/>
                </svg>
                <span class="status-pie-text">${percent}%</span>
            </div>
            <div class="status-chart-label">${label}</div>
            <div class="status-chart-count">${value} of ${total}</div>
        </div>
    `;
}

function renderProjectStatus(chapters) {
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

    // Calculate overall progress based on furthest stage reached
    // Weight: Not started=0, Drafted=25, QA'd=50, Reviewed=75, Complete=100
    let overallProgress = 0;
    chapters.forEach(ch => {
        if (ch.workflow.completed) {
            overallProgress += 100;
        } else if (ch.workflow.editorial && ch.workflow.editorial.rounds.length > 0) {
            overallProgress += 75;
        } else if (ch.workflow.automatedQA && ch.workflow.automatedQA.done) {
            overallProgress += 50;
        } else if (ch.workflow.writing && ch.workflow.writing.done) {
            overallProgress += 25;
        }
    });
    const overallPercent = total > 0 ? Math.round(overallProgress / total) : 0;
    const circumference = 2 * Math.PI * 34;
    const overallOffset = circumference - (overallPercent / 100) * circumference;

    const container = document.getElementById('statusCharts');
    container.innerHTML = `
        <div class="status-chart overall">
            <div class="status-pie-container">
                <svg class="status-pie" viewBox="0 0 80 80">
                    <circle class="status-pie-bg" cx="40" cy="40" r="34"/>
                    <circle class="status-pie-fill" cx="40" cy="40" r="34"
                        stroke-dasharray="${circumference}"
                        stroke-dashoffset="${overallOffset}"/>
                </svg>
                <span class="status-pie-text">${overallPercent}%</span>
            </div>
            <div class="status-chart-label">Overall</div>
            <div class="status-chart-count">Progress</div>
        </div>
        ${createStatusPie(drafted, total, 'Drafted')}
        ${createStatusPie(qaed, total, "QA'd")}
        ${createStatusPie(reviewed, total, 'Reviewed')}
        ${createStatusPie(complete, total, 'Complete')}
    `;
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

function createDonutChart(completed, total) {
    const percentage = total > 0 ? (completed / total) * 100 : 0;
    const circumference = 2 * Math.PI * 20; // r=20
    const offset = circumference - (percentage / 100) * circumference;

    return `
        <svg class="detail-donut" viewBox="0 0 50 50">
            <circle class="donut-bg" cx="25" cy="25" r="20"/>
            <circle class="donut-fill" cx="25" cy="25" r="20"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${offset}"/>
            <text x="25" y="25" class="donut-text">${completed}/${total}</text>
        </svg>
    `;
}

function renderChapterDetails(ch) {
    const workflow = ch.workflow;

    // Count completed workflow steps
    let completedSteps = 0;
    const totalSteps = WORKFLOW_STEPS.length;
    WORKFLOW_STEPS.forEach(step => {
        if (workflow[step.key] && workflow[step.key].done) completedSteps++;
    });

    // QA Score
    const qaScore = ch.qaScore;
    const scoreClass = getQAScoreClass(qaScore);
    const scoreText = qaScore !== null ? qaScore : '—';

    // Editorial status
    const editorial = workflow.editorial || { targetRounds: 3, rounds: [] };
    const editorialRounds = editorial.rounds.length;
    const targetRounds = editorial.targetRounds;

    // Workflow steps with labels
    const workflowDetails = WORKFLOW_STEPS.map(step => {
        const stepData = workflow[step.key];
        const isDone = stepData && stepData.done;
        const date = stepData && stepData.date ? formatDate(stepData.date) : '—';
        const labels = {
            'writing': 'Writing',
            'automatedQA': 'Automated QA',
            'automatedFixes': 'Automated Fixes',
            'manualQA': 'Manual QA'
        };
        return `
            <div class="detail-step ${isDone ? 'done' : ''}">
                <span class="detail-step-dot"></span>
                <span class="detail-step-label">${labels[step.key]}</span>
                <span class="detail-step-date">${isDone ? date : 'Pending'}</span>
            </div>
        `;
    }).join('');

    // Editorial rounds
    const editorialDetails = Array.from({ length: targetRounds }, (_, i) => {
        const round = editorial.rounds[i];
        const isDone = i < editorialRounds;
        const isReady = workflow.manualQA && workflow.manualQA.done && !workflow.completed;
        const isCurrent = isReady && i === editorialRounds;
        let status = 'Pending';
        let date = '—';
        if (isDone && round) {
            status = round.outcome === 'approved' ? 'Approved' : 'Reviewed';
            date = round.reviewDate ? formatDate(round.reviewDate) : '—';
        } else if (isCurrent) {
            status = 'Awaiting ST';
        }
        const className = isDone ? 'done' : (isCurrent ? 'current' : '');
        return `
            <div class="detail-step ${className}">
                <span class="detail-step-dot"></span>
                <span class="detail-step-label">Round ${i + 1}</span>
                <span class="detail-step-date">${status}${isDone ? ` (${date})` : ''}</span>
            </div>
        `;
    }).join('');

    // Tags
    let tagsHtml = '';
    if (workflow.automatedQA && workflow.automatedQA.usedLoop) {
        tagsHtml += '<span class="tag tag-loop">QA Loop</span>';
    }
    if (ch.adversarial && ch.adversarial.hasRun) {
        tagsHtml += '<span class="tag tag-adversarial">Adversarial</span>';
    }

    // Note from author
    let noteHtml = '';
    if (ch.noteToEditor) {
        noteHtml = `
            <div class="detail-note">
                <div class="detail-note-label">Note to Editor</div>
                <div class="detail-note-text">"${ch.noteToEditor}"</div>
            </div>
        `;
    }

    // Doc link
    let docLinkHtml = '';
    if (ch.docLink) {
        docLinkHtml = `<a href="${ch.docLink}" target="_blank" class="detail-doc-link">Open in Google Docs</a>`;
    }

    return `
        <div class="chapter-details">
            <div class="detail-grid">
                <div class="detail-section">
                    <div class="detail-section-header">Workflow Progress</div>
                    <div class="detail-chart-row">
                        ${createDonutChart(completedSteps, totalSteps)}
                        <div class="detail-steps">
                            ${workflowDetails}
                        </div>
                    </div>
                </div>
                <div class="detail-section">
                    <div class="detail-section-header">Editorial Review</div>
                    <div class="detail-chart-row">
                        ${createDonutChart(editorialRounds, targetRounds)}
                        <div class="detail-steps">
                            ${editorialDetails}
                        </div>
                    </div>
                </div>
                <div class="detail-section detail-meta">
                    <div class="detail-qa">
                        <div class="detail-section-header">QA Score</div>
                        <div class="detail-qa-score ${scoreClass}">${scoreText}</div>
                    </div>
                    <div class="detail-tags">
                        ${tagsHtml}
                    </div>
                    ${docLinkHtml}
                </div>
            </div>
            ${noteHtml}
        </div>
    `;
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
    renderProjectStatus(data.chapters);
    renderEditorSection(data.chapters, data.meta.editorName);

    // Setup interactions
    setupRowExpansion(data.chapters);
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
                    <td colspan="10" class="section-header-cell">${ch.part}</td>
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

        // Add class if this row needs ST's attention
        const rowClass = isReady ? 'needs-st' : '';

        rows.push(`
            <tr class="chapter-row ${rowClass}" data-chapter-id="${ch.id}">
                <td class="col-expand"><span class="expand-icon">›</span></td>
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
            <tr class="detail-row" data-detail-for="${ch.id}">
                <td colspan="10" class="detail-cell"></td>
            </tr>
        `);
    });

    tbody.innerHTML = rows.join('');
}

function setupRowExpansion(chapters) {
    const chapterRows = document.querySelectorAll('.chapter-row');

    chapterRows.forEach(row => {
        row.addEventListener('click', (e) => {
            // Don't expand if clicking on a link
            if (e.target.tagName === 'A') return;

            const chapterId = row.dataset.chapterId;
            const detailRow = document.querySelector(`tr[data-detail-for="${chapterId}"]`);
            const expandIcon = row.querySelector('.expand-icon');

            // Toggle expanded state
            const isExpanded = row.classList.contains('expanded');

            if (isExpanded) {
                row.classList.remove('expanded');
                detailRow.classList.remove('expanded');
                expandIcon.textContent = '›';
            } else {
                row.classList.add('expanded');
                detailRow.classList.add('expanded');
                expandIcon.textContent = '⌄';

                // Render details if not already rendered
                const detailCell = detailRow.querySelector('.detail-cell');
                if (!detailCell.hasChildNodes()) {
                    const chapter = chapters.find(ch => ch.id === chapterId);
                    if (chapter) {
                        detailCell.innerHTML = renderChapterDetails(chapter);
                    }
                }
            }
        });
    });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
