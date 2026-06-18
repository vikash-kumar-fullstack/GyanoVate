// Frontend for face recognition attendance (used in teacher/markAttendance)
async function startAttendance(email, imageUrl) {
    try {
        const response = await fetch('http://localhost:5001/start_verification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, imageUrl })
        });
        const data = await response.json();
        if (data.status === 'ready') {
            document.getElementById('attendance-status').innerHTML = '✅ Camera started. Please allow location access.';
        }
    } catch (err) {
        console.error(err);
    }
}