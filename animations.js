// Subtle, premium animations only
document.addEventListener('DOMContentLoaded', () => {
    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Subtle navbar enhancement on scroll
    const nav = document.querySelector('.nav');
    
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 50) {
            nav.style.backgroundColor = 'rgba(253, 252, 251, 0.95)';
            nav.style.borderBottomColor = 'rgba(232, 230, 227, 0.8)';
        } else {
            nav.style.backgroundColor = 'rgba(253, 252, 251, 0.85)';
            nav.style.borderBottomColor = 'rgba(232, 230, 227, 1)';
        }
    });

    // Subtle fade-in for sections (very gentle)
    const observerOptions = {
        threshold: 0.15,
        rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
            }
        });
    }, observerOptions);

    // Only apply to sections, very subtle
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        section.style.opacity = '0.7';
        section.style.transition = 'opacity 1s ease-out';
        observer.observe(section);
    });

    // Animated counter for stats (subtle)
    const animateCounter = (element, target, prefix = '', suffix = '') => {
        const duration = 1500;
        const fps = 60;
        const frames = duration / (1000 / fps);
        const increment = target / frames;
        let current = 0;
        
        const updateCounter = () => {
            current = Math.min(current + increment, target);
            
            if (prefix === '$' && suffix === 'M') {
                element.textContent = prefix + current.toFixed(1) + suffix;
            } else {
                element.textContent = prefix + Math.floor(current) + suffix;
            }
            
            if (current < target) {
                requestAnimationFrame(updateCounter);
            } else {
                if (prefix === '$' && suffix === 'M') {
                    element.textContent = prefix + target.toFixed(1) + suffix;
                } else {
                    element.textContent = prefix + target + suffix;
                }
            }
        };
        
        updateCounter();
    };

    // Counter for hero stats - only when visible
    const statObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const statValue = entry.target.querySelector('.stat-value');
                if (statValue && !statValue.dataset.animated) {
                    statValue.dataset.animated = 'true';
                    const prefix = statValue.dataset.prefix || '';
                    const suffix = statValue.dataset.suffix || '';
                    const target = parseFloat(statValue.dataset.target);
                    animateCounter(statValue, target, prefix, suffix);
                }
            }
        });
    }, { threshold: 0.3 });

    const heroStats = document.querySelectorAll('.hero-stat');
    heroStats.forEach(stat => statObserver.observe(stat));
});
