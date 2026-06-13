#!/usr/bin/env node
/**
 * neuralmd.js — Injects AI Neural Hunt markdown/text into the screener dashboard.
 */
const fs = require('fs');

const args = process.argv.slice(2);
if (!args.length) { console.error('Usage: node neuralmd.js neural_insights.txt'); process.exit(1); }

const txtFile = args[0];
if (!fs.existsSync(txtFile)) { console.error(`File not found: ${txtFile}`); process.exit(1); }
if (!fs.existsSync('screener_report.html')) { console.error('screener_report.html not found. Run screener.js first.'); process.exit(1); }

const txt = fs.readFileSync(txtFile, 'utf8');
const htmlTemplate = fs.readFileSync('screener_report.html', 'utf8');

const blocks = txt.split('---').map(b => b.trim()).filter(Boolean);
let cardsHtml = '<div class="neural-grid">';

blocks.forEach(block => {
    const lines = block.split('\n');
    let data = {};
    let curKey = null;
    lines.forEach(line => {
        const idx = line.indexOf(':');
        if (idx > 0 && idx < 20 && !/\s/.test(line.slice(0,idx))) {
            curKey = line.slice(0,idx);
            data[curKey] = line.slice(idx+1).trim();
        } else if (curKey && line.trim()) {
            data[curKey] += '<br>' + line.trim();
        }
    });

    if(!data.TICKER) return;

    cardsHtml += `
    <div class="neural-card">
        <h2>${data.TICKER} <span class="n-badge">${data.RATING || 'WATCH'}</span></h2>
        
        <div style="display:flex; gap:16px; margin-bottom: 20px;">
            <div style="flex:1; background: rgba(59,130,246,0.1); padding: 12px; border-radius:8px; text-align:center;">
                <div style="font-size:11px; color:#94a3b8; text-transform:uppercase; font-weight:700;">Entry</div>
                <div style="font-size:18px; font-weight:800; color:#60a5fa;">$${data.ENTRY || '-'}</div>
            </div>
            <div style="flex:1; background: rgba(52,211,153,0.1); padding: 12px; border-radius:8px; text-align:center;">
                <div style="font-size:11px; color:#94a3b8; text-transform:uppercase; font-weight:700;">Target Exit</div>
                <div style="font-size:18px; font-weight:800; color:#34d399;">$${data.EXIT || '-'}</div>
            </div>
        </div>

        <div class="n-section">
            <div class="n-title">💎 Quick Valuation / Moat</div>
            <p class="n-text">${data.VAL_MOAT || 'N/A'}</p>
        </div>

        <div class="n-section">
            <div class="n-title">⚖️ Risks & Tailwinds</div>
            <p class="n-text">${data.TAILWINDS_RISKS || 'N/A'}</p>
        </div>

        <div class="n-section" style="border-left: 3px solid #f59e0b;">
            <div class="n-title" style="color:#fbbf24;">🔥 Fuel to the Fire (News/Rumors)</div>
            <p class="n-text">${data.FUEL_NEWS || 'N/A'}</p>
        </div>

        <div class="n-section" style="border-left: 3px solid #3b82f6;">
            <div class="n-title" style="color:#60a5fa;">⚡ Story Changers (1-2 Points)</div>
            <p class="n-text">${data.STORY_CHANGERS || 'N/A'}</p>
        </div>
    </div>`;
});

cardsHtml += '</div>';

const placeholder = /<!-- AI_NEURAL_HUNT_CONTENT -->[\s\S]*?<\/div>\s*<\/div>/;
const newHtml = htmlTemplate.replace(placeholder, `<!-- AI_NEURAL_HUNT_CONTENT -->\n${cardsHtml}\n  </div>`);

fs.writeFileSync('screener_report.html', newHtml);
console.log('✅ AI Neural Hunt successfully injected into screener_report.html');
