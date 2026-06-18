// Auto-hide alerts after 5 seconds
document.addEventListener('DOMContentLoaded', () => {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        setTimeout(() => {
            alert.style.opacity = '0';
            setTimeout(() => alert.remove(), 500);
        }, 5000);
    });

    // Confirm delete actions
    document.querySelectorAll('.delete-confirm').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!confirm('Are you sure?')) e.preventDefault();
        });
    });
});