// Simple placeholder for Chart.js (if you want to add charts later)
function renderAttendanceChart(canvasId, labels, data) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;
    if (typeof Chart !== 'undefined') {
        new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Attendance %', data, backgroundColor: '#1e6f5c' }] }
        });
    }
}